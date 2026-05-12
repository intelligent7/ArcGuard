import { ethers } from 'ethers';
import { getBlock, getLatestBlock, getProvider } from './arcProvider.js';

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

const DEFAULT_INTERVAL_MS = 5000;
const BACKFILL_BLOCKS = 20;
const MAX_BLOCKS_PER_POLL = 60;
const LIVE_WINDOW_BLOCKS = 90;
const MAX_EVENTS = 250;

const WHALE_TRANSFER_UNITS = 10000;
const MASSIVE_OUTFLOW_UNITS = 50000;
const BURST_TRANSFER_COUNT = 25;
const CCTP_SPIKE_COUNT = 35;
const CCTP_SPIKE_VOLUME_UNITS = 100000;

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

  const transfers = logs.map(parseTransferLog).filter(Boolean);
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

function parseTransferLog(log) {
  if (!log.topics || log.topics.length < 3 || !log.data) {
    return null;
  }

  try {
    const from = ethers.getAddress(`0x${log.topics[1].slice(26)}`);
    const to = ethers.getAddress(`0x${log.topics[2].slice(26)}`);
    const valueUnits = Number(ethers.formatUnits(BigInt(log.data), 6));

    return {
      from,
      to,
      valueUnits,
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
      contractAddress: ethers.getAddress(log.address),
      logIndex: log.index,
    };
  } catch {
    return null;
  }
}

function detectWhaleTransfers(transfers, block) {
  return transfers
    .filter((transfer) => !isZeroAddress(transfer.from) && !isZeroAddress(transfer.to))
    .filter((transfer) => transfer.valueUnits >= WHALE_TRANSFER_UNITS)
    .slice(0, 20)
    .map((transfer) => buildEvent({
      type: 'whale_transfer',
      severity: transfer.valueUnits >= MASSIVE_OUTFLOW_UNITS ? 'high' : 'medium',
      title: 'Whale transfer',
      summary: `${formatAmount(transfer.valueUnits)} token units moved in one transfer`,
      block,
      txHash: transfer.txHash,
      amountUnits: transfer.valueUnits,
      addresses: {
        from: transfer.from,
        to: transfer.to,
        token: transfer.contractAddress,
      },
      metrics: {
        thresholdUnits: WHALE_TRANSFER_UNITS,
      },
    }));
}

function detectMassiveOutflows(transfers, block) {
  const spendTransfers = transfers.filter((transfer) => !isZeroAddress(transfer.from) && !isZeroAddress(transfer.to));
  const bySender = groupBy(spendTransfers, (transfer) => transfer.from.toLowerCase());
  const events = [];

  for (const senderTransfers of bySender.values()) {
    const total = senderTransfers.reduce((sum, transfer) => sum + transfer.valueUnits, 0);
    const uniqueRecipients = new Set(senderTransfers.map((transfer) => transfer.to.toLowerCase())).size;

    if (total >= MASSIVE_OUTFLOW_UNITS && uniqueRecipients >= 2) {
      events.push(buildEvent({
        type: 'massive_outflow',
        severity: 'high',
        title: 'Massive outflow',
        summary: `${formatAmount(total)} token units sent to ${uniqueRecipients} recipient(s) in one block`,
        block,
        txHash: senderTransfers[0].txHash,
        amountUnits: total,
        addresses: {
          from: senderTransfers[0].from,
          token: senderTransfers[0].contractAddress,
        },
        metrics: {
          transferCount: senderTransfers.length,
          uniqueRecipients,
          thresholdUnits: MASSIVE_OUTFLOW_UNITS,
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

  const total = transfers.reduce((sum, transfer) => sum + transfer.valueUnits, 0);
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
      amountUnits: total,
      metrics: {
        transferCount: transfers.length,
        uniqueSenders,
        uniqueRecipients,
      },
    }),
  ];
}

function detectCctpSpikeCandidate(transfers, block) {
  const spendTransfers = transfers.filter((transfer) => !isZeroAddress(transfer.from) && !isZeroAddress(transfer.to));
  const total = spendTransfers.reduce((sum, transfer) => sum + transfer.valueUnits, 0);
  if (spendTransfers.length < CCTP_SPIKE_COUNT || total < CCTP_SPIKE_VOLUME_UNITS) {
    return [];
  }

  const byToken = groupBy(spendTransfers, (transfer) => transfer.contractAddress.toLowerCase());
  const [token, tokenTransfers] = [...byToken.entries()]
    .sort((a, b) => b[1].length - a[1].length)[0] || [null, []];

  return [
    buildEvent({
      type: 'cctp_spike_candidate',
      severity: 'high',
      title: 'CCTP spike candidate',
      summary: `${formatAmount(total)} token-unit volume and ${spendTransfers.length} spend transfers in one block`,
      block,
      txHash: spendTransfers[0]?.txHash || null,
      amountUnits: total,
      addresses: {
        token: token ? ethers.getAddress(token) : null,
      },
      metrics: {
        transferCount: spendTransfers.length,
        dominantTokenTransfers: tokenTransfers.length,
      },
    }),
  ];
}

function buildEvent({ type, severity, title, summary, block, txHash, amountUnits = 0, addresses = {}, metrics = {} }) {
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
    amountUnits: round(amountUnits),
    amountLabel: 'token units',
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

function isZeroAddress(address) {
  return String(address).toLowerCase() === ethers.ZeroAddress.toLowerCase();
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
