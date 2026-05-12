# ArcGuard 🛡️

> **Onchain AML & Risk Scoring Engine for Arc Network**

ArcGuard is a free, open-source compliance tool that brings institutional-grade AML (Anti-Money Laundering) screening to the Arc blockchain. It analyzes wallet addresses, scores transaction risk, monitors network anomalies, and helps businesses block dirty money — all in real-time.

## Why ArcGuard?

Arc is built for institutional stablecoin finance. But institutions won't come without compliance infrastructure. ArcGuard fills this critical gap:

- **🔍 Wallet Risk Scoring** — Input any address → get a risk score (0-100) based on OFAC sanctions, mixer interactions, transaction patterns, and behavioral analysis
- **🏢 Business Payment Screening** — API endpoint for merchants to automatically accept/reject incoming USDC payments based on sender risk
- **🚨 Network Threat Monitor** — Real-time detection of exploits, rug pulls, whale movements, and suspicious transaction patterns across the entire Arc network
- **📊 Analytics Dashboard** — Beautiful UI to visualize risks, transaction graphs, and network health

## Architecture

```
Module 3: Engine (Core)     — Scans every block, scores every wallet
  ├── Module 1: Business API  — REST API for merchant payment screening
  └── Module 2: User Scanner  — Web dashboard + Telegram alerts
```

## Tech Stack

- **Backend:** Node.js + Express
- **Blockchain:** ethers.js v6 (Arc EVM-compatible)
- **Frontend:** Vite + React
- **Database:** SQLite
- **Sanctions Data:** OFAC SDN List + OpenSanctions

## Quick Start

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/risk-score/:address` | Full risk assessment (0-100 score) |
| `GET` | `/api/v1/sanctions/:address` | Quick OFAC sanctions check |
| `GET` | `/api/v1/wallet/:address` | Basic wallet info |
| `POST` | `/api/v1/screen` | Screen incoming payment (accept/reject/review) |
| `POST` | `/api/v1/batch-check` | Batch address screening (up to 50) |
| `GET` | `/api/v1/health` | Health check |

### Example: Screen a Payment
```bash
curl -X POST http://localhost:3001/api/v1/screen \
  -H "Content-Type: application/json" \
  -d '{"sender": "0x1234...", "amount": 500}'
```

Response:
```json
{
  "decision": "accept",
  "reason": "✅ Low Risk — Safe to transact",
  "score": 12,
  "level": "low"
}
```

## Risk Score Breakdown

| Score | Level | Action |
|-------|-------|--------|
| 0-30 | 🟢 Low | Safe to transact |
| 31-60 | 🟡 Medium | Proceed with caution |
| 61-100 | 🔴 High | Do not transact |
| 100 | 🚨 Critical | Sanctioned address |

## Detection Patterns

ArcGuard detects **33 threat patterns** across 5 categories:

- **AML/Laundering (D1-D6):** OFAC sanctions, mixer interaction, chain hopping, peel chains, structuring
- **Exploits (A1-A8):** Flash drains, reentrancy, rug pulls, proxy upgrades, oracle manipulation
- **Scams (B1-B5):** Honeypots, hidden mints, fake airdrops, ponzi schemes
- **Phishing (C1-C4):** Address poisoning, unlimited approvals, permit phishing
- **Network Anomalies (E1-E7):** Whale movements, massive outflows, CCTP spikes, sybil patterns

## Arc Network

| Parameter | Value |
|-----------|-------|
| Network | Arc Testnet |
| RPC | `https://rpc.testnet.arc.network` |
| Chain ID | `5042002` |
| Gas Token | USDC |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app) |

## License

MIT

## Built for Arc 🌐

ArcGuard is built specifically for the Arc ecosystem as part of the Architect program. It addresses the "Compliance & Identity Infrastructure" gap identified in Arc's documentation and provides essential security tooling for the stablecoin-native economy.
