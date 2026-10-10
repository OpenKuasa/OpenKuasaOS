/**
 * "Jebat, your CMO" — a single agent that calls the read-only data tools
 * directly. Returns a `streamText` result the route turns into a UI message
 * stream (the client sees the real tool calls). Step-capped so one turn cannot
 * loop without bound.
 */

import { type ModelMessage, stepCountIs, streamText } from 'ai';
import { getModel } from '@/lib/ai/provider';
import type { CrmAccess } from '@/lib/ai/crm-tools';
import {
  REACH_WRITE_TOOL_NAMES,
  combineToolkits,
  crmProduct,
  reachProduct,
  type ReachAccess,
} from '@/lib/ai/products';
import { JEBAT_SYSTEM, tuahSystem } from '@/lib/ai/agents/prompts';
import type { Screen } from '@/lib/chat/screen';

/** Tools that change data: each one pauses for the owner's approval before running. */
export const WRITE_TOOL_NAMES = REACH_WRITE_TOOL_NAMES;

export type { ReachAccess };

export function runJebat(
  messages: ModelMessage[],
  reach: ReachAccess,
  abortSignal?: AbortSignal,
  /** A workspace's own OpenRouter key; omitted for platform-paid turns. */
  apiKey?: string,
) {
  const { tools, toolApproval } = combineToolkits([reachProduct(reach)]);
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
 * It has the marketing tools Jebat has and Kasturi's CRM tools (lookups, and
 * changes behind an approval), runs on the model those rules were tuned on,
 * and says so rather than inventing data from the products it cannot see yet.
 */
export function runTuah(
  messages: ModelMessage[],
  reach: ReachAccess,
  abortSignal?: AbortSignal,
  apiKey?: string,
  /** The screen the question was asked from, if it came from the floating assistant. */
  screen?: Screen | null,
  /** The workspace's CRM, when the user is in one. */
  crm?: CrmAccess | null,
) {
  // Every product the user can reach: marketing always, the CRM in a workspace.
  const { tools, toolApproval } = combineToolkits([
    reachProduct(reach),
    ...(crm ? [crmProduct(crm)] : []),
  ]);
  return streamText({
    model: getModel('orchestrator', apiKey),
    system: tuahSystem(screen),
    messages,
    tools,
    toolApproval,
    // A CRM change often needs two lookups first (the contact, then the stage).
    stopWhen: stepCountIs(10),
    maxOutputTokens: 1000,
    abortSignal,
  });
}
