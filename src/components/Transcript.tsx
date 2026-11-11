import { useMemo } from 'react';
import { useStore } from '../state/store';
import { METRIC_META, METRIC_ORDER } from './shared';
import type { Conversation, EvidenceRef, MetricId } from '../analysis/types';

interface Mark {
  metric: MetricId;
  note: string;
  refIndex: number;
}

/** Evidence underline markers, keyed by message index. */
function useMarks(conversation: Conversation | null): Map<number, Mark[]> {
  const { analyses, activeMetric } = useStore();
  return useMemo(() => {
    const map = new Map<number, Mark[]>();
    if (!conversation) return map;
    const a = analyses.get(conversation.id);
    if (!a) return map;
    for (const m of METRIC_ORDER) {
      if (activeMetric && m !== activeMetric) continue;
      const refs: EvidenceRef[] = a[m].evidence;
      refs.forEach((r, k) => {
        const arr = map.get(r.messageIndex) ?? [];
        arr.push({ metric: m, note: r.note, refIndex: k });
        map.set(r.messageIndex, arr);
      });
    }
    return map;
  }, [analyses, conversation, activeMetric]);
}

export function Transcript({ conversation }: { conversation: Conversation }) {
  const { analyses, activeMetric, setActiveMetric } = useStore();
  const marks = useMarks(conversation);
  const a = analyses.get(conversation.id);

  if (!a) return null;

  return (
    <div className="transcript-wrap">
      <div className="transcript-toolbar">
        <span className="toolbar-label">Evidence</span>
        <div className="evidence-chips" role="group" aria-label="Filter evidence by metric">
          <button
            className={`chip ${activeMetric === null ? 'on' : ''}`}
            onClick={() => setActiveMetric(null)}
          >
            all
          </button>
          {METRIC_ORDER.map((m) => (
            <button
              key={m}
              className={`chip chip-${m} ${activeMetric === m ? 'on' : ''}`}
              onClick={() => setActiveMetric(activeMetric === m ? null : m)}
            >
              {METRIC_META[m].chip}
            </button>
          ))}
        </div>
      </div>
      <ol className="transcript" key={conversation.id}>
        {conversation.messages.map((msg, i) => {
          const msgMarks = marks.get(i);
          return (
            <li key={i} className={`turn ${msg.sender}`}>
              <div className="bubble">
                <div className="bubble-meta">
                  <span className="bubble-author">{msg.author ?? (msg.sender === 'agent' ? 'Agent' : 'Customer')}</span>
                  {msg.timestamp && (
                    <time className="bubble-time">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  )}
                </div>
                <p className="bubble-text">{msg.text}</p>
                {msgMarks && msgMarks.length > 0 && (
                  <ul className="marks">
                    {msgMarks.map((mk, k) => (
                      <li key={k} className={`mark mark-${mk.metric}`}>
                        <span className="mark-tag">{METRIC_META[mk.metric].chip}</span>
                        {mk.note}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
                    }
