import { describe, expect, it } from 'vitest';
import { analyzeConversation } from './analyzer';
import {
  effectiveEscalation,
  effectiveResolution,
  effectiveScore,
  overallWith,
  type Corrections,
} from './types';

const msgs = [
  { sender: 'customer' as const, text: 'Where is my refund?', timestamp: '2026-11-04T14:00:00Z' },
  { sender: 'agent' as const, text: 'It was processed yesterday, reference emailed.', timestamp: '2026-11-04T14:01:00Z' },
];

describe('reviewer corrections', () => {
  const analysis = analyzeConversation(msgs);

  it('an override with a DIFFERENT score changes the effective metric and the overall', () => {
    const machine = analysis.relevance.score;
    const target = machine >= 0.5 ? 0.1 : 0.95; // guaranteed different
    const corr: Corrections = {
      metricOverrides: { relevance: { score: target, note: 'test', at: '2026-11-12T00:00:00Z' } },
    };
    expect(effectiveScore(analysis, corr, 'relevance')).toBe(target);
    expect(overallWith(analysis, corr)).not.toBe(analysis.overall);
    // relevance carries 25% weight
    expect(overallWith(analysis, corr)).toBeCloseTo(analysis.overall + 0.25 * (target - machine), 3);
  });

  it('without corrections the effective values equal the machine values', () => {
    expect(overallWith(analysis, undefined)).toBe(analysis.overall);
    expect(effectiveResolution(analysis, undefined)).toBe(analysis.resolution);
    expect(effectiveEscalation(analysis, undefined)).toBe(analysis.escalationNeeded);
  });

  it('flag overrides win over machine flags', () => {
    const corr: Corrections = {
      metricOverrides: {},
      resolutionOverride: { value: !analysis.resolution, note: 'x', at: '2026-11-12T00:00:00Z' },
      escalationOverride: { value: !analysis.escalationNeeded, note: 'x', at: '2026-11-12T00:00:00Z' },
    };
    expect(effectiveResolution(analysis, corr)).toBe(!analysis.resolution);
    expect(effectiveEscalation(analysis, corr)).toBe(!analysis.escalationNeeded);
  });
});
