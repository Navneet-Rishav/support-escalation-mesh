import { describe, expect, it } from 'vitest';
import { runTriage, type TriageDeps } from '../src/agents/graph.js';
import { FakeProvider } from '../src/llm/fake.js';
import type { LlmProvider } from '../src/llm/types.js';
import { computeMetrics, percentile, type CaseResult } from '../src/evals/metrics.js';
import { evaluateAll } from '../src/evals/runner.js';
import { EVAL_CASES } from '../src/evals/dataset.js';

const order = { orderId: 'BZ-10001', amountInr: 1299, status: 'delivered', items: 'Speaker' };
const deps = (overrides: Partial<TriageDeps> = {}): TriageDeps => ({
  llm: new FakeProvider(),
  promptVersion: 'v2',
  lookupOrder: async () => order,
  refundAgentLimitInr: 2000,
  ...overrides,
});
const customer = { name: 'Aarav Mehta', email: 'aarav@example.com', tier: 'standard' as const };

describe('triage graph', () => {
  it('routes a billing ticket through specialist, policy, draft and draft check', async () => {
    const out = await runTriage(
      { subject: 'Charged twice', body: 'I was charged twice for order BZ-10001, please refund ₹1,299', customer, createdAt: new Date() },
      deps(),
    );
    expect(out.classification.category).toBe('billing');
    expect(out.policy).toMatchObject({ decision: 'review', approvedRefundInr: 1299 });
    expect(out.draft).toMatch(/1299/);
    expect(out.steps.map((s) => s.step)).toEqual(['classify', 'lookup_order', 'billing_agent', 'policy_check', 'draft_reply', 'check_draft']);
    expect(out.totalTokens).toBeGreaterThan(0);
  });

  it('escalates a legal threat without drafting a reply', async () => {
    const out = await runTriage(
      { subject: 'Refund', body: 'Refund my ₹1,299 or I will go to consumer court', customer, createdAt: new Date() },
      deps(),
    );
    expect(out.policy.decision).toBe('escalate');
    expect(out.policy.reasons).toContain('legal_threat');
    expect(out.draft).toBeNull();
    expect(out.steps.at(-1)?.step).toBe('policy_check');
  });

  it('skips the specialist for unclassifiable tickets', async () => {
    const out = await runTriage({ subject: 'Hello', body: 'Do you sell gift cards for corporate events?', customer, createdAt: new Date() }, deps());
    expect(out.classification.category).toBe('other');
    expect(out.steps.map((s) => s.step)).not.toContain('billing_agent');
    expect(out.policy.reasons).toContain('unclassified');
  });

  it('code detectors escalate abuse even if the model misses it', async () => {
    // A model that never sets flags: the code detector must still catch the abuse.
    const fake = new FakeProvider();
    const blindModel: LlmProvider = {
      name: 'blind',
      model: 'test',
      async complete(req) {
        const res = await fake.complete(req);
        if (req.task !== 'classify') return res;
        const parsed = JSON.parse(res.text);
        return { ...res, text: JSON.stringify({ ...parsed, flags: { legal: false, abuse: false } }) };
      },
    };
    const out = await runTriage(
      { subject: 'Wrong item', body: 'You idiots sent the wrong shoes for order BZ-10001', customer, createdAt: new Date() },
      deps({ llm: blindModel }),
    );
    expect(out.policy.reasons).toContain('abusive_language');
  });

  it('escalates when the drafted reply breaks policy', async () => {
    // A drafter that over-promises: the code check must catch it.
    const fake = new FakeProvider();
    const greedyDrafter: LlmProvider = {
      name: 'greedy',
      model: 'test',
      async complete(req) {
        if (req.task === 'draft') {
          return { text: JSON.stringify({ reply: 'Hi Aarav, we will refund ₹10,000 to you today as a goodwill gesture.' }), usage: { promptTokens: 1, completionTokens: 1 }, latencyMs: 1 };
        }
        return fake.complete(req);
      },
    };
    const out = await runTriage(
      { subject: 'Charged twice', body: 'I was charged twice, please refund ₹1,299', customer, createdAt: new Date() },
      deps({ llm: greedyDrafter }),
    );
    expect(out.violations).toContain('promises_unapproved_refund_amount');
    expect(out.policy.decision).toBe('escalate');
    expect(out.policy.reasons).toContain('draft_policy_violation');
  });
});

describe('eval metrics', () => {
  const r = (o: Partial<CaseResult>): CaseResult => ({
    caseId: 'x',
    language: 'en',
    expectedCategory: 'billing',
    predictedCategory: 'billing',
    expectedEscalate: false,
    escalated: false,
    reasons: [],
    drafted: true,
    violations: [],
    latencyMs: 100,
    tokens: 1000,
    ...o,
  });

  it('computes routing accuracy, escalation precision/recall and violation rate', () => {
    const m = computeMetrics(
      [
        r({ expectedEscalate: true, escalated: true, drafted: false }), // TP
        r({ expectedEscalate: false, escalated: true, drafted: false }), // FP
        r({ expectedEscalate: true, escalated: false }), // FN
        r({ predictedCategory: 'order', violations: ['promises_unapproved_refund_amount'] }),
      ],
      0.5,
    );
    expect(m.routingAccuracy).toBe(0.75);
    expect(m.escalationPrecision).toBe(0.5);
    expect(m.escalationRecall).toBe(0.5);
    expect(m.policyViolationRate).toBe(0.5);
    expect(m.costPerTicketInr).toBe(0.5);
  });

  it('reports null cost when no price is configured, and null ratios with no data', () => {
    const m = computeMetrics([r({ drafted: false })]);
    expect(m.costPerTicketInr).toBeNull();
    expect(m.escalationPrecision).toBeNull();
    expect(m.policyViolationRate).toBeNull();
  });

  it('nearest-rank percentile', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([], 95)).toBe(0);
  });

  it('runs the full labelled set with the fake provider without errors', async () => {
    const results = await evaluateAll(new FakeProvider(), 'v2', EVAL_CASES);
    expect(results).toHaveLength(EVAL_CASES.length);
    expect(results.filter((x) => x.error)).toEqual([]);
  });
});
