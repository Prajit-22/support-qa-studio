import { useState } from 'react';
import { StoreProvider, useStore } from './state/store';
import { Inbox } from './components/Inbox';
import { Transcript } from './components/Transcript';
import { Scorecard } from './components/Scorecard';
import { ReportView } from './components/ReportView';
import { ImportModal } from './components/ImportModal';

function Shell() {
  const { conversations, selectedId, select, view, setView, resetToSamples, isSampleData } = useStore();
  const [importing, setImporting] = useState(false);
  const [mobilePane, setMobilePane] = useState<'chat' | 'score'>('chat');
  const selected = conversations.find((c) => c.id === selectedId) ?? conversations[0] ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>✦</span>
          <div className="brand-text">
            <h1>QA Studio</h1>
            <span className="brand-kicker">support review desk</span>
          </div>
        </div>
        <nav className="topnav">
          <button className={`navbtn ${view === 'review' ? 'on' : ''}`} onClick={() => setView('review')}>
            Review
          </button>
          <button className={`navbtn ${view === 'report' ? 'on' : ''}`} onClick={() => setView('report')}>
            Report
          </button>
          <button className="btn btn-primary" onClick={() => setImporting(true)}>
            Import
          </button>
          {!isSampleData && (
            <button className="btn btn-ghost" onClick={resetToSamples} title="Clear imported data and reload samples">
              Reset samples
            </button>
          )}
        </nav>
      </header>

      {view === 'report' ? (
        <main className="main-report">
          <ReportView />
        </main>
      ) : selected ? (
        <main className="main-review">
          <Inbox />
          <div className="pane-tabs no-print">
            <button className={`pane-tab ${mobilePane === 'chat' ? 'on' : ''}`} onClick={() => setMobilePane('chat')}>
              Conversation
            </button>
            <button className={`pane-tab ${mobilePane === 'score' ? 'on' : ''}`} onClick={() => setMobilePane('score')}>
              Scorecard
            </button>
          </div>
          <section className={`pane pane-chat ${mobilePane === 'chat' ? 'show' : ''}`}>
            <div className="pane-head">
              <button className="linkbtn backlink" onClick={() => select(null)}>‹ all cases</button>
              <h2>{selected.title}</h2>
              <span className="pane-source">{selected.source}</span>
            </div>
            <Transcript conversation={selected} />
          </section>
          <section className={`pane pane-score ${mobilePane === 'score' ? 'show' : ''}`}>
            <Scorecard conversation={selected} />
          </section>
        </main>
      ) : (
        <main className="main-empty">
          <div className="empty-card">
            <h2>No conversations yet</h2>
            <p>Import a WhatsApp export, JSON or CSV to start reviewing.</p>
            <button className="btn btn-primary" onClick={() => setImporting(true)}>Import conversations</button>
          </div>
        </main>
      )}

      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
