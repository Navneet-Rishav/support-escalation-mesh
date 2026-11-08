import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card } from '../components/ui';

const EXAMPLES = [
  { subject: 'Charged twice', body: 'I was charged twice for order BZ-20001 (₹1,299). Please refund the extra payment.', name: 'Aarav Mehta', email: 'aarav@example.com' },
  { subject: 'Order nahi aaya', body: 'Bhai mera order BZ-20005 abhi tak nahi aaya, 5 din ho gaye. Kab aayega?', name: 'Vikram Singh', email: 'vikram@example.com' },
  { subject: 'Legal notice', body: 'My refund for order BZ-20004 is still pending. If it is not processed this week I will send a legal notice.', name: 'Tanvi Joshi', email: 'tanvi@example.com' },
];

/** The customer-facing form. Public: no login needed. */
export function SubmitPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', subject: '', body: '', orderId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await api<{ ref: string }>('/api/intake/web', { body: form, auth: false });
      setDone(res.ref);
    } catch (err) {
      if (err instanceof ApiError && err.details) setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const input = 'mt-1 block w-full rounded-lg border-0 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-indigo-500 aria-[invalid=true]:ring-rose-400';
  const fieldError = (k: string) =>
    fieldErrors[k] && (
      <span id={`${k}-error`} className="mt-1 block text-xs font-normal text-rose-700">
        {fieldErrors[k]}
      </span>
    );

  return (
    <div className={user ? '' : 'mx-auto max-w-2xl px-4 py-8'}>
      <h1 className="text-xl font-semibold">Contact Bazaarly support</h1>
      <p className="mt-1 text-sm text-slate-600">
        This is the customer side. Tickets go to the AI triage queue; a human agent approves every reply. Bazaarly is fictional, so use made-up details.
      </p>

      {done ? (
        <Card className="mt-4">
          <p className="font-medium text-emerald-800">Ticket {done} received.</p>
          <p className="mt-1 text-sm text-slate-600">The AI agents will triage it within a few seconds.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {user ? (
              <Link to="/" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                See it in the queue
              </Link>
            ) : (
              <Link to="/login" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                Open the agent console
              </Link>
            )}
            <Button variant="secondary" onClick={() => { setDone(null); setForm({ name: '', email: '', subject: '', body: '', orderId: '' }); }}>
              Submit another
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="mt-4">
          <p className="text-xs font-medium text-slate-500">Fill with an example:</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex.subject} type="button" onClick={() => setForm({ ...ex, orderId: '' })} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200">
                {ex.subject}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2" noValidate>
            <label className="block text-sm font-medium text-slate-700">
              Your name
              <input className={input} value={form.name} onChange={set('name')} required aria-invalid={Boolean(fieldErrors.name)} aria-describedby="name-error" />
              {fieldError('name')}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input className={input} type="email" value={form.email} onChange={set('email')} required aria-invalid={Boolean(fieldErrors.email)} aria-describedby="email-error" />
              {fieldError('email')}
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Subject
              <input className={input} value={form.subject} onChange={set('subject')} required aria-invalid={Boolean(fieldErrors.subject)} aria-describedby="subject-error" />
              {fieldError('subject')}
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              What happened? <span className="font-normal text-slate-500">(English, Hindi or Hinglish)</span>
              <textarea className={input} rows={5} value={form.body} onChange={set('body')} required aria-invalid={Boolean(fieldErrors.body)} aria-describedby="body-error" />
              {fieldError('body')}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Order ID <span className="font-normal text-slate-500">(optional, e.g. BZ-20001)</span>
              <input className={input} value={form.orderId} onChange={set('orderId')} aria-invalid={Boolean(fieldErrors.orderId)} aria-describedby="orderId-error" />
              {fieldError('orderId')}
            </label>
            {error && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">
                {error}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" loading={busy}>
                Submit ticket
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
