import type { TicketStatus } from './types';

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'Queued for AI',
  triaging: 'AI triaging',
  awaiting_review: 'Needs approval',
  escalated: 'Escalated',
  human_handling: 'Human handling',
  resolved: 'Resolved',
  failed: 'Triage failed',
};

/** Plain-English text for the guardrail reason codes produced by the backend policy checker. */
export const REASON_LABEL: Record<string, string> = {
  legal_threat: 'Legal threat: mandatory human handling',
  abusive_language: 'Abusive language: mandatory human handling',
  enterprise_customer: 'Enterprise customer: high-value account',
  high_value_order: 'Order value at or above ₹25,000',
  unclassified: 'Could not be classified',
  low_confidence: 'Classifier confidence below 0.6',
  sla_breached: 'SLA already breached',
  agent_requested_escalation: 'Specialist agent asked for a human',
  refund_without_verified_order: 'Refund requested without a verified order',
  refund_amount_missing: 'Refund proposed without an amount',
  refund_over_agent_limit: 'Refund above the agent approval limit',
  refund_capped_to_order_amount: 'Refund capped at the order amount',
  draft_policy_violation: 'AI draft broke policy and was blocked',
  promises_unapproved_refund_amount: 'Draft promised more money than approved',
  promises_refund_without_approval: 'Draft promised a refund that was not approved',
  draft_too_short: 'Draft was empty or too short',
  triage_error: 'Triage failed with an error',
};

export const RULE_BASED_LABEL = 'Rule-based triage (AI unavailable)';

export const reasonLabel = (code: string) => REASON_LABEL[code] ?? code.replace(/_/g, ' ');

export function formatInr(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}

export function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

/** "in 3h 20m", "in 45m", "12m overdue", "2d 4h overdue". */
export function formatSla(dueAt: string | Date, now: Date = new Date()): { text: string; breached: boolean; soon: boolean } {
  const ms = new Date(dueAt).getTime() - now.getTime();
  const breached = ms < 0;
  const mins = Math.floor(Math.abs(ms) / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const span = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return { text: breached ? `${span} overdue` : `due in ${span}`, breached, soon: !breached && ms < 30 * 60_000 };
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** "ai:billing_specialist" -> { kind: "ai", name: "billing specialist" } */
export function parseActor(actor: string): { kind: 'ai' | 'code' | 'human' | 'customer' | 'system'; name: string } {
  const [kind, ...rest] = actor.split(':');
  const name = rest.join(':').replace(/_/g, ' ') || kind;
  const k = (['ai', 'code', 'human', 'customer'].includes(kind) ? kind : 'system') as 'ai' | 'code' | 'human' | 'customer' | 'system';
  return { kind: k, name };
}
