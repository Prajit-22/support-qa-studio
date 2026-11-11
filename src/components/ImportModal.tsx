import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import {
  applyRoleMap,
  detectFormat,
  parseCsv,
  parseJson,
  parseWhatsApp,
  toConversation,
  type Sender,
  type WhatsAppParse,
} from '../analysis/parsers';

type Stage =
  | { kind: 'pick' }
  | { kind: 'roles'; wa: WhatsAppParse; source: string }
  | { kind: 'done'; count: number; warnings: string[] };

export function ImportModal({ onClose }: { onClose: () => void }) {
  const { addConversations } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [error, setError] = useState<string | null>(null);
  const [roleMap, setRoleMap] = useState<Record<string, Sender>>({});

  const handleFile = async (file: File) => {
    setError(null);
    const text = await file.text();
    const format = detectFormat(file.name, text);
    if (format === 'json') {
      const res = parseJson(text);
      if (res.conversations.length === 0) {
        setError(res.warnings.join(' ') || 'No conversations found in that JSON.');
        return;
      }
      addConversations(res.conversations.map((c) => toConversation(c, file.name)));
      setStage({ kind: 'done', count: res.conversations.length, warnings: res.warnings });
    } else if (format === 'csv') {
      const res = parseCsv(text);
      if (res.conversations.length === 0) {
        setError(res.warnings.join(' ') || 'No rows found in that CSV.');
        return;
      }
      addConversations(res.conversations.map((c) => toConversation(c, file.name)));
      setStage({ kind: 'done', count: res.conversations.length, warnings: res.warnings });
    } else if (format === 'whatsapp') {
      const wa = parseWhatsApp(text);
      const speakers = [...wa.speakers.keys()];
      if (speakers.length < 2) {
        setError('Found only one speaker - a support conversation needs a customer and an agent.');
        return;
      }
      // Default guess: the chattier speaker is the customer... actually the
      // safer default is first speaker = customer, rest unassigned for the
      // user to pick.
      const guess: Record<string, Sender> = {};
      speakers.forEach((s, i) => {
        guess[s] = i === 0 ? 'customer' : 'agent';
      });
      setRoleMap(guess);
      setStage({ kind: 'roles', wa, source: file.name });
    } else {
      setError('Could not detect the format. Use a WhatsApp .txt export, a JSON file, or a CSV with sender,text columns.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Import conversations">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        {stage.kind === 'pick' && (
          <>
            <h3>Import conversations</h3>
            <p className="modal-sub">Parsed locally in your browser. Nothing is uploaded anywhere.</p>
            <button className="dropzone" onClick={() => fileRef.current?.click()}>
              <span className="dropzone-icon">⇪</span>
              <span>Choose a file</span>
              <span className="dropzone-hint">WhatsApp .txt export · JSON · CSV (sender,text)</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.json,.csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            {error && <p className="modal-error">{error}</p>}
            <details className="format-help">
              <summary>JSON format</summary>
              <pre>{`[
  { "sender": "customer", "text": "Where is my order?" },
  { "sender": "agent", "text": "It ships today.",
    "timestamp": "2026-11-04T14:02:00Z" }
]`}</pre>
              <p>"user"/"ai" also accepted. A {'{ "messages": [...] }'} object or a list of conversations works too.</p>
            </details>
          </>
        )}

        {stage.kind === 'roles' && (
          <>
            <h3>Who is the customer?</h3>
            <p className="modal-sub">
              WhatsApp exports name participants. Assign each speaker a role so the
              analyzer knows who served whom.
            </p>
            <ul className="role-list">
              {[...stage.wa.speakers.entries()].map(([name, sample]) => (
                <li key={name} className="role-row">
                  <div className="role-id">
                    <strong>{name}</strong>
                    <span className="role-sample">“{sample[0]?.slice(0, 60)}{(sample[0]?.length ?? 0) > 60 ? '…' : ''}”</span>
                  </div>
                  <div className="role-pick" role="group" aria-label={`Role for ${name}`}>
                    {(['customer', 'agent'] as Sender[]).map((r) => (
                      <button
                        key={r}
                        className={`chip ${roleMap[name] === r ? 'on' : ''}`}
                        onClick={() => setRoleMap((m) => ({ ...m, [name]: r }))}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <button
              className="btn btn-primary btn-wide"
              onClick={() => {
                const messages = applyRoleMap(stage.wa.turns, roleMap);
                if (messages.length === 0) {
                  setError('Assign at least one customer and one agent.');
                  return;
                }
                addConversations([toConversation({ title: stage.source.replace(/\.[^.]+$/, ''), messages }, stage.source)]);
                setStage({ kind: 'done', count: 1, warnings: stage.wa.warnings });
              }}
            >
              Import {stage.wa.turns.length} messages
            </button>
            {error && <p className="modal-error">{error}</p>}
          </>
        )}

        {stage.kind === 'done' && (
          <>
            <h3>Imported</h3>
            <p className="modal-sub">
              {stage.count} conversation{stage.count === 1 ? '' : 's'} added and analyzed.
            </p>
            {stage.warnings.map((w, i) => (
              <p key={i} className="modal-warning">{w}</p>
            ))}
            <button className="btn btn-primary btn-wide" onClick={onClose}>Start reviewing</button>
          </>
        )}
      </div>
    </div>
  );
                }
