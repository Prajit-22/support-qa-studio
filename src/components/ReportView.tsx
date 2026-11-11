import { useMemo } from 'react';
import { useStore } from '../state/store';
import {
  METRIC_WEIGHTS,
  effectiveEscalation,
  effectiveResolution,
  effectiveScore,
  overallWith,
  type MetricId,
} from '../analysis/types';
import { METRIC_META, METRIC_ORDER, pct, scoreClass } from './shared';

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function ReportView() {
  const { conversations, analyses, corrections, select, setView } = useStore();

  const rows = useMemo(
    () =>
      conversations.map((c) => {
        const a = analyses.get(c.id)!;
        const corr = corrections[c.id];
        return {
          c,
          a,
          overall: overallWith(a, corr),
          resolved: effectiveResolution(a, corr),
          escalated: effectiveEscalation(a, corr),
          reviewed: !!corr && (Object.keys(corr.metricOverrides ?? {}).length > 0 || !!corr.resolutionOverride || !!corr.escalationOverride),
        };
      }),
    [conversations, analyses, corrections],
  );

  const summary = useMemo(() => {
    const per: Record<MetricId, number> = {} as Record<MetricId, number>;
    for (const m of METRIC_ORDER) {
      per[m] = avg(rows.map((r) => effectiveScore(r.a, corrections[r.c.id], m)));
    }
    return {
      total: rows.length,
      resolved: rows.filter((r) => r.resolved).length,
      escalations: rows.filter((r) => r.escalated).length,
      reviewed: rows.filter((r) => r.reviewed).length,
      overallAvg: avg(rows.map((r) => r.overall)),
      negative: rows.filter((r) => r.a.sentiment.label === 'negative').length,
      per,
    };
  }, [rows, corrections]);

  const exportCsv = () => {
    const header = ['title', 'source', 'messages', 'overall', ...METRIC_ORDER, 'sentiment', 'resolved', 'escalation', 'reviewed'];
    const lines = rows.map((r) => {
      const corr = corrections[r.c.id];
      const cells = [
        r.c.title,
        r.c.source,
        String(r.c.messages.length),
        r.overall.toFixed(3),
        ...METRIC_ORDER.map((m) => effectiveScore(r.a, corr, m).toFixed(3)),
        r.a.sentiment.label,
        String(r.resolved),
        String(r.escalated),
        String(r.reviewed),
      ];
      return cells.map((x) => `"${x.replace(/"/g, '""')}"`).join(',');
    });
    download('qa-studio-report.csv', [header.join(','), ...lines].join('\n'), 'text/csv');
  };

  const exportJson = () => {
    const payload = rows.map((r) => ({
      conversation: r.c,
      machineAnalysis: r.a,
      corrections: corrections[r.c.id] ?? null,
      effective: {
        overall: r.overall,
        resolved: r.resolved,
        escalated: r.escalated,
      },
    }));
    download('qa-studio-report.json', JSON.stringify(payload, null, 2), 'application/json');
  };

  const weights = Object.entries(METRIC_WEIGHTS)
    .map(([k, v]) => `${METRIC_META[k as MetricId].label} ${Math.round(v * 100)}%`)
    .join(' · ');

  return (
    <div className="report">
      <header className="report-head">
        <h2>Review report</h2>
        <p className="report-sub">
          {summary.total} conversations · generated {new Date().toLocaleString()} · heuristic
          scores, reviewer-corrected where marked
        </p>
        <div className="report-actions no-print">
          <button className="btn" onClick={exportCsv}>Export CSV</button>
          <button className="btn" onClick={exportJson}>Export JSON</button>
          <button className="btn" onClick={() => window.print()}>Print / PDF</button>
        </div>
      </header>

      <section className="report-cards">
        <div className="rcard">
          <span className="rcard-num">{pct(summary.overallAvg)}</span>
          <span className="rcard-label">avg overall</span>
        </div>
        <div className="rcard">
          <span className="rcard-num">{summary.total > 0 ? Math.round((summary.resolved / summary.total) * 100) : 0}%</span>
          <span className="rcard-label">resolved</span>
        </div>
        <div className="rcard">
          <span className="rcard-num">{summary.escalations}</span>
          <span className="rcard-label">escalations</span>
        </div>
        <div className="rcard">
          <span className="rcard-num">{summary.negative}</span>
          <span className="rcard-label">negative sentiment</span>
        </div>
        <div className="rcard">
          <span className="rcard-num">{summary.reviewed}</span>
          <span className="rcard-label">reviewer-corrected</span>
        </div>
      </section>

      <section className="report-metrics">
        <h3>Metric averages</h3>
        <p className="report-weights">Overall = {weights}</p>
        <ul>
          {METRIC_ORDER.map((m) => (
            <li key={m}>
              <span className="rm-name">{METRIC_META[m].label}</span>
              <div className="scorebar report-bar">
                <div className={`scorebar-fill ${scoreClass(summary.per[m])}`} style={{ width: pct(summary.per[m]) + '%' }} />
              </div>
              <span className={`rm-val ${scoreClass(summary.per[m])}`}>{pct(summary.per[m])}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>Conversation</th>
              <th>Overall</th>
              <th>Sentiment</th>
              <th>Status</th>
              <th>Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.c.id}
                onClick={() => {
                  select(r.c.id);
                  setView('review');
                }}
              >
                <td>{r.c.title}</td>
                <td className={scoreClass(r.overall)}>{pct(r.overall)}</td>
                <td>{r.a.sentiment.label}</td>
                <td>{r.escalated ? 'escalation' : r.resolved ? 'resolved' : 'open'}</td>
                <td>{r.reviewed ? 'yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="report-foot">
        Scores come from deterministic heuristics run locally on this device. They
        sort and flag conversations for human review; they do not measure truth,
        intent, or factual accuracy.
      </p>
    </div>
  );
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url;
  el.download = name;
  el.click();
  URL.revokeObjectURL(url);
}
