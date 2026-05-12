import { useState } from 'react';
import './App.css';

const API_URL = 'http://localhost:3099/api/v1';

function App() {
  const [address, setAddress] = useState('');
  const [riskResult, setRiskResult] = useState(null);
  const [arcScoreResult, setArcScoreResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('scanner');

  async function handleAnalyze() {
    if (!address.trim()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'arcScore') {
        setArcScoreResult(null);
        const res = await fetch(`${API_URL}/arc-score/${address.trim()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load Arc Score');
        }
        setArcScoreResult(data);
      } else {
        setRiskResult(null);
        const res = await fetch(`${API_URL}/risk-score/${address.trim()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to scan address');
        }
        setRiskResult(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      handleAnalyze();
    }
  }

  const title = activeTab === 'arcScore'
    ? 'Check your Arc reputation'
    : activeTab === 'monitor'
      ? 'Watch Arc activity in real time'
      : activeTab === 'api'
        ? 'Integrate ArcGuard into your product'
        : 'Scan any address on Arc';

  const subtitle = activeTab === 'arcScore'
    ? 'Measure wallet maturity, activity depth, volume, and ecosystem footprint on Arc'
    : activeTab === 'monitor'
      ? 'Live monitoring is the next module: whales, outflows, and anomaly alerts'
      : activeTab === 'api'
        ? 'Use ArcGuard endpoints for AML screening, Arc Score, and payment decisions'
        : 'AML screening, risk scoring, and threat detection for the Arc Network';

  const placeholder = activeTab === 'arcScore'
    ? 'Enter an Arc address to calculate reputation score...'
    : 'Enter wallet address, contract, or agent to scan...';

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="logo">Arc<span>Guard</span></div>
        </div>
        <div className="navbar-badge">
          <span className="dot"></span>
          Arc Testnet
        </div>
        <div className="navbar-tabs">
          <button className={activeTab === 'scanner' ? 'active' : ''} onClick={() => setActiveTab('scanner')}>Scanner</button>
          <button className={activeTab === 'arcScore' ? 'active' : ''} onClick={() => setActiveTab('arcScore')}>Arc Score</button>
          <button className={activeTab === 'monitor' ? 'active' : ''} onClick={() => setActiveTab('monitor')}>Network Monitor</button>
          <button className={activeTab === 'api' ? 'active' : ''} onClick={() => setActiveTab('api')}>API Docs</button>
        </div>
      </nav>

      <main className="main-content">
        <h1 className="hero-title">{title}</h1>
        <p className="hero-subtitle">{subtitle}</p>

        {(activeTab === 'scanner' || activeTab === 'arcScore') && (
          <div className="search-container">
            <input
              className="search-input"
              type="text"
              placeholder={placeholder}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className={`search-btn ${loading ? 'loading' : ''}`}
              onClick={handleAnalyze}
              disabled={loading || !address.trim()}
            >
              {loading ? 'Loading...' : activeTab === 'arcScore' ? 'Check score' : 'Analyze'}
            </button>
          </div>
        )}

        {error && <div className="error-banner">Warning: {error}</div>}

        {activeTab === 'scanner' && riskResult && <RiskResultPanel result={riskResult} />}
        {activeTab === 'arcScore' && arcScoreResult && <ArcScorePanel result={arcScoreResult} />}
        {activeTab === 'monitor' && <MonitorPlaceholder />}
        {activeTab === 'api' && <ApiDocsPanel />}

        {activeTab === 'scanner' && !riskResult && !loading && !error && <EmptyState mode="scanner" />}
        {activeTab === 'arcScore' && !arcScoreResult && !loading && !error && <EmptyState mode="arcScore" />}
      </main>
    </div>
  );
}

function EmptyState({ mode }) {
  return (
    <div className="empty-state">
      <div className="shield-icon">{mode === 'arcScore' ? 'ARC' : 'AG'}</div>
      <p>
        {mode === 'arcScore'
          ? 'Enter an Arc wallet to compute reputation, consistency, volume, and ecosystem depth.'
          : 'Enter a wallet address, smart contract, or agent address to get a comprehensive AML risk assessment.'}
      </p>
    </div>
  );
}

function RiskResultPanel({ result }) {
  const { address, score, level, verdict, checks, processingTimeMs } = result;

  return (
    <div className="result-panel">
      <div className="result-header">
        <div className="result-address">{address.slice(0, 8)}...{address.slice(-6)}</div>
        <div className={`result-verdict ${level}`}>{verdict}</div>
      </div>

      <div className="result-body">
        <div className="score-container">
          <ScoreRing score={score} color={getRiskColor(level)} />
          <div className="score-label" style={{ color: getRiskColor(level) }}>
            {level === 'critical' ? 'CRITICAL RISK' : `${level.toUpperCase()} RISK`}
          </div>
          <div className="score-time">Scanned in {processingTimeMs}ms</div>
        </div>

        <div className="checks-grid">
          <CheckCard
            title="OFAC Sanctions"
            icon={checks.sanctions?.passed ? 'PASS' : 'BLOCK'}
            value={checks.sanctions?.passed ? 'Clear' : 'Sanctioned'}
            status={checks.sanctions?.passed ? 'pass' : 'fail'}
            detail={checks.sanctions?.details?.lists?.join(', ') || 'No matches'}
          />
          <CheckCard
            title="Mixer Links"
            icon={checks.mixerInteraction?.passed ? 'PASS' : 'WARN'}
            value={checks.mixerInteraction?.passed ? 'None found' : `${checks.mixerInteraction?.details?.mixerInteractions || 0} found`}
            status={checks.mixerInteraction?.passed ? 'pass' : 'warn'}
            detail={checks.mixerInteraction?.passed ? 'No mixer interactions detected' : 'Historical mixer interaction found'}
          />
          <CheckCard
            title="Tx Patterns"
            icon={checks.transactionPatterns?.passed ? 'PASS' : 'WARN'}
            value={checks.transactionPatterns?.passed ? 'Normal' : 'Suspicious'}
            status={checks.transactionPatterns?.passed ? 'pass' : 'warn'}
            detail={checks.transactionPatterns?.details?.flags?.join('; ') || 'No suspicious patterns'}
          />
          <CheckCard
            title="Wallet Activity"
            icon={checks.walletAge?.passed ? 'PASS' : 'WARN'}
            value={`${checks.walletAge?.details?.txCount || 0} txns`}
            status={checks.walletAge?.passed ? 'pass' : 'warn'}
            detail={`Balance: ${checks.walletAge?.details?.balanceUSDC?.toFixed(2) || '0.00'} USDC`}
          />
          <CheckCard
            title="Counterparties"
            icon={checks.sanctionedCounterparty?.passed ? 'PASS' : 'FAIL'}
            value={checks.sanctionedCounterparty?.passed ? 'Clean' : 'Flagged'}
            status={checks.sanctionedCounterparty?.passed ? 'pass' : 'fail'}
            detail={`${checks.sanctionedCounterparty?.details?.sanctionedInteractions || 0} sanctioned interactions`}
          />
          <CheckCard
            title="Entity Type"
            icon="TYPE"
            value={result.entityType?.label || (checks.walletAge?.details?.isContract ? 'Contract' : 'EOA Wallet')}
            status="info"
            detail={result.entityType?.hint || 'Address classification'}
          />
        </div>
      </div>
    </div>
  );
}

function ArcScorePanel({ result }) {
  const { address, score, tier, verdict, summary, breakdown, processingTimeMs } = result;
  const cards = Object.values(breakdown || {});
  const color = getArcScoreColor(score);

  return (
    <div className="result-panel">
      <div className="result-header">
        <div className="result-address">{address.slice(0, 8)}...{address.slice(-6)}</div>
        <div className="result-verdict info">{verdict}</div>
      </div>

      <div className="result-body">
        <div className="score-container">
          <ScoreRing score={score} color={color} />
          <div className="score-label" style={{ color }}>
            {tier.toUpperCase()} ARC SCORE
          </div>
          <div className="score-time">Calculated in {processingTimeMs}ms</div>
        </div>

        <div className="checks-grid">
          {cards.map((item) => (
            <CheckCard
              key={item.label}
              title={item.label}
              icon={`${item.score}/${item.max}`}
              value={`${item.score} points`}
              status="info"
              detail={item.detail}
            />
          ))}
        </div>
      </div>

      <div className="summary-grid">
        <SummaryTile label="Transactions" value={summary.totalTransactions} />
        <SummaryTile label="Recent volume" value={`${summary.totalVolumeUSDC} USDC`} />
        <SummaryTile label="Counterparties" value={summary.uniqueCounterparties} />
        <SummaryTile label="Contracts touched" value={summary.uniqueContracts} />
        <SummaryTile label="Active blocks" value={summary.activeBlocks} />
        <SummaryTile label="Balance" value={`${summary.balanceUSDC} USDC`} />
      </div>
    </div>
  );
}

function SummaryTile({ label, value }) {
  return (
    <div className="summary-tile">
      <div className="summary-label">{label}</div>
      <div className="summary-value">{value}</div>
    </div>
  );
}

function MonitorPlaceholder() {
  return (
    <div className="placeholder-panel">
      <h2>Network Monitor is next</h2>
      <p>
        The monitoring module will surface whale moves, massive outflows, CCTP spikes, and suspicious patterns
        across Arc in a live event feed.
      </p>
      <div className="placeholder-list">
        <div className="placeholder-item">Live feed of suspicious events</div>
        <div className="placeholder-item">Severity labels and alert routing</div>
        <div className="placeholder-item">Telegram and webhook delivery</div>
      </div>
    </div>
  );
}

function ApiDocsPanel() {
  const endpoints = [
    ['GET', '/api/v1/risk-score/:address', 'Full AML risk assessment'],
    ['GET', '/api/v1/arc-score/:address', 'Arc-native reputation score'],
    ['GET', '/api/v1/sanctions/:address', 'Quick sanctions lookup'],
    ['GET', '/api/v1/wallet/:address', 'Wallet info and tx count'],
    ['POST', '/api/v1/screen', 'Decision matrix for incoming payments'],
    ['POST', '/api/v1/batch-check', 'Batch address screening'],
  ];

  return (
    <div className="placeholder-panel">
      <h2>API surface</h2>
      <p>Use ArcGuard as a business screening API or wallet reputation service.</p>
      <div className="api-table">
        {endpoints.map(([method, path, detail]) => (
          <div className="api-row" key={path}>
            <div className="api-method">{method}</div>
            <div className="api-path">{path}</div>
            <div className="api-detail">{detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreRing({ score, color }) {
  const radius = 75;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="score-ring">
      <svg viewBox="0 0 180 180">
        <circle className="ring-bg" cx="90" cy="90" r={radius} />
        <circle
          className="ring-progress"
          cx="90"
          cy="90"
          r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-number" style={{ color }}>{score}</div>
    </div>
  );
}

function CheckCard({ title, icon, value, status, detail }) {
  return (
    <div className="check-card">
      <div className="check-card-header">
        <span className="check-card-title">{title}</span>
        <span className="check-card-icon">{icon}</span>
      </div>
      <div className={`check-card-value ${status}`}>{value}</div>
      <div className="check-card-detail">{detail}</div>
    </div>
  );
}

function getRiskColor(level) {
  switch (level) {
    case 'low':
      return '#00E676';
    case 'medium':
      return '#FFB300';
    case 'high':
      return '#FF3D3D';
    case 'critical':
      return '#FF0040';
    default:
      return '#00F0FF';
  }
}

function getArcScoreColor(score) {
  if (score >= 80) {
    return '#00F0FF';
  }
  if (score >= 60) {
    return '#57E389';
  }
  if (score >= 40) {
    return '#FFB300';
  }
  return '#8B9DC3';
}

export default App;
