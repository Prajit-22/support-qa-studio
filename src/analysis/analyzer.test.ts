import { describe, expect, it } from 'vitest';
import { analyzeConversation } from './analyzer';
import type { Message } from './types';

const good: Message[] = [
  { sender: 'customer', text: 'My lamp arrived cracked. How do I get a refund?', timestamp: '2026-11-04T14:00:00Z' },
  { sender: 'agent', text: "I'm sorry it arrived damaged. I have started your refund and you will see it in 5 working days.", timestamp: '2026-11-04T14:01:30Z' },
  { sender: 'customer', text: 'Great, thanks for the quick help!', timestamp: '2026-11-04T14:03:00Z' },
];

const fallbackLoop: Message[] = [
  { sender: 'customer', text: 'Can you update my invoice?' },
  { sender: 'agent', text: "I don't understand. Could you rephrase?" },
  { sender: 'customer', text: 'The invoice is wrong, fix it.' },
  { sender: 'agent', text: "I am not sure I can help with that. I don't know." },
  { sender: 'customer', text: 'This is ridiculous, get me a human.' },
  { sender: 'agent', text: "I don't understand. Try again later." },
];

const angry: Message[] = [
  { sender: 'customer', text: 'This is unacceptable and ridiculous. I am furious about the double charge.' },
  { sender: 'agent', text: 'Let me look into that for you.' },
  { sender: 'customer', text: 'Worst support ever. Nobody fixed it last time either. I want a manager?' },
];

describe('analyzeConversation', () => {
  it('returns all metrics in [0, 1] with an overall blend', () => {
    const r = analyzeConversation(good);
    for (const m of [r.clarity, r.relevance, r.accuracy, r.completeness, r.empathy, r.sentiment, r.responseTime]) {
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(1);
      expect(typeof m.summary).toBe('string');
    }
    expect(r.overall).toBeGreaterThanOrEqual(0);
    expect(r.overall).toBeLessThanOrEqual(1);
  });

  it('scores a good conversation well and resolved', () => {
    const r = analyzeConversation(good);
    expect(r.resolution).toBe(true);
    expect(r.escalationNeeded).toBe(false);
    expect(r.sentiment.label).toBe('positive');
    expect(r.overall).toBeGreaterThan(0.6);
    expect(r.empathy.score).toBeGreaterThan(0.7); // "i'm sorry" present
  });

  it('measures response time from timestamps', () => {
    const r = analyzeConversation(good);
    expect(r.responseTime.avgSeconds).toBeCloseTo(90, 0);
    expect(r.responseTime.score).toBeGreaterThanOrEqual(0.9);
  });

  it('flags a fallback loop for escalation and marks it unresolved', () => {
    const r = analyzeConversation(fallbackLoop);
    expect(r.fallbackCount).toBeGreaterThanOrEqual(3);
    expect(r.escalationNeeded).toBe(true);
    expect(r.resolution).toBe(false);
    expect(r.accuracy.score).toBeLessThan(0.6);
    expect(r.accuracy.evidence.length).toBeGreaterThan(0);
  });

  it('escalates an angry unresolved conversation and wants empathy', () => {
    const r = analyzeConversation(angry);
    expect(r.sentiment.label).toBe('negative');
    expect(r.escalationNeeded).toBe(true);
    expect(r.resolution).toBe(false); // ends on a customer question
    expect(r.empathy.score).toBeLessThan(0.4); // upset customer, no empathy markers
  });

  it('treats "show" as a statement, not the question word "how"', () => {
    const msgs: Message[] = [
      { sender: 'customer', text: 'The dashboard does not show my data.' },
      { sender: 'agent', text: 'I have cleared your cache, it will show now.' },
    ];
    const r = analyzeConversation(msgs);
    // no question asked -> completeness baseline, not 0
    expect(r.completeness.score).toBe(0.8);
  });

  it('counts unanswered questions against completeness', () => {
    const msgs: Message[] = [
      { sender: 'customer', text: 'Where is my refund?' },
      { sender: 'agent', text: 'OK.' },
      { sender: 'customer', text: 'And why was I charged twice?' },
      { sender: 'agent', text: "I don't know, I can't help with that." },
    ];
    const r = analyzeConversation(msgs);
    expect(r.completeness.score).toBe(0);
    expect(r.completeness.evidence.length).toBe(2);
  });

  it('normalizes curly apostrophes from phones', () => {
    const msgs: Message[] = [
      { sender: 'customer', text: 'My order is broken and I am upset.' },
      { sender: 'agent', text: 'I\u2019m sorry to hear that. I understand.' },
    ];
    const r = analyzeConversation(msgs);
    expect(r.empathy.evidence.length).toBeGreaterThan(0);
  });

  it('handles empty input with neutral defaults', () => {
    const r = analyzeConversation([]);
    expect(r.overall).toBeGreaterThanOrEqual(0);
    expect(r.resolution).toBe(false);
    expect(r.responseTime.avgSeconds).toBeNull();
  });

  it('penalizes hedging under accuracy', () => {
    const msgs: Message[] = [
      { sender: 'customer', text: 'When will it ship?' },
      { sender: 'agent', text: 'I think maybe it will probably ship soon, perhaps tomorrow.' },
    ];
    const r = analyzeConversation(msgs);
    expect(r.accuracy.score).toBeLessThan(0.8);
    expect(r.accuracy.evidence.some((e) => e.note.includes('hedge'))).toBe(true);
  });

  it('does not resolve when the final agent message is a fallback', () => {
    const msgs: Message[] = [
      { sender: 'customer', text: 'Help with billing please.' },
      { sender: 'agent', text: 'I cannot help with that.' },
    ];
    const r = analyzeConversation(msgs);
    expect(r.resolution).toBe(false);
  });
});
