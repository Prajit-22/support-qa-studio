import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AnalysisResult, Conversation, Corrections, MetricId } from '../analysis/types';
import { analyzeConversation } from '../analysis/analyzer';
import { SAMPLE_CONVERSATIONS } from '../data/samples';

const LS_CONVERSATIONS = 'qa-studio:conversations:v1';
const LS_CORRECTIONS = 'qa-studio:corrections:v1';

interface StoreState {
  conversations: Conversation[];
  analyses: Map<string, AnalysisResult>;
  corrections: Record<string, Corrections>;
  selectedId: string | null;
  view: 'review' | 'report';
  activeMetric: MetricId | null;
  addConversations: (convs: Conversation[]) => void;
  removeConversation: (id: string) => void;
  select: (id: string | null) => void;
  setView: (v: 'review' | 'report') => void;
  setActiveMetric: (m: MetricId | null) => void;
  setMetricOverride: (convId: string, metric: MetricId, score: number, note: string, reviewer: string) => void;
  clearMetricOverride: (convId: string, metric: MetricId) => void;
  setFlagOverride: (convId: string, kind: 'resolution' | 'escalation', value: boolean | null, note: string, reviewer: string) => void;
  resetToSamples: () => void;
  isSampleData: boolean;
}

const StoreCtx = createContext<StoreState | null>(null);

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    return loadJson<Conversation[]>(LS_CONVERSATIONS) ?? SAMPLE_CONVERSATIONS;
  });
  const [isSampleData, setIsSampleData] = useState<boolean>(() => loadJson(LS_CONVERSATIONS) === null);
  const [corrections, setCorrections] = useState<Record<string, Corrections>>(() => {
    return loadJson<Record<string, Corrections>>(LS_CORRECTIONS) ?? {};
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'review' | 'report'>('review');
  const [activeMetric, setActiveMetric] = useState<MetricId | null>(null);

  const analyses = useMemo(() => {
    const map = new Map<string, AnalysisResult>();
    for (const c of conversations) map.set(c.id, analyzeConversation(c.messages));
    return map;
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem(LS_CONVERSATIONS, JSON.stringify(conversations));
  }, [conversations]);
  useEffect(() => {
    localStorage.setItem(LS_CORRECTIONS, JSON.stringify(corrections));
  }, [corrections]);

  const addConversations = useCallback((convs: Conversation[]) => {
    setConversations((prev) => [...convs, ...prev]);
    setIsSampleData(false);
    if (convs.length > 0) setSelectedId(convs[0].id);
    setView('review');
  }, []);

  const removeConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setCorrections((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const setMetricOverride = useCallback(
    (convId: string, metric: MetricId, score: number, note: string, reviewer: string) => {
      setCorrections((prev) => ({
        ...prev,
        [convId]: {
          ...prev[convId],
          reviewer: reviewer || prev[convId]?.reviewer,
          metricOverrides: {
            ...prev[convId]?.metricOverrides,
            [metric]: { score, note, at: new Date().toISOString() },
          },
        },
      }));
    },
    [],
  );

  const clearMetricOverride = useCallback((convId: string, metric: MetricId) => {
    setCorrections((prev) => {
      const cur = prev[convId];
      if (!cur?.metricOverrides?.[metric]) return prev;
      const nextOverrides = { ...cur.metricOverrides };
      delete nextOverrides[metric];
      return { ...prev, [convId]: { ...cur, metricOverrides: nextOverrides } };
    });
  }, []);

  const setFlagOverride = useCallback(
    (convId: string, kind: 'resolution' | 'escalation', value: boolean | null, note: string, reviewer: string) => {
      setCorrections((prev) => {
        const cur = prev[convId] ?? { metricOverrides: {} };
        const next: Corrections = { ...cur, reviewer: reviewer || cur.reviewer };
        if (value === null) {
          if (kind === 'resolution') delete next.resolutionOverride;
          else delete next.escalationOverride;
        } else if (kind === 'resolution') {
          next.resolutionOverride = { value, note, at: new Date().toISOString() };
        } else {
          next.escalationOverride = { value, note, at: new Date().toISOString() };
        }
        return { ...prev, [convId]: next };
      });
    },
    [],
  );

  const resetToSamples = useCallback(() => {
    setConversations(SAMPLE_CONVERSATIONS);
    setCorrections({});
    setIsSampleData(true);
    setSelectedId(null);
  }, []);

  const value: StoreState = {
    conversations,
    analyses,
    corrections,
    selectedId,
    view,
    activeMetric,
    addConversations,
    removeConversation,
    select: setSelectedId,
    setView,
    setActiveMetric,
    setMetricOverride,
    clearMetricOverride,
    setFlagOverride,
    resetToSamples,
    isSampleData,
  };

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): StoreState {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
            }
