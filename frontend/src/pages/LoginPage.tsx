import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/authContext';
import type { Role } from '../lib/types';
import { Button } from '../components/ui';
import { cx } from '../lib/cx';

export function LoginPage() {
  const { user, login, register, demo } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'form' | Role>(null);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  async function run(kind: 'form' | Role, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run('form', () => (mode === 'login' ? login(email, password) : register(name, email, password)));
  }

  const input = 'mt-1 block w-full rounded-lg border-0 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto h-12 w-12" />
          <h1 className="mt-3 text-2xl font-semibold">Support Escalation Mesh</h1>
          <p className="mt-1 text-sm text-slate-600">AI triages support tickets for Bazaarly (a fictional marketplace). Humans approve every reply.</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-700">Just looking around? No sign-up needed:</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button loading={busy === 'agent'} disabled={busy !== null} onClick={() => run('agent', () => demo('agent'))}>
              Try demo as Agent
            </Button>
            <Button variant="secondary" loading={busy === 'admin'} disabled={busy !== null} onClick={() => run('admin', () => demo('admin'))}>
              Demo as Admin
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Admin can also start eval runs. The first request can take up to a minute while the free-tier API wakes up.</p>

          <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> or use an account <span className="h-px flex-1 bg-slate-200" />
          </div>

          <div role="tablist" className="mb-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cx('rounded-md py-1.5 font-medium', mode === m ? 'bg-white shadow-sm' : 'text-slate-600')}
              >
                {m === 'login' ? 'Log in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-3" noValidate>
            {mode === 'register' && (
              <label className="block text-sm font-medium text-slate-700">
                Name
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} />
              </label>
            )}
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                className={input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={8}
              />
              {mode === 'register' && <span className="mt-1 block text-xs font-normal text-slate-500">At least 8 characters. New accounts get the Agent role.</span>}
            </label>
            {error && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" loading={busy === 'form'} disabled={busy !== null}>
              {mode === 'login' ? 'Log in' : 'Create account'}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-slate-600">
          Are you a customer? <Link to="/submit" className="font-medium text-indigo-700 hover:underline">Submit a support ticket</Link>
        </p>
      </div>
    </div>
  );
}
