/**
 * Compact sentiment lexicon (polarity -1..1) for the deterministic,
 * fully client-side sentiment heuristic. This replaces TextBlob's
 * pattern-based polarity from the original Python analyzer so the
 * whole pipeline runs in the browser with zero network calls.
 *
 * It is intentionally small and transparent: every word that can move
 * a sentiment score is listed here. Support-domain vocabulary included.
 */

export const LEXICON: Record<string, number> = {
  // strong negative
  terrible: -0.9, awful: -0.9, horrible: -0.9, worst: -0.9, hate: -0.9,
  disgusting: -0.9, outrageous: -0.9, unacceptable: -0.85, furious: -0.85,
  useless: -0.8, pathetic: -0.8, ridiculous: -0.75, disgrace: -0.85,
  scam: -0.9, fraud: -0.9, nightmare: -0.85, appalling: -0.85,
  // negative
  angry: -0.7, frustrated: -0.65, frustrating: -0.65, disappointed: -0.65,
  disappointing: -0.65, upset: -0.6, annoyed: -0.6, annoying: -0.55,
  broken: -0.6, bad: -0.6, poor: -0.55, wrong: -0.5, fail: -0.6,
  failed: -0.6, failing: -0.6, failure: -0.65, issue: -0.3, problem: -0.35,
  problems: -0.35, slow: -0.4, slower: -0.45, delay: -0.45, delayed: -0.45,
  late: -0.4, stuck: -0.5, crash: -0.6, crashed: -0.6, bug: -0.4,
  error: -0.4, errors: -0.45, charged: -0.3, overcharged: -0.7,
  refund: -0.2, missing: -0.4, lost: -0.5, damaged: -0.6, defect: -0.55,
  defective: -0.6, unhappy: -0.6, dissatisfied: -0.6, worse: -0.55,
  difficult: -0.35, confusing: -0.45, confused: -0.45, unhelpful: -0.6,
  incompetent: -0.75, rude: -0.65, ignored: -0.55, waiting: -0.25,
  never: -0.3, nobody: -0.35, nothing: -0.25, unable: -0.35, cannot: -0.25,
  cant: -0.3, wont: -0.3, not: -0.1, no: -0.1, complaint: -0.5,
  disappointedly: -0.6, sadly: -0.4, unfortunately: -0.3, worry: -0.4,
  worried: -0.45, concerned: -0.3, stress: -0.5, stressful: -0.5,
  // strong positive
  amazing: 0.9, excellent: 0.9, fantastic: 0.9, perfect: 0.85,
  wonderful: 0.85, brilliant: 0.85, outstanding: 0.85, awesome: 0.85,
  love: 0.8, loved: 0.8, superb: 0.85, exceptional: 0.85,
  // positive
  great: 0.7, good: 0.55, happy: 0.7, pleased: 0.65, glad: 0.6,
  thanks: 0.4, thank: 0.4, thankyou: 0.45, grateful: 0.7, appreciate: 0.6,
  appreciated: 0.6, helpful: 0.6, resolved: 0.6, fixed: 0.55, works: 0.4,
  working: 0.35, easy: 0.4, easily: 0.4, quick: 0.35, quickly: 0.4,
  fast: 0.35, smooth: 0.45, smoothly: 0.45, nice: 0.5, best: 0.7,
  better: 0.4, satisfied: 0.6, recommend: 0.55, friendly: 0.55,
  professional: 0.45, efficient: 0.5, yay: 0.6,
  correct: 0.35, exactly: 0.3, yes: 0.15, ok: 0.1, okay: 0.1,
  fine: 0.15, sure: 0.2, welcome: 0.3, congratulations: 0.6,
};

export const NEGATORS = new Set([
  'not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere',
  'hardly', 'barely', 'scarcely', "isn't", "aren't", "wasn't", "weren't",
  "don't", "doesn't", "didn't", "can't", "couldn't", "won't", "wouldn't",
  "shouldn't", "mustn't", "ain't",
]);

export const INTENSIFIERS = new Set([
  'very', 'really', 'extremely', 'so', 'too', 'absolutely', 'totally',
  'completely', 'utterly', 'quite', 'super', 'highly', 'incredibly',
]);

const WORD_RE = /[a-z']+/g;

/**
 * Lexicon polarity of one text in roughly [-1, 1].
 * Handles negation (flips the next scored word, damped) and
 * intensifiers (boost the next scored word). Deterministic.
 */
export function polarity(text: string): number {
  const words = text.toLowerCase().match(WORD_RE) ?? [];
  let sum = 0;
  let hits = 0;
  let negate = 0; // words of negation window remaining
  let intensify = false;
  for (const w of words) {
    if (NEGATORS.has(w)) {
      negate = 3;
      continue;
    }
    if (INTENSIFIERS.has(w)) {
      intensify = true;
      continue;
    }
    const v = LEXICON[w];
    if (v !== undefined) {
      let score = v;
      if (intensify) score *= 1.4;
      if (negate > 0) score *= -0.6;
      sum += score;
      hits += 1;
      intensify = false;
    }
    if (negate > 0) negate -= 1;
  }
  if (hits === 0) return 0;
  // Average, gently normalized by message length so long rants and
  // short complaints land in a comparable range.
  const norm = sum / Math.sqrt(words.length || 1);
  return Math.max(-1, Math.min(1, norm));
  }
