import { Schema, model, type InferSchemaType, Types } from 'mongoose';

export const TICKET_STATUSES = [
  'new', // received, waiting for the AI triage worker
  'triaging', // claimed by the worker
  'awaiting_review', // AI drafted a reply; a human must approve or edit it
  'escalated', // guardrails require a human to take over
  'human_handling', // a human agent has taken over
  'resolved',
  'failed', // triage failed after retries; needs a human
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const CATEGORIES = ['billing', 'technical', 'order', 'account', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ['P1', 'P2', 'P3'] as const;
export type Priority = (typeof PRIORITIES)[number];

const triageSchema = new Schema(
  {
    summary: String,
    confidence: Number,
    urgency: { type: String, enum: ['low', 'normal', 'high'] },
    flags: { legal: Boolean, abuse: Boolean },
    proposal: {
      action: String,
      refundAmountInr: { type: Number, default: null },
      rationale: String,
    },
    decision: { type: String, enum: ['review', 'escalate'] },
    reasons: [String],
    approvedRefundInr: { type: Number, default: null },
    draftReply: String,
    draftViolations: [String],
    promptVersion: String,
    provider: String,
    model: String,
    totalLatencyMs: Number,
    totalTokens: Number,
  },
  { _id: false },
);

const ticketSchema = new Schema(
  {
    ref: { type: String, required: true, unique: true },
    channel: { type: String, enum: ['web', 'email'], required: true },
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true, lowercase: true },
      tier: { type: String, enum: ['standard', 'plus', 'enterprise'], default: 'standard' },
    },
    subject: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 5000 },
    orderId: { type: String, uppercase: true },
    status: { type: String, enum: TICKET_STATUSES, default: 'new', index: true },
    priority: { type: String, enum: PRIORITIES, default: 'P3' },
    slaDueAt: { type: Date, required: true },
    category: { type: String, enum: CATEGORIES },
    language: { type: String, enum: ['en', 'hi', 'hinglish'] },
    triage: { type: triageSchema },
    assignee: { type: Types.ObjectId, ref: 'User' },
    assigneeName: String,
    finalReply: String,
    resolvedAt: Date,
    resolvedBy: String,
    claimedAt: Date,
    attempts: { type: Number, default: 0 },
    failureReason: String,
  },
  { timestamps: true },
);

ticketSchema.index({ status: 1, slaDueAt: 1 });

export type TicketDoc = InferSchemaType<typeof ticketSchema>;
export const Ticket = model('Ticket', ticketSchema);
