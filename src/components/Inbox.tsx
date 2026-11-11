import { useStore } from '../state/store';
import { effectiveEscalation, effectiveResolution, overallWith } from '../analysis/types';
import { pct, scoreClass } from './shared';

export function Inbox() {
  const { conversations, analyses, corrections, selectedId, select, removeConversation } = useStore();

  return (
    <aside className="inbox" aria-label="Conversations">
      <div className="inbox-head">
        <span className="inbox-title">Case files</span>
        <span className="inbox-count">{conversations.length}</span>
      </div>
      <ul className="inbox-list">
        {conversations.map((c, i) => {
          const a = analyses.get(c.id);
          if (!a) return null;
          const corr = corrections[c.id];
          const overall = overallWith(a, corr);
          const resolved = effectiveResolution(a, corr);
          const escalated = effectiveEscalation(a, corr);
          const reviewed = !!corr && (Object.keys(corr.metricOverrides ?? {}).length > 0 || corr.resolutionOverride || corr.escalationOverride);
          return (
            <li key={c.id}>
              <button
                className={`case ${selectedId === c.id ? 'active' : ''}`}
                onClick={() => select(c.id)}
              >
                <span className="case-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="case-body">
                  <span className="case-title">{c.title}</span>
                  <span className="case-meta">
                    <span className={`dot ${a.sentiment.label}`} aria-hidden />
                    {c.messages.length} msgs
                    {escalated && <span className="flag flag-esc">escalation</span>}
                    {!resolved && !escalated && <span className="flag flag-open">open</span>}
                    {reviewed && <span className="flag flag-reviewed">reviewed</span>}
                  </span>
                </span>
                <span className={`case-score ${scoreClass(overall)}`}>{pct(overall)}</span>
              </button>
              <button
                className="case-remove"
                title="Remove conversation"
                aria-label={`Remove ${c.title}`}
                onClick={() => removeConversation(c.id)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
