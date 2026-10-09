/**
 * LLM provider factory for the Ask-Jebat agent.
 *
 * Provider-agnostic by design (AGPL self-hosters swap with env alone): OpenRouter
 * is the default — one key, any model — with the model chosen *per layer* so the
 * orchestrator can run a strong model while sub-agents run a cheap/fast one.
 *
 * The provider instance is created lazily, so importing this module never throws
 * when `OPENROUTER_API_KEY` is unset (keeps builds and unit tests key-free).
 */

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';

export type AgentLayer = 'orchestrator' | 'worker';

/** Fallbacks used only when the per-layer env var is unset. Override via env; exact slugs at https://openrouter.ai/models */
const FALLBACK_MODEL: Record<AgentLayer, string> = {
  orchestrator: 'anthropic/claude-sonnet-4.5',
  worker: 'anthropic/claude-haiku-4.5',
};

type EnvLike = Record<string, string | undefined>;

/** Pure model-id resolution (env → fallback), extracted for unit testing. */
export function pickModelId(layer: AgentLayer, env: EnvLike = process.env): string {
  const fromEnv =
    layer === 'orchestrator'
      ? env.OPENKUASA_MODEL_ORCHESTRATOR
      : env.OPENKUASA_MODEL_WORKER;
  return fromEnv?.trim() || FALLBACK_MODEL[layer];
}

/** True when a provider key is configured — lets the route return a clean 503 instead of crashing. */
export function hasProviderKey(env: EnvLike = process.env): boolean {
  return Boolean(env.OPENROUTER_API_KEY?.trim());
}

let provider: ReturnType<typeof createOpenRouter> | null = null;

function getProvider() {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new Error('OPENROUTER_API_KEY is not set — Ask-Jebat cannot reach the model.');
  }
  if (!provider) {
    provider = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
      // Optional second intermediary (Cloudflare AI Gateway); off unless configured.
      baseURL: process.env.AI_GATEWAY_BASE_URL?.trim() || undefined,
      appName: 'OpenKuasa OS',
      appUrl: 'https://openkuasa.com',
    });
  }
  return provider;
}

/** The model for a given agent layer. */
export function getModel(layer: AgentLayer): LanguageModel {
  return getProvider()(pickModelId(layer));
}
