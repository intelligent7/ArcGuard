/**
 * ArcGuard — Sanctions Checker
 * Checks addresses against OFAC SDN list and known malicious addresses
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANCTIONS_FILE = path.join(__dirname, '..', 'data', 'sanctions', 'sanctioned_addresses.json');

// Known mixer contract addresses (Tornado Cash etc.)
const KNOWN_MIXERS = new Set([
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b', // Tornado Cash Router
  '0x722122df12d4e14e13ac3b6895a86e84145b6967', // Tornado Cash Proxy
  '0x12d66f87a04a9e220743712ce6d9bb1b5616b8fc', // Tornado Cash 0.1 ETH
  '0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936', // Tornado Cash 1 ETH
  '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf', // Tornado Cash 10 ETH
  '0xa160cdab225685da1d56aa342ad8841c3b53f291', // Tornado Cash 100 ETH
].map(a => a.toLowerCase()));

// Known scam/phishing addresses (community-sourced)
const KNOWN_SCAMS = new Set([
  // This would be populated from ChainAbuse, Etherscan labels, etc.
  // For MVP, we start with an empty set and add as we go
]);

let sanctionedAddresses = new Set();

/**
 * Load sanctioned addresses from local file
 */
export function loadSanctionsList() {
  try {
    if (fs.existsSync(SANCTIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SANCTIONS_FILE, 'utf-8'));
      sanctionedAddresses = new Set(data.addresses.map(a => a.toLowerCase()));
      console.log(`[Sanctions] Loaded ${sanctionedAddresses.size} sanctioned addresses`);
    } else {
      console.log('[Sanctions] No sanctions file found, initializing with defaults');
      initDefaultSanctions();
    }
  } catch (err) {
    console.error('[Sanctions] Error loading sanctions list:', err.message);
    initDefaultSanctions();
  }
}

/**
 * Initialize with known OFAC-sanctioned crypto addresses
 * Source: https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses
 */
function initDefaultSanctions() {
  const defaultSanctioned = [
    // Tornado Cash sanctioned addresses (OFAC August 2022)
    '0x8589427373d6d84e98730d7795d8f6f8731fda16',
    '0x722122df12d4e14e13ac3b6895a86e84145b6967',
    '0xdd4c48c0b24039969fc16d1cdf626eab821d3384',
    '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b',
    '0xd96f2b1ef156b3df97a9616b44bb024bab05e115',
    // Lazarus Group (North Korea)
    '0x098b716b8aaf21512996dc57eb0615e2383e2f96',
    '0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b',
    '0x3cffd56b47b7b41c56258d9c7731abadc360e460',
    '0x53b6936513e738f44fb50d2b9476730c0ab3bfc1',
  ];

  sanctionedAddresses = new Set(defaultSanctioned.map(a => a.toLowerCase()));
  
  // Save to file
  const dir = path.dirname(SANCTIONS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SANCTIONS_FILE, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: 'OFAC SDN + manual',
    addresses: [...sanctionedAddresses],
  }, null, 2));

  console.log(`[Sanctions] Initialized with ${sanctionedAddresses.size} default addresses`);
}

/**
 * Check if an address is sanctioned
 */
export function isSanctioned(address) {
  return sanctionedAddresses.has(address.toLowerCase());
}

/**
 * Check if an address is a known mixer
 */
export function isMixer(address) {
  return KNOWN_MIXERS.has(address.toLowerCase());
}

/**
 * Check if an address is a known scam
 */
export function isKnownScam(address) {
  return KNOWN_SCAMS.has(address.toLowerCase());
}

/**
 * Full sanctions report for an address
 */
export function getSanctionsReport(address) {
  const addr = address.toLowerCase();
  return {
    address,
    sanctioned: sanctionedAddresses.has(addr),
    isMixer: KNOWN_MIXERS.has(addr),
    isKnownScam: KNOWN_SCAMS.has(addr),
    lists: [
      ...(sanctionedAddresses.has(addr) ? ['OFAC_SDN'] : []),
      ...(KNOWN_MIXERS.has(addr) ? ['KNOWN_MIXER'] : []),
      ...(KNOWN_SCAMS.has(addr) ? ['KNOWN_SCAM'] : []),
    ],
  };
}
