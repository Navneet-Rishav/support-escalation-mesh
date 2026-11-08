import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { getLlmProvider } from '../llm/index.js';
import { PROMPT_VERSIONS } from '../agents/prompts.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { evalLimiter } from '../middleware/rateLimits.js';
import { parse } from '../middleware/validate.js';
import { EvalRun } from '../models/EvalRun.js';
import { EVAL_CASES } from '../evals/dataset.js';
import { executeEvalRun } from '../evals/runner.js';

export const evalsRouter = Router();
evalsRouter.use(requireAuth);

/** The labelled ticket set, so the console can show what is being measured. */
evalsRouter.get('/dataset', (_req, res) => {
  res.json({ cases: EVAL_CASES.map(({ id, language, subject, body, customer, expected }) => ({ id, language, subject, body, tier: customer.tier, expected })) });
});

evalsRouter.get('/runs', async (_req, res) => {
  const runs = await EvalRun.find().sort({ createdAt: -1 }).limit(50).select('-results').lean();
  res.json({ runs });
});

evalsRouter.get('/runs/:id', async (req, res) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw notFound('Eval run');
  const run = await EvalRun.findById(req.params.id).lean();
  if (!run) throw notFound('Eval run');
  res.json({ run });
});

const StartRunBody = z.object({
  promptVersion: z.enum(PROMPT_VERSIONS).default('v2'),
  label: z.string().trim().max(80).optional(),
});

/** Admin only and rate-limited: a run makes ~90 LLM calls. Runs in the background; poll GET /runs/:id. */
evalsRouter.post('/runs', requireRole('admin'), evalLimiter, async (req, res) => {
  const body = parse(StartRunBody, req.body ?? {});
  const llm = getLlmProvider();
  const run = await EvalRun.create({
    label: body.label || `${llm.name}/${llm.model} · prompt ${body.promptVersion}`,
    promptVersion: body.promptVersion,
    provider: llm.name,
    model: llm.model,
    createdBy: new Types.ObjectId(req.user!.id),
    createdByName: req.user!.name,
  });
  void executeEvalRun(String(run._id), llm, body.promptVersion);
  res.status(202).json({ run });
});
