/**
 * `nemia check-output <run> <step> [--try <n>]`, its words parsed against `objects`' `CHECK_OUTPUT_WORDS`, read from the api through the
 * objects' client (`…/tries/:try/check/output`): what the check of the try `--try` names printed, else of its latest, the last of its
 * tries (`…/tries`). Its stdout, or its stderr with `--stderr`.
 *
 * Asked no page (`--from`, `--limit`, `--last`), the command prints the stream whole, reading on from each page's `next` in pages of the
 * most the api answers until none is left; asked one, it prints that page and says on stderr the `--from` to read on from. Under `--match`
 * each line is printed after its number in the stream, as `grep -n` prints it (`checkOutputPrinted`).
 */
import { Effect } from 'effect';
import { type Args, CHECK_OUTPUT_PAGE, type CheckOutput } from 'objects';
import { Refused } from '../client.ts';
import { textArg } from '../commands/requests.ts';
import { asked, type ObjectsClient } from '../objects.ts';

/**
 * What the command prints of a read of a check's output: its lines on stdout, each after its number under a match; and on stderr what a
 * person reads beside them — that no check was filed, that the lines are the end of the log, that the check still runs, and the command
 * that reads on where lines are left.
 * @param read What the api answered: the lines, and the line to read on from.
 * @param again The command that read it, its words but `--from`, to which the `--from` to read on from is added.
 */
export const checkOutputPrinted = (read: CheckOutput, again: string) => {
  const numbered = read.matched !== undefined;
  return {
    stdout: read.lines.map((line) => (numbered ? `${line.n}:${line.text}` : line.text)),
    stderr: [
      ...(read.taskId === null ? [`try ${read.try}: no check filed yet, so nothing printed`] : []),
      ...(read.partial ? [`try ${read.try}: the runtime kept no whole stdout of this check: these are the end of its log`] : []),
      ...(read.running && read.taskId !== null ? [`try ${read.try}: the check still runs, and may print more`] : []),
      ...(read.next === undefined ? [] : [`more from line ${read.next}: ${again} --from ${read.next}`]),
    ],
  };
};

/** The keys a read of a check's output is asked with, each as the api's query spells it; absent where not given. */
type Asked = { stream?: 'stderr'; from?: string; limit?: string; last?: string; match?: string };

/** The words of `args` the api's query takes, each present only where given. */
const askedOf = (args: Args) =>
  Object.fromEntries(
    (['from', 'limit', 'last', 'match'] as const).flatMap((key) => {
      const value = textArg(args, key);
      return value === undefined ? [] : [[key, value]];
    }),
  ) as Omit<Asked, 'stream'>;

/** The try `tryNo` names, else the step's latest, the last of its tries; undefined for a step with no try. */
const tryOf = (client: ObjectsClient, runId: string, step: string, tryNo: string | undefined) =>
  tryNo !== undefined
    ? Effect.succeed(tryNo)
    : Effect.map(client.steps.tries({ params: { runId, step }, query: {} }), ({ tries }) => tries.at(-1)?.try.toString());

/** The check's output of the try `params` names, whole: each page after the first read on from the `next` the page before answered. */
const whole = (client: ObjectsClient, params: { runId: string; step: string; try: string }, query: Asked) =>
  Effect.gen(function* () {
    const asked = { ...query, limit: String(CHECK_OUTPUT_PAGE.most) };
    let page = yield* client.steps.checkOutput({ params, query: asked });
    const lines = [...page.lines];
    while (page.next !== undefined) {
      const at = page.next;
      page = yield* client.steps.checkOutput({ params, query: { ...asked, from: String(at) } });
      lines.push(...page.lines);
      if (page.next !== undefined && page.next <= at) break;
    }
    const { next: _left, ...rest } = page;
    return { ...rest, lines } satisfies CheckOutput;
  });

/**
 * Prints what the check of the try `args` names printed, its latest where no `--try` is given; answers 0.
 * @param args The command's words as parsed against `CHECK_OUTPUT_WORDS`: the run, the step, `--try`, the stream, the page and the match.
 */
export async function checkOutput(args: Args) {
  const runId = textArg(args, 'runId') ?? '';
  const step = textArg(args, 'step') ?? '';
  const words = askedOf(args);
  const query: Asked = { ...(textArg(args, 'stream') === 'stderr' ? { stream: 'stderr' } : {}), ...words };
  const paged = words.from !== undefined || words.limit !== undefined || words.last !== undefined;
  const read = await asked('check-output', (client) =>
    Effect.flatMap(tryOf(client, runId, step, textArg(args, 'try')), (n) =>
      n === undefined
        ? Effect.succeed(undefined)
        : paged
          ? client.steps.checkOutput({ params: { runId, step, try: n }, query })
          : whole(client, { runId, step, try: n }, query),
    ),
  );
  if (read === undefined)
    throw new Refused(
      `Step ${step} of run ${runId} has no try yet, so no check printed anything. Type \`nemia ls ${runId}\` to see where the step stands.`,
    );
  const again = [
    `nemia check-output ${runId} ${step} --try ${read.try}`,
    ...(query.stream === undefined ? [] : ['--stderr']),
    ...(words.limit === undefined ? [] : [`--limit ${words.limit}`]),
    ...(words.match === undefined ? [] : [`--match ${JSON.stringify(words.match)}`]),
  ].join(' ');
  const printed = checkOutputPrinted(read, again);
  for (const line of printed.stdout) process.stdout.write(`${line}\n`);
  for (const line of printed.stderr) process.stderr.write(`${line}\n`);
  return 0;
}
