/**
 * `nemia closeout <run> <step> [--try <n>]`, read from the api: what a try of a step signed off with — the one `--try` names
 * (`…/tries/:try/closeout`), else its latest, the last of its tries (`…/tries`) — printed as the in-process command prints it
 * (`closeoutLines`, the orchestrator's `command/reads.verb.ts`, ported word for word). Any other words go to the old path.
 */
import type { StepCloseout, StepTry, TryCloseout } from '../../../api/src/client/client.ts';
import { get, Refused } from '../client.ts';
import { spawned } from '../local.ts';

/** A field's value on one line: a string as it is, anything else as JSON. */
const valueLine = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

/** A closeout as a person reads it at the command line: the in-process `closeoutLines`. */
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

/** The run, the step and the try typed, or none for words the old path is to read. */
function parsed(args: readonly string[]): { runId: string; step: string; tryNo?: string } | undefined {
  const positionals: string[] = [];
  let tryNo: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const word = args[i] ?? '';
    if (word === '--try') {
      const value = args[i + 1];
      if (tryNo !== undefined || value === undefined || value === '' || value.startsWith('--')) return undefined;
      tryNo = value;
      i++;
    } else if (word.startsWith('-') || word === '') return undefined;
    else positionals.push(word);
  }
  const [runId, step] = positionals;
  return positionals.length === 2 && runId !== undefined && step !== undefined ? { runId, step, ...(tryNo ? { tryNo } : {}) } : undefined;
}

export async function closeout(args: readonly string[]): Promise<number> {
  const asked = parsed(args);
  if (asked === undefined) return spawned(['closeout', ...args]);
  const { runId, step, tryNo } = asked;
  const at = `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/tries`;
  let read: TryCloseout;
  if (tryNo !== undefined) read = await get<TryCloseout>('closeout', `${at}/${encodeURIComponent(tryNo)}/closeout`);
  else {
    const { tries } = await get<{ tries: StepTry[] }>('closeout', at);
    const latest = tries.at(-1);
    if (latest === undefined)
      throw new Refused(
        `Step ${step} of run ${runId} has no try : it has no try yet. Type \`nemia closeout ${runId} ${step} --try <n>\` with one of them.`,
      );
    read = { try: latest.try, closeout: latest.closeout, unreadable: latest.unreadable };
  }
  for (const line of closeoutPrinted(read, step)) process.stdout.write(`${line}\n`);
  return 0;
}
