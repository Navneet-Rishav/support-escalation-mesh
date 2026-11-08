import { config } from '../config.js';
import { runTriage } from '../agents/graph.js';
import type { PromptVersion } from '../agents/prompts.js';
import type { LlmProvider } from '../llm/types.js';
import { EvalRun } from '../models/EvalRun.js';
import { logger } from '../lib/logger.js';
import { EVAL_CASES, type EvalCase } from './dataset.js';
import { computeMetrics, type CaseResult } from './metrics.js';

/** Runs the triage graph on one labelled case. Uses the case's own order data, so evals never touch the DB. */
export async function evaluateCase(c: EvalCase, llm: LlmProvider, promptVersion: PromptVersion): Promise<CaseResult> {
  const base = {
    caseId: c.id,
    language: c.language,
    expectedCategory: c.expected.category,
    expectedEscalate: c.expected.escalate,
  };
  const started = Date.now();
  try {
    const out = await runTriage(
      { subject: c.subject, body: c.body, customer: c.customer, orderId: c.order?.orderId ?? null, createdAt: new Date() },
      { llm, promptVersion, lookupOrder: async () => c.order, refundAgentLimitInr: config.REFUND_AGENT_LIMIT_INR },
    );
    return {
      ...base,
      predictedCategory: out.classification.category,
      escalated: out.policy.decision === 'escalate',
      reasons: out.policy.reasons,
      drafted: out.draft !== null,
      violations: out.violations,
      latencyMs: out.totalLatencyMs,
      tokens: out.totalTokens,
    };
  } catch (err) {
    return {
      ...base,
      predictedCategory: null,
      escalated: true,
      reasons: ['triage_error'],
      drafted: false,
      violations: [],
      latencyMs: Date.now() - started,
      tokens: 0,
      error: (err as Error).message.slice(0, 300),
    };
  }
}

/** Runs cases with a small concurrency limit so we do not hammer the LLM API. */
export async function evaluateAll(llm: LlmProvider, promptVersion: PromptVersion, cases = EVAL_CASES, concurrency = 3): Promise<CaseResult[]> {
  const results: CaseResult[] = new Array(cases.length);
  let next = 0;
  async function worker() {
    while (next < cases.length) {
      const i = next++;
      results[i] = await evaluateCase(cases[i], llm, promptVersion);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));
  return results;
}

/** Creates an EvalRun document, runs all cases, and stores results and metrics. */
export async function executeEvalRun(runId: string, llm: LlmProvider, promptVersion: PromptVersion): Promise<void> {
  try {
    const results = await evaluateAll(llm, promptVersion);
    const metrics = computeMetrics(results, config.LLM_COST_PER_1K_TOKENS_INR);
    await EvalRun.findByIdAndUpdate(runId, { status: 'completed', results, metrics, finishedAt: new Date() });
  } catch (err) {
    logger.error({ err, runId }, 'eval run failed');
    await EvalRun.findByIdAndUpdate(runId, { status: 'failed', error: (err as Error).message, finishedAt: new Date() });
  }
}
