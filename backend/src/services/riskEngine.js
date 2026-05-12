/**
 * ArcGuard — Risk Scoring Engine
 * Analyzes wallet addresses and assigns a risk score (0-100)
 * 
 * Score breakdown:
 * - 0-30:  LOW risk (green)
 * - 31-60: MEDIUM risk (yellow)  
 * - 61-100: HIGH risk (red)
 */
import { getWalletInfo, getRecentTransactions } from './arcProvider.js';
import { isSanctioned, isMixer, isKnownScam, getSanctionsReport } from './sanctionsCheck.js';

/**
 * Main risk scoring function
 * Returns comprehensive risk assessment for an address
 */
export async function calculateRiskScore(address) {
  const startTime = Date.now();
  const checks = {};
  let totalScore = 0;

  // 1. Sanctions Check (D1) — weight: instant flag → 100
  const sanctionsReport = getSanctionsReport(address);
  checks.sanctions = {
    id: 'D1',
    name: 'Sanctions Check (OFAC)',
    passed: !sanctionsReport.sanctioned,
    score: sanctionsReport.sanctioned ? 100 : 0,
    details: sanctionsReport,
  };

  // If sanctioned → instant max score, no need for further checks
  if (sanctionsReport.sanctioned) {
    return buildResult(address, 100, 'critical', checks, startTime);
  }

  // 2. Direct mixer check (D2) — Is the address itself a mixer?
  checks.directMixer = {
    id: 'D2a',
    name: 'Direct Mixer Check',
    passed: !sanctionsReport.isMixer,
    score: sanctionsReport.isMixer ? 90 : 0,
    details: { isMixer: sanctionsReport.isMixer },
  };

  // 3. Known scam check
  checks.knownScam = {
    id: 'B_SCAM',
    name: 'Known Scam Database',
    passed: !sanctionsReport.isKnownScam,
    score: sanctionsReport.isKnownScam ? 85 : 0,
    details: { isKnownScam: sanctionsReport.isKnownScam },
  };

  // 4. Get wallet info from Arc
  let walletInfo;
  try {
    walletInfo = await getWalletInfo(address);
  } catch (err) {
    return buildResult(address, 0, 'error', checks, startTime, err.message);
  }

  // 5. Wallet Age & Activity (heuristic based on tx count)
  const txCount = walletInfo.txCount;
  let ageScore = 0;
  if (txCount === 0) ageScore = 25; // never used — suspicious
  else if (txCount < 3) ageScore = 15; // very new
  else if (txCount < 10) ageScore = 5; // relatively new
  else ageScore = 0; // established wallet

  checks.walletAge = {
    id: 'AGE',
    name: 'Wallet Age & Activity',
    passed: ageScore < 15,
    score: ageScore,
    details: { txCount, balanceUSDC: walletInfo.balanceUSDC, isContract: walletInfo.isContract },
  };

  // 6. Transaction pattern analysis (D3-D6)
  let txPatternScore = 0;
  let txDetails = {};
  
  try {
    const txData = await getRecentTransactions(address, 500);
    const analysis = analyzeTransactionPatterns(txData, address);
    txPatternScore = analysis.score;
    txDetails = analysis;
  } catch (err) {
    txDetails = { error: err.message };
  }

  checks.transactionPatterns = {
    id: 'D3-D6',
    name: 'Transaction Pattern Analysis',
    passed: txPatternScore < 30,
    score: txPatternScore,
    details: txDetails,
  };

  // 7. Mixer interaction in transaction history (D2)
  let mixerInteractionScore = 0;
  if (txDetails.mixerInteractions > 0) {
    mixerInteractionScore = Math.min(50, txDetails.mixerInteractions * 25);
  }

  checks.mixerInteraction = {
    id: 'D2b',
    name: 'Mixer Interaction History',
    passed: mixerInteractionScore === 0,
    score: mixerInteractionScore,
    details: { mixerInteractions: txDetails.mixerInteractions || 0 },
  };

  // 8. Sanctioned counterparty interaction
  let sanctionedCounterpartyScore = 0;
  if (txDetails.sanctionedInteractions > 0) {
    sanctionedCounterpartyScore = Math.min(60, txDetails.sanctionedInteractions * 30);
  }

  checks.sanctionedCounterparty = {
    id: 'D1b',
    name: 'Sanctioned Counterparty Interaction',
    passed: sanctionedCounterpartyScore === 0,
    score: sanctionedCounterpartyScore,
    details: { sanctionedInteractions: txDetails.sanctionedInteractions || 0 },
  };

  // Calculate total score (weighted max of all checks, capped at 100)
  const allScores = Object.values(checks).map(c => c.score);
  totalScore = Math.min(100, Math.max(...allScores) + sumMinor(allScores) * 0.3);
  totalScore = Math.round(totalScore);

  const level = totalScore <= 30 ? 'low' : totalScore <= 60 ? 'medium' : 'high';

  return buildResult(address, totalScore, level, checks, startTime);
}

/**
 * Analyze transaction patterns for AML signals
 */
function analyzeTransactionPatterns(txData, address) {
  const { outgoing, incoming } = txData;
  const allTxs = [...outgoing, ...incoming];
  let score = 0;
  let flags = [];
  let mixerInteractions = 0;
  let sanctionedInteractions = 0;

  // D2: Check for mixer interactions in counterparties
  const allCounterparties = new Set();
  outgoing.forEach(tx => {
    allCounterparties.add(tx.to.toLowerCase());
    if (isMixer(tx.to)) {
      mixerInteractions++;
      flags.push(`Sent funds to mixer: ${tx.to.slice(0, 10)}...`);
    }
    if (isSanctioned(tx.to)) {
      sanctionedInteractions++;
      flags.push(`Sent funds to sanctioned address: ${tx.to.slice(0, 10)}...`);
    }
  });
  incoming.forEach(tx => {
    allCounterparties.add(tx.from.toLowerCase());
    if (isMixer(tx.from)) {
      mixerInteractions++;
      flags.push(`Received funds from mixer: ${tx.from.slice(0, 10)}...`);
    }
    if (isSanctioned(tx.from)) {
      sanctionedInteractions++;
      flags.push(`Received funds from sanctioned address: ${tx.from.slice(0, 10)}...`);
    }
  });

  // D4: Peel Chain detection — 1 large input → many small outputs
  if (incoming.length > 0 && outgoing.length > 5) {
    const totalIn = incoming.reduce((s, tx) => s + tx.valueUSDC, 0);
    const avgOut = outgoing.reduce((s, tx) => s + tx.valueUSDC, 0) / outgoing.length;
    const uniqueRecipients = new Set(outgoing.map(tx => tx.to.toLowerCase())).size;

    if (uniqueRecipients > 5 && avgOut < totalIn * 0.2) {
      score += 20;
      flags.push(`Peel chain pattern: ${uniqueRecipients} unique recipients, avg amount much smaller than input`);
    }
  }

  // D5: Structuring — multiple transfers of similar amounts
  if (outgoing.length > 3) {
    const amounts = outgoing.map(tx => tx.valueUSDC);
    const groups = groupSimilarAmounts(amounts, 0.05); // 5% tolerance
    const largestGroup = Math.max(...Object.values(groups));
    if (largestGroup >= 3) {
      score += 15;
      flags.push(`Structuring pattern: ${largestGroup} transfers of similar amounts`);
    }
  }

  // D3: Chain hopping — receive then quickly send to different addresses
  // (simplified: if most outgoing are shortly after incoming)
  if (incoming.length > 0 && outgoing.length > 0) {
    const inBlocks = incoming.map(tx => tx.blockNumber);
    const outBlocks = outgoing.map(tx => tx.blockNumber);
    const avgInBlock = inBlocks.reduce((a, b) => a + b, 0) / inBlocks.length;
    const avgOutBlock = outBlocks.reduce((a, b) => a + b, 0) / outBlocks.length;
    
    // If average outgoing is very close to average incoming → pass-through
    if (Math.abs(avgOutBlock - avgInBlock) < 50 && outgoing.length > 2) {
      score += 10;
      flags.push('Pass-through pattern: funds received and sent within close block range');
    }
  }

  // C1: Address poisoning — check for 0-value incoming transfers
  const zeroValueIncoming = incoming.filter(tx => tx.valueUSDC === 0);
  if (zeroValueIncoming.length > 2) {
    score += 5;
    flags.push(`Address poisoning signals: ${zeroValueIncoming.length} zero-value incoming transfers`);
  }

  // Counterparty diversity (low = suspicious for business, high = normal)
  const counterpartyCount = allCounterparties.size;

  return {
    score: Math.min(50, score), // Cap pattern score at 50
    flags,
    mixerInteractions,
    sanctionedInteractions,
    totalTransactions: allTxs.length,
    outgoingCount: outgoing.length,
    incomingCount: incoming.length,
    counterpartyCount,
    blocksScanned: txData.blocksScanned,
  };
}

/**
 * Group similar amounts together (for structuring detection)
 */
function groupSimilarAmounts(amounts, tolerance) {
  const groups = {};
  amounts.forEach(amount => {
    const key = Math.round(amount / (amount * tolerance || 1));
    groups[key] = (groups[key] || 0) + 1;
  });
  return groups;
}

/**
 * Sum of minor scores (excluding the max) for weighted calculation
 */
function sumMinor(scores) {
  const sorted = [...scores].sort((a, b) => b - a);
  return sorted.slice(1).reduce((sum, s) => sum + s, 0);
}

/**
 * Build standardized result object
 */
function buildResult(address, score, level, checks, startTime, error = null) {
  // Determine entity type from wallet info
  const walletDetails = checks.walletAge?.details;
  const entityType = classifyEntity(walletDetails);

  return {
    address,
    entityType,
    score,
    level, // 'low' | 'medium' | 'high' | 'critical' | 'error'
    verdict: getVerdict(level),
    checks,
    timestamp: new Date().toISOString(),
    processingTimeMs: Date.now() - startTime,
    ...(error && { error }),
  };
}

/**
 * Classify address entity type
 */
function classifyEntity(walletDetails) {
  if (!walletDetails) return { type: 'unknown', label: 'Unknown' };

  if (walletDetails.isContract) {
    // Could be a token, dApp, agent wallet, or other contract
    return {
      type: 'contract',
      label: 'Smart Contract',
      hint: 'Could be token, dApp, proxy, or agent wallet',
    };
  }

  // EOA (Externally Owned Account)
  if (walletDetails.txCount === 0) {
    return {
      type: 'eoa',
      label: 'New/Empty Wallet',
      hint: 'No transactions on Arc Testnet',
    };
  }

  if (walletDetails.txCount > 100) {
    return {
      type: 'eoa',
      label: 'Active Wallet',
      hint: `High activity: ${walletDetails.txCount} transactions`,
    };
  }

  return {
    type: 'eoa',
    label: 'EOA Wallet',
    hint: `${walletDetails.txCount} transactions`,
  };
}

/**
 * Human-readable verdict
 */
function getVerdict(level) {
  switch (level) {
    case 'low': return '✅ Low Risk — Safe to transact';
    case 'medium': return '⚠️ Medium Risk — Proceed with caution';
    case 'high': return '🚫 High Risk — Do not transact';
    case 'critical': return '🚨 CRITICAL — Sanctioned address';
    default: return '❓ Unknown';
  }
}
