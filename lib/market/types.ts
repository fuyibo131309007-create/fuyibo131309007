export const INDICES = [
  { code: "000001.SH", name: "上证综指", short: "上证", sql: "SSE" },
  { code: "000300.SH", name: "沪深300", short: "沪深300", sql: "CSI300" },
  { code: "000016.SH", name: "上证50", short: "上证50", sql: "SSE50" },
  { code: "000688.SH", name: "科创50", short: "科创50", sql: "KCB50" },
] as const;
export type Mode = "replay" | "official" | "fuyao";
export type ResearchRequest = { index: string; window: 20 | 60; asOf: string; mode: Mode; question?: string };
export type Bar = { date: string; date_ms: number; open_price: number; high_price: number; low_price: number; close_price: number; volume: number | null; turnover: number | null };
export type Series = { code: string; name: string; bars: Bar[]; source: string; sourceUrl: string; endpoint: string; retrievedAt: string; origin: "network" | "archive"; rawFields: Record<string,string> };
export type MarketRow = { date: string; turnover: number | null; average_pe: number | null; turnover_ratio_pct: number | null; listed_count: number | null };
export type MarketSeries = { id: string; name: string; bars: MarketRow[]; sourceUrl: string; endpoint: string; retrievedAt: string; origin: "network" | "archive" };
export type Trace = { id: string; tool: string; purpose: string; status: "success" | "failed" | "skipped" | "cached"; durationMs: number; count?: number; message: string; endpoint?: string };
export type Breadth = { date: string; timestamp: number; up: number; down: number; flat: number; excluded: number; total: number; fetched: number; ratio: number | null; endpoint: string; retrievedAt: string };
export type DataBundle = { series: Series[]; markets: MarketSeries[]; breadth?: Breadth; traces: Trace[]; warnings: string[]; mode: Mode; requestedDate: string; resolvedDate: string };
export type Evidence = { id: string; dimension: string; label: string; status: "available" | "missing" | "conflict"; value: number | null; displayValue: string; unit: string; observation: string; interpretation: string; formula: string; scope: string; asOf: string; source: string; sourceUrl: string; endpoint: string; retrievedAt: string; rawFields: Record<string,string>; inputs: unknown; caveat: string };
export type Insight = { text: string; evidenceIds: string[]; kind: "inference" | "uncertainty" };
export type ModelResult = { status: "generated" | "unconfigured" | "failed" | "refused"; provider: string; model: string; reason: string; durationMs: number; tokens?: number; summary?: string; insights?: Insight[] };
export type ResearchFollowup = {question:string;answer:string;insights:Insight[];model:ModelResult;asOf:string};
export type Report = { id: string; snapshotFingerprint?: string; request: ResearchRequest; indexName: string; asOf: string; generatedAt: string; modeLabel: string; bars: Bar[]; series: { code: string; name: string; returnPct: number | null }[]; evidence: Evidence[]; traces: Trace[]; warnings: string[]; regime: string; structure: "up" | "down" | "mixed" | "unknown"; summary: string; supports: Insight[]; conflicts: Insight[]; conditions: { title: string; detail: string; evidenceIds: string[] }[]; limitations: string[]; coverage: { available: number; total: number; confidence: "高" | "中" | "低"; explanation: string }; model: ModelResult; metrics: { close: number | null; dailyReturn: number | null; windowReturn: number | null; ma20: number | null; ma60: number | null; activityRatio: number | null; volatility: number | null; maxDrawdown: number | null; styleGap: number | null } };
