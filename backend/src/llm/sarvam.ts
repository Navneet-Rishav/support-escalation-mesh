import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from './types.js';

export interface SarvamOptions {
  apiKey: string;
  model?: string;
  /**
   * Sent as `reasoning_effort` with the main model (Sarvam docs: none | low | medium | high | max).
   * Unset = the API default. Reasoning tokens count toward max_tokens and add most of the latency.
   */
  reasoningEffort?: ReasoningEffort;
  /** Optional faster model for the classifier step only, e.g. the non-reasoning `sarvam-105b-conversations`. */
  classifyModel?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Injected in tests so no real HTTP call is made. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export const REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'max'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Sarvam chat completions (OpenAI-compatible): POST {baseUrl}/v1/chat/completions
 * with the `api-subscription-key` header. Retries on 429, 5xx, network errors and timeouts
 * with exponential backoff; other 4xx errors fail immediately.
 */
export class SarvamProvider implements LlmProvider {
  readonly name = 'sarvam';
  /** Human-readable configuration label, stored on tickets and eval runs (e.g. "sarvam-105b · effort low"). */
  readonly model: string;
  private readonly mainModel: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: SarvamOptions) {
    this.mainModel = opts.model ?? 'sarvam-105b';
    this.model = [
      this.mainModel,
      opts.reasoningEffort ? `effort ${opts.reasoningEffort}` : null,
      opts.classifyModel ? `classify ${opts.classifyModel}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    this.baseUrl = (opts.baseUrl ?? 'https://api.sarvam.ai').replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const useClassifyModel = req.task === 'classify' && !!this.opts.classifyModel;
    const body = {
      model: useClassifyModel ? this.opts.classifyModel : this.mainModel,
      // reasoning_effort only goes with the main (reasoning) model; the classify override may not support it.
      ...(this.opts.reasoningEffort && !useClassifyModel ? { reasoning_effort: this.opts.reasoningEffort } : {}),
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 2048,
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    };

    let lastError: LlmError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await this.sleep(lastError?.status === 429 ? 2000 * attempt : 500 * 2 ** attempt);
      const started = Date.now();
      try {
        const res = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'api-subscription-key': this.opts.apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!res.ok) {
          const detail = (await res.text().catch(() => '')).slice(0, 300);
          const retryable = res.status === 429 || res.status >= 500;
          lastError = new LlmError(`Sarvam returned HTTP ${res.status}: ${detail}`, retryable, res.status);
          if (retryable) continue;
          throw lastError;
        }

        const json = (await res.json()) as ChatCompletionResponse;
        const text = json.choices?.[0]?.message?.content;
        if (!text) {
          lastError = new LlmError('Sarvam returned an empty message', true);
          continue;
        }
        return {
          text,
          latencyMs: Date.now() - started,
          usage: {
            promptTokens: json.usage?.prompt_tokens ?? 0,
            completionTokens: json.usage?.completion_tokens ?? 0,
          },
        };
      } catch (err) {
        if (err instanceof LlmError && !err.retryable) throw err;
        if (err instanceof LlmError) {
          lastError = err;
          continue;
        }
        // Network failure or timeout (AbortSignal.timeout throws a TimeoutError DOMException).
        const name = (err as Error).name;
        lastError = new LlmError(
          name === 'TimeoutError' ? `Sarvam request timed out after ${this.timeoutMs} ms` : `Network error: ${(err as Error).message}`,
          true,
        );
      }
    }
    throw lastError ?? new LlmError('Sarvam request failed', true);
  }
}
