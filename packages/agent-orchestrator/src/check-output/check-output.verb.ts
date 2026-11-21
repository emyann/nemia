/**
 * What a try's check printed, read off the engine as the api's `CheckOutput` serves it (`stepCheckOutput`): the try resolved as every
 * read of one is (`stepTry`), its check's task read whole on the stream asked (`output`), or, where the runtime kept no stdout, the end of
 * its log (`partial`); its lines numbered and matched (`checkOutputLines`) and cut to the page asked (`checkOutputCut`, within
 * `CHECK_OUTPUT_PAGE`). A read the engine fails dies in the runtime's words (`asked`), which the api answers as `ReadFailed`.
 */
import { Effect } from 'effect';
import { CHECK_OUTPUT_PAGE, type CheckOutput, type OutputStream } from 'objects';
import { EngineService, asked } from '../runtime-client.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { stepTry } from '../object/run.verb.ts';
import { checkOutputCut, checkOutputLines } from './check-output.ts';

/** What a read of a try's check's output asks, as its query or its command line spells it. */
export type CheckOutputAsked = {
  readonly stream?: OutputStream | undefined;
  readonly from?: string | undefined;
  readonly limit?: string | undefined;
  readonly last?: string | undefined;
  readonly match?: string | undefined;
};

/** A count as a query carries it: null where none is given; the number a whole decimal spells; NaN, which no read takes, otherwise. */
const countOf = (text: string | undefined) =>
  text === undefined || text === '' ? null : /^[0-9]+$/.test(text) ? Number(text) : Number.NaN;

/** The refusal of a page asked wrong, naming the key to change. */
const refusedPage = (refused: 'limit' | 'last' | 'both', asked: CheckOutputAsked) =>
  new Invalid({
    message:
      refused === 'both'
        ? 'last is asked with from or limit: pass ?last=<n> for the last lines, or ?from=<n> and ?limit=<n> to read on from a line, not both'
        : `${refused} ${JSON.stringify(asked[refused])} is no whole number from 1: pass ?${refused}=<n>, n from 1, or leave it out for ${refused === 'limit' ? `${CHECK_OUTPUT_PAGE.byDefault} lines` : 'a page from the first line'}`,
  });

/**
 * A page of what the check of the try `tryNo` of the step `step` of the run `runId` printed (`CheckOutput`), its latest try where none is
 * asked: the lines of the stream asked, stdout by default, numbered from 1, those containing `match` where it is asked, from the line
 * `from` or the last `last`, `limit` of them or `CHECK_OUTPUT_PAGE`'s default, and the line to read on from where any is left. A check not
 * filed yet answers no line, not running; a check filed with no verdict yet, or one running, answers `running`. Refused `Missing` for a run, a step or a try
 * it lacks and for a step with no `check:`, `Invalid` for a page asked wrong.
 * @param runId The run's id.
 * @param step The step's name.
 * @param tryNo The try's number as the path or the command line says it; undefined for the latest.
 * @param ask The stream, the page and the text to match asked.
 */
export const stepCheckOutput = Effect.fn('stepCheckOutput')(function* (
  runId: string,
  step: string,
  tryNo: string | undefined,
  ask: CheckOutputAsked,
) {
  const one = yield* stepTry(runId, step, tryNo);
  const check = one.check;
  if (check === null)
    return yield* Effect.fail(
      new Missing({
        message: `Step ${step} of run ${runId} has no check: line, so nothing checked it. Type \`nemia logs ${runId} ${step}\` for what its session printed.`,
      }),
    );
  const stream = ask.stream ?? 'stdout';
  const fromAsked = countOf(ask.from);
  if (fromAsked !== null && !(Number.isSafeInteger(fromAsked) && fromAsked >= 1))
    return yield* Effect.fail(
      new Invalid({
        message: `from ${JSON.stringify(ask.from)} is no line number: pass ?from=<n>, n from 1, as a page's next says it, or leave it out to read from the first line`,
      }),
    );
  const limit = countOf(ask.limit);
  const last = countOf(ask.last);
  const asking = checkOutputCut(0, fromAsked === null ? null : 0, limit, last, CHECK_OUTPUT_PAGE);
  if ('refused' in asking) return yield* Effect.fail(refusedPage(asking.refused, ask));
  const matching = ask.match !== undefined && ask.match !== '';
  const taskId = check.taskId;
  if (taskId === null)
    return {
      try: one.try,
      taskId: null,
      stream,
      running: false,
      partial: false,
      lines: [],
      total: 0,
      ...(matching ? { matched: 0 } : {}),
    } satisfies CheckOutput;
  const running = check.verdict === null || check.verdict.result === 'running';
  const e = yield* EngineService;
  const printed = yield* asked('output', e.output(taskId, stream));
  const kept = printed !== undefined || stream === 'stderr';
  const text = printed ?? (stream === 'stdout' ? yield* asked('logs', e.logs(taskId)) : '');
  const all = checkOutputLines(text, undefined);
  const held = matching ? checkOutputLines(text, ask.match) : all;
  const start = fromAsked === null ? null : held.findIndex((line) => line.n >= fromAsked);
  const cut = checkOutputCut(held.length, start === -1 ? held.length : start, limit, last, CHECK_OUTPUT_PAGE);
  if ('refused' in cut) return yield* Effect.fail(refusedPage(cut.refused, ask));
  const next = cut.more ? held[cut.to]?.n : undefined;
  return {
    try: one.try,
    taskId,
    stream,
    running,
    partial: !kept,
    lines: held.slice(cut.from, cut.to),
    total: all.length,
    ...(matching ? { matched: held.length } : {}),
    ...(next === undefined ? {} : { next }),
  } satisfies CheckOutput;
});
