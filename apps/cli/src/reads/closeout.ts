/**
 * `nemia closeout <run> <step> [--try <n>]`, its words parsed against `objects`' `CLOSEOUT_WORDS`, read from the api through the
 * objects' client: what a try of a step signed off with — the one `--try` names (`…/tries/:try/closeout`), else its latest, the last of
 * its tries (`…/tries`) — printed a field a line (`closeoutLines`).
 *
 * The api answers a closeout's short output fields and a page of its body unless asked for more: the command prints it whole, so it asks
 * every field (`fields=*`) and reads the body on from each page's `bodyNext` until none is left (`whole`), of the one try it prints: the
 * latest is found off the tries' summaries, each asked as the api keeps it by default, so a step of many tries is never asked whole.
 */
import { Effect } from 'effect';
import { type Args, BODY_PAGE, type StepCloseout, type TryCloseout } from 'objects';
import { Refused } from '../client.ts';
import { textArg } from '../commands/requests.ts';
import { asked, type ObjectsClient } from '../objects.ts';

/** A field's value on one line: a string as it is, anything else as JSON. */
const valueLine = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

/**
 * A closeout as a person reads it at the command line: its outcome and summary, the question a blocked step asks (`needs`), its body, the
 * files and values it handed on, the fields its workflow asked for (`output`), each reply to a finding with its why under it, and what it
 * left out or was refused.
 */
const closeoutLines = (n: number, c: StepCloseout): string[] => [
  `try ${n}: ${c.outcome}: ${c.summary}`,
  ...(c.needs ? [`needs: ${c.needs}`] : []),
  ...(c.body && c.body !== c.summary ? ['', c.body] : []),
  ...(c.artifacts.length ? ['', 'artifacts:', ...c.artifacts.map((a) => `  ${a.path}`)] : []),
  ...(c.values.length ? ['', 'values:', ...c.values.map((v) => `  ${v.name}: ${v.value}`)] : []),
  ...(Object.keys(c.output).length ? ['', 'output:', ...Object.entries(c.output).map(([k, v]) => `  ${k}: ${valueLine(v)}`)] : []),
  ...(c.questions.length ? ['', `questions: ${c.questions.flatMap((q) => q.questions.map((x) => x.title)).join(' · ')}`] : []),
  ...(c.replies?.length ? ['', 'replies:', ...c.replies.flatMap((r) => [`  ${r.answer}: ${r.finding}`, `    ${r.why}`])] : []),
  ...(c.missing.length ? ['', `missing: ${c.missing.join(', ')}`] : []),
  ...(c.refused.length ? ['', 'refused:', ...c.refused.map((r) => `  ${r}`)] : []),
];

/** What the command prints of a try: its closeout, or that it has none yet, or why it does not read. */
export const closeoutPrinted = ({ try: n, closeout, unreadable }: TryCloseout, step: string): string[] =>
  closeout
    ? closeoutLines(n, closeout)
    : [`try ${n} of ${step}: ${unreadable ? `its closeout does not read: ${unreadable.error}` : 'no closeout yet'}`];

/** What a closeout is asked with to be read whole: every output field, and the body in pages of the most the api answers. */
const WHOLE = { fields: '*', bodyLimit: String(BODY_PAGE.most) } as const;

/** `read` with its closeout's body whole: each page after the first read from the `bodyNext` the page before answered. */
const whole = (client: ObjectsClient, runId: string, step: string, read: TryCloseout): Effect.Effect<TryCloseout, unknown> =>
  Effect.gen(function* () {
    let closeout = read.closeout;
    while (closeout?.bodyNext !== undefined) {
      const { bodyNext: from, ...had } = closeout;
      const next = yield* client.steps.closeout({
        params: { runId, step, try: String(read.try) },
        query: { ...WHOLE, bodyFrom: String(from) },
      });
      const page = next.closeout;
      if (page === null) break;
      closeout = {
        ...had,
        body: `${had.body ?? ''}${page.body ?? ''}`,
        ...(page.bodyNext !== undefined && page.bodyNext > from ? { bodyNext: page.bodyNext } : {}),
      };
    }
    return { ...read, closeout };
  });

/** Prints what the try of the step `args` names signed off with, its latest where no `--try` is given; answers 0. */
export async function closeout(args: Args): Promise<number> {
  const runId = textArg(args, 'runId') ?? '';
  const step = textArg(args, 'step') ?? '';
  const tryNo = textArg(args, 'try');
  const read = await asked('closeout', (client) =>
    Effect.flatMap(
      tryNo !== undefined
        ? Effect.succeed(tryNo)
        : Effect.map(client.steps.tries({ params: { runId, step }, query: {} }), ({ tries }) => tries.at(-1)?.try.toString()),
      (n) =>
        n === undefined
          ? Effect.succeed(undefined)
          : Effect.flatMap(client.steps.closeout({ params: { runId, step, try: n }, query: WHOLE }), (first) =>
              whole(client, runId, step, first),
            ),
    ),
  );
  if (read === undefined)
    throw new Refused(
      `Step ${step} of run ${runId} has no try : it has no try yet. Type \`nemia closeout ${runId} ${step} --try <n>\` with one of them.`,
    );
  for (const line of closeoutPrinted(read, step)) process.stdout.write(`${line}\n`);
  return 0;
}
