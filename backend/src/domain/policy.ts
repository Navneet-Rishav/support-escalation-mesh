import type { Category } from '../models/Ticket.js';
import type { Tier } from '../models/Customer.js';
import { promisesRefund, refundAmountsMentioned } from './detectors.js';

/**
 * Guardrails. The LLM agents only *propose* an action; this file decides what is allowed.
 * Every rule is plain code with a named reason, so a decision can always be explained.
 */

export const ACTIONS = ['refund', 'replacement', 'troubleshoot', 'account_recovery', 'information', 'escalate'] as const;
export type Action = (typeof ACTIONS)[number];

/** Orders at or above this amount are always handled by a human. */
export const HIGH_VALUE_ORDER_INR = 25_000;
/** Below this classifier confidence the routing is not trusted. */
export const MIN_CONFIDENCE = 0.6;

export interface OrderContext {
  orderId: string;
  amountInr: number;
  status: string;
  items: string;
}

export interface PolicyInput {
  category: Category;
  confidence: number;
  flags: { legal: boolean; abuse: boolean };
  proposal: { action: Action; refundAmountInr: number | null };
  customerTier: Tier;
  order: OrderContext | null;
  slaDueAt: Date;
  now: Date;
  refundAgentLimitInr: number;
}

export type Decision = 'review' | 'escalate';

export interface PolicyResult {
  decision: Decision;
  /** Reasons that force escalation. Empty when decision is "review". */
  reasons: string[];
  /** Informational notes, e.g. the refund was capped. They do not force escalation. */
  notes: string[];
  /** The refund the drafted reply is allowed to offer (null = no refund may be promised). */
  approvedRefundInr: number | null;
}

export function applyPolicy(input: PolicyInput): PolicyResult {
  const reasons: string[] = [];
  const notes: string[] = [];
  let approvedRefundInr: number | null = null;

  // Mandatory escalations: never handled by AI.
  if (input.flags.legal) reasons.push('legal_threat');
  if (input.flags.abuse) reasons.push('abusive_language');

  // High-value cases go to a human.
  if (input.customerTier === 'enterprise') reasons.push('enterprise_customer');
  if (input.order && input.order.amountInr >= HIGH_VALUE_ORDER_INR) reasons.push('high_value_order');

  // Untrusted routing.
  if (input.category === 'other') reasons.push('unclassified');
  if (input.confidence < MIN_CONFIDENCE) reasons.push('low_confidence');

  // SLA already missed: a human should own it now.
  if (input.now.getTime() > input.slaDueAt.getTime()) reasons.push('sla_breached');

  if (input.proposal.action === 'escalate') reasons.push('agent_requested_escalation');

  // Refund limits.
  if (input.proposal.action === 'refund') {
    const proposed = input.proposal.refundAmountInr;
    if (!input.order) {
      reasons.push('refund_without_verified_order');
    } else if (proposed === null || proposed <= 0) {
      reasons.push('refund_amount_missing');
    } else {
      let amount = proposed;
      if (amount > input.order.amountInr) {
        amount = input.order.amountInr;
        notes.push('refund_capped_to_order_amount');
      }
      if (amount > input.refundAgentLimitInr) {
        reasons.push('refund_over_agent_limit');
      } else {
        approvedRefundInr = amount;
      }
    }
  }

  return {
    decision: reasons.length > 0 ? 'escalate' : 'review',
    reasons,
    notes,
    approvedRefundInr: reasons.length > 0 ? null : approvedRefundInr,
  };
}

/**
 * Checks a drafted reply against what the policy approved. Any violation sends the ticket to a human,
 * and the violation rate is one of the eval metrics.
 */
export function checkDraft(draft: string, approvedRefundInr: number | null): string[] {
  const violations: string[] = [];
  if (draft.trim().length < 20) violations.push('draft_too_short');

  const allowed = approvedRefundInr ?? 0;
  if (refundAmountsMentioned(draft).some((amount) => amount > allowed)) {
    violations.push('promises_unapproved_refund_amount');
  }
  if (approvedRefundInr === null && promisesRefund(draft)) {
    violations.push('promises_refund_without_approval');
  }
  return violations;
}
