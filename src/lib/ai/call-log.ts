/**
 * One log line per model call: who made it, how long it took and what it
 * used. An answer from Tuah's team is several calls (Tuah, then a specialist,
 * then Tuah again), so this is how to see where an answer's time and cost go.
 * Nothing of the conversation is logged.
 */

type CallEnd = {
  modelId?: string;
  finishReason: unknown;
  usage: { inputTokens: number | undefined; outputTokens: number | undefined };
  performance: { responseTimeMs: number };
};

export function logModelCall(agent: string, model: string) {
  return (call: CallEnd) => {
    const finish =
      typeof call.finishReason === 'string'
        ? call.finishReason
        : ((call.finishReason as { unified?: string } | null)?.unified ?? 'unknown');
    console.info(
      `[ai] agent=${agent} model=${call.modelId || model} ms=${Math.round(call.performance.responseTimeMs)} ` +
        `in=${call.usage.inputTokens ?? '?'} out=${call.usage.outputTokens ?? '?'} finish=${finish}`,
    );
  };
}
