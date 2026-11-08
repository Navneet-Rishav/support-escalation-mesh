import { Schema, model, type InferSchemaType, Types } from 'mongoose';

/**
 * One row per step that touched a ticket: each AI agent, the code policy checker, and every human action.
 * This is the "reasoning trail" the agent console shows.
 */
const auditEventSchema = new Schema({
  ticket: { type: Types.ObjectId, ref: 'Ticket', required: true, index: true },
  step: { type: String, required: true }, // e.g. classify, billing_agent, policy_check, draft_reply, approve
  actor: { type: String, required: true }, // e.g. ai:classifier, code:policy, human:Asha
  input: { type: Schema.Types.Mixed },
  output: { type: Schema.Types.Mixed },
  decision: { type: String },
  latencyMs: { type: Number, default: 0 },
  tokens: { prompt: { type: Number, default: 0 }, completion: { type: Number, default: 0 } },
  at: { type: Date, default: () => new Date() },
});

export type AuditEventDoc = InferSchemaType<typeof auditEventSchema>;
export const AuditEvent = model('AuditEvent', auditEventSchema);
