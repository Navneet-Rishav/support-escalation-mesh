import { config } from '../config.js';
import { getLlmProvider } from '../llm/index.js';
import { PROMPT_VERSIONS, type PromptVersion } from '../agents/prompts.js';
import { evaluateAll } from '../evals/runner.js';
import { computeMetrics } from '../evals/metrics.js';

/**
 * Runs the labelled eval set from the command line (no database needed) and prints the metrics.
 * Usage: npm run eval -- v2        (uses LLM_PROVIDER from .env)
 */
async function main() {
  const arg = process.argv[2] ?? 'v2';
  if (!PROMPT_VERSIONS.includes(arg as PromptVersion)) throw new Error(`Unknown prompt version ${arg}`);
  const llm = getLlmProvider();
  console.log(`Running ${llm.name}/${llm.model} with prompt ${arg}...`);
  const results = await evaluateAll(llm, arg as PromptVersion);
  const metrics = computeMetrics(results, config.LLM_COST_PER_1K_TOKENS_INR);

  console.table(
    results.map((r) => ({
      case: r.caseId,
      lang: r.language,
      expected: r.expectedCategory,
      got: r.predictedCategory,
      escExp: r.expectedEscalate,
      esc: r.escalated,
      reasons: r.reasons.join(','),
      violations: r.violations.join(','),
      ms: r.latencyMs,
      err: r.error ?? '',
    })),
  );
  console.log(JSON.stringify(metrics, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
