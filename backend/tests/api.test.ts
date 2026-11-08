import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, createUser, useTestDb } from './helpers.js';
import { Order } from '../src/models/Order.js';
import { Customer } from '../src/models/Customer.js';
import { Ticket } from '../src/models/Ticket.js';
import { AuditEvent } from '../src/models/AuditEvent.js';
import { EvalRun } from '../src/models/EvalRun.js';
import { setLlmProvider } from '../src/llm/index.js';
import { claimNextTicket, processNextTicket, requeueStaleTickets, MAX_TRIAGE_ATTEMPTS } from '../src/services/triage.js';
import { LlmError } from '../src/llm/types.js';

useTestDb();

async function seedOrder(amountInr = 1299, tier: 'standard' | 'enterprise' = 'standard') {
  await Customer.create({ name: 'Aarav Mehta', email: 'aarav@example.com', tier });
  await Order.create({ orderId: 'BZ-10001', customerEmail: 'aarav@example.com', items: 'Speaker', amountInr, status: 'delivered', placedAt: new Date() });
}

const refundTicket = {
  name: 'Aarav Mehta',
  email: 'aarav@example.com',
  subject: 'Charged twice',
  body: 'I was charged twice for order BZ-10001. Please refund ₹1,299.',
};

async function submitAndTriage(body = refundTicket) {
  const res = await request(app).post('/api/intake/web').send(body).expect(202);
  await processNextTicket();
  return Ticket.findOne({ ref: res.body.ref }).lean();
}

describe('health and errors', () => {
  it('GET /healthz reports the database', async () => {
    const res = await request(app).get('/healthz').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('unknown routes return the standard error shape with a request ID', async () => {
    const res = await request(app).get('/api/nope').set('X-Request-Id', 'req-abc-123').expect(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: 'req-abc-123' });
    expect(res.headers['x-request-id']).toBe('req-abc-123');
  });

  it('malformed JSON is a 400, not a 500', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('auth', () => {
  it('registers, logs in and returns the current user', async () => {
    const reg = await request(app).post('/api/auth/register').send({ name: 'Neha', email: 'neha@test.dev', password: 'longpassword' }).expect(201);
    expect(reg.body.user).toMatchObject({ email: 'neha@test.dev', role: 'agent' });
    const login = await request(app).post('/api/auth/login').send({ email: 'NEHA@test.dev', password: 'longpassword' }).expect(200);
    const me = await request(app).get('/api/auth/me').set(auth(login.body.token)).expect(200);
    expect(me.body.user.email).toBe('neha@test.dev');
  });

  it('never stores the plain password', async () => {
    await request(app).post('/api/auth/register').send({ name: 'Neha', email: 'neha@test.dev', password: 'longpassword' }).expect(201);
    const raw = await AuditEvent.db.collection('users').findOne({ email: 'neha@test.dev' });
    expect(raw?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(raw)).not.toContain('longpassword');
  });

  it('rejects wrong passwords and duplicate emails', async () => {
    await request(app).post('/api/auth/register').send({ name: 'Neha', email: 'neha@test.dev', password: 'longpassword' }).expect(201);
    await request(app).post('/api/auth/register').send({ name: 'Neha', email: 'neha@test.dev', password: 'longpassword' }).expect(409);
    const bad = await request(app).post('/api/auth/login').send({ email: 'neha@test.dev', password: 'wrong-password' }).expect(401);
    expect(bad.body.error.message).toBe('Incorrect email or password');
  });

  it('validates registration input', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'N', email: 'not-an-email', password: 'short' }).expect(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['email', 'name', 'password']);
  });

  it('demo login works without a password and fills the demo queue', async () => {
    const res = await request(app).post('/api/auth/demo').send({ role: 'agent' }).expect(200);
    expect(res.body.user).toMatchObject({ role: 'agent', email: 'demo.agent@mesh.demo' });
    expect(await Ticket.countDocuments()).toBeGreaterThanOrEqual(4);
    // Demo accounts cannot be used with a password.
    await request(app).post('/api/auth/login').send({ email: 'demo.agent@mesh.demo', password: 'anything' }).expect(401);
  });

  it('protects routes and rejects tampered tokens', async () => {
    await request(app).get('/api/tickets').expect(401);
    const { token } = await createUser();
    await request(app).get('/api/tickets').set(auth(`${token}x`)).expect(401);
  });
});

describe('ticket intake', () => {
  it('accepts a web ticket and extracts the order ID', async () => {
    const res = await request(app).post('/api/intake/web').send(refundTicket).expect(202);
    expect(res.body.ref).toMatch(/^TKT-[0-9A-F]{6}$/);
    const t = await Ticket.findOne({ ref: res.body.ref });
    expect(t).toMatchObject({ status: 'new', orderId: 'BZ-10001', channel: 'web' });
  });

  it('accepts email-style JSON', async () => {
    const res = await request(app)
      .post('/api/intake/email')
      .send({ from: 'Priya Sharma <priya@example.com>', subject: 'Order late', text: 'Mera order abhi tak nahi aaya.' })
      .expect(202);
    const t = await Ticket.findOne({ ref: res.body.ref });
    expect(t?.customer).toMatchObject({ name: 'Priya Sharma', email: 'priya@example.com' });
    expect(t?.channel).toBe('email');
  });

  it('rejects invalid tickets', async () => {
    const res = await request(app).post('/api/intake/web').send({ ...refundTicket, body: 'short', orderId: '123' }).expect(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['body', 'orderId']));
  });

  it('rejects oversized bodies', async () => {
    await request(app).post('/api/intake/web').send({ ...refundTicket, body: 'x'.repeat(200_000) }).expect(413);
  });
});

describe('triage worker', () => {
  it('triages a small refund to awaiting_review with a draft and full audit trail', async () => {
    await seedOrder();
    const t = await submitAndTriage();
    expect(t).toMatchObject({ status: 'awaiting_review', category: 'billing' });
    expect(t?.triage?.approvedRefundInr).toBe(1299);
    expect(t?.triage?.draftReply).toContain('1299');
    const steps = (await AuditEvent.find({ ticket: t!._id }).sort({ at: 1, _id: 1 })).map((a) => a.step);
    expect(steps).toEqual(['received', 'classify', 'lookup_order', 'billing_agent', 'policy_check', 'draft_reply', 'check_draft']);
  });

  it('escalates enterprise customers', async () => {
    await seedOrder(1299, 'enterprise');
    const t = await submitAndTriage();
    expect(t?.status).toBe('escalated');
    expect(t?.priority).toBe('P1');
    expect(t?.triage?.reasons).toContain('enterprise_customer');
    expect(t?.triage?.draftReply).toBeUndefined();
  });

  it('only one worker can claim a ticket', async () => {
    await request(app).post('/api/intake/web').send(refundTicket).expect(202);
    const [a, b] = await Promise.all([claimNextTicket(), claimNextTicket()]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it('retries failed triage and marks the ticket failed after max attempts', async () => {
    setLlmProvider({
      name: 'down',
      model: 'test',
      complete: async () => {
        throw new LlmError('provider down', true);
      },
    });
    try {
      const res = await request(app).post('/api/intake/web').send(refundTicket).expect(202);
      for (let i = 0; i < MAX_TRIAGE_ATTEMPTS; i++) await processNextTicket();
      const t = await Ticket.findOne({ ref: res.body.ref });
      expect(t).toMatchObject({ status: 'failed', attempts: MAX_TRIAGE_ATTEMPTS });
      expect(t?.failureReason).toContain('provider down');
      expect(await processNextTicket()).toBe(false);
    } finally {
      setLlmProvider(undefined);
    }
  });

  it('requeues tickets stuck in triaging', async () => {
    await request(app).post('/api/intake/web').send(refundTicket).expect(202);
    const claimed = await claimNextTicket();
    expect(await requeueStaleTickets(new Date(Date.now() + 10 * 60_000))).toBe(1);
    expect((await Ticket.findById(claimed!._id))?.status).toBe('new');
  });
});

describe('agent console (human in the loop)', () => {
  it('lists open tickets sorted by SLA with status counts', async () => {
    const { token } = await createUser();
    await seedOrder();
    await submitAndTriage();
    const res = await request(app).get('/api/tickets').set(auth(token)).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.counts).toEqual({ awaiting_review: 1 });
    expect(res.body.items[0]).toHaveProperty('slaDueAt');
  });

  it('returns ticket detail with the audit trail; 404 for unknown IDs', async () => {
    const { token } = await createUser();
    await seedOrder();
    const t = await submitAndTriage();
    const res = await request(app).get(`/api/tickets/${t!._id}`).set(auth(token)).expect(200);
    expect(res.body.audit.length).toBe(7);
    await request(app).get('/api/tickets/000000000000000000000000').set(auth(token)).expect(404);
    await request(app).get('/api/tickets/not-an-id').set(auth(token)).expect(404);
  });

  it('approves an AI draft as-is', async () => {
    const { token } = await createUser();
    await seedOrder();
    const t = await submitAndTriage();
    const res = await request(app).post(`/api/tickets/${t!._id}/approve`).set(auth(token)).send({}).expect(200);
    expect(res.body.ticket).toMatchObject({ status: 'resolved', resolvedBy: 'Ravi Agent', finalReply: t!.triage!.draftReply });
    expect(await AuditEvent.exists({ ticket: t!._id, step: 'approve_draft' })).toBeTruthy();
  });

  it('records edits to the draft', async () => {
    const { token } = await createUser();
    await seedOrder();
    const t = await submitAndTriage();
    await request(app).post(`/api/tickets/${t!._id}/approve`).set(auth(token)).send({ reply: 'Edited reply text for the customer.' }).expect(200);
    const ev = await AuditEvent.findOne({ ticket: t!._id, step: 'edit_and_send' });
    expect(ev?.output).toMatchObject({ edited: true });
  });

  it('escalated tickets need a take-over before replying, and only the owner can reply', async () => {
    const agentA = await createUser('agent', 'Ravi Agent');
    const agentB = await createUser('agent', 'Sana Agent');
    await seedOrder(1299, 'enterprise');
    const t = await submitAndTriage();
    expect(t?.status).toBe('escalated');

    const blocked = await request(app).post(`/api/tickets/${t!._id}/approve`).set(auth(agentA.token)).send({ reply: 'Hello there, sorting this now.' }).expect(409);
    expect(blocked.body.error.code).toBe('INVALID_STATE');

    await request(app).post(`/api/tickets/${t!._id}/take-over`).set(auth(agentA.token)).expect(200);
    await request(app).post(`/api/tickets/${t!._id}/take-over`).set(auth(agentB.token)).expect(409);
    await request(app).post(`/api/tickets/${t!._id}/approve`).set(auth(agentB.token)).send({ reply: 'Not mine to send.' }).expect(409);
    // Taken-over escalated ticket has no draft, so a reply is required.
    await request(app).post(`/api/tickets/${t!._id}/approve`).set(auth(agentA.token)).send({}).expect(400);
    const done = await request(app).post(`/api/tickets/${t!._id}/approve`).set(auth(agentA.token)).send({ reply: 'Hi Aarav, our senior team has fixed this.' }).expect(200);
    expect(done.body.ticket.status).toBe('resolved');
  });

  it('retriage is admin-only (role-based access)', async () => {
    const agent = await createUser('agent');
    const admin = await createUser('admin');
    await seedOrder(1299, 'enterprise');
    const t = await submitAndTriage();
    const denied = await request(app).post(`/api/tickets/${t!._id}/retriage`).set(auth(agent.token)).expect(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    const ok = await request(app).post(`/api/tickets/${t!._id}/retriage`).set(auth(admin.token)).expect(200);
    expect(ok.body.ticket.status).toBe('new');
  });
});

describe('evals API', () => {
  it('agents can read but not start runs; admins can start a run that completes', async () => {
    const agent = await createUser('agent');
    const admin = await createUser('admin');
    await request(app).get('/api/evals/dataset').set(auth(agent.token)).expect(200);
    await request(app).post('/api/evals/runs').set(auth(agent.token)).send({}).expect(403);

    const started = await request(app).post('/api/evals/runs').set(auth(admin.token)).send({ promptVersion: 'v1' }).expect(202);
    const id = started.body.run._id;
    let run;
    for (let i = 0; i < 50; i++) {
      run = await EvalRun.findById(id).lean();
      if (run?.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(run?.status).toBe('completed');
    expect(run?.results).toHaveLength(30);
    expect(run?.metrics?.routingAccuracy).toBeGreaterThan(0);

    const list = await request(app).get('/api/evals/runs').set(auth(agent.token)).expect(200);
    expect(list.body.runs[0]).not.toHaveProperty('results');
  });
});
