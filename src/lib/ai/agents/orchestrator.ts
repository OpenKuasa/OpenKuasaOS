/**
 * Layer-1 orchestrator — "Jebat, your CMO".
 *
 * Plans and delegates to the specialist sub-agents (agents-as-tools); it never
 * touches the data directly. Returns a `streamText` result the route turns into
 * a UI message stream. Step-capped so a single turn cannot fan out without bound.
 */

import { type ModelMessage, stepCountIs, streamText } from 'ai';
import { getModel } from '@/lib/ai/provider';
import { createReachTools } from '@/lib/ai/tools';
import type { ReachData } from '@/lib/reach/types';
import { JEBAT_SYSTEM } from '@/lib/ai/agents/prompts';
import {
  createAnalystTool,
  createCopywriterTool,
  createOptimizerTool,
} from '@/lib/ai/agents/sub-agents';

export function runJebat(
  messages: ModelMessage[],
  data: ReachData,
  abortSignal?: AbortSignal,
) {
  const reachTools = createReachTools(data);
  return streamText({
    model: getModel('orchestrator'),
    system: JEBAT_SYSTEM,
    messages,
    tools: {
      consultAnalyst: createAnalystTool(reachTools),
      consultOptimizer: createOptimizerTool(),
      consultCopywriter: createCopywriterTool(),
    },
    // Enough to consult one or two specialists and then answer.
    stopWhen: stepCountIs(6),
    maxOutputTokens: 1200,
    // Stop the whole fan-out (including in-flight sub-agent calls) if the
    // client disconnects — otherwise the expensive leaf calls keep spending.
    abortSignal,
  });
}
