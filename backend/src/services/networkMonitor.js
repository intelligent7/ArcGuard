import { ethers } from 'ethers';
import { getBlock, getLatestBlock, getProvider } from './arcProvider.js';

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const ERC20_METADATA_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

const DEFAULT_INTERVAL_MS = 5000;
const BACKFILL_BLOCKS = 20;
const MAX_BLOCKS_PER_POLL = 60;
const LIVE_WINDOW_BLOCKS = 90;
const MAX_EVENTS = 250;

const WHALE_TRANSFER_AMOUNT = 10000;
const MASSIVE_OUTFLOW_AMOUNT = 50000;
const BURST_TRANSFER_COUNT = 25;
const CCTP_SPIKE_COUNT = 35;
const CCTP_SPIKE_VOLUME_AMOUNT = 100000;
const STABLE_TOKEN_SYMBOLS = new Set(['USDC', 'WUSDC', 'EURC']);

const state = {
  running: false,
  startedAt: null,
  lastPollAt: null,
  lastError: null,
  latestBlock: null,
  lastScannedBlock: null,
  intervalMs: DEFAULT_INTERVAL_MS,
  events: [],
  stats: {
    blocksScanned: 0,
    transfersSeen: 0,
    eventsDetected: 0,
    resyncs: 0,
  },
};

let intervalId = null;
let polling = false;
const knownEventIds = new Set();
const tokenMetadataCache = new Map();

export async function startNetworkMonitor(options = {}) {
  if (state.running) {
    return getNetworkMonitorStatus();
  }

  const latestBlock = await getLatestBlock();

  state.intervalMs = Number(options.intervalMs) || DEFAULT_INTERVAL_MS;
  state.startedAt = new Date().toISOString();
  state.lastPollAt = null;
  state.lastError = null;
  state.running = true;
  state.latestBlock = latestBlock;
  state.lastScannedBlock = Math.max(0, latestBlock - BACKFILL_BLOCKS);

  await pollNetworkOnce();
  intervalId = setInterval(() => {
    pollNetworkOnce().catch((err) => {
      state.lastError = err.message;
      console.error('[Monitor] polling error:', err);
    });
  }, state.intervalMs);

  intervalId.unref?.();
  return getNetworkMonitorStatus();
}

export function stopNetworkMonitor() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  state.running = false;
  return getNetworkMonitorStatus();
}

export async function pollNetworkOnce() {
  if (polling) {
    return getNetworkMonitorStatus();
  }

  polling = true;
  try {
    const latestBlock = await getLatestBlock();
    const currentLag = state.lastScannedBlock === null ? 0 : latestBlock - state.lastScannedBlock;
    if (currentLag > LIVE_WINDOW_BLOCKS) {
      state.lastScannedBlock = Math.max(0, latestBlock - BACKFILL_BLOCKS);
      state.stats.resyncs += 1;
    }

    const fromBlock = Math.max(0, (state.lastScannedBlock ?? latestBlock - BACKFILL_BLOCKS) + 1);
    const toBlock = Math.min(latestBlock, fromBlock + MAX_BLOCKS_PER_POLL - 1);

    state.latestBlock = latestBlock;

    if (fromBlock > latestBlock) {
      state.lastPollAt = new Date().toISOString();
      return getNetworkMonitorStatus();
    }

    for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber += 1) {
      await inspectBlock(blockNumber);
      state.lastScannedBlock = blockNumber;
    }

    state.lastPollAt = new Date().toISOString();
    state.lastError = null;
    return getNetworkMonitorStatus();
  } catch (err) {
    state.lastError = err.message;
    throw err;
  } finally {
    polling = false;
  }
}

export function getNetworkMonitorStatus() {
  return {
    running: state.running,
    startedAt: state.startedAt,
    lastPollAt: state.lastPollAt,
    lastError: state.lastError,
    latestBlock: state.latestBlock,
    lastScannedBlock: state.lastScannedBlock,
    lagBlocks: state.latestBlock && state.lastScannedBlock
      ? Math.max(0, state.latestBlock - state.lastScannedBlock)
      : null,
    intervalMs: state.intervalMs,
    stats: { ...state.stats },
    eventCount: state.events.length,
  };
}

export function getNetworkEvents(filters = {}) {
  const limit = clamp(Number(filters.limit) || 50, 1, 200);
  const severity = String(filters.severity || '').toLowerCase();
  const type = String(filters.type || '').toLowerCase();

  let events = [...state.events];
  if (severity) {
    events = events.filter((event) => event.severity === severity);
  }
  if (type) {
    events = events.filter((event) => event.type === type);
  }

  return {
    status: getNetworkMonitorStatus(),
    events: events.slice(0, limit),
  };
}

async function inspectBlock(blockNumber) {
  const [block, logs] = await Promise.all([
    getBlock(blockNumber),
    getTransferLogs(blockNumber),
  ]);

  const transfers = (await Promise.all(logs.map(parseTransferLog))).filter(Boolean);
  state.stats.blocksScanned += 1;
  state.stats.transfersSeen += transfers.length;

  const detected = [
    ...detectWhaleTransfers(transfers, block),
    ...detectMassiveOutflows(transfers, block),
    ...detectBurstActivity(transfers, block),
    ...detectCctpSpikeCandidate(transfers, block),
  ];

  for (const event of detected) {
    pushEvent(event);
  }
}

async function getTransferLogs(blockNumber) {
  const provider = getProvider();
  return provider.getLogs({
    fromBlock: blockNumber,
    toBlock: blockNumber,
    topics: [TRANSFER_TOPIC],
  });
}

async function parseTransferLog(log) {
  if (!log.topics || log.topics.length < 3 || !log.data) {
    return null;
  }

  try {
    const from = ethers.getAddress(`0x${log.topics[1].slice(26)}`);
    const to = ethers.getAddress(`0x${log.topics[2].slice(26)}`);
    const contractAddress = ethers.getAddress(log.address);
    const metadata = await getTokenMetadata(contractAddress);
    const rawAmount = BigInt(log.data);
    const amount = Number(ethers.formatUnits(rawAmount, metadata.decimals));

    return {
      from,
      to,
      amount,
      rawAmount: rawAmount.toString(),
      tokenSymbol: metadata.symbol,
      tokenName: metadata.name,
      tokenDecimals: metadata.decimals,
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
      contractAddress,
      logIndex: log.index,
    };
  } catch {
    return null;
  }
}

async function getTokenMetadata(address) {
  const cacheKey = address.toLowerCase();
  if (tokenMetadataCache.has(cacheKey)) {
    return tokenMetadataCache.get(cacheKey);
  }

  const provider = getProvider();
  const token = new ethers.Contract(address, ERC20_METADATA_ABI, provider);
  const metadata = {
    symbol: 'TOKEN',
    name: 'Unknown token',
    decimals: 18,
  };

  try {
    metadata.decimals = Number(await token.decimals());
  } catch {
    metadata.decimals = 18;
  }

  try {
    metadata.symbol = sanitizeTokenText(await token.symbol(), 'TOKEN');
  } catch {
    metadata.symbol = 'TOKEN';
  }

  try {
    metadata.name = sanitizeTokenText(await token.name(), 'Unknown token');
  } catch {
    metadata.name = 'Unknown token';
  }

  tokenMetadataCache.set(cacheKey, metadata);
  return metadata;
}

function detectWhaleTransfers(transfers, block) {
  return transfers
    .filter((transfer) => !isZeroAddress(transfer.from) && !isZeroAddress(transfer.to))
    .filter(isStableTokenTransfer)
    .filter((transfer) => transfer.amount >= WHALE_TRANSFER_AMOUNT)
    .slice(0, 20)
    .map((transfer) => buildEvent({
      type: 'whale_transfer',
      severity: transfer.amount >= MASSIVE_OUTFLOW_AMOUNT ? 'high' : 'medium',
      title: 'Whale stablecoin transfer',
      summary: `${formatAmount(transfer.amount)} ${transfer.tokenSymbol} moved in one transfer`,
      block,
      txHash: transfer.txHash,
      amount: transfer.amount,
      amountLabel: transfer.tokenSymbol,
      addresses: {
        from: transfer.from,
        to: transfer.to,
        token: transfer.contractAddress,
      },
      metrics: {
        thresholdAmount: WHALE_TRANSFER_AMOUNT,
        tokenDecimals: transfer.tokenDecimals,
        tokenName: transfer.tokenName,
        rawAmount: transfer.rawAmount,
      },
    }));
}

function detectMassiveOutflows(transfers, block) {
  const spendTransfers = transfers
    .filter((transfer) => !isZeroAddress(transfer.from) && !isZeroAddress(transfer.to))
    .filter(isStableTokenTransfer);
  const bySenderAndToken = groupBy(
    spendTransfers,
    (transfer) => `${transfer.from.toLowerCase()}:${transfer.contractAddress.toLowerCase()}`
  );
  const events = [];

  for (const senderTransfers of bySenderAndToken.values()) {
    const total = senderTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);
    const uniqueRecipients = new Set(senderTransfers.map((transfer) => transfer.to.toLowerCase())).size;
    const firstTransfer = senderTransfers[0];

    if (total >= MASSIVE_OUTFLOW_AMOUNT && uniqueRecipients >= 2) {
      events.push(buildEvent({
        type: 'massive_outflow',
        severity: 'high',
        title: 'Massive outflow',
        summary: `${formatAmount(total)} ${firstTransfer.tokenSymbol} sent to ${uniqueRecipients} recipient(s) in one block`,
        block,
        txHash: firstTransfer.txHash,
        amount: total,
        amountLabel: firstTransfer.tokenSymbol,
        addresses: {
          from: firstTransfer.from,
          token: firstTransfer.contractAddress,
        },
        metrics: {
          transferCount: senderTransfers.length,
          uniqueRecipients,
          thresholdAmount: MASSIVE_OUTFLOW_AMOUNT,
          tokenDecimals: firstTransfer.tokenDecimals,
          tokenName: firstTransfer.tokenName,
        },
      }));
    }
  }

  return events.slice(0, 20);
}

function detectBurstActivity(transfers, block) {
  if (transfers.length < BURST_TRANSFER_COUNT) {
    return [];
  }

  const uniqueSenders = new Set(transfers.map((transfer) => transfer.from.toLowerCase())).size;
  const uniqueRecipients = new Set(transfers.map((transfer) => transfer.to.toLowerCase())).size;

  return [
    buildEvent({
      type: 'burst_activity',
      severity: transfers.length >= BURST_TRANSFER_COUNT * 2 ? 'high' : 'medium',
      title: 'Transfer burst',
      summary: `${transfers.length} transfer logs in block ${getBlockNumber(block)}`,
      block,
      txHash: transfers[0]?.txHash || null,
      metrics: {
        transferCount: transfers.length,
        uniqueSenders,
        uniqueRecipients,
      },
    }),
  ];
}

function detectCctpSpikeCandidate(transfers, block) {
  const spendTransfers = transfers
    .filter((transfer) => !isZeroAddress(transfer.from) && !isZeroAddress(transfer.to))
    .filter(isStableTokenTransfer);
  const byToken = groupBy(spendTransfers, (transfer) => transfer.contractAddress.toLowerCase());
  const [token, tokenTransfers] = [...byToken.entries()]
    .sort((a, b) => b[1].length - a[1].length)[0] || [null, []];
  const total = tokenTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);

  if (tokenTransfers.length < CCTP_SPIKE_COUNT || total < CCTP_SPIKE_VOLUME_AMOUNT) {
    return [];
  }

  const firstTransfer = tokenTransfers[0];

  return [
    buildEvent({
      type: 'cctp_spike_candidate',
      severity: 'high',
      title: 'CCTP spike candidate',
      summary: `${formatAmount(total)} ${firstTransfer.tokenSymbol} volume and ${tokenTransfers.length} spend transfers in one block`,
      block,
      txHash: firstTransfer.txHash,
      amount: total,
      amountLabel: firstTransfer.tokenSymbol,
      addresses: {
        token: token ? ethers.getAddress(token) : null,
      },
      metrics: {
        transferCount: tokenTransfers.length,
        dominantTokenTransfers: tokenTransfers.length,
        tokenDecimals: firstTransfer.tokenDecimals,
        tokenName: firstTransfer.tokenName,
      },
    }),
  ];
}

function buildEvent({ type, severity, title, summary, block, txHash, amount = null, amountLabel = '', addresses = {}, metrics = {} }) {
  const blockNumber = getBlockNumber(block);
  return {
    id: `${type}:${blockNumber}:${txHash || 'block'}:${hashText(summary)}`,
    type,
    severity,
    title,
    summary,
    blockNumber,
    blockHash: block?.hash || null,
    timestamp: block?.timestamp ? new Date(block.timestamp * 1000).toISOString() : new Date().toISOString(),
    txHash,
    amount: amount === null ? null : round(amount),
    amountLabel,
    addresses,
    metrics,
  };
}

function pushEvent(event) {
  if (!event || knownEventIds.has(event.id)) {
    return;
  }

  knownEventIds.add(event.id);
  state.events.unshift(event);
  state.stats.eventsDetected += 1;

  while (state.events.length > MAX_EVENTS) {
    const removed = state.events.pop();
    if (removed) {
      knownEventIds.delete(removed.id);
    }
  }
}

function groupBy(items, getKey) {
  const groups = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  }
  return groups;
}

function getBlockNumber(block) {
  return Number(block?.number ?? block?.blockNumber ?? 0);
}

function formatAmount(value) {
  return round(value).toLocaleString('en-US');
}

function sanitizeTokenText(value, fallback) {
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }
  return text.slice(0, 32);
}

function isZeroAddress(address) {
  return String(address).toLowerCase() === ethers.ZeroAddress.toLowerCase();
}

function isStableTokenTransfer(transfer) {
  return STABLE_TOKEN_SYMBOLS.has(String(transfer.tokenSymbol || '').toUpperCase());
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16);
}
