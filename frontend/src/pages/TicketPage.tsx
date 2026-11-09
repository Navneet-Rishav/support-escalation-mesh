import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, errorMessage } from '../lib/api';
import { useAuth } from '../lib/authContext';
import { formatInr, formatRelative, parseActor, reasonLabel, RULE_BASED_LABEL } from '../lib/format';
import type { AuditEvent, Ticket } from '../lib/types';
import { Button, Card, ErrorState, Pill, PriorityBadge, SlaBadge, Spinner, StatusBadge } from '../components/ui';
import { cx } from '../lib/cx';

interface TicketDetail {
  ticket: Ticket;
  audit: AuditEvent[];
  now: string;
}

export function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api<TicketDetail>(`/api/tickets/${id}`),
    // Poll while the AI is still working on it.
    refetchInterval: (q) => (['new', 'triaging'].includes(q.state.data?.ticket.status ?? '') ? 2000 : false),
  });

  if (isLoading) return <div className="py-16 text-center"><Spinner label="Loading ticket…" /></div>;
  if (error) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message={missing ? 'This ticket does not exist.' : errorMessage(error)} onRetry={missing ? undefined : () => refetch()} />
      </div>
    );
  }
  if (!data) return null;

  const { ticket, audit } = data;
  const now = new Date(data.now);

  return (
    <div className="space-y-4">
      <BackLink />
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={ticket.priority} />
          <span className="font-mono text-sm text-slate-500">{ticket.ref}</span>
          <StatusBadge status={ticket.status} />
          <SlaBadge dueAt={ticket.slaDueAt} now={now} done={ticket.status === 'resolved'} />
        </div>
        <h1 className="text-xl font-semibold break-words">{ticket.subject}</h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <CustomerMessage ticket={ticket} now={now} />
          <TriagePanel ticket={ticket} now={now} />
          <ReplyPanel key={`${ticket._id}:${ticket.status}:${ticket.triage?.draftReply ?? ''}`} ticket={ticket} />
        </div>
        <div className="lg:col-span-2">
          <AuditTrail events={audit} />
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline">
      ← Back to queue
    </Link>
  );
}

function CustomerMessage({ ticket, now }: { ticket: Ticket; now: Date }) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">
          {ticket.customer.name} <span className="text-sm font-normal text-slate-500">&lt;{ticket.customer.email}&gt;</span>
        </h2>
        <span className="text-xs text-slate-500">
          via {ticket.channel} · {formatRelative(ticket.createdAt, now)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <Pill tone={ticket.customer.tier === 'enterprise' ? 'rose' : ticket.customer.tier === 'plus' ? 'indigo' : 'slate'}>{ticket.customer.tier} customer</Pill>
        {ticket.orderId && <Pill>order {ticket.orderId}</Pill>}
      </div>
      <p className="mt-3 text-sm whitespace-pre-wrap break-words text-slate-800">{ticket.body}</p>
    </Card>
  );
}

/** Shown while the ticket waits for or is in AI triage. The page polls every 2 s, so the elapsed time updates. */
export function TriagingCard({ ticket, now }: { ticket: Pick<Ticket, 'status' | 'createdAt'>; now: Date }) {
  const elapsed = Math.max(0, Math.round((now.getTime() - new Date(ticket.createdAt).getTime()) / 1000));
  const queued = ticket.status === 'new';
  return (
    <Card>
      <div aria-live="polite" className="space-y-2">
        <p className="flex items-center gap-2 font-medium text-sky-900">
          <Spinner small /> {queued ? 'Waiting for the AI triage worker…' : 'AI is triaging…'}
          <span className="ml-auto text-xs font-normal text-slate-500 tabular-nums">{elapsed}s</span>
        </p>
        <p className="text-sm text-slate-600">
          Classifier → specialist agent → policy check (code) → reply draft → draft check (code). This usually takes under a minute; the page
          updates by itself. If the AI service is unavailable, the ticket is triaged by keyword rules instead and marked as such.
        </p>
      </div>
    </Card>
  );
}

function TriagePanel({ ticket, now }: { ticket: Ticket; now: Date }) {
  const t = ticket.triage;
  if (ticket.status === 'new' || ticket.status === 'triaging') return <TriagingCard ticket={ticket} now={now} />;
  if (!t) {
    return (
      <Card>
        <h2 className="font-medium">AI triage</h2>
        <p className="mt-1 text-sm text-slate-600">{ticket.failureReason ? `Triage failed: ${ticket.failureReason}` : 'No AI triage for this ticket.'}</p>
      </Card>
    );
  }
  const escalate = t.decision === 'escalate';
  const ruleBased = t.mode === 'rule_based';

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{ruleBased ? 'Triage' : 'AI triage'}</h2>
        <span className="text-xs text-slate-500">
          {t.provider}/{t.model} · prompt {t.promptVersion} · {t.totalLatencyMs} ms · {t.totalTokens} tokens
        </span>
      </div>
      {ruleBased && (
        <div role="note" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">{RULE_BASED_LABEL}</p>
          <p className="mt-0.5">
            The AI service could not be reached, so keyword rules classified this ticket and wrote the draft. The same code-enforced guardrails
            were applied. Check the category and draft carefully before approving.
          </p>
          {t.fallbackReason && <p className="mt-1 text-xs break-words text-amber-800">Reason: {t.fallbackReason.slice(0, 160)}</p>}
        </div>
      )}
      {t.summary && <p className="mt-2 text-sm text-slate-700">{t.summary}</p>}

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Field label="Category" value={ticket.category ?? '—'} />
        <Field label="Confidence" value={t.confidence !== undefined ? t.confidence.toFixed(2) : '—'} />
        <Field label="Language" value={LANGUAGE[ticket.language ?? ''] ?? '—'} />
        <Field label="Urgency" value={t.urgency ?? '—'} />
      </dl>

      {t.proposal && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-800">
            Specialist proposed: <span className="text-indigo-700">{t.proposal.action.replace(/_/g, ' ')}</span>
            {t.proposal.refundAmountInr !== null && <span> of {formatInr(t.proposal.refundAmountInr)}</span>}
          </p>
          <p className="mt-1 text-slate-600">{t.proposal.rationale}</p>
        </div>
      )}

      <div className={cx('mt-3 rounded-lg p-3 text-sm ring-1', escalate ? 'bg-rose-50 ring-rose-200' : 'bg-emerald-50 ring-emerald-200')}>
        <p className={cx('font-medium', escalate ? 'text-rose-800' : 'text-emerald-800')}>
          Policy check (code): {escalate ? 'escalate to a human' : 'AI draft allowed, human approval required'}
        </p>
        {t.approvedRefundInr !== null && t.approvedRefundInr !== undefined && <p className="mt-1 text-emerald-800">Approved refund: {formatInr(t.approvedRefundInr)}</p>}
        {(t.reasons?.length ?? 0) > 0 && (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-slate-700">
            {t.reasons!.map((r) => (
              <li key={r}>{reasonLabel(r)}</li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

const LANGUAGE: Record<string, string> = { en: 'English', hi: 'Hindi', hinglish: 'Hinglish' };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium capitalize">{value}</dd>
    </div>
  );
}

function ReplyPanel({ ticket }: { ticket: Ticket }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const draft = ticket.triage?.draftReply ?? '';
  // The parent re-mounts this panel (via `key`) when the ticket or its draft changes, so this initial value stays in sync.
  const [reply, setReply] = useState(draft);

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['ticket', ticket._id] });
    void qc.invalidateQueries({ queryKey: ['tickets'] });
  };
  const send = useMutation({
    mutationFn: (body: { reply?: string }) => api(`/api/tickets/${ticket._id}/approve`, { body }),
    onSuccess: done,
  });
  const takeOver = useMutation({ mutationFn: () => api(`/api/tickets/${ticket._id}/take-over`, { body: {} }), onSuccess: done });
  const retriage = useMutation({ mutationFn: () => api(`/api/tickets/${ticket._id}/retriage`, { body: {} }), onSuccess: done });
  const mutationError = send.error ?? takeOver.error ?? retriage.error;

  const mine = ticket.status === 'human_handling' && ticket.assignee === user?.id;
  const edited = reply.trim() !== draft.trim();

  if (ticket.status === 'resolved') {
    return (
      <Card>
        <h2 className="font-medium">Reply sent</h2>
        <p className="mt-1 text-xs text-slate-500">by {ticket.resolvedBy}</p>
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap break-words">{ticket.finalReply}</p>
      </Card>
    );
  }
  if (ticket.status === 'new' || ticket.status === 'triaging') return null;

  const canCompose = ticket.status === 'awaiting_review' || mine;

  return (
    <Card>
      <h2 className="font-medium">{ticket.status === 'awaiting_review' ? 'Review the AI draft' : 'Reply to the customer'}</h2>

      {(ticket.status === 'escalated' || ticket.status === 'failed') && (
        <p className="mt-2 text-sm text-slate-600">
          {ticket.status === 'escalated' ? 'The guardrails sent this ticket to a human, so the AI did not draft a reply.' : 'AI triage failed.'} Take it over to reply.
        </p>
      )}
      {ticket.status === 'human_handling' && !mine && <p className="mt-2 text-sm text-slate-600">Being handled by {ticket.assigneeName}.</p>}
      {(ticket.triage?.draftViolations?.length ?? 0) > 0 && (
        <p className="mt-2 rounded-lg bg-rose-50 p-2 text-sm text-rose-800">
          The AI draft was blocked: {ticket.triage!.draftViolations!.map(reasonLabel).join('; ')}.
        </p>
      )}

      {canCompose && (
        <label className="mt-3 block">
          <span className="sr-only">Reply text</span>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={7}
            placeholder="Write your reply to the customer…"
            className="block w-full rounded-lg border-0 p-3 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-indigo-500"
          />
          {ticket.status === 'awaiting_review' && edited && <span className="mt-1 block text-xs text-amber-700">Edited: your version will be sent instead of the AI draft.</span>}
        </label>
      )}

      {mutationError && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage(mutationError)}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {canCompose && (
          <Button
            loading={send.isPending}
            disabled={!reply.trim()}
            onClick={() => send.mutate(ticket.status === 'awaiting_review' && !edited ? {} : { reply: reply.trim() })}
          >
            {ticket.status === 'awaiting_review' ? (edited ? 'Send edited reply' : 'Approve & send') : 'Send reply'}
          </Button>
        )}
        {['awaiting_review', 'escalated', 'failed'].includes(ticket.status) && (
          <Button variant="secondary" loading={takeOver.isPending} onClick={() => takeOver.mutate()}>
            Take over
          </Button>
        )}
        {user?.role === 'admin' && ['escalated', 'failed', 'human_handling'].includes(ticket.status) && (
          <Button variant="ghost" loading={retriage.isPending} onClick={() => retriage.mutate()}>
            Re-run AI triage
          </Button>
        )}
      </div>
    </Card>
  );
}

const ACTOR_STYLE = {
  ai: 'bg-indigo-500',
  code: 'bg-emerald-500',
  human: 'bg-violet-500',
  customer: 'bg-slate-400',
  system: 'bg-rose-400',
};

function AuditTrail({ events }: { events: AuditEvent[] }) {
  return (
    <Card>
      <h2 className="font-medium">Reasoning trail</h2>
      <p className="mt-0.5 text-xs text-slate-500">Every AI step, code check and human action, in order.</p>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
        {(['ai', 'code', 'human'] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={cx('h-2 w-2 rounded-full', ACTOR_STYLE[k])} /> {k === 'code' ? 'code rule' : k}
          </span>
        ))}
      </div>
      <ol className="mt-4 space-y-3">
        {events.map((e) => {
          const actor = parseActor(e.actor);
          const tokens = e.tokens.prompt + e.tokens.completion;
          return (
            <li key={e._id} className="relative pl-5">
              <span className={cx('absolute top-1.5 left-0 h-2.5 w-2.5 rounded-full', ACTOR_STYLE[actor.kind])} aria-hidden="true" />
              <details className="group">
                <summary className="cursor-pointer list-none text-sm">
                  <span className="font-medium">{e.step.replace(/_/g, ' ')}</span>
                  {e.decision && <span className="text-slate-600"> → {e.decision.replace(/_/g, ' ')}</span>}
                  <span className="block text-xs text-slate-500">
                    {actor.name}
                    {e.latencyMs > 0 && ` · ${e.latencyMs} ms`}
                    {tokens > 0 && ` · ${tokens} tokens`}
                    <span className="text-indigo-600 group-open:hidden"> · details</span>
                  </span>
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify({ input: e.input, output: e.output }, null, 2)}</pre>
              </details>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
