import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatInr, formatPct, reasonLabel } from '../lib/format';
import type { EvalMetrics, EvalRun, Meta } from '../lib/types';
import { Button, Card, EmptyState, ErrorState, Pill, Spinner, cx } from '../components/ui';

type MetricKey = keyof EvalMetrics;
const METRICS: { key: MetricKey; label: string; fmt: (v: number | null) => string; higherIsBetter?: boolean }[] = [
  { key: 'routingAccuracy', label: 'Routing accuracy', fmt: formatPct, higherIsBetter: true },
  { key: 'escalationPrecision', label: 'Escalation precision', fmt: formatPct, higherIsBetter: true },
  { key: 'escalationRecall', label: 'Escalation recall', fmt: formatPct, higherIsBetter: true },
  { key: 'policyViolationRate', label: 'Draft policy violations', fmt: formatPct, higherIsBetter: false },
  { key: 'avgLatencyMs', label: 'Avg latency / ticket', fmt: (v) => (v === null ? '—' : `${v} ms`), higherIsBetter: false },
  { key: 'p95LatencyMs', label: 'p95 latency', fmt: (v) => (v === null ? '—' : `${v} ms`), higherIsBetter: false },
  { key: 'avgTokensPerTicket', label: 'Avg tokens / ticket', fmt: (v) => (v === null ? '—' : String(v)), higherIsBetter: false },
  { key: 'costPerTicketInr', label: 'Cost / ticket', fmt: (v) => (v === null ? 'price not set' : formatInr(v)), higherIsBetter: false },
  { key: 'errors', label: 'Errors', fmt: (v) => String(v ?? 0), higherIsBetter: false },
];

export function EvalsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const runs = useQuery({
    queryKey: ['evalRuns'],
    queryFn: () => api<{ runs: EvalRun[] }>('/api/evals/runs'),
    refetchInterval: (q) => (q.state.data?.runs.some((r) => r.status === 'running') ? 3000 : false),
  });
  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/api/meta') });
  // null = the user has not picked runs yet; default to the two most recent completed runs.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [promptVersion, setPromptVersion] = useState('v2');

  const list = runs.data?.runs ?? [];
  const selected = picked ?? list.filter((r) => r.status === 'completed').slice(0, 2).map((r) => r._id);

  const start = useMutation({
    mutationFn: () => api<{ run: EvalRun }>('/api/evals/runs', { body: { promptVersion } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evalRuns'] }),
  });

  const toggle = (id: string) => setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id].slice(-2));
  const compared = selected.map((id) => list.find((r) => r._id === id)).filter((r): r is EvalRun => Boolean(r?.metrics));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Evals</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Each run sends the 30 labelled tickets (English, Hinglish and Hindi) through the same triage graph and scores routing, escalation and draft safety. Select two runs to compare prompt or model versions.
        </p>
      </div>

      {meta.data?.provider === 'fake' && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          This deployment uses the <strong>fake keyword provider</strong>, not an LLM. Its scores only check that the pipeline works; they are not model quality numbers.
        </p>
      )}

      {user?.role === 'admin' ? (
        <Card className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Prompt version
            <select value={promptVersion} onChange={(e) => setPromptVersion(e.target.value)} className="mt-1 block rounded-lg border-0 px-3 py-2 ring-1 ring-slate-300">
              {(meta.data?.promptVersions ?? ['v1', 'v2']).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <Button loading={start.isPending} onClick={() => start.mutate()}>
            Start eval run
          </Button>
          <span className="text-xs text-slate-500">
            Uses {meta.data ? `${meta.data.provider}/${meta.data.model}` : 'the configured model'}. Limited to 3 runs per hour.
          </span>
          {start.error && <p role="alert" className="w-full text-sm text-rose-700">{errorMessage(start.error)}</p>}
        </Card>
      ) : (
        <p className="text-sm text-slate-500">Only admins can start eval runs (they make ~90 model calls). Use "Demo as Admin" to try it.</p>
      )}

      {runs.isLoading ? (
        <Spinner label="Loading runs…" />
      ) : runs.error ? (
        <ErrorState message={errorMessage(runs.error)} onRetry={() => runs.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="No eval runs yet" />
      ) : (
        <>
          <Card className="overflow-x-auto p-0 sm:p-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Eval runs</caption>
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2">Compare</th>
                  <th className="px-4 py-2">Run</th>
                  <th className="px-4 py-2">Routing</th>
                  <th className="px-4 py-2">Esc. P / R</th>
                  <th className="px-4 py-2">Violations</th>
                  <th className="px-4 py-2">p95</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((r) => (
                  <tr key={r._id} className={cx(selected.includes(r._id) && 'bg-indigo-50/50')}>
                    <td className="px-4 py-2">
                      <input type="checkbox" aria-label={`Compare ${r.label}`} checked={selected.includes(r._id)} disabled={r.status !== 'completed'} onChange={() => toggle(r._id)} />
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-medium">{r.label}</span>
                      <span className="block text-xs text-slate-500">
                        {new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} {r.createdByName && `· ${r.createdByName}`}
                      </span>
                    </td>
                    {r.status === 'completed' && r.metrics ? (
                      <>
                        <td className="px-4 py-2">{formatPct(r.metrics.routingAccuracy)}</td>
                        <td className="px-4 py-2">
                          {formatPct(r.metrics.escalationPrecision)} / {formatPct(r.metrics.escalationRecall)}
                        </td>
                        <td className="px-4 py-2">{formatPct(r.metrics.policyViolationRate)}</td>
                        <td className="px-4 py-2">{r.metrics.p95LatencyMs} ms</td>
                      </>
                    ) : (
                      <td colSpan={4} className="px-4 py-2">
                        {r.status === 'running' ? <Spinner small label="Running…" /> : <span className="text-rose-700">Failed: {r.error}</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {compared.length > 0 && <Comparison runs={compared} />}
          {compared.length > 0 && <CaseResults runId={compared[compared.length - 1]._id} />}
        </>
      )}
    </div>
  );
}

function Comparison({ runs }: { runs: EvalRun[] }) {
  const [a, b] = runs;
  return (
    <Card>
      <h2 className="font-medium">{b ? 'Comparison' : 'Run metrics'}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {METRICS.map((m) => {
          const va = a.metrics![m.key] as number | null;
          const vb = b?.metrics?.[m.key] as number | null | undefined;
          const better = vb !== undefined && vb !== null && va !== null && vb !== va ? (m.higherIsBetter ? vb > va : vb < va) : null;
          return (
            <div key={m.key} className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{m.label}</p>
              <p className="mt-1 text-lg font-semibold">
                {m.fmt(va)}
                {b && (
                  <span className={cx('ml-2 text-sm', better === null ? 'text-slate-500' : better ? 'text-emerald-700' : 'text-rose-700')}>
                    → {m.fmt(vb ?? null)}
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {b ? `${a.label} → ${b.label}. ` : ''}30 labelled tickets: a small set, so treat differences as indicative.
      </p>
    </Card>
  );
}

function CaseResults({ runId }: { runId: string }) {
  const q = useQuery({ queryKey: ['evalRun', runId], queryFn: () => api<{ run: EvalRun }>(`/api/evals/runs/${runId}`) });
  const [onlyMisses, setOnlyMisses] = useState(true);
  if (q.isLoading) return <Spinner label="Loading results…" />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  const results = q.data?.run.results ?? [];
  const isMiss = (r: (typeof results)[number]) => r.predictedCategory !== r.expectedCategory || r.escalated !== r.expectedEscalate || r.violations.length > 0 || Boolean(r.error);
  const shown = onlyMisses ? results.filter(isMiss) : results;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Per-ticket results · {q.data?.run.label}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyMisses} onChange={(e) => setOnlyMisses(e.target.checked)} /> Only misses ({results.filter(isMiss).length})
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No misses in this run.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {shown.map((r) => (
            <li key={r.caseId} className="flex flex-wrap items-center gap-2 py-2">
              <span className="w-10 font-mono text-xs text-slate-500">{r.caseId}</span>
              <Pill tone={r.language === 'en' ? 'slate' : 'indigo'}>{r.language}</Pill>
              <span className={cx(r.predictedCategory === r.expectedCategory ? 'text-slate-700' : 'font-medium text-rose-700')}>
                {r.predictedCategory ?? 'error'}
                {r.predictedCategory !== r.expectedCategory && <span className="text-slate-500"> (expected {r.expectedCategory})</span>}
              </span>
              <span className={cx(r.escalated === r.expectedEscalate ? 'text-slate-500' : 'font-medium text-rose-700')}>
                {r.escalated ? 'escalated' : 'AI draft'}
                {r.escalated !== r.expectedEscalate && ` (expected ${r.expectedEscalate ? 'escalate' : 'AI draft'})`}
              </span>
              {r.reasons.length > 0 && <span className="w-full pl-12 text-xs text-slate-500 sm:w-auto sm:pl-0">{r.reasons.map(reasonLabel).join(' · ')}</span>}
              {r.error && <span className="w-full pl-12 text-xs text-rose-700">{r.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
