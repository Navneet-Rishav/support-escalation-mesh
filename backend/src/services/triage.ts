import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { getLlmProvider } from '../llm/index.js';
import { runTriage, type AuditStep, type TriageDeps } from '../agents/graph.js';
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

/** Order lookup used by the graph: by order ID if the customer gave one, otherwise their latest order. */
export async function lookupOrderInDb(orderId: string | null | undefined, email: string): Promise<OrderContext | null> {
  const order = orderId
    ? await Order.findOne({ orderId: orderId.toUpperCase(), customerEmail: email.toLowerCase() }).lean()
    : await Order.findOne({ customerEmail: email.toLowerCase() }).sort({ placedAt: -1 }).lean();
  if (!order) return null;
  return { orderId: order.orderId, amountInr: order.amountInr, status: order.status, items: order.items };
}

export function defaultDeps(): TriageDeps {
  return {
    llm: getLlmProvider(),
    promptVersion: CURRENT_PROMPT_VERSION,
    lookupOrder: lookupOrderInDb,
    refundAgentLimitInr: config.REFUND_AGENT_LIMIT_INR,
  };
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
export async function triageTicket(ticketId: Types.ObjectId, deps: TriageDeps = defaultDeps()): Promise<void> {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket || ticket.status !== 'triaging') return;

  try {
    const outcome = await runTriage(
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
      orderId: outcome.order?.orderId ?? ticket.orderId,
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
        provider: deps.llm.name,
        model: deps.llm.model,
        totalLatencyMs: outcome.totalLatencyMs,
        totalTokens: outcome.totalTokens,
      },
    });
    await ticket.save();
    logger.info({ ref: ticket.ref, status: ticket.status, category: ticket.category }, 'ticket triaged');
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
export async function processNextTicket(deps?: TriageDeps): Promise<boolean> {
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
