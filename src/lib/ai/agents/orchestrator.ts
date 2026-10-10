/**
 * "Jebat, your CMO" — a single agent that calls the read-only data tools
 * directly. Returns a `streamText` result the route turns into a UI message
 * stream (the client sees the real tool calls). Step-capped so one turn cannot
 * loop without bound.
 */

import { type ModelMessage, stepCountIs, streamText } from 'ai';
import { getModel } from '@/lib/ai/provider';
import { createReachTools } from '@/lib/ai/tools';
import type { ReachData } from '@/lib/reach/types';
import { JEBAT_SYSTEM, TUAH_SYSTEM } from '@/lib/ai/agents/prompts';

export function runJebat(
  messages: ModelMessage[],
  data: ReachData,
  abortSignal?: AbortSignal,
  /** A workspace's own OpenRouter key; omitted for platform-paid turns. */
  apiKey?: string,
) {
  return streamText({
    model: getModel('orchestrator', apiKey),
    system: JEBAT_SYSTEM,
    messages,
    tools: createReachTools(data),
    stopWhen: stepCountIs(8),
    maxOutputTokens: 1000,
    // Stop in-flight model/tool work if the client disconnects.
    abortSignal,
  });
}

/**
 * Tuah, the cross-app assistant on the Command page and the floating button.
 * No tools yet: it explains and advises, and says so rather than inventing
 * workspace data.
 */
export function runTuah(
  messages: ModelMessage[],
  abortSignal?: AbortSignal,
  apiKey?: string,
) {
  return streamText({
    model: getModel('worker', apiKey),
    system: TUAH_SYSTEM,
    messages,
    maxOutputTokens: 800,
    abortSignal,
  });
}
