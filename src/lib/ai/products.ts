/**
 * The products Tuah works across, each as one toolkit: what it can look up,
 * and what it can change. An agent is put together from these, so adding a
 * product means adding one entry here rather than touching every agent.
 *
 * `read` tools run on their own. `write` tools change data, and every agent
 * built from a toolkit asks for the user's approval before running one; that
 * rule is taken from which side a tool is on, never from a list kept elsewhere.
 */

import type { ToolSet } from 'ai';
import { CRM_WRITE_TOOL_NAMES, createCrmTools, type CrmAccess } from '@/lib/ai/crm-tools';
import { createReachTools } from '@/lib/ai/tools';
import type { ReachWriteContext } from '@/lib/reach/capabilities';
import type { ReachData } from '@/lib/reach/types';

/** The marketing data an agent works on, and whether this caller may change it. */
export type ReachAccess = {
  data: ReachData;
  write?: { ctx: ReachWriteContext; canWrite: boolean };
};

/** Marketing tools that change data. */
export const REACH_WRITE_TOOL_NAMES = [
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
  'createLead',
  'updateLead',
  'setLeadStage',
  'deleteLead',
  'promoteLeadToContact',
  'createAppointment',
  'updateAppointment',
  'setAppointmentStatus',
  'deleteAppointment',
] as const;

export type ProductKey = 'reach' | 'crm';

export type ProductToolkit = {
  /** The product's route segment, as in the navigation. */
  key: ProductKey;
  /** The name its assistant goes by. */
  name: string;
  /** Lookups: run without asking. */
  read: ToolSet;
  /** Changes: each waits for the user's approval. Empty for someone who may not change anything. */
  write: ToolSet;
};

function split(all: ToolSet, writeNames: readonly string[]): Pick<ProductToolkit, 'read' | 'write'> {
  const read: ToolSet = {};
  const write: ToolSet = {};
  for (const [name, tool] of Object.entries(all)) {
    (writeNames.includes(name) ? write : read)[name] = tool;
  }
  return { read, write };
}

/** Jebat: ads, leads, lead forms, creatives and ad settings. */
export function reachProduct(reach: ReachAccess): ProductToolkit {
  const all = createReachTools(reach.data, () => new Date(), reach.write);
  return { key: 'reach', name: 'Jebat', ...split(all, REACH_WRITE_TOOL_NAMES) };
}

/** Kasturi: CRM contacts, deals and pipelines. */
export function crmProduct(crm: CrmAccess): ProductToolkit {
  return { key: 'crm', name: 'Kasturi', ...split(createCrmTools(crm), CRM_WRITE_TOOL_NAMES) };
}

/**
 * One agent's tools from several products. Two products must not use the same
 * tool name: the second would silently replace the first.
 */
export function combineToolkits(products: ProductToolkit[]): {
  tools: ToolSet;
  toolApproval: Record<string, 'user-approval'> | undefined;
} {
  const tools: ToolSet = {};
  const toolApproval: Record<string, 'user-approval'> = {};
  for (const product of products) {
    for (const [name, tool] of Object.entries({ ...product.read, ...product.write })) {
      if (name in tools) throw new Error(`Two products both have a tool called ${name}.`);
      tools[name] = tool;
    }
    for (const name of Object.keys(product.write)) toolApproval[name] = 'user-approval';
  }
  return {
    tools,
    toolApproval: Object.keys(toolApproval).length > 0 ? toolApproval : undefined,
  };
}
