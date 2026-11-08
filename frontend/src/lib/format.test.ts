import { describe, expect, it } from 'vitest';
import { formatInr, formatPct, formatSla, parseActor, reasonLabel } from './format';

describe('formatSla', () => {
  const now = new Date('2026-11-09T10:00:00Z');

  it('shows time remaining and flags tickets due within 30 minutes', () => {
    expect(formatSla('2026-11-09T13:20:00Z', now)).toEqual({ text: 'due in 3h 20m', breached: false, soon: false });
    expect(formatSla('2026-11-09T10:15:00Z', now)).toEqual({ text: 'due in 15m', breached: false, soon: true });
  });

  it('shows overdue time once breached', () => {
    expect(formatSla('2026-11-07T06:00:00Z', now)).toMatchObject({ text: '2d 4h overdue', breached: true });
  });
});

describe('formatters', () => {
  it('formats rupees in Indian grouping', () => {
    expect(formatInr(125000)).toBe('₹1,25,000');
    expect(formatInr(null)).toBe('—');
  });

  it('formats percentages and nulls', () => {
    expect(formatPct(0.857)).toBe('85.7%');
    expect(formatPct(1)).toBe('100%');
    expect(formatPct(null)).toBe('—');
  });

  it('labels guardrail reasons, with a readable fallback', () => {
    expect(reasonLabel('legal_threat')).toMatch(/Legal threat/);
    expect(reasonLabel('some_new_reason')).toBe('some new reason');
  });

  it('parses audit actors', () => {
    expect(parseActor('ai:billing_specialist')).toEqual({ kind: 'ai', name: 'billing specialist' });
    expect(parseActor('human:Asha')).toEqual({ kind: 'human', name: 'Asha' });
    expect(parseActor('system')).toEqual({ kind: 'system', name: 'system' });
  });
});
