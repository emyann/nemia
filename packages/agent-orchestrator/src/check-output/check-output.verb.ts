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
  readonly before?: string | undefined;
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
 * What a page asks once read: the line to read on from, the line to read back from, how many lines, and the last lines, each null where
 * not asked.
 */
type PageAsked = {
  readonly from: number | null;
  readonly before: number | null;
  readonly limit: number | null;
  readonly last: number | null;
};

/** The line number `text` spells, null where none is given, or the refusal naming the key `key` that spells none. */
const lineOf = (key: 'from' | 'before', text: string | undefined) => {
  const n = countOf(text);
  if (n === null || (Number.isSafeInteger(n) && n >= 1)) return n;
  return new Invalid({
    message: `${key} ${JSON.stringify(text)} is no line number: pass ?${key}=<n>, n from 1, as a page's ${key === 'from' ? 'next' : 'before'} says it, or leave it out to read ${key === 'from' ? 'from the first line' : 'the last lines'}`,
  });
};

/**
 * The page `ask` asks, read before anything else is, or its refusal: a `from` or a `before` that is no line number, a `limit` or a
 * `last` that is no whole number from 1, `last` asked with `from` or `limit`, or `before` asked with `from` or `last`.
 */
const pageAskedOf = (ask: CheckOutputAsked) => {
  const from = lineOf('from', ask.from);
  if (from instanceof Invalid) return from;
  const before = lineOf('before', ask.before);
  if (before instanceof Invalid) return before;
  const page = { from, before, limit: countOf(ask.limit), last: countOf(ask.last) } satisfies PageAsked;
  if (before !== null && (from !== null || ask.last !== undefined))
    return new Invalid({
      message:
        'before is asked with from or last: pass ?before=<n> to read the lines before a line, ?from=<n> to read on from one, or ?last=<n> for the last lines, one of them',
    });
  const cut = checkOutputCut(0, from === null && before === null ? null : 0, page.limit, page.last, CHECK_OUTPUT_PAGE);
  return 'refused' in cut ? refusedPage(cut.refused, ask) : page;
};

/**
 * What the check's task `taskId` printed on `stream`, whole, off the engine, and whether the runtime kept it: where it kept no stdout,
 * the end of the task's log; where it kept no stderr, nothing.
 */
const printedOn = Effect.fnUntraced(function* (taskId: string, stream: OutputStream) {
  const e = yield* EngineService;
  const printed = yield* asked('output', e.output(taskId, stream));
  if (printed !== undefined) return { text: printed, kept: true };
  if (stream === 'stderr') return { text: '', kept: true };
  return { text: yield* asked('logs', e.logs(taskId)), kept: false };
});

/** The index of the first of `held` numbered `n` or after, `held`'s length where none is. */
const indexAt = (held: readonly { readonly n: number }[], n: number) => {
  const i = held.findIndex((line) => line.n >= n);
  return i === -1 ? held.length : i;
};

/**
 * Where the page `page` starts among `held` and how many it asks: on from `from`, the index of its line; back from `before`, the page of
 * held lines ending just before that line, as many as `limit` or the default asks, held lines and not line numbers, so that a page back
 * under a match holds as many matches as one forward.
 */
const startOf = (held: readonly { readonly n: number }[], page: PageAsked) => {
  if (page.before === null) return { start: page.from === null ? null : indexAt(held, page.from), limit: page.limit };
  const end = indexAt(held, page.before);
  const start = Math.max(0, end - Math.min(page.limit ?? CHECK_OUTPUT_PAGE.byDefault, CHECK_OUTPUT_PAGE.most));
  return { start, limit: end - start };
};

/**
 * The page `page` cuts of `text`, its lines numbered and those containing `match` kept (`checkOutputLines`), as `CheckOutput`'s lines,
 * total, matched, next and before say it; or the refusal of a page asked wrong.
 */
const pageOf = (text: string, match: string | undefined, page: PageAsked, ask: CheckOutputAsked) => {
  const all = checkOutputLines(text, undefined);
  const matching = match !== undefined && match !== '';
  const held = matching ? checkOutputLines(text, match) : all;
  const { start, limit } = startOf(held, page);
  const cut =
    limit === 0
      ? { from: start ?? 0, to: start ?? 0, more: (start ?? 0) < held.length }
      : checkOutputCut(held.length, start, limit, page.last, CHECK_OUTPUT_PAGE);
  if ('refused' in cut) return refusedPage(cut.refused, ask);
  const next = cut.more ? held[cut.to]?.n : undefined;
  const before = cut.from > 0 ? held[cut.from]?.n : undefined;
  return {
    lines: held.slice(cut.from, cut.to),
    total: all.length,
    ...(matching ? { matched: held.length } : {}),
    ...(next === undefined ? {} : { next }),
    ...(before === undefined ? {} : { before }),
  };
};

/**
 * A page of what the check of the try `tryNo` of the step `step` of the run `runId` printed (`CheckOutput`), its latest try where none is
 * asked: the lines of the stream asked, stdout by default, numbered from 1, those containing `match` where it is asked, from the line
 * `from`, back from the line `before` or the last `last`, `limit` of them or `CHECK_OUTPUT_PAGE`'s default, and the lines to read on
 * from and back from where any are left. A check not filed yet answers no line, not running; a check filed with no verdict yet, or one
 * running, answers `running`. Refused `Missing` for a run, a step or a try it lacks and for a step with no `check:`, `Invalid` for a page
 * asked wrong.
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
  const page = pageAskedOf(ask);
  if (page instanceof Invalid) return yield* Effect.fail(page);
  const stream = ask.stream ?? 'stdout';
  const taskId = check.taskId;
  const { text, kept } = taskId === null ? { text: '', kept: true } : yield* printedOn(taskId, stream);
  const cut = pageOf(text, ask.match, page, ask);
  if (cut instanceof Invalid) return yield* Effect.fail(cut);
  const running = taskId !== null && (check.verdict === null || check.verdict.result === 'running');
  return { try: one.try, taskId, stream, running, partial: !kept, ...cut } satisfies CheckOutput;
});
