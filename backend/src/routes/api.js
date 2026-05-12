/**
 * ArcGuard — API Routes
 */
import { Router } from 'express';
import { calculateRiskScore } from '../services/riskEngine.js';
import { getSanctionsReport, isSanctioned } from '../services/sanctionsCheck.js';
import { getWalletInfo, getRecentTransactions } from '../services/arcProvider.js';
import { ethers } from 'ethers';

const router = Router();

/**
 * GET /api/v1/risk-score/:address
 * Full risk assessment for a wallet address
 */
router.get('/risk-score/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }

    const checksumAddress = ethers.getAddress(address);
    const result = await calculateRiskScore(checksumAddress);

    res.json(result);
  } catch (err) {
    console.error('[API] risk-score error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

/**
 * GET /api/v1/sanctions/:address
 * Quick sanctions check (fast, no on-chain calls)
 */
router.get('/sanctions/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }

    const report = getSanctionsReport(ethers.getAddress(address));
    res.json(report);
  } catch (err) {
    console.error('[API] sanctions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/wallet/:address
 * Basic wallet info
 */
router.get('/wallet/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }

    const info = await getWalletInfo(ethers.getAddress(address));
    res.json(info);
  } catch (err) {
    console.error('[API] wallet error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

/**
 * POST /api/v1/screen
 * Business endpoint: screen an incoming payment
 * Body: { sender: "0x...", amount: 1000 }
 * Returns: { decision: "accept" | "reject" | "review", score, details }
 */
router.post('/screen', async (req, res) => {
  try {
    const { sender, amount } = req.body;

    if (!sender || !ethers.isAddress(sender)) {
      return res.status(400).json({ error: 'Invalid sender address' });
    }

    const txAmount = Number(amount) || 0;
    const checksumAddress = ethers.getAddress(sender);

    // Quick sanctions check first (fast path)
    if (isSanctioned(checksumAddress)) {
      return res.json({
        decision: 'reject',
        reason: 'Sanctioned address (OFAC)',
        action: 'BLOCK — Do not process. Freeze if possible.',
        score: 100,
        sender: checksumAddress,
        amount: txAmount,
        timestamp: new Date().toISOString(),
      });
    }

    // Full risk assessment
    const result = await calculateRiskScore(checksumAddress);

    // ══════════════════════════════════════════════════
    //  Decision Matrix: Score × Transaction Amount
    //  (adapted from SEON/Kount antifraud methodology)
    // ══════════════════════════════════════════════════
    //
    //  |               | Score 0-30  | Score 31-60  | Score 61-100  |
    //  |---------------|------------|-------------|--------------|
    //  | Small (<$100) | Accept     | Accept+Flag | Review       |
    //  | Mid ($100-10K)| Accept     | Review      | Reject       |
    //  | Large (>$10K) | Accept+Log | Reject+Alert| Reject+Freeze|

    const decision = getDecision(result.score, txAmount);

    res.json({
      decision: decision.action,
      reason: result.verdict,
      recommendation: decision.recommendation,
      score: result.score,
      level: result.level,
      entityType: result.entityType,
      sender: checksumAddress,
      amount: txAmount,
      amountTier: decision.amountTier,
      checks: result.checks,
      timestamp: new Date().toISOString(),
      processingTimeMs: result.processingTimeMs,
    });
  } catch (err) {
    console.error('[API] screen error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

/**
 * Decision matrix: Score × Amount → action + recommendation
 */
function getDecision(score, amount) {
  const amountTier = amount > 10000 ? 'large' : amount > 100 ? 'medium' : 'small';

  if (score <= 30) {
    // Low risk
    if (amountTier === 'large') {
      return { action: 'accept', amountTier, recommendation: 'Accept — log transaction for audit trail' };
    }
    return { action: 'accept', amountTier, recommendation: 'Accept — no action needed' };
  }

  if (score <= 60) {
    // Medium risk
    if (amountTier === 'small') {
      return { action: 'accept', amountTier, recommendation: 'Accept — flag address for monitoring' };
    }
    if (amountTier === 'medium') {
      return { action: 'review', amountTier, recommendation: 'Manual review recommended before processing' };
    }
    return { action: 'reject', amountTier, recommendation: 'Reject — medium risk + large amount. Request source of funds.' };
  }

  // High risk (61-100)
  if (amountTier === 'small') {
    return { action: 'review', amountTier, recommendation: 'Review — high risk but small amount. Monitor closely.' };
  }
  if (amountTier === 'medium') {
    return { action: 'reject', amountTier, recommendation: 'Reject — do not process. Consider quarantine.' };
  }
  return { action: 'reject', amountTier, recommendation: 'REJECT + FREEZE — high risk, large amount. Quarantine funds immediately.' };
}

/**
 * POST /api/v1/batch-check
 * Batch screening of multiple addresses
 * Body: { addresses: ["0x...", "0x..."] }
 */
router.post('/batch-check', async (req, res) => {
  try {
    const { addresses } = req.body;

    if (!Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({ error: 'Provide an array of addresses' });
    }

    if (addresses.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 addresses per batch' });
    }

    const results = await Promise.all(
      addresses.map(async (addr) => {
        if (!ethers.isAddress(addr)) {
          return { address: addr, error: 'Invalid address' };
        }
        try {
          const result = await calculateRiskScore(ethers.getAddress(addr));
          return {
            address: result.address,
            score: result.score,
            level: result.level,
            verdict: result.verdict,
          };
        } catch (err) {
          return { address: addr, error: err.message };
        }
      })
    );

    res.json({ results, count: results.length, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[API] batch-check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/health
 * Health check
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ArcGuard API', version: '1.0.0' });
});

export default router;
