/**
 * What the api does for a command beyond its spec, keyed by the command's name: the keys of a body it takes that the command line has no
 * flag for (`apiTakes`), with their schemas, and its fold — refusals of the api's own (400, and 409 for a run the board does not remove),
 * and the arguments those keys carry.
 */
import { Schema } from 'effect';
import { type Args, budgetRefusal, type CommandSpec, commandLine, type RetryHow, roundBudgetRefusal, tryOf } from 'agent-orchestrator';
import type { Run } from 'agent-orchestrator/run';
import { answeredApproval, answeredHow } from '../asks/answers.ts';
import type { Refusal } from '../guard.ts';
import type { Engine } from '../store.ts';

/** What a fold reads: the engine, the store's root, and the run the route found. */
export type FoldAt = { readonly e: Engine['Service']; readonly home: string; readonly run: Run };

/**
 * A command's extension on the api: `takes`, the schema of each key of its body its `apiTakes` names; `fold`, its arguments made whole
 * from what the body carried under those keys (`taken`), or why the body is not one.
 */
export type Extension = {
  readonly takes: Readonly<Record<string, Schema.Decoder<unknown>>>;
  readonly fold: (
    at: FoldAt,
    command: CommandSpec,
    args: Args,
    taken: Readonly<Record<string, unknown>>,
  ) => Promise<{ args: Args } | Refusal>;
};

/** A person's answers to the questions a step asks, as the board sends them. */
const ANSWERS = Schema.Array(
  Schema.Struct({ question: Schema.String, chose: Schema.Array(Schema.String), own: Schema.optionalKey(Schema.String) }),
);

/** `nemia retry`'s how, off its arguments as the route decoded them. */
function retryHowOf(args: Args): RetryHow {
  const { mode, model, message, budget } = args;
  return {
    mode: mode === 'fresh' || mode === 'recheck' ? mode : 'nudge',
    ...(typeof model === 'string' ? { model } : {}),
    ...(typeof message === 'string' ? { message } : {}),
    ...(typeof budget === 'number' ? { budget } : {}),
  };
}

/**
 * A round's (`retry --round`, `POST …/round`): a budget not above zero is refused before the round is asked, 400, in the package's words
 * (`roundBudgetRefusal`). What else a round does not take is the command's check.
 */
const roundFold = (run: Run, args: Args): { args: Args } | Refusal => {
  const notAmount = roundBudgetRefusal(run.id, typeof args.budget === 'number' ? args.budget : undefined);
  return notAmount ? { status: 400, error: notAmount } : { args };
};

/**
 * Retry's: a round's on its path (`roundFold`); else a `model`, which is a new session's, goes with `"mode": "fresh"` alone, and a
 * `budget` not above zero is refused in the package's words (`budgetRefusal`), both 400; then the person's `answers`, checked against the
 * questions the step's current closeout asks and written as the try's message (`answeredHow`). Whether the message and the budget may
 * ride on the ask is the command's check.
 */
const RETRY: Extension = {
  takes: { answers: ANSWERS },
  async fold({ e, home, run }, command, args, { answers }) {
    if (args.round === true) return roundFold(run, args);
    const how = retryHowOf(args);
    if (how.model !== undefined && how.mode !== 'fresh') {
      return {
        status: 400,
        error: `\`model\` names the model a new session runs on, as \`nemia retry --model <m>\` does, so it goes with "mode": "fresh" — a nudge continues a session on the model it has, and a recheck files no session. This request asked for "${how.mode}".`,
      };
    }
    const notAmount = how.budget !== undefined && !(how.budget > 0) ? budgetRefusal(how, commandLine(command, args)) : null;
    if (notAmount) return { status: 400, error: notAmount };
    if (!Schema.is(ANSWERS)(answers)) return { args };
    const answered = await answeredHow(e, run, String(args.step), how, answers, home);
    if ('status' in answered) return answered;
    return { args: { ...args, message: answered.message } };
  },
};

/**
 * Approve's: the person's `answers` to the questions the gated step's current closeout asks, checked and written as the approval's words,
 * the words it carried becoming their note (`answeredApproval`). An approval with no `answers` is the command's alone.
 */
const APPROVE: Extension = {
  takes: { answers: ANSWERS },
  async fold({ e, home, run }, _command, args, { answers }) {
    if (!Schema.is(ANSWERS)(answers)) return { args };
    const note = typeof args.message === 'string' ? args.message : undefined;
    const answered = await answeredApproval(e, run, String(args.step), note, answers, home);
    if ('status' in answered) return answered;
    return { args: { ...args, message: answered.message } };
  },
};

/**
 * Rm's: the board removes only a try, a run started from an agent's page (`tryOf`); any other run is a 409 naming `nemia rm`, which says
 * what it hands off and what it leaves, since a repository run's worktrees and branches are a person's to read before they go.
 */
const RM: Extension = {
  takes: {},
  async fold({ home, run }, _command, args) {
    if (tryOf(run, home)) return { args };
    return {
      status: 409,
      error: `DELETE /api/runs/${run.id}: the board removes only a try, a run started from an agent's page, and ${run.id} is a run of ${run.workflowDir}. Remove it with \`nemia rm ${run.id}\`, which says what it hands off and what it leaves.`,
    };
  },
};

/** The api's extension of each command that has one, by its name. */
export const EXTENSIONS: Readonly<Record<string, Extension>> = { retry: RETRY, approve: APPROVE, rm: RM };

/** Where a table asks the api for what it does not do, a sentence each: a key a command's `apiTakes` names that no extension takes. */
export const extensionBreaks = (table: readonly Pick<CommandSpec, 'name' | 'apiTakes'>[]): string[] =>
  table.flatMap((c) =>
    (c.apiTakes ?? [])
      .filter((key) => !Object.hasOwn(EXTENSIONS[c.name]?.takes ?? {}, key))
      .map(
        (key) => `${c.name} takes \`${key}\` on the api, and extend.ts folds none: give ${c.name} an extension that takes it, or drop it`,
      ),
  );
