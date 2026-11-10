/**
 * `nemia decide <run>`, a verb of the client's own (the untangle intent's Q14): the run's decision read from the api
 * (`GET /api/runs/:runId/decision`, `objects`' `RunDecision`, the one read model the board reads too) and its screen printed — what it
 * waits on, or what it produced: the over-budget line, what each branch touched, the lesson, the check-affecting diffs in full, what each
 * step consumed, where each branch stands, the collisions, and the commands it leaves a person, numbered. At a terminal it then asks which
 * to run: a `nemia` command is run as this client runs that verb, the words a placeholder holds (`"<objection>"`) asked first; a `git`
 * command is printed and never run. Off a terminal it prints and runs nothing.
 *
 * It refuses `--local`, as every verb of the client's own, and `--sensitive`, which the api's read does not take yet.
 */
import readline from 'node:readline';
import type { DecideCommand, Decidable, RunDecision } from 'objects';
import { Refused } from '../refused.ts';
import { asked, noLocal } from '../objects.ts';

/** `nemia decide`'s help. */
export const DECIDE_HELP = `nemia decide <runId>

What the run produced, and the choice it leaves you, as the api reads it (GET /api/runs/<runId>/decision):
what it waits on, or the branches it touched, the lesson, the check-affecting diffs in full, what each
step consumed, where each branch stands against the base, the collisions with other runs, and the
commands left to you, numbered. At a terminal it asks which to run: a nemia command runs as you would
type it, its placeholders asked first; a git command is printed and never run.

A step's closeout is \`nemia closeout <runId> <step>\`; its steps and waits, \`nemia ls <runId>\`.`;

/** Where `decide` reads a person's answer, whether it asks at all, and how it runs a command it offers. */
export type DecideIo = {
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly interactive: boolean;
  readonly run: (argv: readonly string[]) => Promise<number>;
};

/** `n` with its unit, plural where it is not one. */
const counted = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** What each branch touched, by group, and the agent-facing and check-affecting files among it; or why it is not known. */
const touchedLines = (d: Decidable): string[] =>
  d.touched.flatMap(({ branch, radius }) =>
    'error' in radius
      ? [`touched  ${branch}: not known — ${radius.error}`]
      : [
          `touched  ${branch}: ${counted(radius.changes.length, 'file')}`,
          ...radius.groups.map(
            (g) => `  ${g.name}  ${counted(g.files, 'file')}  +${g.added} −${g.removed}${g.binary ? `  ${g.binary} binary` : ''}`,
          ),
          ...(radius.agentFacing.length ? [`  agent-facing: ${radius.agentFacing.join(', ')}`] : []),
          ...(radius.checkAffecting.length ? [`  check-affecting: ${radius.checkAffecting.join(', ')}`] : []),
        ],
  );

/** Each branch's check-affecting files in full, each cut where the read model cut it; or why they are not known. */
const inFullLines = (d: Decidable): string[] =>
  d.sensitive.flatMap(({ branch, files, error }) =>
    error !== null
      ? [`in full  ${branch}: not known — ${error}`]
      : files.flatMap((f) => [
          `in full  ${branch}: ${f.path}`,
          ...f.lines.map((line) => `  ${line}`),
          ...(f.cut ? [`  … ${counted(f.cut, 'line')} more`] : []),
        ]),
  );

/** What each step consumed, then the total and the run's cost. */
const usedLines = (d: Decidable): string[] => [
  ...Object.entries(d.used).map(([step, u]) => `used  ${step}: ${u.used}, ${u.cost}`),
  ...(Object.keys(d.used).length ? [`used  total: ${d.total.used}, ${d.total.cost}`] : []),
  ...(d.cost !== null ? [`cost  ${d.cost}`] : []),
];

/** Where each branch stands against the base, how much it changed, and whether it still merges. */
const standingLines = (d: Decidable): string[] =>
  d.standings.map((s) => `${s.branch}  ${s.said}${s.stat !== null ? `  ${s.stat}` : ''}${s.merge !== null ? `  · ${s.merge.said}` : ''}`);

/** The collisions read at an ending's decision: the whole in one line, then each branch that does not merge and the semantic refusal. */
const collisionLines = (d: Decidable): string[] =>
  d.collisions === null
    ? []
    : [
        d.collisions.said,
        ...d.collisions.colliding.map((c) => `  ${c.said}`),
        ...(d.collisions.semantic !== null ? [`  ${d.collisions.semantic.said}`] : []),
      ];

/** A command as offered: its number, its label, the line, and the sentence it ends with. */
const offered = (c: DecideCommand, at: number): string => `${at + 1}. ${c.label}: ${c.command}${c.said !== null ? `  — ${c.said}` : ''}`;

/** The screen of `decision`, run `runId`'s: every line, each but the head indented. */
export function decisionLines(runId: string, decision: RunDecision): string[] {
  const body = (lines: readonly string[]) => [runId, '', ...lines.map((line) => (line === '' ? '' : `  ${line}`))];
  if ('waiting' in decision)
    return body([
      decision.waiting.word,
      decision.waiting.advice,
      ...(decision.holding ? [`${decision.holding.word} as well — ${decision.holding.advice}`] : []),
    ]);
  if ('holding' in decision) return body([decision.holding.word, decision.holding.advice]);
  if ('running' in decision)
    return body([
      ...(decision.held ? [`held at the cap on runs in flight: ${decision.held.inFlight} in flight of ${decision.held.cap}`] : []),
      'still running — nothing to decide yet',
    ]);
  if ('nothing' in decision) return body([decision.nothing]);
  const d = decision;
  const sections = [
    d.overBudget !== null ? [d.overBudget] : [],
    d.baseHeldBy ? [`waits for the base's checkout, which ${d.baseHeldBy.run}'s ${d.baseHeldBy.step} holds`] : [],
    touchedLines(d),
    [`lesson  ${d.lesson.said}`],
    inFullLines(d),
    usedLines(d),
    standingLines(d),
    collisionLines(d),
    d.commands.map(offered),
  ].filter((lines) => lines.length);
  return body(sections.flatMap((lines, at) => (at === 0 ? lines : ['', ...lines])));
}

/** The words of a command line as a shell would read them: split on spaces, a double-quoted stretch one word without its quotes. */
export const wordsOf = (line: string): string[] => [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? '');

/** The placeholders a command line holds, `<objection>` and its like, each once, in order. */
const placeholdersOf = (line: string): string[] => [...new Set([...line.matchAll(/<([^<>]+)>/g)].map((m) => m[1] ?? ''))];

/**
 * The commands of `decision` a person may pick, asked at a terminal: the one picked run as this client runs it, its placeholders asked
 * first; a `git` command printed, never run. Answers the exit code of the command run, 0 where none is.
 */
async function picked(commands: readonly DecideCommand[], io: DecideIo): Promise<number> {
  const prompt = readline.createInterface({ input: io.input, terminal: false });
  const lines = prompt[Symbol.asyncIterator]();
  const question = async (words: string): Promise<string> => {
    io.output.write(words);
    const line = await lines.next();
    return line.done === true ? '' : String(line.value);
  };
  try {
    const answer = (await question(`run one? the number, or Enter for none: `)).trim();
    if (answer === '') return 0;
    const command = commands[Number(answer) - 1];
    if (!/^\d+$/.test(answer) || command === undefined)
      throw new Refused(`there is no command ${answer} to run: type nemia decide again, and a number of the list`);
    if (!command.command.startsWith('nemia ')) {
      io.output.write(`not run here, yours to type: ${command.command}\n`);
      return 0;
    }
    let line = command.command;
    for (const name of placeholdersOf(line)) {
      const words = (await question(`${name}: `)).trim();
      if (words === '')
        throw new Refused(`the command needs its ${name}: type nemia decide again and say it, or type the command yourself`);
      line = line.split(`<${name}>`).join(words.replaceAll('"', "'"));
    }
    return io.run(wordsOf(line).slice(1));
  } finally {
    prompt.close();
  }
}

/** The process's own terminal, and the client run on a command line. */
const terminal = (run: DecideIo['run']): DecideIo => ({
  input: process.stdin,
  output: process.stdout,
  interactive: process.stdin.isTTY === true && process.stdout.isTTY === true,
  run,
});

/** `nemia decide <args>`: the screen of a run's decision, then, at a terminal, the command a person picks run. Answers its exit code. */
export async function decide(args: readonly string[], run: DecideIo['run'], io: DecideIo = terminal(run)): Promise<number> {
  if (args.includes('--local')) throw noLocal('decide');
  if (args.includes('--help')) {
    io.output.write(`${DECIDE_HELP}\n`);
    return 0;
  }
  if (args.includes('--sensitive'))
    throw new Refused(
      'nemia decide takes no --sensitive here: the api reads the default check-affecting globs alone. Type it again without --sensitive',
    );
  const [runId, ...more] = args;
  if (runId === undefined || runId === '' || runId.startsWith('-') || more.length)
    throw new Refused(`nemia decide takes the run alone: nemia decide <runId> (nemia decide --help)`);
  const decision = await asked('decide', (client) => client.runs.decision({ params: { runId } }));
  for (const line of decisionLines(runId, decision)) io.output.write(`${line}\n`);
  const commands = 'commands' in decision ? decision.commands : [];
  return io.interactive && commands.length ? picked(commands, io) : 0;
}
