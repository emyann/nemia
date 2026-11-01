/**
 * The run store on files under `WF_ROOT`: `filesStore`, the only implementation of `RunStore`, made of the functions of
 * `record.store.ts` and of a person's writes beside them here, and the path of the inbox (`inboxDir`), whose cards are the Card door's
 * (`src/cards/cards.store.ts`); the claims of the cards started (`claimCard`); and `runStore`, the one binding every controller reads it
 * through, where another implementation would be swapped in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Schema } from 'effect';
import { pauseFile, readPause } from '../pause/pause.store.ts';
import type { Pause } from '../pause/pause.ts';
import type { AskKey, AskOf, AsksRead, AskWritten, PersonRequest, Pruned, Run, RunStore } from './record.ts';
import type { RetryAsk } from '../retry/index.ts';
import type { RoundAsk } from '../status/status.ts';
import {
  HOME,
  UnreadableRecord,
  acceptFile,
  acceptanceIn,
  approvalFile,
  approvalIn,
  askFile,
  askIn,
  asksDir,
  cancelFile,
  consumeAsks,
  doneWith,
  fileNames,
  heldIn,
  holdFile,
  listRuns,
  lstatOf,
  markCancelled,
  pruneFile,
  readAnswers,
  readPruned,
  readAs,
  readAsks,
  readRun,
  removeHold,
  restStamps,
  rewriteRun,
  roundAskFile,
  sayOnce,
  roundAskIn,
  runFile,
  runsDir,
  writeAsk,
  writeHold,
  writeRun,
  When,
} from './record.store.ts';
import { mergeSpent } from '../merge/merge.ts';
import { keptRecords, type RecordMemo } from '../rest/index.ts';
import { verifiesRest } from '../config/config.store.ts';

/** Each ask, by which it is: the file it is written at, by run, step and number, and its reader, as the tick reads it. */
const ASKS: Record<
  AskOf,
  { file: (id: string, step: string, n: number) => string; read: (file: string, step: string, n: number) => unknown }
> = {
  try: { file: askFile, read: askIn },
  round: { file: roundAskFile, read: roundAskIn },
  gate: { file: approvalFile, read: approvalIn },
  loop: { file: acceptFile, read: acceptanceIn },
  base: { file: mergeAskFile, read: mergeAskIn },
};

/** The file of the ask `key` of the run `id`. */
const askWhere = (id: string, { of, step, n }: AskKey): string => ASKS[of].file(id, step, n);

/**
 * Write a person's ask at its name (`writeAsk`), the ask alone; and, when a file already stands there, why it is no ask of its kind: its
 * reader's words, or null when it reads as one or is gone since.
 */
function writePersonAsk(id: string, person: PersonRequest): AskWritten {
  const { of, ask } = person;
  const [step, n] =
    person.of === 'base' ? [person.ask.merge.target, person.ask.merge.try] : [ask.step, 'round' in ask ? ask.round : ask.try];
  const where = askWhere(id, { of, step, n });
  if (writeAsk(where, askHeld(person))) return { written: true, where };
  const read = ASKS[of].read(where, step, n);
  return { written: false, where, stray: typeof read === 'string' && lstatOf(where) ? read : null };
}

/** What a person's ask file holds: the ask as its verb gave it, but a merge's, which holds its loop, round, base, commit and time. */
function askHeld(person: PersonRequest): Parameters<typeof writeAsk>[1] {
  if (person.of !== 'base') return person.ask;
  const { step, round, at, merge } = person.ask;
  return { loop: step, round, onto: merge.onto, sha: merge.sha, at, ...(merge.landing ? { landing: merge.landing } : {}) };
}

const MergeAskFileSchema = Schema.StructWithRest(
  Schema.Struct({
    loop: Schema.NonEmptyString,
    round: Schema.Int,
    onto: Schema.NonEmptyString,
    sha: Schema.NonEmptyString,
    at: When,
    landing: Schema.optional(Schema.Struct({ step: Schema.NonEmptyString, check: Schema.NonEmptyString })),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** A merge ask's file in the run's asks directory: `merge-<step>-<n>`, the loop's target and its try that merges the base. */
function mergeAskFile(id: string, step: string, n: number): string {
  return path.join(asksDir(id), `merge-${step}-${n}`);
}

/**
 * One merge ask file, read: the loop's target and its try from its name; the looping step, the round it is on, the base branch, its commit
 * and when from what it holds — as a round ask of that looping step and round, with what it merges (`RoundAsk.merge`) — or why it cannot be
 * read.
 */
function mergeAskIn(file: string, step: string, n: number): RoundAsk | string {
  const held = heldIn(file);
  if ('unreadable' in held) return held.unreadable;
  const read = readAs(MergeAskFileSchema, held.read);
  if ('refused' in read) return read.refused === 'at' ? 'it says no time it was given' : 'it is not an ask nemia refresh --base wrote';
  const { loop, round, onto, sha, at, landing } = read.read;
  return { step: loop, round, at, merge: { target: step, try: n, onto, sha, ...(landing ? { landing: { ...landing } } : {}) } };
}

/** The merge asks waiting in a run's directory, and a line for each file named as one that cannot be read as one. */
function readMergeAsks(id: string): { rounds: RoundAsk[]; notes: string[] } {
  const rounds: RoundAsk[] = [];
  const notes: string[] = [];
  for (const name of fileNames(asksDir(id)) ?? []) {
    const [, target, n] = /^merge-(.+)-(\d+)$/.exec(name) ?? [];
    const file = path.join(asksDir(id), name);
    const ask = target !== undefined && n !== undefined ? mergeAskIn(file, target, Number(n)) : undefined;
    if (typeof ask === 'string') notes.push(`${file}: ${ask}, so it is not honoured — remove it, and ask with nemia refresh --base`);
    else if (ask) rounds.push(ask);
  }
  return { rounds, notes };
}

/** Move each merge ask among `rounds` the run's record already answers (`mergeSpent`) into `done/`: the tick's one touch on it. */
function consumeMergeAsks(run: Run, rounds: readonly RoundAsk[]): void {
  const spent = rounds.flatMap((a) => (a.merge && mergeSpent(run, a) ? [mergeAskFile(run.id, a.merge.target, a.merge.try)] : []));
  doneWith(run.id, spent);
}

/** The asks waiting in a run's directory (`readAsks`), a person's merges among its rounds (`readMergeAsks`). */
function readAllAsks(id: string): AsksRead {
  const { asks, rounds, notes } = readAsks(id);
  const merges = readMergeAsks(id);
  return { asks, rounds: [...rounds, ...merges.rounds], notes: [...notes, ...merges.notes] };
}

/** Consume the asks the run's record answers (`consumeAsks`), its merges apart (`consumeMergeAsks`). */
function consumeAllAsks(run: Run, asks: readonly RetryAsk[], rounds: readonly RoundAsk[], voided: readonly RetryAsk[] = []): void {
  consumeAsks(
    run,
    asks,
    rounds.filter((a) => !a.merge),
    voided,
  );
  consumeMergeAsks(run, rounds);
}

/** Remove the run's record and a person's files beside it, and its own directory, answering each path removed from `WF_ROOT`. */
function removeRunFiles(id: string): string[] {
  const removed: string[] = [];
  for (const at of [runFile(id), cancelFile(id), pruneFile(id), holdFile(id), refreshFile(id), asksDir(id), path.join(runsDir(), id)]) {
    const st = lstatOf(at);
    if (!st) continue;
    fs.rmSync(at, { recursive: true, force: true });
    removed.push(`${path.relative(HOME, at)}${st.isDirectory() ? '/' : ''}`);
  }
  return removed;
}

/** Whether an id names something of a run in the store: its record, a person's file beside it, its asks or its own directory. */
function runIdTaken(id: string): boolean {
  let names: string[];
  try {
    names = fs.readdirSync(runsDir());
  } catch {
    return false;
  }
  return names.some((name) => name === id || name.startsWith(`${id}.`));
}

/** The id of every `<id>.json` under `runs/`, read or not, sorted; none when there is no `runs/`. */
function runIds(): string[] {
  try {
    return fs
      .readdirSync(runsDir())
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.basename(f, '.json'))
      .sort();
  } catch {
    return [];
  }
}

/**
 * That a person asked the run to take the new revisions (`nemia refresh`): `{ at }`, a person's fact in a file of its own for the reason
 * `cancelFile` is. Written by `refresh` alone, exclusively; removed by the pass that takes the revisions it asked for (`removeRefresh`).
 * Never composed onto the record: the pass reads the file itself (`stands`), as a level-triggered reader must.
 */
const refreshFile = (id: string): string => path.join(runsDir(), `${id}.refresh`);

/**
 * Write down that a person asked this run to take the new revisions, and answer with the ask written — or null, when one already stands.
 * `wx`, so two people asking at once make one ask, and an ask is never edited: the pass that takes the revisions lifts it.
 */
const writeRefresh = (id: string): { at: string } | null => {
  fs.mkdirSync(runsDir(), { recursive: true });
  const ask = { at: new Date().toISOString() };
  try {
    fs.writeFileSync(refreshFile(id), JSON.stringify(ask, null, 2), { flag: 'wx' });
    return ask;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return null;
    throw err;
  }
};

/** Lift the refresh ask: whether a file was there. Taken by the pass that wrote the pins it asked for, after the record is written. */
const removeRefresh = (id: string): boolean => {
  try {
    fs.rmSync(refreshFile(id));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
};

/** The run's files directory, `runs/<id>/artifacts`. */
const filesDir = (id: string): string => path.join(runsDir(), id, 'artifacts');

/** The run's files directory while it is a directory and no link; else undefined. */
const filesAt = (id: string): string | undefined => (lstatOf(filesDir(id))?.isDirectory() ? filesDir(id) : undefined);

/** Remove the run's files directory: null once it is gone; else the first line of what the filesystem said. */
function dropFiles(id: string): string | null {
  try {
    fs.rmSync(filesDir(id), { recursive: true, force: true });
    return null;
  } catch (err) {
    return lstatOf(filesDir(id)) ? ((err as Error).message.split('\n')[0] ?? '') : null;
  }
}

/** Write the prune marker whole, or remove it for `undefined`. */
const writePruned = (id: string, marker: Pruned | undefined): void =>
  marker ? fs.writeFileSync(pruneFile(id), JSON.stringify(marker, null, 2)) : fs.rmSync(pruneFile(id), { force: true });

/**
 * The inbox: cards before they are started, one `<name>.md` per card (`parseInboxCard` in inbox.ts), in the store beside `runs/` — not in a
 * repository, since a card's `repo:` says which one the idea is about.
 */
export const inboxDir = (): string => path.join(HOME, 'inbox');

/** Where `nemia rm` writes down the engine's tasks of the runs it forgets: beside `runs/`, since each `runs/<id>.*` goes with a record. */
const forgettingDir = (): string => path.join(HOME, 'forgetting');

/** The marker of the run `id`. */
const forgettingFile = (id: string): string => path.join(forgettingDir(), `${id}.json`);

/** A marker as `nemia rm` writes it; any key beside these is left unread. */
const isForgetting = Schema.is(Schema.Struct({ run: Schema.String, taskIds: Schema.Array(Schema.String) }));

/** The marker of the run `id` written whole, through a hidden file renamed over it, the folder made first. */
function writeForgetting(id: string, taskIds: readonly string[]): void {
  fs.mkdirSync(forgettingDir(), { recursive: true });
  const hidden = path.join(forgettingDir(), `.${id}.json.${process.pid}`);
  fs.writeFileSync(hidden, JSON.stringify({ run: id, taskIds: [...taskIds] }, null, 2));
  fs.renameSync(hidden, forgettingFile(id));
}

/** The task ids the marker of the run `id` lists, or undefined: none there, or one that does not read as a marker. */
function readForgetting(id: string): string[] | undefined {
  let text: string;
  try {
    text = fs.readFileSync(forgettingFile(id), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  try {
    const marker: unknown = JSON.parse(text);
    if (isForgetting(marker) && marker.run === id) return [...marker.taskIds];
  } catch {}
  return undefined;
}

/** The runs a marker stands for: each `<id>.json` of the folder, none when there is no folder. */
function forgettingRuns(): string[] {
  try {
    return fs
      .readdirSync(forgettingDir())
      .filter((n) => n.endsWith('.json') && !n.startsWith('.'))
      .map((n) => n.slice(0, -'.json'.length))
      .sort();
  } catch {
    return [];
  }
}

/**
 * The run as it reads with the store's pause (`readPause`) composed onto it — the one given, read where none is — or without one while
 * none stands: a run the tick's memo kept is read with the pause as it stands now, so the pause is in no run's stamp (`restStamps`): a
 * run at rest has nothing due for it to hold, and one it holds anything of is `running`, never at rest. A run that already reads with
 * the pause as it stands, or with none while none does, is the very run given, which the memo knows by identity (`keptOf`). Never
 * written into the record.
 */
function paused(run: Run, pause: Pause | null = readPause()): Run {
  if (isDeepStrictEqual(run.pause ?? null, pause)) return run;
  const { pause: _, ...bare } = run;
  return pause ? { ...bare, pause } : bare;
}

/**
 * The run `id` names, read with `pause` composed onto it as `runs.read` composes the store's own — for an id the caller has already
 * matched against the store's listing. Undefined for a record removed between the listing and the read, and for one that does not read
 * as a run (`UnreadableRecord`), which is said on `said`, as `listRuns` says it: the run page answers that there is no such run where
 * it used to throw.
 */
function runListed(id: string, said: (line: string) => void, pause: Pause | null): Run | undefined {
  try {
    return paused(readRun(id), pause);
  } catch (err) {
    if (err instanceof UnreadableRecord) said(`left out: ${err.message}`);
    else if (fs.existsSync(runFile(id))) throw err;
    return undefined;
  }
}

/**
 * The run `id` names, found among the ids the store lists (`runIds`), never read by a path made of the id, so no id — one climbing out
 * with `..`, an absolute one — can name a file outside `runs/`; with the store's pause composed onto it as `runs.read` composes it, and
 * undefined for an id the store does not list, or that does not read (`runListed`).
 */
function findRun(id: string, said: (line: string) => void = sayOnce): Run | undefined {
  return runIds().includes(id) ? runListed(id, said, readPause()) : undefined;
}

/** Where the claims of the cards started are, `<card>.json` each: beside `runs/`, so that no listing of runs reads one. */
const startedDir = (): string => path.join(path.dirname(runsDir()), 'started');

/** The run the claim at `file` names, or undefined: none there, or one that does not read as a claim. */
function claimedAt(file: string): string | undefined {
  try {
    const claim: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isClaim(claim) ? claim.run : undefined;
  } catch {
    return undefined;
  }
}
const isClaim = Schema.is(Schema.Struct({ run: Schema.String }));

/**
 * Claim the card `card` for the run `id`: `started/<card>.json`, created exclusively (`wx`), so that of two processes starting one card
 * one run holds it. The run's record is written before its claim, so a claim whose run has no record, or a record from another card, is
 * stale — a run forgotten, a crash between the writes — and is taken over: renamed aside, which only one taker can do; put back if what
 * was renamed is not what was judged stale, since another taker came between; else made again, once. Answers whom the card is the run
 * of when it is not `id`.
 */
export function claimCard(card: string, id: string): { taken: true } | { by: string } {
  const file = path.join(startedDir(), `${card}.json`);
  const create = (): boolean => {
    try {
      fs.writeFileSync(file, JSON.stringify({ run: id }, null, 2), { flag: 'wx' });
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw err;
    }
  };
  fs.mkdirSync(startedDir(), { recursive: true });
  if (create()) return { taken: true };
  const by = claimedAt(file);
  if (by !== undefined && by !== id && findRun(by)?.from?.inbox === card) return { by };
  const tomb = path.join(startedDir(), `.${card}.${process.pid}.${Math.random().toString(36).slice(2)}`);
  try {
    fs.renameSync(file, tomb);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const renamed = fs.existsSync(tomb) ? claimedAt(tomb) : by;
  if (renamed !== by) {
    try {
      fs.linkSync(tomb, file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    fs.rmSync(tomb, { force: true });
    return { by: renamed ?? 'another run' };
  }
  fs.rmSync(tomb, { force: true });
  return create() ? { taken: true } : { by: claimedAt(file) ?? 'another run' };
}

/**
 * A run's record and a person's files beside it, each a file of its own under `runs/`, with the store's pause composed onto each run read
 * (`paused`); the markers of the runs `nemia rm` forgets, under `forgetting/`.
 */
export const filesStore: RunStore = {
  runs: {
    read: (id) => paused(readRun(id)),
    find: findRun,
    list: (said, kept) => {
      const pause = readPause();
      return listRuns(said, kept).map((run) => paused(run, pause));
    },
    create: writeRun,
    rewrite: rewriteRun,
    stamps: restStamps,
    exists: (id) => fs.existsSync(runFile(id)),
    taken: runIdTaken,
    calledOff: (id) => [cancelFile, pruneFile, holdFile].some((file) => fs.existsSync(file(id))) || fs.existsSync(pauseFile()),
    cancel: markCancelled,
    forget: removeRunFiles,
    ids: runIds,
    filesAt,
    dropFiles,
    prune: writePruned,
    pruned: readPruned,
  },
  asks: { read: readAllAsks, answers: readAnswers, consume: consumeAllAsks, write: writePersonAsk, where: askWhere },
  holds: { lift: removeHold, put: writeHold, stands: (id) => fs.existsSync(holdFile(id)) },
  refresh: { lift: removeRefresh, put: writeRefresh, stands: (id) => fs.existsSync(refreshFile(id)) },
  forgetting: {
    write: writeForgetting,
    read: readForgetting,
    list: forgettingRuns,
    lift: (id) => fs.rmSync(forgettingFile(id), { force: true }),
    where: forgettingFile,
  },
};

/** The run store every controller reads and writes through. */
export const runStore: RunStore = filesStore;

/**
 * Every run of the store as `project` reads it, off `memo` where one is handed in (`keptRecords`): the store stamped before any record
 * is read, each run whose stamp stands answered from memory, and each other read by id. With no memo — the command line's reads, and a
 * test's cold read — every record is read, and nothing is kept. `env` says whether each kept projection is judged afresh too
 * (`WF_VERIFY_REST`).
 *
 * The store is listed once and its pause read once for the whole read, as `runs.list` lists and reads them once: `runs.find` does both
 * for its one run, and a read that went through it per run would list the store once per run.
 */
export const keptRuns = <P>(memo: RecordMemo<P> | undefined, project: (run: Run) => P, env: NodeJS.ProcessEnv = process.env): P[] => {
  const listed = new Set(runIds());
  const pause = readPause();
  const find = (id: string) => (listed.has(id) ? runListed(id, sayOnce, pause) : undefined);
  return keptRecords(memo, { stamps: runStore.runs.stamps(), find, verify: verifiesRest(env) }, project);
};
