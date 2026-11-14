/**
 * Words a person says to a step's session while it runs (`nemia say`): what the engine journalled (`Said`, `SaidTo`), what the package
 * refuses before the engine is asked (`sayRefusal`), when the words are kept for a step's first try instead (`saidAhead`), and how
 * `nemia ls` and `nemia decide` show them (`saidWord`, `saidBeforeWord`, `saidLines`). Pure.
 */
import type { StepSpec } from '../step/step.ts';
import { fenced, prunedWords, tryOf, type Run, type TaskPhase } from '../record/record.ts';
import { holdWord } from '../wait/wait.ts';
import type { SaidAfter } from 'objects';
import type { SaidBy, SaidFrom } from '../../contracts/step-speaker.contract.ts';
import { AGENT_OPENS, AGENT_WRITES } from '../chat/index.ts';

export { AGENT_OPENS, AGENT_WRITES } from '../chat/index.ts';

export type { SaidFrom } from '../../contracts/step-speaker.contract.ts';

/**
 * A person's words, said to a step's session while it ran (`nemia say`), as the engine journalled them: when, to which attempt of the
 * step's task, the words as given, and the last event of the session's transcript before they went (`after`, `{ kind, id }`, null when
 * the engine read none). The engine's own `Said`, named here because this file does not import the engine: views.verb.ts reads it off
 * the task's `state.said`. The engine's journal is the record, and the run keeps no copy.
 */
export type Said = { at: string; attempt: number; text: string; after?: { kind: SaidAfterKind; id: string } | null };

/**
 * The kind of the transcript event a said message follows: the runtime's `TranscriptEvent['kind']`, written out here because this file
 * imports no runtime, and held equal to it in `runtime-client.ts` (`saidAfterKindHeld`).
 */
export type SaidAfterKind = SaidAfter;

/** What was said to one of a step's tries: the engine's entry, and the try whose task it is on. */
export type SaidTo = Said & { try: number };

/**
 * Whether words said to the step `name` now are kept for its first try rather than said to a session: nothing of it is filed — no task,
 * and no try behind it. Pure. `sayRefusal` still judges a cancelled or pruned run, and a step the run does not have.
 */
export const saidAhead = (run: Run, name: string): boolean => {
  const step = run.steps[name];
  return step !== undefined && !step.taskId && !step.tries?.length;
};

/**
 * Why `nemia say` will not hand a step's session words, in words that say what to do instead — or null, when the engine may be asked, or
 * the words kept for a step nothing of which is filed (`saidAhead`). Pure.
 *
 * The package's own refusals, before the engine is asked: a step the run does not have; a cancelled run, whose sessions are being stopped;
 * a step with no task filed whose tries are behind it (sent back, or a round to be filed again), where no session is there to hear and no
 * first try is left to carry them; and a step whose current try's task has settled, where no session is running to hear anything — words
 * for such a step go into its next try's brief, with `nemia retry --message`. A step nothing of which is filed yet is no refusal, nor is it
 * the engine's: its words are kept for its first try (`saidAhead`), unless the run was pruned, which files nothing more. Everything else
 * about the session — words that are empty, an attempt not started, a harness with no way in, a session its harness does not list — is the
 * engine's to refuse, in its own words (`Engine.say`). A settled step of a pruned or a held run is told that the try that would carry the
 * words is refused (`prunedRefusal`, `heldRefusal`).
 */
export function sayRefusal(steps: readonly StepSpec[], run: Run, name: string, phaseOf: (taskId: string) => TaskPhase): string | null {
  if (!steps.some((s) => s.name === name) || !run.steps[name])
    return `${run.id} has no step "${name}" — its steps are ${steps.map((s) => s.name).join(', ')}.`;
  if (run.cancelledAt) {
    return `${run.id} was cancelled at ${run.cancelledAt}: its sessions are being stopped, not steered, and a cancelled run files nothing more. Start a new run for the work with nemia start.`;
  }
  const taskId = run.steps[name].taskId;
  if (!taskId && run.pruned)
    return `${name} has not been filed, and it never will be: ${run.id} was ${prunedWords(run.pruned)}, so nothing would carry the words.`;
  if (!taskId) {
    if (saidAhead(run, name)) return null;
    return `${name} has no session to hear anything: try ${tryOf(run, name) - 1} is behind it and its next try is not filed yet, which is handed no words said before. Say them once that try runs: nemia ls ${run.id}.`;
  }
  const phase = phaseOf(taskId);
  if (phase === 'succeeded' || phase === 'failed' || phase === 'stopped') {
    const settled = `${name} is not running: try ${tryOf(run, name)}'s task settled \`${phase}\`, so no session of it is there to hear anything.`;
    if (run.pruned) return `${settled} Nor is it tried again: ${run.id} was ${prunedWords(run.pruned)}.`;
    if (run.hold)
      return `${settled} Words for the step go into its next try's brief, and no try is filed while ${run.id} is ${holdWord(run.hold.until.map((id) => ({ run: id })))}: say them once the hold lifts, or lift it first: nemia hold ${run.id} --off.`;
    return `${settled} Words for the step go into its next try's brief, where it may be tried again (nemia decide ${run.id} says): nemia retry ${run.id} ${name} --message "<words>".`;
  }
  return null;
}

/** How `nemia ls` notes a step whose current try a person said something to (`nemia say`): `said to 2×`. Empty when nobody did. */
export const saidWord = (times: number): string => (times > 0 ? `said to ${times}×` : '');

/**
 * How `nemia ls` notes a step said to before it was filed (`nemia say`, kept for its first try): `said to 2× before it ran`, while it is
 * on its first try or has none yet. Empty when nobody did.
 */
export const saidBeforeWord = (times: number): string => (times > 0 ? `said to ${times}× before it ran` : '');

/**
 * What `nemia decide` prints under a step, before its closeout: each thing a person said to its sessions while they ran (`nemia say`), in
 * the order given — when, to which try, and to which attempt where it was not the first — and the words as data, in a fence longer than any
 * run of backticks in them (`fenced`), as a try's brief carries an answer: words that read as a heading or a command are shown as what was
 * said. Pure. None when nothing was said, so the screen of a step nobody spoke to is what it was.
 */
export function saidLines(said: readonly SaidTo[]): string[] {
  return said.flatMap((s) => [
    `said to try ${s.try}${s.attempt > 1 ? `, attempt ${s.attempt}` : ''}, at ${s.at}:`,
    ...fenced(s.text, 'text'),
  ]);
}

/**
 * Who the words `text` a step's journal holds are from, and the words without their frame: an agent's where they stand in the frame
 * `framedFor` writes (`AGENT_OPENS`, a name up to the first `AGENT_WRITES`, which may hold a space as an agent's name may, then that
 * phrase), the person's as journalled otherwise — every say from before words were framed among them. Pure: read back each time,
 * nothing kept beside the journal.
 *
 * Two of its tests hold of every text the others pass, and are made so the verifier need not prove them of `indexOf` and `slice`: that
 * the name, cut at the first `AGENT_WRITES`, holds none; and that the frame written again around the name and the words is the text.
 */
export const saidBy: SaidBy = (text) => {
  const asJournalled = { from: { kind: 'person' }, words: text } as const;
  if (!text.startsWith(AGENT_OPENS)) return asJournalled;
  const rest = text.slice(AGENT_OPENS.length);
  const end = rest.indexOf(AGENT_WRITES);
  if (end <= 0) return asJournalled;
  const name = rest.slice(0, end);
  if (name.includes(AGENT_WRITES)) return asJournalled;
  const after = rest.slice(end);
  if (!after.startsWith(AGENT_WRITES)) return asJournalled;
  const words = after.slice(AGENT_WRITES.length);
  if (AGENT_OPENS + name + AGENT_WRITES + words !== text) return asJournalled;
  return { from: { kind: 'agent', name }, words };
};

/**
 * A said as the run's step status shows it (`objects`' `Said`): the engine's entry as journalled, with who wrote it (`from`) and its
 * words without the frame (`words`) where an agent did; the person's unchanged, no key added. Pure.
 */
export function saidOf<S extends { text: string }>(said: S): S | (S & SaidFrom) {
  const by = saidBy(said.text);
  return by.from.kind === 'agent' ? { ...said, from: by.from, words: by.words } : said;
}
