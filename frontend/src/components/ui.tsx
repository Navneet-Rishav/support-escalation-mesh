import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { formatSla, STATUS_LABEL } from '../lib/format';
import type { Priority, TicketStatus } from '../lib/types';
import { cx } from '../lib/cx';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
  secondary: 'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300',
  ghost: 'text-slate-700 hover:bg-slate-100',
};

export function Button({ variant = 'primary', className, loading, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed', VARIANTS[variant], className)}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small, label }: { small?: boolean; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-slate-500">
      <span className={cx('animate-spin rounded-full border-2 border-current border-t-transparent', small ? 'h-3.5 w-3.5' : 'h-5 w-5')} aria-hidden="true" />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5', className)}>{children}</section>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<TicketStatus, string> = {
  new: 'bg-slate-100 text-slate-700',
  triaging: 'bg-sky-100 text-sky-800',
  awaiting_review: 'bg-amber-100 text-amber-800',
  escalated: 'bg-rose-100 text-rose-800',
  human_handling: 'bg-violet-100 text-violet-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}

const PRIORITY_STYLE: Record<Priority, string> = {
  P1: 'bg-rose-600 text-white',
  P2: 'bg-amber-500 text-white',
  P3: 'bg-slate-400 text-white',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span title={`Priority ${priority}`} className={cx('inline-flex rounded px-1.5 py-0.5 text-xs font-bold', PRIORITY_STYLE[priority])}>
      {priority}
    </span>
  );
}

export function SlaBadge({ dueAt, now, done }: { dueAt: string; now?: Date; done?: boolean }) {
  if (done) return <span className="text-xs text-slate-500">SLA closed</span>;
  const s = formatSla(dueAt, now);
  return (
    <span className={cx('text-xs font-medium whitespace-nowrap', s.breached ? 'text-rose-700' : s.soon ? 'text-amber-700' : 'text-slate-600')}>
      ⏱ {s.text}
    </span>
  );
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'indigo' | 'rose' | 'emerald' | 'amber' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    indigo: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
    rose: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  };
  return <span className={cx('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}
