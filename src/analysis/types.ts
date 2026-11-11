export type Sender = 'customer' | 'agent';

export interface Message {
  sender: Sender;
  text: string;
  /** ISO-8601 timestamp, optional. Enables response-time measurement. */
  timestamp?: string;
  /** Display name of the speaker (from the import source). */
  author?: string;
}

export interface Conversation {
  id: string;
  title: string;
  source: string;
  messages: Message[];
}

export type MetricId =
  | 'clarity'
  | 'relevance'
  | 'accuracy'
  | 'completeness'
  | 'empathy'
  | 'sentiment'
  | 'responseTime';

export interface EvidenceRef {
  /** Index into Conversation.messages */
  messageIndex: number;
  /** Short excerpt shown in the scorecard */
  excerpt: string;
  /** Why this line is evidence */
  note: string;
}

export interface MetricResult {
  id: MetricId;
  /** 0..1 for all metrics. */
  score: number;
  /** Plain-language explanation of what drove the score. */
  summary: string;
  evidence: EvidenceRef[];
}

export interface AnalysisResult {
  clarity: MetricResult;
  relevance: MetricResult;
  accuracy: MetricResult;
  completeness: MetricResult;
  empathy: MetricResult;
  sentiment: MetricResult & { label: 'positive' | 'neutral' | 'negative' };
  responseTime: MetricResult & { avgSeconds: number | null };
  resolution: boolean;
  resolutionReason: string;
  escalationNeeded: boolean;
  escalationReason: string;
  fallbackCount: number;
  /** Weighted blend of the scored metrics, 0..1. Review aid, not ground truth. */
  overall: number;
}

export interface MetricOverride {
  score: number;
  note: string;
  at: string;
}

export interface Corrections {
  metricOverrides: Partial<Record<MetricId, MetricOverride>>;
  resolutionOverride?: { value: boolean; note: string; at: string };
  escalationOverride?: { value: boolean; note: string; at: string };
  reviewer?: string;
}

/** Analysis with reviewer corrections applied. */
export function effectiveScore(
  result: AnalysisResult,
  corrections: Corrections | undefined,
  metric: MetricId,
): number {
  const o = corrections?.metricOverrides?.[metric];
  return o ? o.score : result[metric].score;
}

export const METRIC_WEIGHTS: Record<Exclude<MetricId, 'sentiment' | 'responseTime'>, number> = {
  clarity: 0.25,
  relevance: 0.25,
  accuracy: 0.2,
  completeness: 0.2,
  empathy: 0.1,
};

export function overallWith(
  result: AnalysisResult,
  corrections: Corrections | undefined,
): number {
  let total = 0;
  (Object.keys(METRIC_WEIGHTS) as Array<keyof typeof METRIC_WEIGHTS>).forEach((k) => {
    total += METRIC_WEIGHTS[k] * effectiveScore(result, corrections, k);
  });
  return Math.round(Math.max(0, Math.min(1, total)) * 1000) / 1000;
}

export function effectiveResolution(
  result: AnalysisResult,
  corrections: Corrections | undefined,
): boolean {
  return corrections?.resolutionOverride
    ? corrections.resolutionOverride.value
    : result.resolution;
}

export function effectiveEscalation(
  result: AnalysisResult,
  corrections: Corrections | undefined,
): boolean {
  return corrections?.escalationOverride
    ? corrections.escalationOverride.value
    : result.escalationNeeded;
}
