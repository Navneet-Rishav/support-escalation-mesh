import { config } from '../config.js';
import { FakeProvider } from './fake.js';
import { SarvamProvider } from './sarvam.js';
import type { LlmProvider } from './types.js';

let provider: LlmProvider | undefined;

/** The configured provider (LLM_PROVIDER=fake|sarvam), created once. */
export function getLlmProvider(): LlmProvider {
  if (!provider) {
    provider =
      config.LLM_PROVIDER === 'sarvam'
        ? new SarvamProvider({
            apiKey: config.SARVAM_API_KEY!,
            model: config.SARVAM_MODEL,
            reasoningEffort: config.SARVAM_REASONING_EFFORT,
            classifyModel: config.SARVAM_CLASSIFY_MODEL,
          })
        : new FakeProvider();
  }
  return provider;
}

/** Tests use this to plug in a scripted provider. */
export function setLlmProvider(p: LlmProvider | undefined): void {
  provider = p;
}
