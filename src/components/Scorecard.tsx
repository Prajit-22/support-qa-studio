import { useState } from 'react';
import { useStore } from '../state/store';
import {
  effectiveEscalation,
  effectiveResolution,
  overallWith,
  type Conversation,
  type MetricId,
} from '../analysis/types';
import { METRIC_META, METRIC_ORDER, ScoreBar, pct, scoreClass } from './shared';

function OverrideEditor({
  convId,
  metric,
  current,
  onClose,
}: {
  convId: string;
  metric: MetricId;
  current: number;
  onClose: () => void;
}) {
  const { setMetricOverride, corrections } = useStore();
  const existing = corrections[convId]?.metricOverrides?.[metric];
  const [score, setScore] = useState(Math.round((existing?.score ?? current) * 100));
  const [note, setNote] = useState(existing?.note ?? '');
  const [reviewer, setReviewer] = useState(corrections[convId]?.reviewer ?? '');

  return (
    <div className="override-editor">
      <label>
        Reviewer score <strong>{score}</strong>/100
        <input
          type="range"
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(parseInt(e.target.value, 10))}
        />
      </label>
      <label>
        Why is the machine score off?
        <input
          type="text"
          value={note}
          placeholder='e.g. "sarcasm read as positive"'
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label>
        Your name
        <input
          type="text"
          value={reviewer}
          placeholder="reviewer initials"
          onChange={(e) => setReviewer(e.target.value)}
        />
      </label>
      <div className="override-actions">
        <button
          className="btn btn-primary"
          onClick={() => {
            setMetricOverride(convId, metric, score / 100, note.trim(), reviewer.trim());
            onClose();
          }}
        >
          Save correction
        </button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

export function Scorecard({ conversation }: { conversation: Conversation }) {
  const {
    analyses,
    corrections,
    clearMetricOverride,
    setFlagOverride,
    setActiveMetric,
    activeMetric,
  } = useStore();
  const a = analyses.get(conversation.id);
  const [editing, setEditing] = useState<MetricId | null>(null);
  const [reviewer, setReviewer] = useState('');
  if (!a) return null;

  const corr = corrections[conversation.id];
  const overall = overallWith(a, corr);
  const resolved = effectiveResolution(a, corr);
  const escalated = effectiveEscalation(a, corr);

  return (
    <aside className="scorecard" aria-label="Scorecard">
      <div className="overall-block">
        <div className="overall-number">
          <span className={`overall-value ${scoreClass(overall)}`}>{pct(overall)}</span>
          <span className="overall-max">/100</span>
        </div>
        <div className="overall-sub">overall - review aid, not ground truth</div>
        <div className="stamps">
          <button
            className={`stamp stamp-${resolved ? 'resolved' : 'open'} as-button`}
            title={`${a.resolutionReason} (click to override)`}
            onClick={() => {
              const note = window.prompt(
                `Mark this conversation as ${resolved ? 'NOT resolved' : 'resolved'}? Add a short reason:`,
                '',
              );
              if (note !== null) setFlagOverride(conversation.id, 'resolution', !resolved, note, reviewer);
            }}
          >
            {resolved ? 'resolved' : 'unresolved'}
          </button>
          <button
            className={`stamp stamp-escalation as-button ${escalated ? '' : 'muted'}`}
            title={`${a.escalationReason} (click to override)`}
            onClick={() => {
              const note = window.prompt(
                `${escalated ? 'Clear' : 'Flag'} escalation? Add a short reason:`,
                '',
              );
              if (note !== null) setFlagOverride(conversation.id, 'escalation', !escalated, note, reviewer);
            }}
          >
            {escalated ? 'escalation' : 'no escalation'}
          </button>
        </div>
        {(corr?.resolutionOverride || corr?.escalationOverride) && (
          <div className="override-notes">
            {corr.resolutionOverride && (
              <p>
                Resolution set to <strong>{String(corr.resolutionOverride.value)}</strong> by reviewer
                {corr.resolutionOverride.note ? `: ${corr.resolutionOverride.note}` : ''}
                <button className="linkbtn" onClick={() => setFlagOverride(conversation.id, 'resolution', null, '', '')}>revert</button>
              </p>
            )}
            {corr.escalationOverride && (
              <p>
                Escalation set to <strong>{String(corr.escalationOverride.value)}</strong> by reviewer
                {corr.escalationOverride.note ? `: ${corr.escalationOverride.note}` : ''}
                <button className="linkbtn" onClick={() => setFlagOverride(conversation.id, 'escalation', null, '', '')}>revert</button>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="reviewer-line">
        <label>
          Reviewer
          <input
            type="text"
            value={reviewer}
            placeholder="your name / initials"
            onChange={(e) => setReviewer(e.target.value)}
          />
        </label>
      </div>

      <ul className="metric-list">
        {METRIC_ORDER.map((m) => {
          const res = a[m];
          const override = corr?.metricOverrides?.[m];
          const shown = override ? override.score : res.score;
          const meta = METRIC_META[m];
          const extra =
            m === 'sentiment'
              ? ` (${a.sentiment.label})`
              : m === 'responseTime' && a.responseTime.avgSeconds != null
                ? ` (${Math.round(a.responseTime.avgSeconds)}s avg)`
                : '';
          return (
            <li key={m} className={`metric ${activeMetric === m ? 'focus' : ''}`}>
              <button
                className="metric-head"
                onClick={() => setActiveMetric(activeMetric === m ? null : m)}
                title={meta.hint}
              >
                <span className="metric-name">
                  {meta.label}
                  <span className="metric-extra">{extra}</span>
                </span>
                <span className={`metric-value ${scoreClass(shown)}`}>{pct(shown)}</span>
              </button>
              <ScoreBar score={shown} animateKey={conversation.id + m + shown} />
              <p className="metric-summary">{res.summary}</p>
              {override && (
                <p className="metric-override-note">
                  Reviewer set {pct(override.score)} (machine {pct(res.score)})
                  {override.note ? `: ${override.note}` : ''}
                  <button className="linkbtn" onClick={() => clearMetricOverride(conversation.id, m)}>revert</button>
                </p>
              )}
              {res.evidence.length > 0 && (
                <ul className="evidence-list">
                  {res.evidence.map((ev, k) => (
                    <li key={k} className={`evidence evidence-${m}`}>
                      <span className="evidence-quote">“{ev.excerpt}”</span>
                      <span className="evidence-note">{ev.note}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="metric-actions">
                {editing === m ? (
                  <OverrideEditor
                    convId={conversation.id}
                    metric={m}
                    current={res.score}
                    onClose={() => setEditing(null)}
                  />
                ) : (
                  <button className="btn btn-small" onClick={() => setEditing(m)}>
                    Correct this score
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="scorecard-foot">
        Deterministic rules, run locally in your browser. Scores flag conversations
        worth a human look; they are not measurements of truth.
      </p>
    </aside>
  );
}
