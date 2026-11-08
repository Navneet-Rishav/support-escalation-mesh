import { Router } from 'express';
import { z } from 'zod';
import { intakeLimiter } from '../middleware/rateLimits.js';
import { parse } from '../middleware/validate.js';
import { createTicket } from '../services/triage.js';

/** Public endpoints where customers submit tickets. No login; rate-limited per IP. */
export const intakeRouter = Router();

const WebTicketSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(120),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10, 'Please describe the problem in at least 10 characters').max(5000),
  orderId: z
    .string()
    .trim()
    .regex(/^BZ-\d{5}$/i, 'Order IDs look like BZ-12345')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

/** Email-style JSON, e.g. from an inbound email webhook: { from: "Name <email>", subject, text }. */
const EmailTicketSchema = z.object({
  from: z.string().trim().min(3).max(200),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(10).max(5000),
});

function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  const email = (m ? m[2] : from).trim();
  const name = (m?.[1].trim() || email.split('@')[0]).slice(0, 80);
  return { name, email };
}

intakeRouter.post('/web', intakeLimiter, async (req, res) => {
  const body = parse(WebTicketSchema, req.body);
  const ticket = await createTicket({ channel: 'web', ...body });
  res.status(202).json({ ref: ticket.ref, status: ticket.status, message: 'Ticket received. Our team will reply by email.' });
});

intakeRouter.post('/email', intakeLimiter, async (req, res) => {
  const body = parse(EmailTicketSchema, req.body);
  const sender = parse(z.object({ name: z.string().min(1), email: z.email() }), parseFrom(body.from));
  const ticket = await createTicket({ channel: 'email', ...sender, subject: body.subject, body: body.text });
  res.status(202).json({ ref: ticket.ref, status: ticket.status });
});
