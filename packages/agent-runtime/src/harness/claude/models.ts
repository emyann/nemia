/**
 * Claude Code's models: the Agent SDK asked which models it lists for a session (`claudeModels`). No prompt is sent, so no model is
 * called and no token spent; the ask opens a query as the quota's does (`usageOptions`), puts `supportedModels()` and closes it. Each row
 * the harness answers is read by `listedOf`, which yields each model once by its canonical id.
 *
 * The SDK's method has one call site, `sdkModelsAsk` here, and `OpenModels` is the seam a test stands in for.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { Effect } from 'effect';
import type { ListedOf, ModelRow } from '../../../contracts/listed-models.contract.ts';
import { RunnerError } from '../error.ts';
import { programIn } from '../harness-bin.ts';
import { heldInput, quotaExecutable, usageOptions } from './quota.ts';

export type { ListedModel, ModelRow } from '../../../contracts/listed-models.contract.ts';

/** How long an ask may take before it is given up on, and its query closed. */
const MODELS_TIMEOUT_MS = 15_000;

/**
 * The models a harness lists, by canonical id, read off its rows: each row's `resolvedModel`, else its `value`, once, with the other
 * words that resolve to it as its aliases, and the facts of the first row that names it. Pure.
 * @param rows The rows the harness answered, each a `ModelInfo` of the SDK.
 */
export const listedOf: ListedOf = (rows) =>
  rows
    .filter((row, i) => !rows.slice(0, i).some((before) => (before.resolvedModel ?? before.value) === (row.resolvedModel ?? row.value)))
    .map((first) => ({
      id: first.resolvedModel ?? first.value,
      aliases: rows
        .filter(
          (row) =>
            (row.resolvedModel ?? row.value) === (first.resolvedModel ?? first.value) && row.value !== (first.resolvedModel ?? first.value),
        )
        .map((row) => row.value),
      name: first.displayName,
      keepsAuto: first.supportsAutoMode,
      efforts: first.supportedEffortLevels,
    }));

/** One ask of Claude Code's models, as `claudeModels` puts it: `models` answers once, `close` lets the query go whatever came of it. */
type ModelsAsk = {
  readonly models: () => Promise<readonly ModelRow[]>;
  readonly close: () => Promise<void>;
};

/** How an ask is opened: over the Claude Code named, the Agent SDK's own when it is `undefined`. */
export type OpenModels = (command: string | undefined) => ModelsAsk;

/** The ask as the Agent SDK takes it (the one call site of `supportedModels`): a query opened for the question, closed with its input. */
const sdkModelsAsk = (env: NodeJS.ProcessEnv) =>
  ((command) => {
    const input = heldInput();
    const q = query({ prompt: input.prompt, options: usageOptions(command, env) });
    return {
      models: () => q.supportedModels(),
      close: async () => {
        input.release();
        await q.return(undefined);
      },
    };
  }) satisfies OpenModels;

/** A refusal of the ask, in the words of what went wrong. */
const refused = (message: string) => new RunnerError({ verb: 'models', message });

/**
 * Ask Claude Code which models it lists: the Claude Code the sessions run (`quotaExecutable`, else `<harnessBin>/claude`), read at each
 * ask. The query is taken in the ask's scope and closed as it closes, whatever ends it. Fails with a `RunnerError` saying why where it
 * cannot be opened, is refused, or does not answer in `timeoutMs`.
 */
export const claudeModels = ({
  command,
  timeoutMs = MODELS_TIMEOUT_MS,
  env = process.env,
  ask = sdkModelsAsk(env),
  harnessBin,
}: {
  command?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  ask?: OpenModels;
  harnessBin?: string;
} = {}) =>
  Effect.suspend(() => {
    const executable = quotaExecutable(command, env) ?? programIn(harnessBin, 'claude');
    return Effect.acquireRelease(
      Effect.try({
        try: () => ask(executable),
        catch: (cause) => refused(`Claude Code could not be asked for its models: ${String(cause)}`),
      }),
      (open) => Effect.promise(() => open.close().catch(() => undefined)),
    ).pipe(
      Effect.flatMap((open) =>
        Effect.tryPromise({
          try: () => open.models(),
          catch: (cause) => refused(`Claude Code did not list its models: ${cause instanceof Error ? cause.message : String(cause)}`),
        }),
      ),
      Effect.map(listedOf),
      Effect.scoped,
      Effect.timeoutOrElse({
        duration: timeoutMs,
        orElse: () => Effect.fail(refused(`Claude Code did not list its models within ${timeoutMs} ms`)),
      }),
    );
  });
