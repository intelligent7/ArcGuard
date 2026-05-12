/**
 * ArcGuard - Main Server
 */
import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api.js';
import { loadSanctionsList } from './services/sanctionsCheck.js';
import { startNetworkMonitor } from './services/networkMonitor.js';

const app = express();
const PORT = process.env.PORT || 3099;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.url} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

app.use('/api/v1', apiRoutes);

app.get('/', (req, res) => {
  res.json({
    name: 'ArcGuard',
    description: 'Onchain AML and Risk Scoring Engine for Arc Network',
    version: '1.0.0',
    docs: '/api/v1/health',
    endpoints: [
      'GET  /api/v1/risk-score/:address  - Full risk assessment',
      'GET  /api/v1/arc-score/:address   - Arc reputation score',
      'GET  /api/v1/sanctions/:address   - Quick sanctions check',
      'GET  /api/v1/wallet/:address      - Wallet info',
      'GET  /api/v1/monitor/status       - Network Monitor status',
      'GET  /api/v1/monitor/events       - Network Monitor live feed',
      'POST /api/v1/monitor/poll         - Force one monitor poll',
      'POST /api/v1/screen               - Screen incoming payment',
      'POST /api/v1/batch-check          - Batch address screening',
      'GET  /api/v1/health               - Health check',
    ],
  });
});

async function start() {
  console.log('');
  console.log('  ========================================');
  console.log('    ArcGuard v1.0.0');
  console.log('    Onchain AML and Risk Scoring Engine');
  console.log('    for Arc Network');
  console.log('  ========================================');
  console.log('');

  loadSanctionsList();
  startNetworkMonitor().catch((err) => {
    console.warn('[Monitor] Auto-start failed:', err.message);
  });

  app.listen(PORT, () => {
    console.log(`[Server] ArcGuard API running at http://localhost:${PORT}`);
    console.log('[Server] Arc Testnet RPC: https://rpc.testnet.arc.network');
    console.log(`[Server] Try: http://localhost:${PORT}/api/v1/health`);
  });
}

start().catch(console.error);
