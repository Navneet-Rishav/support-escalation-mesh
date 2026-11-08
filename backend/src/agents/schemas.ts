import { z } from 'zod';
import { CATEGORIES } from '../models/Ticket.js';
import { ACTIONS } from '../domain/policy.js';

/** What the classifier agent must return. Validated before anything else uses it. */
export const ClassificationSchema = z.object({
  category: z.enum(CATEGORIES),
  confidence: z.coerce.number().min(0).max(1),
  language: z.enum(['en', 'hi', 'hinglish']),
  urgency: z.enum(['low', 'normal', 'high']),
  summary: z.string().min(1).max(300),
  flags: z.object({ legal: z.boolean(), abuse: z.boolean() }),
});
export type Classification = z.infer<typeof ClassificationSchema>;

/** What a specialist agent proposes. The policy checker decides whether it is allowed. */
export const ProposalSchema = z.object({
  action: z.enum(ACTIONS),
  refundAmountInr: z.coerce
    .number()
    .nonnegative()
    .nullish()
    .transform((v) => v ?? null),
  rationale: z.string().min(1).max(600),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const DraftSchema = z.object({
  reply: z.string().min(1).max(2500),
});
export type Draft = z.infer<typeof DraftSchema>;

/** Inputs sent to each agent. The user message is this object serialised as JSON. */
export interface ClassifyInput {
  subject: string;
  body: string;
  customerTier: string;
}

export interface SpecialistInput {
  category: string;
  subject: string;
  body: string;
  customerTier: string;
  order: { orderId: string; amountInr: number; status: string; items: string } | null;
}

export interface DraftInput {
  customerName: string;
  language: string;
  category: string;
  subject: string;
  body: string;
  action: string;
  approvedRefundInr: number | null;
  orderId: string | null;
}
