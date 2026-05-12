import { useState } from 'react';
import './App.css';

const API_URL = 'http://localhost:3099/api/v1';

function App() {
  const [address, setAddress] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('scanner');

  const handleScan = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/risk-score/${address.trim()}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to scan address');
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleScan();
  };

  return (
    <div className="app">
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="logo">🛡️ Arc<span>Guard</span></div>
        </div>
        <div className="navbar-badge">
          <span className="dot"></span>
          Arc Testnet
        </div>
        <div className="navbar-tabs">
          <button className={activeTab === 'scanner' ? 'active' : ''} onClick={() => setActiveTab('scanner')}>Scanner</button>
          <button className={activeTab === 'monitor' ? 'active' : ''} onClick={() => setActiveTab('monitor')}>Network Monitor</button>
          <button className={activeTab === 'api' ? 'active' : ''} onClick={() => setActiveTab('api')}>API Docs</button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        <h1 className="hero-title">Scan any address on Arc</h1>
        <p className="hero-subtitle">AML screening, risk scoring, and threat detection for the Arc Network</p>

        {/* Search Bar */}
        <div className="search-container">
          <input
            className="search-input"
            type="text"
            placeholder="Enter wallet address, contract, or agent to scan..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className={`search-btn ${loading ? 'loading' : ''}`}
            onClick={handleScan}
            disabled={loading || !address.trim()}
          >
            {loading ? 'Scanning...' : 'Analyze'}
          </button>
        </div>

        {/* Error */}
        {error && <div className="error-banner">⚠️ {error}</div>}

        {/* Result */}
        {result && <ResultPanel result={result} />}

        {/* Empty State */}
        {!result && !loading && !error && (
          <div className="empty-state">
            <div className="shield-icon">🛡️</div>
            <p>Enter a wallet address, smart contract, or AI agent address<br />to get a comprehensive risk assessment</p>
          </div>
        )}
      </main>
    </div>
  );
}

/* ════════════════════════════════ */
/*         RESULT PANEL            */
/* ════════════════════════════════ */

function ResultPanel({ result }) {
  const { address, score, level, verdict, checks, processingTimeMs } = result;

  return (
    <div className="result-panel">
      {/* Header */}
      <div className="result-header">
        <div className="result-address">{address.slice(0, 8)}...{address.slice(-6)}</div>
        <div className={`result-verdict ${level}`}>{verdict}</div>
      </div>

      {/* Body: Score + Checks */}
      <div className="result-body">
        {/* Score Ring */}
        <div className="score-container">
          <ScoreRing score={score} level={level} />
          <div className="score-label" style={{ color: getRiskColor(level) }}>
            {level === 'critical' ? '🚨 CRITICAL' : level.toUpperCase() + ' RISK'}
          </div>
          <div className="score-time">Scanned in {processingTimeMs}ms</div>
        </div>

        {/* Check Cards */}
        <div className="checks-grid">
          <CheckCard
            title="OFAC Sanctions"
            icon={checks.sanctions?.passed ? '✅' : '🚨'}
            value={checks.sanctions?.passed ? 'Clear' : 'SANCTIONED'}
            status={checks.sanctions?.passed ? 'pass' : 'fail'}
            detail={checks.sanctions?.details?.lists?.join(', ') || 'No matches'}
          />
          <CheckCard
            title="Mixer Links"
            icon={checks.mixerInteraction ? (checks.mixerInteraction.passed ? '✅' : '⚠️') : (checks.directMixer?.passed === false ? '🚨' : '✅')}
            value={checks.mixerInteraction ? (checks.mixerInteraction.passed ? 'None Found' : `${checks.mixerInteraction.details?.mixerInteractions || 0} Found`) : (checks.directMixer?.passed === false ? 'IS A MIXER' : 'Clear')}
            status={checks.mixerInteraction ? (checks.mixerInteraction.passed ? 'pass' : 'fail') : (checks.directMixer?.passed === false ? 'fail' : 'pass')}
            detail={checks.mixerInteraction ? (checks.mixerInteraction.passed ? 'No mixer interactions' : 'Tornado Cash interaction detected') : (checks.directMixer?.passed === false ? 'This address is a known mixer' : 'No mixer data')}
          />
          <CheckCard
            title="Tx Patterns"
            icon={checks.transactionPatterns?.passed ? '✅' : '⚠️'}
            value={checks.transactionPatterns?.passed ? 'Normal' : 'Suspicious'}
            status={checks.transactionPatterns?.passed ? 'pass' : 'warn'}
            detail={checks.transactionPatterns?.details?.flags?.join('; ') || 'No suspicious patterns'}
          />
          <CheckCard
            title="Wallet Activity"
            icon={checks.walletAge?.passed ? '✅' : '⚠️'}
            value={`${checks.walletAge?.details?.txCount || 0} txns`}
            status={checks.walletAge?.passed ? 'pass' : 'warn'}
            detail={`Balance: ${checks.walletAge?.details?.balanceUSDC?.toFixed(2) || '0.00'} USDC`}
          />
          <CheckCard
            title="Counterparties"
            icon={checks.sanctionedCounterparty?.passed ? '✅' : '🚫'}
            value={checks.sanctionedCounterparty?.passed ? 'Clean' : 'Flagged'}
            status={checks.sanctionedCounterparty?.passed ? 'pass' : 'fail'}
            detail={`${checks.sanctionedCounterparty?.details?.sanctionedInteractions || 0} sanctioned interactions`}
          />
          <CheckCard
            title="Entity Type"
            icon="🔍"
            value={result.entityType?.label || (checks.walletAge?.details?.isContract ? 'Contract' : 'EOA Wallet')}
            status="info"
            detail={result.entityType?.hint || 'Address classification'}
          />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════ */
/*          SCORE RING             */
/* ════════════════════════════════ */

function ScoreRing({ score, level }) {
  const radius = 75;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getRiskColor(level);

  return (
    <div className="score-ring">
      <svg viewBox="0 0 180 180">
        <circle className="ring-bg" cx="90" cy="90" r={radius} />
        <circle
          className="ring-progress"
          cx="90" cy="90" r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-number" style={{ color }}>{score}</div>
    </div>
  );
}

/* ════════════════════════════════ */
/*          CHECK CARD             */
/* ════════════════════════════════ */

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

/* ════════════════════════════════ */
/*           HELPERS               */
/* ════════════════════════════════ */

function getRiskColor(level) {
  switch (level) {
    case 'low': return '#00E676';
    case 'medium': return '#FFB300';
    case 'high': return '#FF3D3D';
    case 'critical': return '#FF0040';
    default: return '#00F0FF';
  }
}

export default App;
