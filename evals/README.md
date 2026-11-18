# Evals

Where to find everything behind the eval numbers in the main README.

| What | Where |
|---|---|
| The 30 labelled tickets (20 English, 8 Hinglish, 2 Hindi; 12 should escalate) | [`backend/src/evals/dataset.ts`](../backend/src/evals/dataset.ts) |
| How a run works (each ticket goes through the real triage graph and guardrails) | [`backend/src/evals/runner.ts`](../backend/src/evals/runner.ts) |
| How the metrics are computed (routing accuracy, escalation precision/recall, violations, p95) | [`backend/src/evals/metrics.ts`](../backend/src/evals/metrics.ts) |
| **Stored results, one row per ticket** | [`results/`](results/) |

## Results in this folder

- [`2026-11-10-sarvam-105b-prompt-v1.md`](results/2026-11-10-sarvam-105b-prompt-v1.md) (+ [raw JSON](results/2026-11-10-sarvam-105b-prompt-v1.json)): Sarvam `sarvam-105b`, prompt v1. Routing 100% (30/30), escalation precision/recall 92.3% / 100%, 0% draft violations. Exported unchanged from the run stored in the live Evals tab.

Not here:
- **The fake keyword provider's score** (routing 90%) only proves the pipeline runs end to end; it was written next to the dataset, so it isn't a model number.
- **The latency experiment** (reasoning effort low + a non-reasoning classifier, 10 Nov) was a one-off command-line run that wasn't stored. Its numbers are in the main README and `docs/DECISIONS.md` §17.

## Run it yourself

```bash
npm --prefix backend run eval -- v1   # uses LLM_PROVIDER from backend/.env ("fake" by default, "sarvam" needs SARVAM_API_KEY)
```

Admins can also start a run from the **Evals** tab in the live demo (rate-limited) and compare two runs side by side.
