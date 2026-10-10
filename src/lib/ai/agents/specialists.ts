/**
 * Tuah's team. Tuah itself holds almost no tools: it asks a specialist per
 * product (`askJebat`, `askKasturi`) and carries out what they prepare
 * (`applyChange`). A specialist runs on the cheaper model with its product's
 * lookups, and with "prepare" versions of its change tools: same inputs, but
 * they save nothing and hand back a proposal.
 *
 * The AI SDK does not allow an approval inside a sub-agent, so the approval
 * lives on Tuah: `applyChange` is the only tool that asks for one, and it is
 * the only place a real change tool is ever run.
 */

import { stepCountIs, streamText, tool, type Tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { subAgentSystem } from '@/lib/ai/agents/prompts';
import type { ProductToolkit } from '@/lib/ai/products';
import { getModel } from '@/lib/ai/provider';
import {
  approvalDetail,
  approvalTitle,
  collectNames,
  nameIn,
  type ItemKind,
  type KnownNames,
  type ToolResult,
} from '@/lib/chat/change-titles';
import {
  APPLY_TOOL,
  ASK_PREFIX,
  type AgentStep,
  type Delegation,
  type Proposal,
} from '@/lib/chat/delegation';

export type TeamContext = {
  /** A workspace's own OpenRouter key; omitted for platform-paid turns. */
  apiKey?: string;
  /** The conversation so far, in words, for specialists that only see their task. */
  transcript: string;
  /** Changes prepared earlier in the conversation, by id. New ones are added here. */
  proposals: Map<string, Proposal>;
  /** Names of rows the conversation has come across, by `kind:id`. Added to as it goes. */
  names?: KnownNames;
};

type Execute = (input: unknown, options: unknown) => unknown;
const executeOf = (t: Tool): Execute | undefined =>
  (t as { execute?: Execute }).execute?.bind(t);

/** What a specialist reports back, as Tuah's model reads it. */
export function delegationForModel(output: Delegation): string {
  if (output.status === 'failed') {
    return `${output.agent} could not finish. ${output.answer}`.trim();
  }
  const lines = [output.answer.trim() || `${output.agent} finished without a report.`];
  if (output.proposals.length > 0) {
    lines.push(
      '',
      'Prepared changes, not saved yet. Call applyChange with the id to put each in front of the user:',
      ...output.proposals.map((p) => `- proposalId ${p.id}: ${p.title}`),
    );
  }
  return lines.join('\n');
}

/** A specialist's tools: its lookups as they are, and its changes as proposals. */
function specialistTools(
  product: ProductToolkit,
  team: TeamContext,
  results: ToolResult[],
  prepared: Proposal[],
): ToolSet {
  const tools: ToolSet = {};

  for (const [name, lookup] of Object.entries(product.read)) {
    const run = executeOf(lookup);
    tools[name] = {
      ...lookup,
      // Remembered so a prepared change can be worded with the item's name.
      execute: async (input: unknown, options: unknown) => {
        const output = await run?.(input, options);
        results.push({ tool: name, output });
        return output;
      },
    } as Tool;
  }

  for (const [name, change] of Object.entries(product.write)) {
    tools[name] = tool({
      description:
        `${change.description ?? name} ` +
        'Calling this only PREPARES the change: the user is shown an Approve card and nothing is saved until they approve.',
      inputSchema: change.inputSchema as z.ZodType,
      execute: async (input: unknown) => {
        const proposal: Proposal = {
          id: crypto.randomUUID().slice(0, 8),
          product: product.key,
          action: name,
          input,
          // Named from what this specialist just looked up, else from earlier turns.
          title: approvalTitle(
            name,
            input,
            (id: unknown, kind?: ItemKind) =>
              nameIn(results)(id, kind) ??
              (kind && typeof id === 'string' ? (team.names?.[`${kind}:${id}`] ?? null) : null),
          ),
          detail: approvalDetail(name),
        };
        team.proposals.set(proposal.id, proposal);
        prepared.push(proposal);
        return { prepared: true, proposalId: proposal.id, card: proposal.title };
      },
    });
  }
  return tools;
}

/** The tool Tuah uses to hand a task to one specialist. */
function askTool(product: ProductToolkit, team: TeamContext): Tool {
  const canChange = Object.keys(product.write).length > 0;
  return tool({
    description:
      `Ask ${product.name}, the specialist for ${AREA[product.key]}, to look things up` +
      (canChange ? ' or to prepare a change' : '') +
      `. ${product.name} does not see this conversation: give a complete task, with the names, ` +
      'amounts and details the user gave.',
    inputSchema: z.object({
      task: z.string().min(1).describe('What to find out or prepare, in full.'),
    }),
    execute: async function* ({ task }, { abortSignal }) {
      const steps: AgentStep[] = [];
      const prepared: Proposal[] = [];
      const results: ToolResult[] = [];
      let answer = '';
      const snapshot = (status: Delegation['status']): Delegation => ({
        agent: product.name,
        product: product.key,
        status,
        steps: steps.map((step) => ({ ...step })),
        answer,
        proposals: [...prepared],
        ...(status === 'working' ? {} : { names: collectNames(results) }),
      });

      yield snapshot('working');
      try {
        const result = streamText({
          model: getModel('worker', team.apiKey),
          system: subAgentSystem(product.key, canChange),
          prompt:
            (team.transcript ? `The conversation so far:\n${team.transcript}\n\n` : '') +
            `Task from Tuah: ${task}`,
          tools: specialistTools(product, team, results, prepared),
          stopWhen: stepCountIs(8),
          maxOutputTokens: 900,
          abortSignal,
        });
        for await (const part of result.fullStream) {
          if (part.type === 'tool-call') {
            steps.push({ tool: part.toolName, done: false });
            // Words said before a lookup are not the report.
            answer = '';
            yield snapshot('working');
          } else if (part.type === 'tool-result' || part.type === 'tool-error') {
            const open = steps.find((step) => step.tool === part.toolName && !step.done);
            if (open) open.done = true;
            yield snapshot('working');
          } else if (part.type === 'text-delta') {
            answer += part.text;
          } else if (part.type === 'error') {
            throw part.error;
          }
        }
        yield snapshot('done');
      } catch (error) {
        console.error(
          `[tuah] ${product.name} could not finish:`,
          error instanceof Error ? error.message : error,
        );
        answer = 'Something went wrong while working on this. Try again in a moment.';
        yield snapshot('failed');
      }
    },
    toModelOutput: ({ output }) => ({
      type: 'text',
      value: delegationForModel(output as Delegation),
    }),
  }) as Tool;
}

const AREA: Record<ProductToolkit['key'], string> = {
  reach: 'marketing (ads, campaigns, creatives, leads, lead forms, appointments, ad settings)',
  crm: 'the CRM (contacts, deals, pipelines and their stages)',
};

/** Runs a prepared change through the product's own change tool, after checking its input again. */
async function apply(
  products: ProductToolkit[],
  team: TeamContext,
  proposal: Proposal | undefined,
  options: unknown,
): Promise<unknown> {
  if (!proposal) {
    return {
      ok: false,
      error: 'That prepared change was not found. Ask the specialist to prepare it again.',
    };
  }
  const product = products.find((p) => p.key === proposal.product);
  const change =
    product && Object.hasOwn(product.write, proposal.action)
      ? product.write[proposal.action]
      : undefined;
  const run = change ? executeOf(change) : undefined;
  if (!change || !run) {
    return { ok: false, error: 'You are not able to make that change in this workspace.' };
  }
  // A proposal read back from the conversation is checked like any other input.
  const parsed = (change.inputSchema as z.ZodType).safeParse(proposal.input);
  if (!parsed.success) {
    return { ok: false, error: 'That prepared change is no longer valid. Ask for it again.' };
  }
  const output = await run(parsed.data, options);
  if (team.names) collectNames([{ tool: proposal.action, output }], team.names);
  return output;
}

/** Tuah's tools when it works through its team, and which of them need approval. */
export function createTeamTools(
  products: ProductToolkit[],
  team: TeamContext,
): { tools: ToolSet; toolApproval: Record<string, 'user-approval'> | undefined } {
  const tools: ToolSet = {};
  for (const product of products) {
    tools[`${ASK_PREFIX}${product.name}`] = askTool(product, team);
  }

  const anyChanges = products.some((p) => Object.keys(p.write).length > 0);
  if (!anyChanges) return { tools, toolApproval: undefined };

  tools[APPLY_TOOL] = tool({
    description:
      'Carry out a change a specialist prepared, by its proposalId. This shows the user an ' +
      'Approve / Reject card; nothing is saved until they approve. Needs approval.',
    inputSchema: z.object({
      proposalId: z.string().min(1).describe('The id the specialist reported.'),
    }),
    execute: async ({ proposalId }, options) =>
      apply(products, team, team.proposals.get(proposalId), options),
  });
  return { tools, toolApproval: { [APPLY_TOOL]: 'user-approval' } };
}
