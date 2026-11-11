import type { MetricId } from '../analysis/types';

export const METRIC_META: Record<MetricId, { label: string; short: string; chip: string; hint: string }> = {
  clarity: {
    label: 'Clarity',
    short: 'CLR',
   chip: 'clarity',
    hint: 'Sentence length and readability of agent replies. Long walls of text and fragments score lower.',
  },
  relevance: {
    label: 'Relevance',
    short: 'REL',
   chip: 'relevance',
    hint: 'Word overlap between each customer turn and the reply that follows it. Off-topic replies score lower.',
  },
  accuracy: {
    label: 'Confidence signal',
    short: 'ACC',
   chip: 'confidence',
    hint: 'Confidence proxy: hedging and fallback language lower it. This does NOT check factual correctness.',
  },
  completeness: {
    label: 'Completeness',
    short: 'CMP',
   chip: 'completeness',
    hint: 'Share of customer questions that received a substantive reply (5+ words, no fallback).',
  },
  empathy: {
    label: 'Empathy',
    short: 'EMP',
   chip: 'empathy',
    hint: 'Empathy markers in agent replies. Weighs more when the customer is upset.',
  },
  sentiment: {
    label: 'Customer sentiment',
    short: 'SNT',
   chip: 'sentiment',
    hint: 'Lexicon-based tone of customer messages. A mood signal, not an emotion reading.',
  },
  responseTime: {
    label: 'Response time',
    short: 'RSP',
   chip: 'time',
    hint: 'Average time from a customer turn to the agent reply. Needs timestamps in the import.',
  },
};

export const METRIC_ORDER: MetricId[] = [
  'clarity',
  'relevance',
  'accuracy',
  'completeness',
  'empathy',
  'sentiment',
  'responseTime',
];

export function scoreClass(score: number): string {
  if (score >= 0.7) return 'good';
  if (score >= 0.45) return 'mid';
  return 'low';
}

export function pct(score: number): string {
  return `${Math.round(score * 100)}`;
}

export function ScoreBar({ score, animateKey }: { score: number; animateKey?: string }) {
  return (
    <div className="scorebar" role="img" aria-label={`score ${Math.round(score * 100)} out of 100`}>
      <div
        key={animateKey}
        className={`scorebar-fill ${scoreClass(score)}`}
        style={{ width: `${Math.round(score * 100)}%` }}
      />
    </div>
  );
}

export function Stamp({ kind, children }: { kind: 'resolved' | 'open' | 'escalation'; children: React.ReactNode }) {
  return <span className={`stamp stamp-${kind}`}>{children}</span>;
}
