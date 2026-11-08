import type { Priority } from '../models/Ticket.js';
import type { Tier } from '../models/Customer.js';

/** First-response SLA per priority, in minutes. */
export const SLA_MINUTES: Record<Priority, number> = {
  P1: 60,
  P2: 4 * 60,
  P3: 24 * 60,
};

export interface PriorityInput {
  tier: Tier;
  urgency?: 'low' | 'normal' | 'high';
  legal?: boolean;
  abuse?: boolean;
}

/**
 * Priority is decided in code from facts, not by the LLM:
 * - P1: enterprise customers, legal threats, or tickets the classifier marks as urgent
 * - P2: Plus members, abusive tickets, or normal urgency
 * - P3: low urgency from standard customers
 * Before triage (urgency unknown), only the tier is used.
 */
export function computePriority({ tier, urgency, legal, abuse }: PriorityInput): Priority {
  if (tier === 'enterprise' || legal || urgency === 'high') return 'P1';
  if (tier === 'plus' || abuse || urgency === 'normal') return 'P2';
  return 'P3';
}

export function slaDueAt(createdAt: Date, priority: Priority): Date {
  return new Date(createdAt.getTime() + SLA_MINUTES[priority] * 60_000);
}

export function slaState(dueAt: Date, now: Date = new Date()) {
  const msRemaining = dueAt.getTime() - now.getTime();
  return { msRemaining, breached: msRemaining < 0 };
}
