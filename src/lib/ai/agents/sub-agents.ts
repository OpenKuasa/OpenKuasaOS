/**
 * Layer-2 specialist sub-agents, each wrapped as a tool so the orchestrator can
 * call it ("agents-as-tools"). Each runs its own model + prompt; the Analyst
 * additionally owns the Layer-3 data tools.
 *
 * Sub-agents run on the cheaper `worker` model and are step-capped — the
 * orchestrator fan-out is where cost accrues, so the leaves stay lean.
 */

import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { getModel } from '@/lib/ai/provider';
import { type ReachTools } from '@/lib/ai/tools';
import {
  ANALYST_SYSTEM,
  COPYWRITER_SYSTEM,
  OPTIMIZER_SYSTEM,
} from '@/lib/ai/agents/prompts';

export function createAnalystTool(reachTools: ReachTools) {
  return tool({
    description:
      'Consult the Analyst for anything needing real numbers: campaigns, leads, the funnel, spend by channel, conversion, trends or appointments. Returns a grounded explanation of what is happening.',
    inputSchema: z.object({
      question: z
        .string()
        .describe('The full analytical question to answer, e.g. "which campaign has the best cost per lead?"'),
    }),
    execute: async ({ question }, { abortSignal }) => {
      const { text } = await generateText({
        model: getModel('worker'),
        system: ANALYST_SYSTEM,
        prompt: question,
        tools: reachTools,
        stopWhen: stepCountIs(4),
        maxOutputTokens: 700,
        abortSignal,
      });
      return text;
    },
  });
}

export function createOptimizerTool() {
  return tool({
    description:
      'Consult the Optimizer to turn figures into concrete budget/targeting recommendations. Pass the relevant numbers and goal in `situation`.',
    inputSchema: z.object({
      situation: z
        .string()
        .describe('The figures and the goal, e.g. "CPL by campaign: ...; want to lower overall cost per lead".'),
    }),
    execute: async ({ situation }, { abortSignal }) => {
      const { text } = await generateText({
        model: getModel('worker'),
        system: OPTIMIZER_SYSTEM,
        prompt: situation,
        maxOutputTokens: 500,
        abortSignal,
      });
      return text;
    },
  });
}

export function createCopywriterTool() {
  return tool({
    description:
      'Consult the Copywriter to draft ad copy, captions or WhatsApp follow-ups. Describe the campaign/offer and audience in `brief`.',
    inputSchema: z.object({
      brief: z
        .string()
        .describe('What to write and for whom, e.g. "WhatsApp follow-up for a Raya promo, friendly tone".'),
    }),
    execute: async ({ brief }, { abortSignal }) => {
      const { text } = await generateText({
        model: getModel('worker'),
        system: COPYWRITER_SYSTEM,
        prompt: brief,
        maxOutputTokens: 500,
        abortSignal,
      });
      return text;
    },
  });
}
