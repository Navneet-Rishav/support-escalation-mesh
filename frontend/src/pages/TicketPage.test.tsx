import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TriagingCard } from './TicketPage';

describe('TriagingCard', () => {
  const createdAt = '2026-11-10T10:00:00.000Z';

  it('shows a clear "AI is triaging" state with elapsed seconds', () => {
    render(<TriagingCard ticket={{ status: 'triaging', createdAt }} now={new Date('2026-11-10T10:00:42.000Z')} />);
    expect(screen.getByText('AI is triaging…')).toBeInTheDocument();
    expect(screen.getByText('42s')).toBeInTheDocument();
    expect(screen.getByText(/triaged by keyword rules instead/)).toBeInTheDocument();
  });

  it('says it is waiting for the worker while the ticket is still queued', () => {
    render(<TriagingCard ticket={{ status: 'new', createdAt }} now={new Date(createdAt)} />);
    expect(screen.getByText('Waiting for the AI triage worker…')).toBeInTheDocument();
    expect(screen.getByText('0s')).toBeInTheDocument();
  });
});
