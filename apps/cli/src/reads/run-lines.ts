/**
 * The lines `nemia ls <run>` prints of one run, off the `Run` the api answers (`GET /api/runs/:name`), in the words its status already
 * carries: its head line — its name, its brief's first line, whether it was called off, what it cost and the labels asked — then a step a
 * line, its word, its cost, its branch and its note, and under them what it asks of a person: what to decide, the steps that wait on
 * you, a run waited on that never lands, a hold and what lifts it, and where its work ended up. Pure.
 */
import type { Run, RunStepStatus, TableAsked } from 'objects';

/** How much of a brief's first line the head line shows. */
const BRIEF_WIDTH = 56;

/** The width a step's name is padded to. */
const NAME_WIDTH = 14;

/** The least width a step's word is padded to. */
const WORD_WIDTH = 20;

/** The engine's bare word for a session that waits on its harness, which a step's `waitingFor` words. */
const NEEDS_HUMAN = 'needs-human';

/** `text` up to its first line's end. */
const firstLine = (text: string): string => text.split('\n')[0] ?? text;

/** A step's word: a session at `needs-human` says what it waits for, before what its closeout said. */
const stepWordOf = (step: RunStepStatus): string =>
  step.waitingFor && step.message.startsWith(NEEDS_HUMAN)
    ? `${NEEDS_HUMAN}: ${step.waitingFor.words}${step.message.slice(NEEDS_HUMAN.length)}`
    : step.message;

/** What a step at work runs on, `on v1.2.0, codex 0.200.0`, off its latest attempt while that has not ended; none else. */
const ranOnOf = ({ attempts: { latest } }: RunStepStatus): string | undefined => {
  if (latest === null || latest.ended !== null) return undefined;
  const said = [
    ...(latest.release === null ? [] : [latest.release.kind === 'install' ? latest.release.tag : 'checkout']),
    ...(latest.harness === null ? [] : [`${latest.harness.name} ${latest.harness.version}`]),
  ];
  return said.length ? `on ${said.join(', ')}` : undefined;
};

/** A step's note: its own, how many questions its closeout asks, what it runs on and what its try was denied; none where it has none. */
const noteOf = (step: RunStepStatus): string | undefined =>
  [step.note, step.asks ? `asks ${step.asks} question${step.asks === 1 ? '' : 's'}` : '', ranOnOf(step), step.denied?.words]
    .filter(Boolean)
    .join(' · ') || undefined;

/** The labels asked beside the head line: the whole map with `--show-labels`, and each `-L <key>`'s value, `<none>` where unset. */
const labelsOf = (labels: Readonly<Record<string, string>>, asked: TableAsked): string => {
  const keys = Object.keys(labels).sort();
  const all = keys.length === 0 ? '<none>' : keys.map((key) => `${key}=${labels[key] ?? ''}`).join(',');
  return `${asked.showLabels ? `  labels: ${all}` : ''}${asked.columns.map((key) => `  ${key}: ${labels[key] ?? '<none>'}`).join('')}`;
};

/** What the run asks of a person, a line each: what to decide, the steps that wait on you, a wait or a hold, and its result. */
const asksLines = ({ metadata: { name }, status }: Run): string[] => {
  const { toDecide, waiting, holding, result = [] } = status;
  const words = status.waitingOnYouWords.filter((said) => !(toDecide?.kind === 'approve' && said === `approve ${toDecide.step}`));
  const lifting = holding !== null && holding.runs.length > 0 && holding.runs.every((r) => r.landed);
  const held =
    holding === null
      ? []
      : [`   → ${holding.word}${holding.waitingOnYou ? `: ${holding.advice}` : lifting ? '' : `  —  nemia hold ${name} --off lifts it`}`];
  return [
    ...(toDecide ? [`   → to decide: ${toDecide.said}`] : []),
    ...(words.length ? [`   → waiting on you: ${words.join(', ')}  —  nemia decide ${name}`] : []),
    ...(waiting?.waitingOnYou ? [`   → waiting on you: ${waiting.advice}`] : []),
    ...held,
    ...(result.length ? [`   → result: ${result.join(', ')}  —  nemia decide ${name}`] : []),
  ];
};

/** The lines of `run`, its head line ending on the labels `asked` names. */
export function runLines(run: Run, asked: TableAsked): string[] {
  const { status } = run;
  const calledOff = `${status.cancelledAt ? '  (cancelled)' : ''}${status.pruned ? '  (pruned)' : ''}`;
  const cost = status.cost ? `  ${status.cost.said}` : '';
  const head = `${run.metadata.name}  ${firstLine(run.spec.brief).slice(0, BRIEF_WIDTH)}${calledOff}${cost}${labelsOf(run.metadata.labels, asked)}`;
  const said = status.steps.map((step) => ({ step, word: `${stepWordOf(step)}${step.spent ? `  ${step.spent.said}` : ''}` }));
  const width = Math.max(WORD_WIDTH, ...said.map(({ word }) => word.length));
  return [
    head,
    ...said.map(({ step, word }) => {
      const note = noteOf(step);
      return `   ${step.name.padEnd(NAME_WIDTH)} ${word.padEnd(width)} ${step.branch ?? ''}${note ? `  · ${note}` : ''}`;
    }),
    ...asksLines(run),
  ];
}
