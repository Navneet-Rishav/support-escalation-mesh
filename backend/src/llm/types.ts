/**
 * The provider interface every LLM client implements. The agent graph only depends on this,
 * so Sarvam can be swapped for another provider (or the fake one in tests) without touching agent code.
 */

/** Which agent step is calling. Real providers ignore it; the fake provider uses it to pick a response. */
export type LlmTask = 'classify' | 'specialist' | 'draft';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  task: LlmTask;
  messages: LlmMessage[];
  /** Ask the provider for a JSON object response. */
  json: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LlmResponse {
  text: string;
  usage: LlmUsage;
  latencyMs: number;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
