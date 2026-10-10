/**
 * "Jebat, your CMO" — a single agent that calls the read-only data tools
 * directly. Returns a `streamText` result the route turns into a UI message
 * stream (the client sees the real tool calls). Step-capped so one turn cannot
 * loop without bound.
 */

import { type ModelMessage, stepCountIs, streamText } from 'ai';
import { logModelCall } from '@/lib/ai/call-log';
import { getModel, pickModelId } from '@/lib/ai/provider';
import type { CrmAccess } from '@/lib/ai/crm-tools';
import {
  REACH_WRITE_TOOL_NAMES,
  combineToolkits,
  crmProduct,
  reachProduct,
  type ReachAccess,
} from '@/lib/ai/products';
import { JEBAT_SYSTEM, KASTURI_SYSTEM, tuahSystem, tuahTeamSystem } from '@/lib/ai/agents/prompts';
import { createTeamTools, type TeamContext } from '@/lib/ai/agents/specialists';
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
    onLanguageModelCallEnd: logModelCall('jebat', pickModelId('orchestrator')),
    stopWhen: stepCountIs(8),
    maxOutputTokens: 1000,
    // Stop in-flight model/tool work if the client disconnects.
    abortSignal,
  });
}

/**
 * "Kasturi, your sales co-pilot": the same single agent as Jebat, holding the
 * CRM tools instead of the marketing ones. Lookups run on their own; each
 * change waits for the owner's approval.
 */
export function runKasturi(
  messages: ModelMessage[],
  crm: CrmAccess,
  abortSignal?: AbortSignal,
  /** A workspace's own OpenRouter key; omitted for platform-paid turns. */
  apiKey?: string,
) {
  const { tools, toolApproval } = combineToolkits([crmProduct(crm)]);
  return streamText({
    model: getModel('orchestrator', apiKey),
    system: KASTURI_SYSTEM,
    messages,
    tools,
    toolApproval,
    onLanguageModelCallEnd: logModelCall('kasturi', pickModelId('orchestrator')),
    // A CRM change often needs two lookups first (the contact, then the stage).
    stopWhen: stepCountIs(10),
    maxOutputTokens: 1000,
    abortSignal,
  });
}

/** What each specialist is for, as Tuah's instructions put it. */
const TEAM_AREA = {
  reach:
    'marketing: ads and campaigns, spend, leads (finding, adding and editing them, and promoting a lead to a CRM contact), lead forms, creatives, appointments and ad settings',
  crm: 'the CRM: contacts, deals, pipelines and their stages. A lead is not a contact yet: anything about a lead goes to Jebat',
} as const;

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
  /**
   * Set to run Tuah with its team: it asks a specialist per product and
   * carries out what they prepare, instead of holding every tool itself.
   */
  team?: Omit<TeamContext, 'apiKey'> | null,
) {
  // Every product the user can reach: marketing always, the CRM in a workspace.
  const products = [reachProduct(reach), ...(crm ? [crmProduct(crm)] : [])];
  const teamTools = team ? createTeamTools(products, { ...team, apiKey }) : null;
  const { tools, toolApproval } = teamTools ?? combineToolkits(products);
  const system = team
    ? tuahTeamSystem(
        products.map((p) => ({ name: p.name, area: TEAM_AREA[p.key] })),
        toolApproval !== undefined,
        screen,
      )
    : tuahSystem(screen);
  return streamText({
    model: getModel('orchestrator', apiKey),
    system,
    messages,
    tools,
    toolApproval,
    prepareStep: teamTools?.prepareStep as never,
    onLanguageModelCallEnd: logModelCall(team ? 'tuah-team' : 'tuah', pickModelId('orchestrator')),
    // A CRM change often needs two lookups first (the contact, then the stage).
    stopWhen: stepCountIs(10),
    maxOutputTokens: 1000,
    abortSignal,
  });
}
