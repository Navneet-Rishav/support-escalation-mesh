# Support Escalation Mesh

> 🛠️ **In progress.** A MERN support desk for "Bazaarly", a fictional Indian marketplace: an Express + TypeScript REST API with JWT auth and role-based access, a React agent console with human approval, and AI ticket routing where code, not the model, enforces the rules.

This README will be completed with a live demo link, screenshots and setup steps as the project ships.

## What works so far
- **REST API** (Express 5 + TypeScript): JWT auth with bcrypt-hashed passwords, `agent` / `admin` roles, Zod validation on every input, one consistent JSON error shape, request-ID logging, `/healthz`, per-IP and per-user rate limits.
- **MongoDB + Mongoose** models: users, customers, orders, tickets, audit events, eval runs.
- **Ticket intake** by web form or email-style JSON; a MongoDB-backed queue with an in-process worker (atomic claim, retries, stale-job recovery).
- **Triage graph** (LangGraph.js): classifier → specialist agent (billing / order / technical / account) → policy check in code → reply drafter → draft check in code. Every step is written to an audit trail with latency and tokens.
- **Guardrails in code**: refund limits, mandatory escalation for legal threats, abuse, enterprise customers and high-value orders, SLA timers.
- **Human in the loop**: approve or edit the AI draft, or take over the ticket.
- **Evals**: 30 labelled English/Hinglish/Hindi tickets; routing accuracy, escalation precision/recall, policy-violation rate, latency and tokens.
- **Tests**: 64 Vitest + Supertest tests against a real in-memory MongoDB. CI never calls a paid API (a fake LLM provider is used).
