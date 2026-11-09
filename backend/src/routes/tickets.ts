import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { CATEGORIES, TICKET_STATUSES, Ticket } from '../models/Ticket.js';
import { approveAndSend, retriage, takeOver } from '../services/tickets.js';

/** The agent console API. Every route requires a signed-in agent or admin. */
export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

const ListQuery = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  view: z.enum(['open', 'mine', 'all']).default('open'),
  category: z.enum(CATEGORIES).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const OPEN = ['new', 'triaging', 'awaiting_review', 'escalated', 'human_handling', 'failed'];

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

ticketsRouter.get('/', async (req, res) => {
  const q = parse(ListQuery, req.query);
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  else if (q.view === 'open') filter.status = { $in: OPEN };
  if (q.view === 'mine') filter.assignee = new Types.ObjectId(req.user!.id);
  if (q.category) filter.category = q.category;
  if (q.q) {
    const re = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ ref: re }, { subject: re }, { 'customer.email': re }, { 'customer.name': re }];
  }

  // Open work is sorted by SLA deadline (most urgent first); history by most recent.
  const sort: Record<string, 1 | -1> = q.view === 'open' && !q.status ? { slaDueAt: 1 } : { updatedAt: -1 };
  const [items, total, counts] = await Promise.all([
    Ticket.find(filter)
      .sort(sort)
      .skip(q.offset)
      .limit(q.limit)
      .select('ref channel customer subject status priority slaDueAt category language assigneeName createdAt updatedAt triage.decision triage.reasons triage.mode')
      .lean(),
    Ticket.countDocuments(filter),
    Ticket.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);

  res.json({
    items,
    total,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    now: new Date().toISOString(),
  });
});

ticketsRouter.get('/:id', async (req, res) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw notFound('Ticket');
  const ticket = await Ticket.findById(req.params.id).lean();
  if (!ticket) throw notFound('Ticket');
  const audit = await AuditEvent.find({ ticket: ticket._id }).sort({ at: 1, _id: 1 }).lean();
  res.json({ ticket, audit, now: new Date().toISOString() });
});

ticketsRouter.post('/:id/take-over', async (req, res) => {
  res.json({ ticket: await takeOver(String(req.params.id), req.user!) });
});

const ApproveBody = z.object({ reply: z.string().trim().min(1).max(5000).optional() });

ticketsRouter.post('/:id/approve', async (req, res) => {
  const body = parse(ApproveBody, req.body ?? {});
  res.json({ ticket: await approveAndSend(String(req.params.id), req.user!, body.reply) });
});

ticketsRouter.post('/:id/retriage', requireRole('admin'), async (req, res) => {
  res.json({ ticket: await retriage(String(req.params.id), req.user!) });
});
