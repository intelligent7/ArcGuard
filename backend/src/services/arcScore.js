import { getWalletInfo, getRecentTransactions } from './arcProvider.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function tierFromScore(score) {
  if (score >= 80) {
    return 'elite';
  }
  if (score >= 60) {
    return 'strong';
  }
  if (score >= 40) {
    return 'growing';
  }
  return 'new';
}

function verdictFromTier(tier) {
  switch (tier) {
    case 'elite':
      return 'Elite Arc reputation';
    case 'strong':
      return 'Strong Arc reputation';
    case 'growing':
      return 'Growing Arc reputation';
    default:
      return 'Early Arc footprint';
  }
}

export async function calculateArcScore(address) {
  const startedAt = Date.now();
  const wallet = await getWalletInfo(address);
  const txData = await getRecentTransactions(address, 3000);

  const outgoing = txData.outgoing || [];
  const incoming = txData.incoming || [];
  const allTransactions = [...outgoing, ...incoming].sort((a, b) => a.blockNumber - b.blockNumber);

  const uniqueCounterparties = new Set();
  const uniqueContracts = new Set();
  const activeBlocks = new Set();

  let outgoingVolume = 0;
  let incomingVolume = 0;

  for (const tx of outgoing) {
    uniqueCounterparties.add(tx.to.toLowerCase());
    uniqueContracts.add(tx.contractAddress.toLowerCase());
    activeBlocks.add(tx.blockNumber);
    outgoingVolume += Number(tx.valueUSDC || 0);
  }

  for (const tx of incoming) {
    uniqueCounterparties.add(tx.from.toLowerCase());
    uniqueContracts.add(tx.contractAddress.toLowerCase());
    activeBlocks.add(tx.blockNumber);
    incomingVolume += Number(tx.valueUSDC || 0);
  }

  const totalVolume = outgoingVolume + incomingVolume;
  const totalTransactions = wallet.txCount;
  const scannedTransactions = allTransactions.length;
  const activeBlockCount = activeBlocks.size;
  const firstSeenBlock = allTransactions[0]?.blockNumber || null;
  const lastSeenBlock = allTransactions[allTransactions.length - 1]?.blockNumber || null;
  const spanBlocks = firstSeenBlock && lastSeenBlock ? Math.max(1, lastSeenBlock - firstSeenBlock) : 0;
  const continuityRatio = spanBlocks > 0 ? activeBlockCount / spanBlocks : 0;

  const ageScore = clamp(Math.log10(totalTransactions + 1) * 6, 0, 20);
  const activityScore = clamp(totalTransactions >= 200 ? 25 : totalTransactions / 8, 0, 25);
  const diversityScore = clamp(uniqueCounterparties.size * 1.2 + uniqueContracts.size * 2.2, 0, 20);
  const volumeScore = clamp(Math.log10(totalVolume + 1) * 4, 0, 15);
  const consistencyScore = clamp(continuityRatio * 240, 0, 15);
  const builderScore = clamp(
    (wallet.isContract ? 5 : 0) +
      (uniqueContracts.size >= 3 ? 2 : 0) +
      (totalTransactions >= 100 ? 2 : 0),
    0,
    5
  );

  const score = Math.round(
    clamp(ageScore + activityScore + diversityScore + volumeScore + consistencyScore + builderScore, 0, 100)
  );
  const tier = tierFromScore(score);

  return {
    address,
    score,
    tier,
    verdict: verdictFromTier(tier),
    summary: {
      totalTransactions,
      scannedTransactions,
      uniqueCounterparties: uniqueCounterparties.size,
      uniqueContracts: uniqueContracts.size,
      activeBlocks: activeBlockCount,
      firstSeenBlock,
      lastSeenBlock,
      totalVolumeUSDC: round(totalVolume),
      outgoingVolumeUSDC: round(outgoingVolume),
      incomingVolumeUSDC: round(incomingVolume),
      balanceUSDC: round(wallet.balanceUSDC || 0),
      isContract: wallet.isContract,
    },
    breakdown: {
      age: {
        score: Math.round(ageScore),
        max: 20,
        label: 'Wallet maturity',
        detail: firstSeenBlock
          ? `Seen in ${activeBlockCount} active blocks between ${firstSeenBlock} and ${lastSeenBlock}.`
          : 'No transfer activity found in the recent scan window.',
      },
      activity: {
        score: Math.round(activityScore),
        max: 25,
        label: 'Onchain activity',
        detail: `${totalTransactions} total transaction(s) on Arc.`,
      },
      diversity: {
        score: Math.round(diversityScore),
        max: 20,
        label: 'Interaction diversity',
        detail: `${uniqueCounterparties.size} counterparties and ${uniqueContracts.size} token/contract touchpoint(s).`,
      },
      volume: {
        score: Math.round(volumeScore),
        max: 15,
        label: 'Economic volume',
        detail: `${round(totalVolume)} USDC observed in the recent transfer window.`,
      },
      consistency: {
        score: Math.round(consistencyScore),
        max: 15,
        label: 'Consistency',
        detail: activeBlockCount > 1
          ? `Activity is spread across ${activeBlockCount} unique blocks.`
          : 'Very concentrated or no recent activity.',
      },
      builder: {
        score: Math.round(builderScore),
        max: 5,
        label: 'Builder signal',
        detail: wallet.isContract
          ? 'Address is a deployed smart contract.'
          : 'EOA wallet, scored from contract usage and activity depth.',
      },
    },
    timestamp: new Date().toISOString(),
    processingTimeMs: Date.now() - startedAt,
  };
}
