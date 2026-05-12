/**
 * ArcGuard — Main Server
 */
import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api.js';
import { loadSanctionsList } from './services/sanctionsCheck.js';

const app = express();
const PORT = process.env.PORT || 3099;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.url} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// API Routes
app.use('/api/v1', apiRoutes);

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'ArcGuard',
    description: 'Onchain AML & Risk Scoring Engine for Arc Network',
    version: '1.0.0',
    docs: '/api/v1/health',
    endpoints: [
      'GET  /api/v1/risk-score/:address  — Full risk assessment',
      'GET  /api/v1/sanctions/:address   — Quick sanctions check',
      'GET  /api/v1/wallet/:address      — Wallet info',
      'POST /api/v1/screen               — Screen incoming payment',
      'POST /api/v1/batch-check           — Batch address screening',
      'GET  /api/v1/health               — Health check',
    ],
  });
});

// Initialize and start
async function start() {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║         🛡️  ArcGuard v1.0.0           ║');
  console.log('  ║   Onchain AML & Risk Scoring Engine   ║');
  console.log('  ║          for Arc Network               ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');

  // Load sanctions list
  loadSanctionsList();

  // Start server
  app.listen(PORT, () => {
    console.log(`\n[Server] ArcGuard API running at http://localhost:${PORT}`);
    console.log(`[Server] Arc Testnet RPC: https://rpc.testnet.arc.network`);
    console.log(`[Server] Try: http://localhost:${PORT}/api/v1/health\n`);
  });
}

start().catch(console.error);
