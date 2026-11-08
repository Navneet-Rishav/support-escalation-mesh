import { describe, expect, it } from 'vitest';
import { applyPolicy, checkDraft, type PolicyInput } from '../src/domain/policy.js';
import { computePriority, slaDueAt, slaState } from '../src/domain/sla.js';
import { detectAbuse, detectLegal, extractAmountsInr, extractOrderId, refundAmountsMentioned } from '../src/domain/detectors.js';

const now = new Date('2026-11-09T10:00:00Z');
const base: PolicyInput = {
  category: 'billing',
  confidence: 0.9,
  flags: { legal: false, abuse: false },
  proposal: { action: 'refund', refundAmountInr: 1299 },
  customerTier: 'standard',
  order: { orderId: 'BZ-10001', amountInr: 1299, status: 'delivered', items: 'Speaker' },
  slaDueAt: new Date(now.getTime() + 3_600_000),
  now,
  refundAgentLimitInr: 2000,
};

describe('applyPolicy guardrails', () => {
  it('approves a small refund on a verified order for human review', () => {
    const r = applyPolicy(base);
    expect(r).toMatchObject({ decision: 'review', reasons: [], approvedRefundInr: 1299 });
  });

  it('escalates refunds above the agent limit', () => {
    const r = applyPolicy({ ...base, proposal: { action: 'refund', refundAmountInr: 4500 }, order: { ...base.order!, amountInr: 4500 } });
    expect(r.decision).toBe('escalate');
    expect(r.reasons).toContain('refund_over_agent_limit');
    expect(r.approvedRefundInr).toBeNull();
  });

  it('caps a refund at the order amount and notes it', () => {
    const r = applyPolicy({ ...base, proposal: { action: 'refund', refundAmountInr: 3000 }, order: { ...base.order!, amountInr: 1800 } });
    expect(r.decision).toBe('review');
    expect(r.approvedRefundInr).toBe(1800);
    expect(r.notes).toContain('refund_capped_to_order_amount');
  });

  it('escalates refunds without a verified order or amount', () => {
    expect(applyPolicy({ ...base, order: null }).reasons).toContain('refund_without_verified_order');
    expect(applyPolicy({ ...base, proposal: { action: 'refund', refundAmountInr: null } }).reasons).toContain('refund_amount_missing');
  });

  it.each([
    ['legal_threat', { flags: { legal: true, abuse: false } }],
    ['abusive_language', { flags: { legal: false, abuse: true } }],
    ['enterprise_customer', { customerTier: 'enterprise' as const }],
    ['high_value_order', { order: { ...base.order!, amountInr: 25_000 } }],
    ['unclassified', { category: 'other' as const }],
    ['low_confidence', { confidence: 0.4 }],
    ['sla_breached', { slaDueAt: new Date(now.getTime() - 1) }],
    ['agent_requested_escalation', { proposal: { action: 'escalate' as const, refundAmountInr: null } }],
  ])('always escalates for %s', (reason, override) => {
    const r = applyPolicy({ ...base, ...override });
    expect(r.decision).toBe('escalate');
    expect(r.reasons).toContain(reason);
    expect(r.approvedRefundInr).toBeNull();
  });

  it('non-refund actions never approve money', () => {
    const r = applyPolicy({ ...base, category: 'technical', proposal: { action: 'troubleshoot', refundAmountInr: 500 } });
    expect(r).toMatchObject({ decision: 'review', approvedRefundInr: null });
  });
});

describe('checkDraft', () => {
  it('accepts a reply that offers exactly the approved refund', () => {
    expect(checkDraft('Hi Aarav, we have initiated a refund of ₹1,299 to your card.', 1299)).toEqual([]);
  });

  it('flags a reply that promises more than approved', () => {
    expect(checkDraft('Hi, we will refund ₹5,000 to you within a week, sorry!', 1299)).toContain('promises_unapproved_refund_amount');
  });

  it('flags a refund promise when no refund was approved', () => {
    const v = checkDraft('Hi Kavya, your refund has been processed and will arrive soon.', null);
    expect(v).toContain('promises_refund_without_approval');
  });

  it('does not flag an order amount mentioned outside a refund sentence', () => {
    expect(checkDraft('Your order of ₹62,000 is on its way. Tracking will update tomorrow.', null)).toEqual([]);
  });

  it('flags empty drafts', () => {
    expect(checkDraft('  ok ', null)).toContain('draft_too_short');
  });
});

describe('SLA', () => {
  it('computes priority from facts', () => {
    expect(computePriority({ tier: 'enterprise' })).toBe('P1');
    expect(computePriority({ tier: 'standard', legal: true })).toBe('P1');
    expect(computePriority({ tier: 'standard', urgency: 'high' })).toBe('P1');
    expect(computePriority({ tier: 'plus' })).toBe('P2');
    expect(computePriority({ tier: 'standard', urgency: 'normal' })).toBe('P2');
    expect(computePriority({ tier: 'standard', urgency: 'low' })).toBe('P3');
    expect(computePriority({ tier: 'standard' })).toBe('P3');
  });

  it('computes due dates and breach state', () => {
    const due = slaDueAt(now, 'P1');
    expect(due.toISOString()).toBe('2026-11-09T11:00:00.000Z');
    expect(slaState(due, now).breached).toBe(false);
    expect(slaState(due, new Date('2026-11-09T11:00:01Z')).breached).toBe(true);
  });
});

describe('detectors', () => {
  it('detects legal threats in English and Hinglish', () => {
    expect(detectLegal('I will send a legal notice')).toBe(true);
    expect(detectLegal('consumer court mein case karunga')).toBe(true);
    expect(detectLegal('Please help with my order')).toBe(false);
    // "courtyard" must not match "court"
    expect(detectLegal('Deliver to the courtyard gate')).toBe(false);
  });

  it('detects abuse', () => {
    expect(detectAbuse('You idiots sent the wrong item')).toBe(true);
    expect(detectAbuse('bewakoof log ho tum')).toBe(true);
    expect(detectAbuse('This is frustrating, please fix it')).toBe(false);
  });

  it('extracts amounts and order IDs', () => {
    expect(extractAmountsInr('charged ₹1,299 and Rs. 250 and 500 rupees')).toEqual([1299, 250, 500]);
    expect(extractOrderId('my order bz-12345 is late')).toBe('BZ-12345');
    expect(refundAmountsMentioned('Order of ₹900 shipped. We will refund ₹300.')).toEqual([300]);
  });
});
