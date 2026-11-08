import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SarvamProvider } from '../src/llm/sarvam.js';
import { completeJson, extractJsonObject } from '../src/llm/json.js';
import { LlmError, type LlmProvider, type LlmRequest } from '../src/llm/types.js';

const req: LlmRequest = { task: 'classify', json: true, messages: [{ role: 'user', content: '{}' }] };

function okResponse(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SarvamProvider', () => {
  const noSleep = async () => {};

  it('sends the subscription key header and parses the reply', async () => {
    const fetchImpl = vi.fn(async () => okResponse('{"a":1}'));
    const p = new SarvamProvider({ apiKey: 'k-123', fetchImpl, sleep: noSleep });
    const res = await p.complete(req);
    expect(res.text).toBe('{"a":1}');
    expect(res.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.sarvam.ai/v1/chat/completions');
    expect((init.headers as Record<string, string>)['api-subscription-key']).toBe('k-123');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'sarvam-105b', response_format: { type: 'json_object' } });
  });

  it('retries on 429 and 5xx, then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(new Response('oops', { status: 503 }))
      .mockResolvedValueOnce(okResponse('{"ok":true}'));
    const p = new SarvamProvider({ apiKey: 'k', fetchImpl, sleep: noSleep, maxRetries: 2 });
    await expect(p.complete(req)).resolves.toMatchObject({ text: '{"ok":true}' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not retry other 4xx errors', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad key', { status: 403 }));
    const p = new SarvamProvider({ apiKey: 'k', fetchImpl, sleep: noSleep });
    await expect(p.complete(req)).rejects.toMatchObject({ status: 403, retryable: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up after max retries on timeouts', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    const p = new SarvamProvider({ apiKey: 'k', fetchImpl, sleep: noSleep, maxRetries: 1, timeoutMs: 5 });
    await expect(p.complete(req)).rejects.toThrow(/timed out/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('completeJson', () => {
  const schema = z.object({ category: z.enum(['billing', 'order']) });

  function scripted(...replies: string[]): LlmProvider & { calls: LlmRequest[] } {
    const calls: LlmRequest[] = [];
    return {
      name: 'scripted',
      model: 'test',
      calls,
      async complete(r) {
        calls.push(r);
        return { text: replies[calls.length - 1], usage: { promptTokens: 1, completionTokens: 1 }, latencyMs: 1 };
      },
    };
  }

  it('strips <think> blocks and code fences', () => {
    expect(extractJsonObject('<think>hmm {not this}</think>\n```json\n{"x":2}\n```')).toEqual({ x: 2 });
  });

  it('retries once with the validation error, then succeeds', async () => {
    const p = scripted('{"category":"refunds"}', '{"category":"billing"}');
    const res = await completeJson(p, req, schema);
    expect(res.data).toEqual({ category: 'billing' });
    expect(res.attempts).toBe(2);
    expect(res.usage.promptTokens).toBe(2);
    expect(p.calls[1].messages.at(-1)?.content).toMatch(/not valid/);
  });

  it('throws after two invalid replies', async () => {
    const p = scripted('not json', '{"category":42}');
    await expect(completeJson(p, req, schema)).rejects.toBeInstanceOf(LlmError);
  });
});
