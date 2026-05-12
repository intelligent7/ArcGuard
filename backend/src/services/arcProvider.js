/**
 * ArcGuard — Arc Network Provider
 * Connects to Arc Testnet via ethers.js
 */
import { ethers } from 'ethers';

const ARC_TESTNET_RPC = 'https://rpc.testnet.arc.network';
const ARC_CHAIN_ID = 5042002;

let provider = null;

export function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(ARC_TESTNET_RPC, {
      name: 'arc-testnet',
      chainId: ARC_CHAIN_ID,
    });
  }
  return provider;
}

/**
 * Get basic wallet info from Arc
 */
export async function getWalletInfo(address) {
  const p = getProvider();
  
  const [balance, txCount, code] = await Promise.all([
    p.getBalance(address),
    p.getTransactionCount(address),
    p.getCode(address),
  ]);

  const isContract = code !== '0x';
  // On Arc, balance is in USDC (6 decimals)
  const balanceUSDC = Number(ethers.formatUnits(balance, 6));

  return {
    address,
    balanceUSDC,
    txCount,
    isContract,
  };
}

/**
 * Get recent transactions for an address (last N blocks)
 */
export async function getRecentTransactions(address, blockRange = 1000) {
  const p = getProvider();
  const currentBlock = await p.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - blockRange);
  
  // Get logs for transfers involving this address
  // USDC Transfer event signature: Transfer(address,address,uint256)
  const transferTopic = ethers.id('Transfer(address,address,uint256)');
  const paddedAddress = ethers.zeroPadValue(address, 32);

  // Outgoing transfers
  const outgoingLogs = await p.getLogs({
    fromBlock,
    toBlock: currentBlock,
    topics: [transferTopic, paddedAddress],
  });

  // Incoming transfers
  const incomingLogs = await p.getLogs({
    fromBlock,
    toBlock: currentBlock,
    topics: [transferTopic, null, paddedAddress],
  });

  return {
    outgoing: outgoingLogs.map(parseTransferLog),
    incoming: incomingLogs.map(parseTransferLog),
    blocksScanned: blockRange,
    fromBlock,
    toBlock: currentBlock,
  };
}

/**
 * Parse a Transfer event log
 */
function parseTransferLog(log) {
  const from = ethers.getAddress('0x' + log.topics[1].slice(26));
  const to = ethers.getAddress('0x' + log.topics[2].slice(26));
  const value = Number(ethers.formatUnits(BigInt(log.data), 6));

  return {
    from,
    to,
    valueUSDC: value,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    contractAddress: log.address,
  };
}

/**
 * Get the latest block number
 */
export async function getLatestBlock() {
  const p = getProvider();
  return await p.getBlockNumber();
}

/**
 * Get block with transactions
 */
export async function getBlock(blockNumber) {
  const p = getProvider();
  return await p.getBlock(blockNumber, true);
}
