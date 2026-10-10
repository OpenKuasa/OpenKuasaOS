/**
 * "Jebat, your CMO" — a single agent that calls the read-only data tools
 * directly. Returns a `streamText` result the route turns into a UI message
 * stream (the client sees the real tool calls). Step-capped so one turn cannot
 * loop without bound.
 */

import { type ModelMessage, stepCountIs, streamText } from 'ai';
import { getModel } from '@/lib/ai/provider';
import { createReachTools } from '@/lib/ai/tools';
import type { ReachWriteContext } from '@/lib/reach/capabilities';
import type { ReachData } from '@/lib/reach/types';
import { JEBAT_SYSTEM, tuahSystem } from '@/lib/ai/agents/prompts';
import type { Screen } from '@/lib/chat/screen';

/** Tools that change data: each one pauses for the owner's approval before running. */
export const WRITE_TOOL_NAMES = [
  'createCampaign',
  'updateCampaign',
  'setCampaignStatus',
  'deleteCampaign',
  'createCreative',
  'updateCreative',
  'deleteCreative',
  'updateAdSettings',
  'createForm',
  'updateForm',
  'setFormStatus',
  'deleteForm',
] as const;

/** The marketing data an agent works on, and whether this caller may change it. */
export type ReachAccess = {
  data: ReachData;
  write?: { ctx: ReachWriteContext; canWrite: boolean };
};

/** The marketing tools for one request, shared by Jebat and Tuah. */
function reachToolkit(reach: ReachAccess) {
  const tools = createReachTools(reach.data, () => new Date(), reach.write);
  // Read tools auto-run; every write tool actually present requires approval.
  const toolApproval = reach.write?.canWrite
    ? Object.fromEntries(
        WRITE_TOOL_NAMES.filter((n) => n in tools).map((n) => [n, 'user-approval' as const]),
      )
    : undefined;
  return { tools, toolApproval };
}

export function runJebat(
  messages: ModelMessage[],
  reach: ReachAccess,
  abortSignal?: AbortSignal,
  /** A workspace's own OpenRouter key; omitted for platform-paid turns. */
  apiKey?: string,
) {
  const { tools, toolApproval } = reachToolkit(reach);
  return streamText({
    model: getModel('orchestrator', apiKey),
    system: JEBAT_SYSTEM,
    messages,
    tools,
    toolApproval,
    stopWhen: stepCountIs(8),
    maxOutputTokens: 1000,
    // Stop in-flight model/tool work if the client disconnects.
    abortSignal,
  });
}

/**
 * Tuah, the cross-app assistant on the Command page and the floating button.
 * It has the marketing tools Jebat has (lookups, and changes behind an
 * approval), runs on the same model those tools were tuned on, and says so
 * rather than inventing data from the products it cannot see yet.
 */
export function runTuah(
  messages: ModelMessage[],
  reach: ReachAccess,
  abortSignal?: AbortSignal,
  apiKey?: string,
  /** The screen the question was asked from, if it came from the floating assistant. */
  screen?: Screen | null,
) {
  const { tools, toolApproval } = reachToolkit(reach);
  return streamText({
    model: getModel('orchestrator', apiKey),
    system: tuahSystem(screen),
    messages,
    tools,
    toolApproval,
    stopWhen: stepCountIs(8),
    maxOutputTokens: 1000,
    abortSignal,
  });
}
