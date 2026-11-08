import type { z } from 'zod';
import { LlmError, type LlmProvider, type LlmRequest, type LlmUsage } from './types.js';

/**
 * Pulls the JSON object out of a model reply. Reasoning models can wrap the answer in <think> blocks
 * or code fences, so take the outermost {...}.
 */
export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new SyntaxError('No JSON object found in model output');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export interface JsonResult<T> {
  data: T;
  usage: LlmUsage;
  latencyMs: number;
  attempts: number;
}

/**
 * Calls the model, parses the JSON and validates it with Zod.
 * If the output is invalid, it retries once and tells the model what was wrong.
 */
export async function completeJson<T>(provider: LlmProvider, req: LlmRequest, schema: z.ZodType<T>): Promise<JsonResult<T>> {
  const usage: LlmUsage = { promptTokens: 0, completionTokens: 0 };
  let latencyMs = 0;
  let messages = req.messages;
  let lastError = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await provider.complete({ ...req, messages, json: true });
    usage.promptTokens += res.usage.promptTokens;
    usage.completionTokens += res.usage.completionTokens;
    latencyMs += res.latencyMs;

    try {
      const parsed = schema.safeParse(extractJsonObject(res.text));
      if (parsed.success) return { data: parsed.data, usage, latencyMs, attempts: attempt };
      lastError = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    } catch (err) {
      lastError = (err as Error).message;
    }

    messages = [
      ...req.messages,
      { role: 'assistant', content: res.text },
      {
        role: 'user',
        content: `Your previous reply was not valid for the required JSON schema (${lastError}). Reply again with only the corrected JSON object.`,
      },
    ];
  }
  throw new LlmError(`Model returned invalid JSON twice: ${lastError}`, false);
}
