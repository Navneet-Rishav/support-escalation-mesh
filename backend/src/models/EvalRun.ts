import { Schema, model, type InferSchemaType, Types } from 'mongoose';

const resultSchema = new Schema(
  {
    caseId: String,
    language: String,
    expectedCategory: String,
    predictedCategory: String,
    expectedEscalate: Boolean,
    escalated: Boolean,
    reasons: [String],
    drafted: Boolean,
    violations: [String],
    latencyMs: Number,
    tokens: Number,
    error: String,
  },
  { _id: false },
);

const evalRunSchema = new Schema(
  {
    label: { type: String, required: true },
    promptVersion: { type: String, required: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
    createdBy: { type: Types.ObjectId, ref: 'User' },
    createdByName: String,
    metrics: {
      cases: Number,
      routingAccuracy: Number,
      escalationPrecision: Number,
      escalationRecall: Number,
      policyViolationRate: Number,
      avgLatencyMs: Number,
      p95LatencyMs: Number,
      avgTokensPerTicket: Number,
      costPerTicketInr: { type: Number, default: null },
      errors: Number,
    },
    results: [resultSchema],
    error: String,
    finishedAt: Date,
  },
  { timestamps: true },
);

export type EvalRunDoc = InferSchemaType<typeof evalRunSchema>;
export const EvalRun = model('EvalRun', evalRunSchema);
