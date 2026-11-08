import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { formatRelative } from '../lib/format';
import type { TicketList, TicketStatus } from '../lib/types';
import { Card, EmptyState, ErrorState, PriorityBadge, SlaBadge, Spinner, StatusBadge, Pill } from '../components/ui';
import { cx } from '../lib/cx';

type Tab = { key: string; label: string; status?: TicketStatus; view: 'open' | 'mine' | 'all' };

const TABS: Tab[] = [
  { key: 'open', label: 'All open', view: 'open' },
  { key: 'awaiting_review', label: 'Needs approval', status: 'awaiting_review', view: 'open' },
  { key: 'escalated', label: 'Escalated', status: 'escalated', view: 'open' },
  { key: 'mine', label: 'Mine', view: 'mine' },
  { key: 'resolved', label: 'Resolved', status: 'resolved', view: 'all' },
];

const CLOSED: TicketStatus[] = ['resolved'];

export function QueuePage() {
  const [tab, setTab] = useState<Tab>(TABS[0]);
  const [search, setSearch] = useState('');

  const params = new URLSearchParams({ view: tab.view });
  if (tab.status) params.set('status', tab.status);
  if (search.trim()) params.set('q', search.trim());

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['tickets', tab.key, search.trim()],
    queryFn: () => api<TicketList>(`/api/tickets?${params}`),
    refetchInterval: 5000, // live queue: new tickets appear as the AI worker triages them
  });

  const now = data ? new Date(data.now) : new Date();
  const counts = data?.counts ?? {};
  const triaging = (counts.new ?? 0) + (counts.triaging ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Ticket queue</h1>
          <p className="text-sm text-slate-600">Sorted by SLA deadline. Updates every 5 seconds.</p>
        </div>
        <label className="w-full sm:w-72">
          <span className="sr-only">Search tickets</span>
          <input
            type="search"
            placeholder="Search ref, subject or customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <div role="tablist" aria-label="Ticket filters" className="flex w-max gap-1 rounded-lg bg-slate-100 p-1">
          {TABS.map((t) => {
            const n = t.status ? counts[t.status] : undefined;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab.key === t.key}
                onClick={() => setTab(t)}
                className={cx('rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap', tab.key === t.key ? 'bg-white shadow-sm' : 'text-slate-600 hover:text-slate-900')}
              >
                {t.label}
                {n !== undefined && <span className="ml-1.5 text-xs text-slate-500">{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {triaging > 0 && (
        <p className="flex items-center gap-2 text-sm text-sky-800">
          <Spinner small /> AI is triaging {triaging} new ticket{triaging > 1 ? 's' : ''}…
        </p>
      )}

      {isLoading ? (
        <div className="py-10 text-center">
          <Spinner label="Loading tickets…" />
        </div>
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title={search ? 'No tickets match your search' : 'Nothing here right now'}>
          {tab.key === 'mine' ? 'Tickets you take over will show up here.' : <Link to="/submit" className="text-indigo-700 hover:underline">Submit a test ticket</Link>}
        </EmptyState>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className={cx('divide-y divide-slate-100', isFetching && 'opacity-90')}>
            {data.items.map((t) => (
              <li key={t._id}>
                <Link to={`/tickets/${t._id}`} className="block px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={t.priority} />
                    <span className="font-mono text-xs text-slate-500">{t.ref}</span>
                    <StatusBadge status={t.status} />
                    {t.category && <Pill>{t.category}</Pill>}
                    {t.language && t.language !== 'en' && <Pill tone="indigo">{t.language}</Pill>}
                    <span className="ml-auto">
                      <SlaBadge dueAt={t.slaDueAt} now={now} done={CLOSED.includes(t.status)} />
                    </span>
                  </div>
                  <p className="mt-1.5 font-medium text-slate-900">{t.subject}</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {t.customer.name}
                    {t.customer.tier !== 'standard' && <span className="font-medium text-slate-700"> · {t.customer.tier}</span>} · {t.channel} · {formatRelative(t.createdAt, now)}
                    {t.assigneeName && <span> · handled by {t.assigneeName}</span>}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {data.total > data.items.length && <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">Showing {data.items.length} of {data.total}</p>}
        </Card>
      )}
    </div>
  );
}
