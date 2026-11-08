/** Per-ticket eval result, as stored on an EvalRun. */
export interface CaseResult {
  caseId: string;
  language: string;
  expectedCategory: string;
  predictedCategory: string | null;
  expectedEscalate: boolean;
  escalated: boolean;
  reasons: string[];
  drafted: boolean;
  violations: string[];
  latencyMs: number;
  tokens: number;
  error?: string;
}

export interface EvalMetrics {
  cases: number;
  /** Share of tickets routed to the expected category. */
  routingAccuracy: number;
  /** Of the tickets we escalated, how many should have been. null if nothing was escalated. */
  escalationPrecision: number | null;
  /** Of the tickets that should be escalated, how many we caught. null if none should be. */
  escalationRecall: number | null;
  /** Share of AI-drafted replies that the code draft-checker flagged. null if nothing was drafted. */
  policyViolationRate: number | null;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgTokensPerTicket: number;
  /** Only when a price per 1K tokens is configured; otherwise null (we never invent prices). */
  costPerTicketInr: number | null;
  errors: number;
}

const round = (n: number, dp = 3) => Number(n.toFixed(dp));

/** Nearest-rank percentile. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function computeMetrics(results: CaseResult[], costPer1kTokensInr?: number): EvalMetrics {
  const n = results.length;
  const ok = results.filter((r) => !r.error);
  // A ticket whose triage errored counts as wrong routing and as escalated (a failed ticket goes to a human).
  const correctRoutes = results.filter((r) => r.predictedCategory === r.expectedCategory).length;

  const tp = results.filter((r) => r.escalated && r.expectedEscalate).length;
  const fp = results.filter((r) => r.escalated && !r.expectedEscalate).length;
  const fn = results.filter((r) => !r.escalated && r.expectedEscalate).length;

  const drafted = results.filter((r) => r.drafted);
  const violating = drafted.filter((r) => r.violations.length > 0).length;

  const latencies = ok.map((r) => r.latencyMs);
  const avgTokens = ok.length ? ok.reduce((s, r) => s + r.tokens, 0) / ok.length : 0;

  return {
    cases: n,
    routingAccuracy: n ? round(correctRoutes / n) : 0,
    escalationPrecision: tp + fp > 0 ? round(tp / (tp + fp)) : null,
    escalationRecall: tp + fn > 0 ? round(tp / (tp + fn)) : null,
    policyViolationRate: drafted.length ? round(violating / drafted.length) : null,
    avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    p95LatencyMs: Math.round(percentile(latencies, 95)),
    avgTokensPerTicket: Math.round(avgTokens),
    costPerTicketInr: costPer1kTokensInr !== undefined ? round((avgTokens / 1000) * costPer1kTokensInr, 4) : null,
    errors: n - ok.length,
  };
}
