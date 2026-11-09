export type Role = 'agent' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** 'rule_based' = the AI provider was unavailable and the keyword baseline triaged the ticket. */
export type TriageMode = 'ai' | 'rule_based';

export type TicketStatus = 'new' | 'triaging' | 'awaiting_review' | 'escalated' | 'human_handling' | 'resolved' | 'failed';
export type Category = 'billing' | 'technical' | 'order' | 'account' | 'other';
export type Priority = 'P1' | 'P2' | 'P3';

export interface TicketSummary {
  _id: string;
  ref: string;
  channel: 'web' | 'email';
  customer: { name: string; email: string; tier: 'standard' | 'plus' | 'enterprise' };
  subject: string;
  status: TicketStatus;
  priority: Priority;
  slaDueAt: string;
  category?: Category;
  language?: 'en' | 'hi' | 'hinglish';
  assigneeName?: string;
  createdAt: string;
  updatedAt: string;
  triage?: { decision?: 'review' | 'escalate'; reasons?: string[]; mode?: TriageMode };
}

export interface Ticket extends TicketSummary {
  body: string;
  orderId?: string;
  assignee?: string;
  finalReply?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  failureReason?: string;
  triage?: {
    summary?: string;
    confidence?: number;
    urgency?: 'low' | 'normal' | 'high';
    flags?: { legal: boolean; abuse: boolean };
    proposal?: { action: string; refundAmountInr: number | null; rationale: string };
    decision?: 'review' | 'escalate';
    reasons?: string[];
    approvedRefundInr?: number | null;
    draftReply?: string;
    draftViolations?: string[];
    promptVersion?: string;
    provider?: string;
    model?: string;
    mode?: TriageMode;
    fallbackReason?: string;
    totalLatencyMs?: number;
    totalTokens?: number;
  };
}

export interface AuditEvent {
  _id: string;
  step: string;
  actor: string;
  input?: unknown;
  output?: unknown;
  decision?: string;
  latencyMs: number;
  tokens: { prompt: number; completion: number };
  at: string;
}

export interface TicketList {
  items: TicketSummary[];
  total: number;
  counts: Partial<Record<TicketStatus, number>>;
  now: string;
}

export interface EvalMetrics {
  cases: number;
  routingAccuracy: number;
  escalationPrecision: number | null;
  escalationRecall: number | null;
  policyViolationRate: number | null;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgTokensPerTicket: number;
  costPerTicketInr: number | null;
  errors: number;
}

export interface EvalCaseResult {
  caseId: string;
  language: string;
  expectedCategory: string;
  predictedCategory: string | null;
  expectedEscalate: boolean;
  escalated: boolean;
  reasons: string[];
  drafted: boolean;
  violations: string[];
  latencyMs: number;
  tokens: number;
  error?: string;
}

export interface EvalRun {
  _id: string;
  label: string;
  promptVersion: string;
  provider: string;
  model: string;
  status: 'running' | 'completed' | 'failed';
  createdByName?: string;
  metrics?: EvalMetrics;
  results?: EvalCaseResult[];
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

export interface Meta {
  provider: string;
  model: string;
  promptVersion: string;
  promptVersions: string[];
  refundAgentLimitInr: number;
}
