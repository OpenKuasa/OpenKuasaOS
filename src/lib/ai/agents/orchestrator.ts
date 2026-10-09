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
import { JEBAT_SYSTEM } from '@/lib/ai/agents/prompts';

export function runJebat(
  messages: ModelMessage[],
  data: ReachData,
  abortSignal?: AbortSignal,
) {
  return streamText({
    model: getModel('orchestrator'),
    system: JEBAT_SYSTEM,
    messages,
    tools: createReachTools(data),
    stopWhen: stepCountIs(8),
    maxOutputTokens: 1000,
    // Stop in-flight model/tool work if the client disconnects.
    abortSignal,
  });
}
