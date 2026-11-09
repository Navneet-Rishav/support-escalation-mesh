import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { getLlmProvider } from '../llm/index.js';
import { FakeProvider } from '../llm/fake.js';
import { LlmError, type LlmProvider } from '../llm/types.js';
import { runTriage, type AuditStep, type TriageDeps, type TriageInput, type TriageOutcome } from '../agents/graph.js';
import type { PromptVersion } from '../agents/prompts.js';
import { extractOrderId } from '../domain/detectors.js';
import type { OrderContext } from '../domain/policy.js';
import { computePriority, slaDueAt } from '../domain/sla.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { Customer, type Tier } from '../models/Customer.js';
import { Order } from '../models/Order.js';
import { Ticket } from '../models/Ticket.js';
import type { Types } from 'mongoose';

export const MAX_TRIAGE_ATTEMPTS = 3;
/** A ticket stuck in "triaging" longer than this (e.g. the server restarted mid-run) is put back in the queue. */
export const STALE_TRIAGE_MS = 2 * 60_000;
export const CURRENT_PROMPT_VERSION: PromptVersion = 'v2';

export interface NewTicketInput {
  channel: 'web' | 'email';
  name: string;
  email: string;
  subject: string;
  body: string;
  orderId?: string;
}

function newRef(): string {
  return `TKT-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Stores a new ticket with status "new". The background worker picks it up for AI triage. */
export async function createTicket(input: NewTicketInput) {
  const email = input.email.toLowerCase();
  const customer = await Customer.findOne({ email }).lean();
  const tier: Tier = (customer?.tier as Tier | undefined) ?? 'standard';
  const createdAt = new Date();
  const priority = computePriority({ tier });

  const ticket = await Ticket.create({
    ref: newRef(),
    channel: input.channel,
    customer: { name: input.name, email, tier },
    subject: input.subject,
    body: input.body,
    orderId: input.orderId ?? extractOrderId(`${input.subject} ${input.body}`),
    status: 'new',
    priority,
    slaDueAt: slaDueAt(createdAt, priority),
  });

  await AuditEvent.create({
    ticket: ticket._id,
    step: 'received',
    actor: `customer:${input.channel}`,
    input: { subject: input.subject },
    output: { ref: ticket.ref, tier, priority },
    decision: 'queued',
  });
  return ticket;
}

/**
 * Order lookup used by the graph. Only an order ID the customer actually gave is used, and it must belong
 * to the same email. We never guess "their latest order": a refund approved against a guessed order is unsafe.
 */
export async function lookupOrderInDb(orderId: string | null | undefined, email: string): Promise<OrderContext | null> {
  if (!orderId) return null;
  const order = await Order.findOne({ orderId: orderId.toUpperCase(), customerEmail: email.toLowerCase() }).lean();
  if (!order) return null;
  return { orderId: order.orderId, amountInr: order.amountInr, status: order.status, items: order.items };
}

export interface TriageServiceDeps extends TriageDeps {
  /**
   * Used when the main LLM is unavailable. Defaults to the keyword baseline. Pass null to disable
   * the fallback (the ticket then goes through the normal retry -> failed path).
   */
  fallbackLlm?: LlmProvider | null;
}

export function defaultDeps(): TriageServiceDeps {
  return {
    llm: getLlmProvider(),
    promptVersion: CURRENT_PROMPT_VERSION,
    lookupOrder: lookupOrderInDb,
    refundAgentLimitInr: config.REFUND_AGENT_LIMIT_INR,
  };
}

/**
 * True when the LLM provider is unavailable rather than misbehaving: out of credits (402), or a timeout,
 * network error, 429 or 5xx that the client already retried. A non-retryable 4xx (bad request, bad key)
 * is a bug or a config problem, so it is NOT hidden behind the fallback.
 */
export function isProviderUnavailable(err: unknown): err is LlmError {
  return err instanceof LlmError && (err.retryable || err.status === 402);
}

/**
 * Runs the graph with the configured LLM. If the provider is unavailable, runs the same graph again with
 * the keyword baseline, so the ticket still gets a category and a draft and, above all, passes the same
 * code-enforced policy and draft checks. The result is marked rule-based so agents know no AI was involved.
 */
async function runWithFallback(
  input: TriageInput,
  deps: TriageServiceDeps,
): Promise<{ outcome: TriageOutcome; used: LlmProvider; fallbackReason?: string }> {
  try {
    return { outcome: await runTriage(input, deps), used: deps.llm };
  } catch (err) {
    const fallback = deps.fallbackLlm === undefined ? new FakeProvider() : deps.fallbackLlm;
    if (!fallback || fallback.name === deps.llm.name || !isProviderUnavailable(err)) throw err;
    const outcome = await runTriage(input, { ...deps, llm: fallback });
    // No AI ran, so the "AI" steps are relabelled as the keyword code they really were.
    outcome.steps = outcome.steps.map((s) => (s.actor.startsWith('ai:') ? { ...s, actor: s.actor.replace(/^ai:/, 'code:keyword_') } : s));
    outcome.steps.unshift({
      step: 'ai_unavailable',
      actor: 'system',
      input: { provider: deps.llm.name, model: deps.llm.model },
      output: { error: err.message, status: err.status ?? null, fallback: `${fallback.name}/${fallback.model}` },
      decision: 'rule_based_fallback',
      latencyMs: 0,
      tokens: { prompt: 0, completion: 0 },
    });
    return { outcome, used: fallback, fallbackReason: err.message };
  }
}

/**
 * Atomically claims the oldest "new" ticket. findOneAndUpdate is a single atomic operation in MongoDB,
 * so two workers can never claim the same ticket.
 */
export async function claimNextTicket() {
  return Ticket.findOneAndUpdate(
    { status: 'new' },
    { $set: { status: 'triaging', claimedAt: new Date() }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
}

async function saveSteps(ticketId: Types.ObjectId, steps: AuditStep[]) {
  if (steps.length === 0) return;
  await AuditEvent.insertMany(steps.map((s) => ({ ...s, ticket: ticketId })));
}

/** Runs the agent graph on one claimed ticket and stores the outcome and audit trail. */
export async function triageTicket(ticketId: Types.ObjectId, deps: TriageServiceDeps = defaultDeps()): Promise<void> {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket || ticket.status !== 'triaging') return;

  try {
    const { outcome, used, fallbackReason } = await runWithFallback(
      {
        subject: ticket.subject,
        body: ticket.body,
        customer: { name: ticket.customer!.name, email: ticket.customer!.email, tier: ticket.customer!.tier as Tier },
        orderId: ticket.orderId,
        createdAt: ticket.createdAt,
      },
      deps,
    );
    await saveSteps(ticket._id, outcome.steps);

    const escalated = outcome.policy.decision === 'escalate';
    ticket.set({
      status: escalated ? 'escalated' : 'awaiting_review',
      category: outcome.classification.category,
      language: outcome.classification.language,
      priority: outcome.priority,
      slaDueAt: outcome.slaDueAt,
      failureReason: undefined,
      triage: {
        summary: outcome.classification.summary,
        confidence: outcome.classification.confidence,
        urgency: outcome.classification.urgency,
        flags: outcome.classification.flags,
        proposal: outcome.proposal,
        decision: outcome.policy.decision,
        reasons: [...outcome.policy.reasons, ...outcome.policy.notes],
        approvedRefundInr: outcome.policy.approvedRefundInr,
        draftReply: outcome.draft ?? undefined,
        draftViolations: outcome.violations,
        promptVersion: deps.promptVersion,
        provider: used.name,
        model: used.model,
        mode: fallbackReason ? 'rule_based' : 'ai',
        fallbackReason,
        totalLatencyMs: outcome.totalLatencyMs,
        totalTokens: outcome.totalTokens,
      },
    });
    await ticket.save();
    if (fallbackReason) logger.warn({ ref: ticket.ref, err: fallbackReason }, 'AI unavailable; used rule-based triage');
    logger.info({ ref: ticket.ref, status: ticket.status, category: ticket.category, mode: fallbackReason ? 'rule_based' : 'ai' }, 'ticket triaged');
  } catch (err) {
    const message = (err as Error).message;
    const giveUp = ticket.attempts >= MAX_TRIAGE_ATTEMPTS;
    ticket.set({ status: giveUp ? 'failed' : 'new', failureReason: message });
    await ticket.save();
    await AuditEvent.create({
      ticket: ticket._id,
      step: 'triage_error',
      actor: 'system',
      output: { error: message, attempt: ticket.attempts },
      decision: giveUp ? 'failed' : 'retry',
    });
    logger.warn({ ref: ticket.ref, err: message, attempt: ticket.attempts }, 'triage failed');
  }
}

/** Claims and triages one ticket. Returns false when the queue is empty. */
export async function processNextTicket(deps?: TriageServiceDeps): Promise<boolean> {
  const ticket = await claimNextTicket();
  if (!ticket) return false;
  await triageTicket(ticket._id, deps);
  return true;
}

export async function requeueStaleTickets(now = new Date()): Promise<number> {
  const res = await Ticket.updateMany(
    { status: 'triaging', claimedAt: { $lt: new Date(now.getTime() - STALE_TRIAGE_MS) } },
    { $set: { status: 'new' } },
  );
  return res.modifiedCount;
}

/**
 * In-process background worker. It polls for new tickets and drains the queue.
 * The queue lives in MongoDB, so work survives a restart (e.g. Render free tier spinning down).
 */
export function startWorker(pollMs = config.WORKER_POLL_MS): () => void {
  let running = false;
  let stopped = false;

  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await requeueStaleTickets();
      while (!stopped && (await processNextTicket())) {
        /* keep draining */
      }
    } catch (err) {
      logger.error({ err }, 'worker tick failed');
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, pollMs);
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
