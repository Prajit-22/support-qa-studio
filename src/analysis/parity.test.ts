/**
 * Parity regression: the TypeScript app analyzer and the Python skill
 * analyzer must produce identical scores on the same input. Run after
 * touching either implementation or the shared lexicon.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeConversation } from './analyzer';
import type { Message } from './types';

const SKILL = resolve(__dirname, '../../skill');

interface PythonResult {
  overall: number;
  resolution: boolean;
  escalation_needed: boolean;
  fallback_count: number;
  metrics: Record<string, { score: number; avg_seconds?: number | null }>;
}

function pythonAnalyze(fixture: string, args: string[] = []): PythonResult {
  const out = execFileSync(
    'python3',
    [resolve(SKILL, 'scripts/qa_analyzer.py'), fixture, ...args],
    { encoding: 'utf-8' },
  );
  return JSON.parse(out) as PythonResult;
}

const METRICS = ['clarity', 'relevance', 'accuracy', 'completeness', 'empathy', 'sentiment', 'responseTime'] as const;

function expectParity(fixture: string, messages: Message[], args: string[] = []) {
  const py = pythonAnalyze(fixture, args);
  const ts = analyzeConversation(messages);
  for (const m of METRICS) {
    expect(ts[m].score, `metric ${m}`).toBeCloseTo(py.metrics[m].score, 6);
  }
  expect(ts.overall, 'overall').toBeCloseTo(py.overall, 6);
  expect(ts.resolution, 'resolution').toBe(py.resolution);
  expect(ts.escalationNeeded, 'escalation').toBe(py.escalation_needed);
  expect(ts.fallbackCount, 'fallbacks').toBe(py.fallback_count);
}

describe('app/skill analyzer parity', () => {
  it('matches on the good JSON fixture', () => {
    const fixture = resolve(SKILL, 'tests/fixtures/good.json');
    const messages = JSON.parse(readFileSync(fixture, 'utf-8')) as Array<Record<string, string>>;
    expectParity(
      fixture,
      messages.map((m) => ({
        sender: (m.sender === 'user' ? 'customer' : m.sender === 'ai' ? 'agent' : m.sender) as Message['sender'],
        text: m.text,
        ...(m.timestamp ? { timestamp: m.timestamp } : {}),
      })),
    );
  });

  it('matches on the WhatsApp bot-loop fixture', () => {
    const fixture = resolve(SKILL, 'tests/fixtures/bot_loop.txt');
    const messages: Message[] = [
      { sender: 'customer', text: 'My invoice shows the wrong GST number. Can you update it?', author: 'Kabir', timestamp: '2026-11-04T14:50:00+00:00' },
      { sender: 'agent', text: "I don't understand your request. Could you rephrase it?", author: 'HelpBot', timestamp: '2026-11-04T14:50:20+00:00' },
      { sender: 'customer', text: 'The GST number on invoice INV-2210 is wrong. Please correct it.', author: 'Kabir', timestamp: '2026-11-04T14:51:00+00:00' },
      { sender: 'agent', text: "I am not sure about that. I don't know how to help with invoices.", author: 'HelpBot', timestamp: '2026-11-04T14:51:10+00:00' },
      { sender: 'customer', text: 'This is ridiculous. Get me a human agent please.', author: 'Kabir', timestamp: '2026-11-04T14:52:00+00:00' },
      { sender: 'agent', text: "I don't understand. Try again later.", author: 'HelpBot', timestamp: '2026-11-04T14:52:05+00:00' },
    ];
    expectParity(fixture, messages, ['--roles', 'Kabir=customer,HelpBot=agent']);
  });
});
