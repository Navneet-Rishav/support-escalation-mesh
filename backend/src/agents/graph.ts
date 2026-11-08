import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { completeJson } from '../llm/json.js';
import type { LlmProvider } from '../llm/types.js';
import { detectAbuse, detectLegal } from '../domain/detectors.js';
import { applyPolicy, checkDraft, type OrderContext, type PolicyResult } from '../domain/policy.js';
import { computePriority, slaDueAt } from '../domain/sla.js';
import type { Category, Priority } from '../models/Ticket.js';
import type { Tier } from '../models/Customer.js';
import {
  ClassificationSchema,
  DraftSchema,
  ProposalSchema,
  type Classification,
  type ClassifyInput,
  type DraftInput,
  type Proposal,
  type SpecialistInput,
} from './schemas.js';
import { classifierPrompt, draftPrompt, specialistPrompt, type PromptVersion } from './prompts.js';

/**
 * The triage pipeline as a LangGraph state machine:
 *
 *   classify -> lookup_order -> {billing|order|technical|account}_agent -> policy_check -> draft_reply -> check_draft
 *                                       (category "other" skips the specialist)   \-> END when escalated
 *
 * LLM nodes: classify, the four specialists, draft_reply. Code nodes: lookup_order, policy_check, check_draft.
 * Every node appends an AuditStep, which becomes the reasoning trail in the agent console.
 */

export interface TriageInput {
  subject: string;
  body: string;
  customer: { name: string; email: string; tier: Tier };
  orderId?: string | null;
  createdAt: Date;
}

export interface AuditStep {
  step: string;
  actor: string;
  input: unknown;
  output: unknown;
  decision?: string;
  latencyMs: number;
  tokens: { prompt: number; completion: number };
}

export interface TriageDeps {
  llm: LlmProvider;
  promptVersion: PromptVersion;
  lookupOrder: (orderId: string | null | undefined, email: string) => Promise<OrderContext | null>;
  refundAgentLimitInr: number;
  now?: () => Date;
}

const TriageState = Annotation.Root({
  input: Annotation<TriageInput>,
  classification: Annotation<Classification | undefined>,
  order: Annotation<OrderContext | null | undefined>,
  proposal: Annotation<Proposal | undefined>,
  priority: Annotation<Priority | undefined>,
  slaDueAt: Annotation<Date | undefined>,
  policy: Annotation<PolicyResult | undefined>,
  draft: Annotation<string | null | undefined>,
  violations: Annotation<string[] | undefined>,
  steps: Annotation<AuditStep[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

type State = typeof TriageState.State;

const SPECIALIST_NODES = {
  billing: 'billing_agent',
  order: 'order_agent',
  technical: 'technical_agent',
  account: 'account_agent',
} as const;

export function buildTriageGraph(deps: TriageDeps) {
  const now = deps.now ?? (() => new Date());

  async function classify(state: State): Promise<Partial<State>> {
    const input: ClassifyInput = {
      subject: state.input.subject,
      body: state.input.body,
      customerTier: state.input.customer.tier,
    };
    const res = await completeJson(
      deps.llm,
      {
        task: 'classify',
        json: true,
        temperature: 0,
        messages: [
          { role: 'system', content: classifierPrompt(deps.promptVersion) },
          { role: 'user', content: JSON.stringify(input) },
        ],
      },
      ClassificationSchema,
    );
    // Code-level detectors are OR-ed with the model's flags: a mandatory escalation never depends on the LLM alone.
    const text = `${input.subject}\n${input.body}`;
    const classification: Classification = {
      ...res.data,
      flags: {
        legal: res.data.flags.legal || detectLegal(text),
        abuse: res.data.flags.abuse || detectAbuse(text),
      },
    };
    const priority = computePriority({
      tier: state.input.customer.tier,
      urgency: classification.urgency,
      ...classification.flags,
    });
    const due = slaDueAt(state.input.createdAt, priority);
    return {
      classification,
      priority,
      slaDueAt: due,
      steps: [
        {
          step: 'classify',
          actor: `ai:classifier`,
          input,
          output: { ...classification, priority, slaDueAt: due.toISOString(), attempts: res.attempts },
          decision: classification.category,
          latencyMs: res.latencyMs,
          tokens: { prompt: res.usage.promptTokens, completion: res.usage.completionTokens },
        },
      ],
    };
  }

  async function lookupOrder(state: State): Promise<Partial<State>> {
    const started = Date.now();
    const order = await deps.lookupOrder(state.input.orderId, state.input.customer.email);
    return {
      order,
      steps: [
        {
          step: 'lookup_order',
          actor: 'code:order_lookup',
          input: { orderId: state.input.orderId ?? null, email: state.input.customer.email },
          output: order,
          decision: order ? 'found' : 'not_found',
          latencyMs: Date.now() - started,
          tokens: { prompt: 0, completion: 0 },
        },
      ],
    };
  }

  function makeSpecialist(category: Exclude<Category, 'other'>) {
    return async (state: State): Promise<Partial<State>> => {
      const input: SpecialistInput = {
        category,
        subject: state.input.subject,
        body: state.input.body,
        customerTier: state.input.customer.tier,
        order: state.order ?? null,
      };
      const res = await completeJson(
        deps.llm,
        {
          task: 'specialist',
          json: true,
          temperature: 0.1,
          messages: [
            { role: 'system', content: specialistPrompt(category, deps.promptVersion) },
            { role: 'user', content: JSON.stringify(input) },
          ],
        },
        ProposalSchema,
      );
      return {
        proposal: res.data,
        steps: [
          {
            step: SPECIALIST_NODES[category],
            actor: `ai:${category}_specialist`,
            input,
            output: res.data,
            decision: res.data.action,
            latencyMs: res.latencyMs,
            tokens: { prompt: res.usage.promptTokens, completion: res.usage.completionTokens },
          },
        ],
      };
    };
  }

  async function policyCheck(state: State): Promise<Partial<State>> {
    const started = Date.now();
    const c = state.classification!;
    const proposal: Proposal = state.proposal ?? { action: 'escalate', refundAmountInr: null, rationale: 'No specialist for this category.' };
    const result = applyPolicy({
      category: c.category,
      confidence: c.confidence,
      flags: c.flags,
      proposal,
      customerTier: state.input.customer.tier,
      order: state.order ?? null,
      slaDueAt: state.slaDueAt!,
      now: now(),
      refundAgentLimitInr: deps.refundAgentLimitInr,
    });
    return {
      proposal,
      policy: result,
      steps: [
        {
          step: 'policy_check',
          actor: 'code:policy',
          input: { proposal, category: c.category, confidence: c.confidence, flags: c.flags, tier: state.input.customer.tier },
          output: result,
          decision: result.decision,
          latencyMs: Date.now() - started,
          tokens: { prompt: 0, completion: 0 },
        },
      ],
    };
  }

  async function draftReply(state: State): Promise<Partial<State>> {
    const input: DraftInput = {
      customerName: state.input.customer.name,
      language: state.classification!.language,
      category: state.classification!.category,
      subject: state.input.subject,
      body: state.input.body,
      action: state.proposal!.action,
      approvedRefundInr: state.policy!.approvedRefundInr,
      orderId: state.order?.orderId ?? null,
    };
    const res = await completeJson(
      deps.llm,
      {
        task: 'draft',
        json: true,
        temperature: 0.3,
        messages: [
          { role: 'system', content: draftPrompt(deps.promptVersion) },
          { role: 'user', content: JSON.stringify(input) },
        ],
      },
      DraftSchema,
    );
    return {
      draft: res.data.reply,
      steps: [
        {
          step: 'draft_reply',
          actor: 'ai:reply_drafter',
          input,
          output: res.data,
          latencyMs: res.latencyMs,
          tokens: { prompt: res.usage.promptTokens, completion: res.usage.completionTokens },
        },
      ],
    };
  }

  async function checkDraftNode(state: State): Promise<Partial<State>> {
    const started = Date.now();
    const violations = checkDraft(state.draft ?? '', state.policy!.approvedRefundInr);
    const policy: PolicyResult =
      violations.length > 0
        ? { ...state.policy!, decision: 'escalate', reasons: [...state.policy!.reasons, 'draft_policy_violation'], approvedRefundInr: null }
        : state.policy!;
    return {
      violations,
      policy,
      steps: [
        {
          step: 'check_draft',
          actor: 'code:draft_checker',
          input: { approvedRefundInr: state.policy!.approvedRefundInr },
          output: { violations },
          decision: violations.length > 0 ? 'escalate' : 'ok',
          latencyMs: Date.now() - started,
          tokens: { prompt: 0, completion: 0 },
        },
      ],
    };
  }

  return new StateGraph(TriageState)
    .addNode('classify', classify)
    .addNode('lookup_order', lookupOrder)
    .addNode('billing_agent', makeSpecialist('billing'))
    .addNode('order_agent', makeSpecialist('order'))
    .addNode('technical_agent', makeSpecialist('technical'))
    .addNode('account_agent', makeSpecialist('account'))
    .addNode('policy_check', policyCheck)
    .addNode('draft_reply', draftReply)
    .addNode('check_draft', checkDraftNode)
    .addEdge(START, 'classify')
    .addEdge('classify', 'lookup_order')
    .addConditionalEdges(
      'lookup_order',
      (s: State) => {
        const cat = s.classification!.category;
        return cat === 'other' ? 'policy_check' : SPECIALIST_NODES[cat];
      },
      ['billing_agent', 'order_agent', 'technical_agent', 'account_agent', 'policy_check'],
    )
    .addEdge('billing_agent', 'policy_check')
    .addEdge('order_agent', 'policy_check')
    .addEdge('technical_agent', 'policy_check')
    .addEdge('account_agent', 'policy_check')
    // Escalated tickets go straight to a human; no AI reply is drafted for them.
    .addConditionalEdges('policy_check', (s: State) => (s.policy!.decision === 'escalate' ? END : 'draft_reply'), ['draft_reply', END])
    .addEdge('draft_reply', 'check_draft')
    .addEdge('check_draft', END)
    .compile();
}

export interface TriageOutcome {
  classification: Classification;
  order: OrderContext | null;
  proposal: Proposal;
  priority: Priority;
  slaDueAt: Date;
  policy: PolicyResult;
  draft: string | null;
  violations: string[];
  steps: AuditStep[];
  totalLatencyMs: number;
  totalTokens: number;
}

export async function runTriage(input: TriageInput, deps: TriageDeps): Promise<TriageOutcome> {
  const graph = buildTriageGraph(deps);
  const started = Date.now();
  const s = await graph.invoke({ input });
  // Wall-clock time for the whole graph, including code steps and graph overhead.
  const totalLatencyMs = Date.now() - started;
  const totalTokens = s.steps.reduce((n, st) => n + st.tokens.prompt + st.tokens.completion, 0);
  return {
    classification: s.classification!,
    order: s.order ?? null,
    proposal: s.proposal!,
    priority: s.priority!,
    slaDueAt: s.slaDueAt!,
    policy: s.policy!,
    draft: s.draft ?? null,
    violations: s.violations ?? [],
    steps: s.steps,
    totalLatencyMs,
    totalTokens,
  };
}
