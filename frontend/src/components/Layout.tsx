import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../lib/authContext';
import { cx } from '../lib/cx';

const NAV = [
  { to: '/', label: 'Queue', end: true },
  { to: '/evals', label: 'Evals' },
  { to: '/submit', label: 'Submit a ticket' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span>Escalation Mesh</span>
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => cx('rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100')}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            {user && (
              <span className="text-right text-xs leading-tight text-slate-500">
                <span className="block font-medium text-slate-800">{user.name}</span>
                {user.role}
              </span>
            )}
            <button onClick={logout} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Log out
            </button>
          </div>

          <button className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 sm:hidden" aria-expanded={open} aria-controls="mobile-nav" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {open && (
          <nav id="mobile-nav" aria-label="Main" className="border-t border-slate-200 px-4 pb-3 sm:hidden">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) => cx('block rounded-lg px-3 py-2.5 text-sm font-medium', isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700')}
              >
                {n.label}
              </NavLink>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-600">
                {user?.name} · {user?.role}
              </span>
              <button onClick={logout} className="font-medium text-indigo-700">
                Log out
              </button>
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
