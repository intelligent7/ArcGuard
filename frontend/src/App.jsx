import { useEffect, useState } from 'react';
import './App.css';

const API_URL = 'http://localhost:3099/api/v1';

function App() {
  const [address, setAddress] = useState('');
  const [riskResult, setRiskResult] = useState(null);
  const [arcScoreResult, setArcScoreResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('scanner');
  const [monitorData, setMonitorData] = useState(null);
  const [monitorLoading, setMonitorLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'monitor') {
      return undefined;
    }

    let cancelled = false;

    async function loadMonitorData() {
      setMonitorLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_URL}/monitor/events?limit=60`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load monitor events');
        }
        if (!cancelled) {
          setMonitorData(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setMonitorLoading(false);
        }
      }
    }

    loadMonitorData();
    const intervalId = setInterval(loadMonitorData, 10000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [activeTab]);

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

  async function handleMonitorRefresh() {
    setMonitorLoading(true);
    setError(null);

    try {
      await fetch(`${API_URL}/monitor/poll`, { method: 'POST' });
      const res = await fetch(`${API_URL}/monitor/events?limit=60`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to refresh monitor');
      }
      setMonitorData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setMonitorLoading(false);
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
      ? 'Live block polling, whale transfers, outflows, bursts, and CCTP spike candidates'
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
        {activeTab === 'monitor' && (
          <NetworkMonitorPanel
            data={monitorData}
            loading={monitorLoading}
            onRefresh={handleMonitorRefresh}
          />
        )}
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

function NetworkMonitorPanel({ data, loading, onRefresh }) {
  const status = data?.status || {};
  const stats = status.stats || {};
  const events = data?.events || [];
  const latestEvents = events.slice(0, 8);

  return (
    <div className="monitor-layout">
      <div className="monitor-toolbar">
        <div>
          <div className="monitor-kicker">Network Monitor</div>
          <div className="monitor-heading">Arc live feed</div>
        </div>
        <button className="secondary-btn" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="monitor-status-grid">
        <MetricCard label="Status" value={status.running ? 'Running' : 'Stopped'} tone={status.running ? 'good' : 'muted'} />
        <MetricCard label="Latest block" value={formatNumber(status.latestBlock)} />
        <MetricCard label="Scanned block" value={formatNumber(status.lastScannedBlock)} />
        <MetricCard label="Lag" value={status.lagBlocks === null || status.lagBlocks === undefined ? '-' : `${status.lagBlocks} blocks`} />
        <MetricCard label="Transfers" value={formatNumber(stats.transfersSeen)} />
        <MetricCard label="Events" value={formatNumber(stats.eventsDetected)} tone={stats.eventsDetected ? 'warn' : 'muted'} />
      </div>

      <div className="detector-strip">
        <DetectorPill label="Whale transfers" type="whale_transfer" events={events} />
        <DetectorPill label="Massive outflows" type="massive_outflow" events={events} />
        <DetectorPill label="Transfer bursts" type="burst_activity" events={events} />
        <DetectorPill label="CCTP spikes" type="cctp_spike_candidate" events={events} />
      </div>

      {status.lastError && <div className="error-banner">Warning: {status.lastError}</div>}

      <div className="event-feed">
        <div className="feed-header">
          <span>Recent events</span>
          <span>{latestEvents.length} visible</span>
        </div>

        {latestEvents.length === 0 && (
          <div className="empty-feed">
            <div className="shield-icon">LIVE</div>
            <p>No suspicious Arc activity detected in the current monitor window.</p>
          </div>
        )}

        {latestEvents.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone = 'default' }) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value ?? '-'}</div>
    </div>
  );
}

function DetectorPill({ label, type, events }) {
  const count = events.filter((event) => event.type === type).length;
  return (
    <div className={count ? 'detector-pill active' : 'detector-pill'}>
      <span>{label}</span>
      <strong>{count}</strong>
    </div>
  );
}

function EventRow({ event }) {
  return (
    <div className={`event-row ${event.severity}`}>
      <div className="event-main">
        <div className="event-title-line">
          <span className={`severity-dot ${event.severity}`}></span>
          <span className="event-title">{event.title}</span>
          <span className="event-type">{event.type.replaceAll('_', ' ')}</span>
        </div>
        <div className="event-summary">{event.summary}</div>
        <div className="event-meta">
          <span>Block {formatNumber(event.blockNumber)}</span>
          <span>{formatTime(event.timestamp)}</span>
          {event.txHash && (
            <a href={`https://testnet.arcscan.app/tx/${event.txHash}`} target="_blank" rel="noreferrer">
              {shortHash(event.txHash)}
            </a>
          )}
        </div>
      </div>
      <div className="event-side">
        <div className="event-amount">{formatTokenAmount(event.amountUnits, event.amountLabel)}</div>
        <div className="event-addresses">
          {event.addresses?.from && <span>from {shortAddress(event.addresses.from)}</span>}
          {event.addresses?.to && <span>to {shortAddress(event.addresses.to)}</span>}
        </div>
      </div>
    </div>
  );
}

function ApiDocsPanel() {
  const endpoints = [
    ['GET', '/api/v1/risk-score/:address', 'Full AML risk assessment'],
    ['GET', '/api/v1/arc-score/:address', 'Arc-native reputation score'],
    ['GET', '/api/v1/monitor/events', 'Live Network Monitor event feed'],
    ['GET', '/api/v1/monitor/status', 'Network Monitor polling status'],
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

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-';
  }
  return Number(value).toLocaleString('en-US');
}

function formatTokenAmount(value, label = 'units') {
  const number = Number(value) || 0;
  if (number === 0) {
    return `0 ${label}`;
  }
  return `${number.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${label}`;
}

function formatTime(timestamp) {
  if (!timestamp) {
    return '-';
  }
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shortAddress(address) {
  if (!address) {
    return '';
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash) {
  if (!hash) {
    return '';
  }
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export default App;
