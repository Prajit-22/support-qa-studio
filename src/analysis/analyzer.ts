/**
 * Rule-based support-conversation analyzer.
 *
 * TypeScript port of the analyzers in post-conversation-analysis
 * (analysis/analyzers.py), extended so every metric also returns the
 * exact conversation lines that drove it (evidence). Same formulas,
 * same score ranges, same deterministic behavior. Sentiment uses the
 * local lexicon (lexicon.ts) instead of TextBlob.
 *
 * Every metric is a heuristic review aid, not ground truth.
 */

import type { AnalysisResult, EvidenceRef, Message, MetricResult } from './types';
import { polarity } from './lexicon';

const WORD_RE = /[a-z']+/g;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'its', 'i', 'me', 'my', 'we', 'you',
  'your', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'can',
  'could', 'please', 'hi', 'hello', 'thanks', 'thank', 'do', 'does',
]);

export const FALLBACK_PATTERNS = [
  "i don't understand", 'i do not understand', "didn't understand",
  'could you rephrase', 'can you rephrase', 'please rephrase',
  "i'm not sure", 'i am not sure', "i don't know", 'i do not know',
  'cannot help', "can't help", 'unable to help', 'try again later',
];

export const EMPATHY_PATTERNS = [
  'i understand', "i'm sorry", 'i am sorry', 'sorry to hear',
  'apologize', 'apologies', 'i can imagine', 'that sounds frustrating',
  "i'm here to help", 'i am here to help',
];

export const HEDGE_PATTERNS = [
  'i think', 'maybe', 'perhaps', 'probably', 'not sure', 'might be',
];

// Whole-word question detection: a bare substring test treats "show" as
// "how" and "whenever" as "when", counting statements as questions.
const QUESTION_RE = /\b(?:how|what|why|when|where|which|can you|could you)\b/;

function normalizeApostrophes(text: string): string {
  return text.replace(/[’‘ʼ′]/g, "'");
}

function clamp(value: number, low = 0, high = 1): number {
  return Math.max(low, Math.min(high, value));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(WORD_RE) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w) && w.length > 2));
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function excerpt(text: string, max = 90): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max - 1) + '…';
}

function agentMessages(messages: Message[]): Message[] {
  return messages.filter((m) => m.sender === 'agent');
}

function userMessages(messages: Message[]): Message[] {
  return messages.filter((m) => m.sender === 'customer');
}

// ---------------------------------------------------------------- sentiment

function analyzeSentiment(
  messages: Message[],
): MetricResult & { label: 'positive' | 'neutral' | 'negative'; rawScore: number } {
  const users = userMessages(messages);
  if (users.length === 0) {
    return {
      id: 'sentiment', label: 'neutral', rawScore: 0, score: 0.5,
      summary: 'No customer messages to score.',
      evidence: [],
    };
  }
  const per = users.map((m, i) => ({ m, i, p: polarity(m.text) }));
  const avg = per.reduce((s, x) => s + x.p, 0) / per.length;
  const label = avg > 0.1 ? 'positive' : avg < -0.1 ? 'negative' : 'neutral';
  const ranked = [...per].sort((a, b) =>
    label === 'negative' ? a.p - b.p : b.p - a.p,
  );
  const evidence: EvidenceRef[] = ranked
    .filter((x) => (label === 'negative' ? x.p < -0.05 : x.p > 0.05))
    .slice(0, 4)
    .map((x) => ({
      messageIndex: messages.indexOf(x.m),
      excerpt: excerpt(x.m.text),
      note: `customer line, polarity ${x.p.toFixed(2)} (lexicon)`,
    }));
  // Score maps -1..1 polarity to 0..1 so worse sentiment reads as a lower score.
  const score = round3(clamp((avg + 1) / 2));
  return {
    id: 'sentiment',
    label,
    rawScore: Math.round(avg * 1000) / 1000,
    score,
    summary: `Average customer sentiment is ${label} (${avg.toFixed(2)} on a -1..1 lexicon scale), from ${users.length} customer message${users.length === 1 ? '' : 's'}.`,
    evidence,
  };
}

// ------------------------------------------------------------------ clarity

function analyzeClarity(messages: Message[]): MetricResult {
  const agents = agentMessages(messages);
  if (agents.length === 0) {
    return { id: 'clarity', score: 0.5, summary: 'No agent messages to score.', evidence: [] };
  }
  const evidence: EvidenceRef[] = [];
  const scores = agents.map((msg) => {
    const sentences = splitSentences(msg.text);
    const list = sentences.length > 0 ? sentences : [msg.text];
    const lengths = list.map((s) => s.split(/\s+/).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    let score = 1;
    if (avg > 25) score -= Math.min(0.5, (avg - 25) * 0.03);
    else if (avg < 3) score -= 0.2;
    const longSentences = lengths.filter((l) => l > 40).length;
    score -= 0.1 * longSentences;
    if (avg > 25 || longSentences > 0 || avg < 3) {
      evidence.push({
        messageIndex: messages.indexOf(msg),
        excerpt: excerpt(msg.text),
        note:
          longSentences > 0
            ? `${longSentences} sentence${longSentences === 1 ? '' : 's'} over 40 words (avg ${avg.toFixed(0)})`
            : avg > 25
              ? `avg sentence length ${avg.toFixed(0)} words (over 25)`
              : `avg sentence length ${avg.toFixed(1)} words (fragmentary)`,
      });
    }
    return clamp(score);
  });
  const score = round3(scores.reduce((a, b) => a + b, 0) / scores.length);
  return {
    id: 'clarity',
    score,
    summary:
      evidence.length === 0
        ? 'Agent replies use readable sentence lengths throughout.'
        : `${evidence.length} agent message${evidence.length === 1 ? '' : 's'} with very long or fragmentary sentences.`,
    evidence: evidence.slice(0, 5),
  };
}

// ---------------------------------------------------------------- relevance

function analyzeRelevance(messages: Message[]): MetricResult {
  let pairs = 0;
  let total = 0;
  const pairScores: Array<{ i: number; j: number; overlap: number; score: number }> = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.sender !== 'customer') continue;
    const nxt = i + 1 < messages.length ? messages[i + 1] : undefined;
    if (!nxt || nxt.sender !== 'agent') continue;
    const userWords = contentWords(msg.text);
    const aiWords = contentWords(nxt.text);
    if (userWords.size === 0 || aiWords.size === 0) continue;
    let shared = 0;
    userWords.forEach((w) => {
      if (aiWords.has(w)) shared += 1;
    });
    const overlap = shared / userWords.size;
    const score = Math.min(1, 0.4 + overlap); // a direct echo is not required to be relevant
    total += score;
    pairs += 1;
    pairScores.push({ i, j: i + 1, overlap, score });
  }
  if (pairs === 0) {
    return { id: 'relevance', score: 0.5, summary: 'No customer/agent turn pairs to compare.', evidence: [] };
  }
  const score = round3(clamp(total / pairs));
  const weakest = [...pairScores].sort((a, b) => a.overlap - b.overlap).slice(0, 3);
  const evidence: EvidenceRef[] = weakest.map((p) => ({
    messageIndex: p.j,
    excerpt: excerpt(messages[p.j].text),
    note: `shares ${(p.overlap * 100).toFixed(0)}% of the customer's content words from turn ${p.i + 1}`,
  }));
  return {
    id: 'relevance',
    score,
    summary: `Agent replies overlap ${(Math.max(0, score - 0.4) * 100).toFixed(0)}% of customer content words on average across ${pairs} turn${pairs === 1 ? '' : 's'}. Weakest exchanges listed.`,
    evidence,
  };
}

// ----------------------------------------------------------------- accuracy

function analyzeAccuracy(messages: Message[], fallbackCount: number): MetricResult {
  const agents = agentMessages(messages);
  if (agents.length === 0) {
    return { id: 'accuracy', score: 0.5, summary: 'No agent messages to score.', evidence: [] };
  }
  const evidence: EvidenceRef[] = [];
  let hedges = 0;
  for (const msg of agents) {
    const lower = msg.text.toLowerCase();
    const hits = HEDGE_PATTERNS.filter((p) => lower.includes(p));
    const fallbacks = FALLBACK_PATTERNS.filter((p) => lower.includes(p));
    hedges += hits.length;
    if (hits.length > 0 || fallbacks.length > 0) {
      evidence.push({
        messageIndex: messages.indexOf(msg),
        excerpt: excerpt(msg.text),
        note: [...hits.map((h) => `hedge "${h}"`), ...fallbacks.map((f) => `fallback "${f}"`)].join('; '),
      });
    }
  }
  const score = round3(clamp(1 - 0.1 * hedges - 0.15 * fallbackCount));
  return {
    id: 'accuracy',
    score,
    summary:
      hedges === 0 && fallbackCount === 0
        ? 'No hedging or fallback language detected. Note: this measures answer confidence, not factual correctness.'
        : `${hedges} hedge${hedges === 1 ? '' : 's'} and ${fallbackCount} fallback${fallbackCount === 1 ? '' : 's'} detected. This measures confidence, not factual correctness.`,
    evidence: evidence.slice(0, 6),
  };
}

// ------------------------------------------------------------- completeness

function analyzeCompleteness(messages: Message[], fallbackCount: number): MetricResult {
  let asked = 0;
  let answered = 0;
  const unanswered: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.sender !== 'customer') continue;
    const text = msg.text.toLowerCase();
    const isQuestion = text.includes('?') || QUESTION_RE.test(text);
    if (!isQuestion) continue;
    asked += 1;
    const nxt = i + 1 < messages.length ? messages[i + 1] : undefined;
    if (nxt && nxt.sender === 'agent') {
      const reply = nxt.text.toLowerCase();
      const substantive =
        reply.split(/\s+/).length >= 5 &&
        !FALLBACK_PATTERNS.some((p) => reply.includes(p));
      if (substantive) answered += 1;
      else unanswered.push(i);
    } else {
      unanswered.push(i);
    }
  }
  const evidence: EvidenceRef[] = unanswered.slice(0, 5).map((i) => ({
    messageIndex: i,
    excerpt: excerpt(messages[i].text),
    note: 'customer question without a substantive agent reply',
  }));
  if (asked === 0) {
    const score = fallbackCount === 0 ? 0.8 : 0.5;
    return {
      id: 'completeness',
      score,
      summary: `No explicit customer questions detected; baseline ${score} applied${fallbackCount > 0 ? ' (fallbacks present)' : ''}.`,
      evidence,
    };
  }
  const score = round3(clamp(answered / asked));
  return {
    id: 'completeness',
    score,
    summary: `${answered} of ${asked} customer question${asked === 1 ? '' : 's'} got a substantive reply (5+ words, no fallback).`,
    evidence,
  };
}

// ------------------------------------------------------------------ empathy

function analyzeEmpathy(messages: Message[], userSentiment: number): MetricResult {
  const agents = agentMessages(messages);
  const evidence: EvidenceRef[] = [];
  let hits = 0;
  for (const msg of agents) {
    const lower = msg.text.toLowerCase();
    const found = EMPATHY_PATTERNS.filter((p) => lower.includes(p));
    if (found.length > 0) {
      hits += found.length;
      evidence.push({
        messageIndex: messages.indexOf(msg),
        excerpt: excerpt(msg.text),
        note: `empathy marker "${found[0]}"`,
      });
    }
  }
  const upset = userSentiment < -0.1;
  const score = round3(clamp(upset ? 0.3 + 0.35 * hits : 0.6 + 0.2 * hits));
  return {
    id: 'empathy',
    score,
    summary:
      hits === 0
        ? upset
          ? 'Customer is upset but no empathy markers ("i understand", "i\'m sorry", …) appear in agent replies.'
          : 'No explicit empathy markers in agent replies.'
        : `${hits} empathy marker${hits === 1 ? '' : 's'} in agent replies${upset ? ' (customer is upset, so these weigh more)' : ''}.`,
    evidence: evidence.slice(0, 5),
  };
}

// ------------------------------------------------------------ response time

function analyzeResponseTime(
  messages: Message[],
): MetricResult & { avgSeconds: number | null } {
  const deltas: Array<{ i: number; seconds: number }> = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.sender !== 'customer' || !msg.timestamp) continue;
    const nxt = i + 1 < messages.length ? messages[i + 1] : undefined;
    if (!nxt || nxt.sender !== 'agent' || !nxt.timestamp) continue;
    const t0 = Date.parse(msg.timestamp);
    const t1 = Date.parse(nxt.timestamp);
    if (Number.isNaN(t0) || Number.isNaN(t1) || t1 < t0) continue;
    deltas.push({ i, seconds: (t1 - t0) / 1000 });
  }
  if (deltas.length === 0) {
    return {
      id: 'responseTime',
      avgSeconds: null,
      score: 0.5,
      summary: 'No usable timestamps, so response time could not be measured. Import a format with timestamps to enable this metric.',
      evidence: [],
    };
  }
  const avg = deltas.reduce((s, d) => s + d.seconds, 0) / deltas.length;
  // Score: <=60s is excellent (1.0), decays to 0 at 30 minutes.
  const score = round3(clamp(1 - Math.max(0, avg - 60) / (30 * 60 - 60)));
  const slowest = [...deltas].sort((a, b) => b.seconds - a.seconds).slice(0, 3);
  const evidence: EvidenceRef[] = slowest.map((d) => ({
    messageIndex: d.i + 1,
    excerpt: excerpt(messages[d.i + 1].text),
    note: `agent replied after ${formatSeconds(d.seconds)}`,
  }));
  return {
    id: 'responseTime',
    avgSeconds: Math.round(avg * 100) / 100,
    score,
    summary: `Average first-reply time ${formatSeconds(avg)} across ${deltas.length} customer turn${deltas.length === 1 ? '' : 's'} (under 60s scores full, 30min+ scores zero).`,
    evidence,
  };
}

function formatSeconds(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
}

// --------------------------------------------------------------- resolution

function analyzeResolution(messages: Message[], fallbackCount: number): { value: boolean; reason: string } {
  const agents = agentMessages(messages);
  if (agents.length === 0) return { value: false, reason: 'No agent messages in the conversation.' };
  if (fallbackCount >= 2) return { value: false, reason: `${fallbackCount} fallback replies - the conversation never got past deflection.` };
  const lastAi = agents[agents.length - 1].text.toLowerCase();
  if (FALLBACK_PATTERNS.some((p) => lastAi.includes(p))) {
    return { value: false, reason: 'The final agent reply is a fallback.' };
  }
  const last = messages[messages.length - 1];
  if (last && last.sender === 'customer' && last.text.trim().endsWith('?')) {
    return { value: false, reason: 'The conversation ends on an unanswered customer question.' };
  }
  if (userMessages(messages).length === 0) return { value: false, reason: 'No customer messages in the conversation.' };
  return { value: true, reason: 'Ends with a substantive agent reply and no open customer question.' };
}

// ------------------------------------------------------------------- entry

export function analyzeConversation(rawMessages: Message[]): AnalysisResult {
  const messages = rawMessages
    .filter((m) => m.text && m.text.trim().length > 0)
    .map((m) => ({ ...m, text: normalizeApostrophes(m.text) }));

  const agents = agentMessages(messages);
  let fallbackCount = 0;
  for (const msg of agents) {
    const lower = msg.text.toLowerCase();
    if (FALLBACK_PATTERNS.some((p) => lower.includes(p))) fallbackCount += 1;
  }

  const sentiment = analyzeSentiment(messages);
  const clarity = analyzeClarity(messages);
  const relevance = analyzeRelevance(messages);
  const accuracy = analyzeAccuracy(messages, fallbackCount);
  const completeness = analyzeCompleteness(messages, fallbackCount);
  const empathy = analyzeEmpathy(messages, sentiment.rawScore);
  const responseTime = analyzeResponseTime(messages);
  const resolution = analyzeResolution(messages, fallbackCount);
  const escalationValue =
    (sentiment.rawScore < -0.2 && !resolution.value) || fallbackCount >= 3;
  const escalationReason = escalationValue
    ? fallbackCount >= 3
      ? `${fallbackCount} fallback replies - automated deflection loop.`
      : `Negative customer sentiment (${sentiment.rawScore.toFixed(2)}) with no resolution.`
    : 'No escalation signals.';

  const overall = round3(
    clamp(
      0.25 * clarity.score +
        0.25 * relevance.score +
        0.2 * accuracy.score +
        0.2 * completeness.score +
        0.1 * empathy.score,
    ),
  );

  return {
    clarity,
    relevance,
    accuracy,
    completeness,
    empathy,
    sentiment: {
      id: 'sentiment',
      label: sentiment.label,
      score: sentiment.score,
      summary: sentiment.summary,
      evidence: sentiment.evidence,
    },
    responseTime: {
      id: 'responseTime',
      avgSeconds: responseTime.avgSeconds,
      score: responseTime.score,
      summary: responseTime.summary,
      evidence: responseTime.evidence,
    },
    resolution: resolution.value,
    resolutionReason: resolution.reason,
    escalationNeeded: escalationValue,
    escalationReason,
    fallbackCount,
    overall,
  };
}
