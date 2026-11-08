import { Types } from 'mongoose';
import { AppError, invalidState, notFound } from '../lib/errors.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { Ticket } from '../models/Ticket.js';
import type { AuthUser } from '../middleware/auth.js';

/**
 * Human-in-the-loop actions. Each one checks the ticket's current state, applies the change,
 * and writes an audit event so the trail shows who did what.
 */

async function loadTicket(id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Ticket');
  const ticket = await Ticket.findById(id);
  if (!ticket) throw notFound('Ticket');
  return ticket;
}

/** A human takes ownership. Required for escalated or failed tickets before replying. */
export async function takeOver(id: string, user: AuthUser) {
  const ticket = await loadTicket(id);
  if (ticket.status === 'human_handling') {
    if (ticket.assignee?.toString() === user.id) return ticket;
    throw new AppError(409, 'CONFLICT', `Already being handled by ${ticket.assigneeName ?? 'another agent'}`);
  }
  if (!['awaiting_review', 'escalated', 'failed', 'new'].includes(ticket.status)) {
    throw invalidState(`Cannot take over a ticket that is ${ticket.status}`);
  }
  const previous = ticket.status;
  ticket.set({ status: 'human_handling', assignee: new Types.ObjectId(user.id), assigneeName: user.name });
  await ticket.save();
  await AuditEvent.create({
    ticket: ticket._id,
    step: 'take_over',
    actor: `human:${user.name}`,
    input: { previousStatus: previous },
    decision: 'human_handling',
  });
  return ticket;
}

/**
 * Sends the reply and resolves the ticket.
 * - awaiting_review: any agent can approve the AI draft as-is, or edit it first.
 * - human_handling: only the assignee can send, and must provide the reply text if there is no draft.
 * - escalated: a human must take over first (the guardrails said AI should not handle it).
 */
export async function approveAndSend(id: string, user: AuthUser, editedReply?: string) {
  const ticket = await loadTicket(id);

  if (ticket.status === 'escalated' || ticket.status === 'failed') {
    throw invalidState('This ticket was escalated. Take it over before replying.');
  }
  if (ticket.status === 'human_handling' && ticket.assignee?.toString() !== user.id) {
    throw new AppError(409, 'CONFLICT', `Only ${ticket.assigneeName ?? 'the assigned agent'} can reply to this ticket`);
  }
  if (!['awaiting_review', 'human_handling'].includes(ticket.status)) {
    throw invalidState(`Cannot send a reply on a ticket that is ${ticket.status}`);
  }

  const draft = ticket.triage?.draftReply ?? '';
  const reply = (editedReply ?? draft).trim();
  if (!reply) throw new AppError(400, 'VALIDATION_ERROR', 'Reply text is required');

  const edited = reply !== draft.trim();
  ticket.set({ status: 'resolved', finalReply: reply, resolvedAt: new Date(), resolvedBy: user.name });
  await ticket.save();
  await AuditEvent.create({
    ticket: ticket._id,
    step: edited ? 'edit_and_send' : 'approve_draft',
    actor: `human:${user.name}`,
    input: { draftLength: draft.length },
    output: { replyLength: reply.length, edited },
    decision: 'resolved',
  });
  return ticket;
}

/** Admin only: put a ticket back in the AI queue, e.g. after a failure. */
export async function retriage(id: string, user: AuthUser) {
  const ticket = await loadTicket(id);
  if (ticket.status === 'resolved') throw invalidState('Resolved tickets cannot be re-triaged');
  ticket.set({ status: 'new', attempts: 0, assignee: undefined, assigneeName: undefined, failureReason: undefined });
  await ticket.save();
  await AuditEvent.create({ ticket: ticket._id, step: 'retriage', actor: `human:${user.name}`, decision: 'queued' });
  return ticket;
}
