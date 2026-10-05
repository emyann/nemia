/**
 * What the engine forgot of a run's tasks, or without `yes` would forget (`engineForgetting` in `forgetting.verb.ts`): one call's answer
 * over many tasks (`EngineAnswer`), each run's share of it (`forgettingOf`), and the words `nemia rm`, `nemia prune` and the tick say of
 * it (`engineWords`). Pure.
 */
import { sizeOf } from '../artifacts/artifacts.ts';

/** A task the engine forgot, or would: its journal's bytes, its lines in the feed, and what its harness keeps that the runtime leaves. */
export type TaskForgotten = { taskId: string; journalBytes: number; feedLines: number; left: string[] };

/** A task the engine has not forgotten, and why, in the runtime's words. */
export type TaskKept = { taskId: string; why: string };

/**
 * One call over the engine (`engineForgetting`): each task forgotten, or that would be; each that waits, not settled yet; each the engine
 * refused on its own account, settled; and why the engine refused the whole call, for a reason no one task carries.
 */
export type EngineAnswer = { tasks: TaskForgotten[]; waiting: TaskKept[]; refused: TaskKept[]; refusal?: string };

/**
 * What the engine forgot of one run's tasks, or would (`forgettingOf`): the tasks forgotten; those that wait, not settled, with the
 * runtime's words for why (`why`, each once); those the engine refused by name, with its words (`refusedWhy`, each once); what their
 * harness keeps that the runtime leaves (`left`); the engine's refusal of the whole call; the journals' bytes and feed lines of the tasks
 * forgotten; and, while something is left, where the run's marker keeps their ids (`marker`, `runStore.forgetting`).
 */
export type EngineForgetting = {
  forgotten: string[];
  waiting: string[];
  why: string[];
  refused: string[];
  refusedWhy: string[];
  left: string[];
  refusal?: string;
  journalBytes: number;
  feedLines: number;
  marker?: string;
};

/** The share of `answer` that is the tasks `ids`: a refusal of the whole call is every run's. */
export function forgettingOf(answer: EngineAnswer, ids: readonly string[]): EngineForgetting {
  const own = new Set(ids);
  const tasks = answer.tasks.filter((t) => own.has(t.taskId));
  const waiting = answer.waiting.filter((w) => own.has(w.taskId));
  const refused = answer.refused.filter((r) => own.has(r.taskId));
  return {
    forgotten: tasks.map((t) => t.taskId),
    waiting: waiting.map((w) => w.taskId),
    why: [...new Set(waiting.map((w) => w.why))],
    refused: refused.map((r) => r.taskId),
    refusedWhy: [...new Set(refused.map((r) => r.why))],
    left: tasks.flatMap((t) => t.left),
    ...(answer.refusal ? { refusal: answer.refusal } : {}),
    journalBytes: tasks.reduce((n, t) => n + t.journalBytes, 0),
    feedLines: tasks.reduce((n, t) => n + t.feedLines, 0),
  };
}

/** Whether the engine has nothing left to forget of the run: no task waits, none was refused, and the call was not refused. */
export const forgettingDone = (f: EngineForgetting): boolean => !f.waiting.length && !f.refused.length && f.refusal === undefined;

/** Whether the engine refused to forget something of the run: a task by name, or the whole call. */
export const forgettingRefused = (f: EngineForgetting): boolean => f.refused.length > 0 || f.refusal !== undefined;

/** `n` tasks, in words. */
const tasksWord = (n: number): string => `${n} task${n === 1 ? '' : 's'}`;

/** What `nemia rm` says it forgot of the run `id`'s tasks, or, `dry`, what `nemia prune` says it would; empty when it forgot none. */
const forgotWords = (f: EngineForgetting, id: string, dry: boolean): string => {
  const n = f.forgotten.length;
  if (!n) return '';
  const size = `${sizeOf(f.journalBytes)} of journal, ${f.feedLines} feed line${f.feedLines === 1 ? '' : 's'}`;
  return dry
    ? `the engine keeps ${tasksWord(n)} of it (${size}): nemia rm ${id} forgets them`
    : `the engine forgot ${tasksWord(n)} of it (${size})`;
};

/** What waits of the run's tasks, and why, and, unless `dry`, that the passes forget it from `marker`; empty when nothing waits. */
const waitWords = (f: EngineForgetting, marker: string, dry: boolean): string => {
  const one = f.waiting.length === 1;
  if (!f.waiting.length) return '';
  if (dry) return `${tasksWord(f.waiting.length)} of it ${one ? 'is' : 'are'} not to be forgotten yet: ${f.why.join('; ')}`;
  const once = one ? 'it once it settles' : 'them once they settle';
  return `${tasksWord(f.waiting.length)} of it ${one ? 'waits' : 'wait'} — ${f.why.join('; ')} — and the daemon's passes forget ${once}, from ${marker}`;
};

/**
 * The engine's refusals, of tasks by name and of the whole call, in its words, and, unless `dry`, the marker they leave, which only a
 * person removes; empty without one.
 */
const refusalWords = (f: EngineForgetting, marker: string, dry: boolean): string => {
  if (!forgettingRefused(f)) return '';
  const refused = dry ? 'would refuse' : 'refused';
  const said = [
    f.refused.length ? `the engine ${refused} to forget ${tasksWord(f.refused.length)} of it: ${f.refusedWhy.join('; ')}` : '',
    f.refusal === undefined ? '' : `the engine ${refused} to forget its tasks: ${f.refusal}`,
  ]
    .filter(Boolean)
    .join('; ');
  if (dry) return said;
  const asks = `${marker} keeps their ids and the daemon asks again each pass`;
  return `${said} ${asks}; only a person removes it, once nothing of them is wanted: rm ${marker}`;
};

/**
 * What `nemia rm` says the engine did with the run `id`'s tasks, or, `dry`, what `nemia prune` says it would: the tasks forgotten with
 * their journals' size and feed lines, what their harness keeps, what waits and why, and what the engine refused with the marker it
 * leaves, which only a person removes. Empty when the engine keeps no task of the run.
 */
export function engineWords(f: EngineForgetting, { id, dry = false }: { id: string; dry?: boolean }): string {
  const marker = f.marker ?? `the marker of ${id}`;
  const left = f.left.length ? `${dry ? 'it would leave' : 'it left'} ${f.left.join('; ')}` : '';
  return [forgotWords(f, id, dry), left, waitWords(f, marker, dry), refusalWords(f, marker, dry)].filter(Boolean).join('; ');
}

/** What `nemia prune` says of the run `id` whose tasks it could not count, since reading it as `nemia rm` does failed with `why`. */
export const uncountedWords = (id: string, why: string): string =>
  `${id}: what nemia rm would forget of the engine's tasks of it was not counted: ${why}`;
