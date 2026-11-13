/**
 * The run store on files under the store's root a caller hands it: `filesStoreAt(home)`, the only implementation of `RunStore`, made of
 * the functions of `record.store.ts` and of a person's writes beside them here, and the path of the inbox (`inboxDir`), whose cards are
 * the Card door's (`src/cards/cards.store.ts`); and the claims of the cards started (`claimCard`). The Run door (`src/runs/runs.store.ts`)
 * is the one file of src that reads and writes a run through `filesStoreAt`: every other reads the door (`test/run-store.test.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Schema } from 'effect';
import { pauseFile, readPause } from '../pause/pause.store.ts';
import type { Pause } from '../pause/pause.ts';
import type { AskKey, AskOf, AsksRead, AskWritten, PersonRequest, Pruned, Run, RunStore } from './record.ts';
import type { Labels } from '../labels/labels.ts';
import type { RetryAsk } from '../retry/index.ts';
import type { RoundAsk } from '../status/status.ts';
import {
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
  runRecord,
  removeHold,
  restStamps,
  rewriteRun,
  roundAskFile,
  sayOnce,
  roundAskIn,
  runFile,
  runsDir,
  saidDir,
  keepSaid,
  writeAsk,
  writeHold,
  writeRun,
  When,
} from './record.store.ts';
import { mergeSpent } from '../merge/merge.ts';
import { keptRecords, type RecordMemo } from '../rest/index.ts';
import { writeWhole } from '../whole-file/whole-file.store.ts';

/** Each ask, by which it is: the file it is written at, by run, step and number, and its reader, as the tick reads it. */
const ASKS: Record<
  AskOf,
  { file: (home: string, id: string, step: string, n: number) => string; read: (file: string, step: string, n: number) => unknown }
> = {
  try: { file: askFile, read: askIn },
  round: { file: roundAskFile, read: roundAskIn },
  gate: { file: approvalFile, read: approvalIn },
  loop: { file: acceptFile, read: acceptanceIn },
  base: { file: mergeAskFile, read: mergeAskIn },
};

/** The file of the ask `key` of the run `id`, under the store's root `home`. */
const askWhere = (home: string, id: string, { of, step, n }: AskKey): string => ASKS[of].file(home, id, step, n);

/**
 * Write a person's ask at its name (`writeAsk`), the ask alone; and, when a file already stands there, why it is no ask of its kind: its
 * reader's words, or null when it reads as one or is gone since.
 */
function writePersonAsk(home: string, id: string, person: PersonRequest): AskWritten {
  const { of, ask } = person;
  const [step, n] =
    person.of === 'base' ? [person.ask.merge.target, person.ask.merge.try] : [ask.step, 'round' in ask ? ask.round : ask.try];
  const where = askWhere(home, id, { of, step, n });
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
function mergeAskFile(home: string, id: string, step: string, n: number): string {
  return path.join(asksDir(home, id), `merge-${step}-${n}`);
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
function readMergeAsks(home: string, id: string): { rounds: RoundAsk[]; notes: string[] } {
  const rounds: RoundAsk[] = [];
  const notes: string[] = [];
  for (const name of fileNames(asksDir(home, id)) ?? []) {
    const [, target, n] = /^merge-(.+)-(\d+)$/.exec(name) ?? [];
    const file = path.join(asksDir(home, id), name);
    const ask = target !== undefined && n !== undefined ? mergeAskIn(file, target, Number(n)) : undefined;
    if (typeof ask === 'string') notes.push(`${file}: ${ask}, so it is not honoured — remove it, and ask with nemia refresh --base`);
    else if (ask) rounds.push(ask);
  }
  return { rounds, notes };
}

/** Move each merge ask among `rounds` the run's record already answers (`mergeSpent`) into `done/`: the tick's one touch on it. */
function consumeMergeAsks(home: string, run: Run, rounds: readonly RoundAsk[]): void {
  const spent = rounds.flatMap((a) => (a.merge && mergeSpent(run, a) ? [mergeAskFile(home, run.id, a.merge.target, a.merge.try)] : []));
  doneWith(home, run.id, spent);
}

/** The asks waiting in a run's directory (`readAsks`), a person's merges among its rounds (`readMergeAsks`). */
function readAllAsks(home: string, id: string): AsksRead {
  const { asks, rounds, notes } = readAsks(home, id);
  const merges = readMergeAsks(home, id);
  return { asks, rounds: [...rounds, ...merges.rounds], notes: [...notes, ...merges.notes] };
}

/** Consume the asks the run's record answers (`consumeAsks`), its merges apart (`consumeMergeAsks`). */
function consumeAllAsks(
  home: string,
  run: Run,
  asks: readonly RetryAsk[],
  rounds: readonly RoundAsk[],
  voided: readonly RetryAsk[] = [],
): void {
  consumeAsks(
    home,
    run,
    asks,
    rounds.filter((a) => !a.merge),
    voided,
  );
  consumeMergeAsks(home, run, rounds);
}

/**
 * Remove the run's record and a person's files beside it — its labels among them — and its own directory, and the claim of the card it was
 * started from while the claim names it (`claimCard`), answering each path removed from `WF_ROOT`. A claim naming another run is that
 * run's, and stays.
 */
function removeRunFiles(home: string, id: string): string[] {
  const card = cardOf(home, id);
  const removed: string[] = [];
  const files = [
    runFile(home, id),
    cancelFile(home, id),
    pruneFile(home, id),
    holdFile(home, id),
    refreshFile(home, id),
    labelsFile(home, id),
    asksDir(home, id),
    saidDir(home, id),
    path.join(runsDir(home), id),
  ];
  for (const at of files) {
    const st = lstatOf(at);
    if (!st) continue;
    fs.rmSync(at, { recursive: true, force: true });
    removed.push(`${path.relative(home, at)}${st.isDirectory() ? '/' : ''}`);
  }
  const claim = card === undefined ? undefined : path.join(startedDir(home), `${card}.json`);
  if (claim !== undefined && claimedAt(claim) === id) {
    fs.rmSync(claim, { force: true });
    removed.push(path.join('started', `${card}.json`));
  }
  return removed;
}

/** The card the record of the run `id` says it was started from, or undefined: none, no record, or one that does not read. */
function cardOf(home: string, id: string): string | undefined {
  try {
    const record: unknown = JSON.parse(fs.readFileSync(runFile(home, id), 'utf8'));
    return isFromCard(record) ? record.from.inbox : undefined;
  } catch {
    return undefined;
  }
}
const isFromCard = Schema.is(Schema.Struct({ from: Schema.Struct({ inbox: Schema.String }) }));

/** Whether an id names something of a run in the store: its record, a person's file beside it, its asks or its own directory. */
function runIdTaken(home: string, id: string): boolean {
  let names: string[];
  try {
    names = fs.readdirSync(runsDir(home));
  } catch {
    return false;
  }
  return names.some((name) => name === id || name.startsWith(`${id}.`));
}

/** The id of every `<id>.json` under `runs/`, read or not, sorted; none when there is no `runs/`. */
function runIds(home: string): string[] {
  try {
    return fs
      .readdirSync(runsDir(home))
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.basename(f, '.json'))
      .sort();
  } catch {
    return [];
  }
}

/**
 * A person's labels on the run (`nemia label run`, and `nemia start`'s copy at creation): a JSON object of strings, a person's fact in a
 * file of its own for the reason `cancelFile` is. Written whole by `writeLabels`, which removes it for an empty map, and removed by
 * `nemia rm` with the run. Composed onto the run as `labels` by every read of the store (`labelled`), and never written into the record
 * (`rewriteRun`, `writeRun`). Every write moves the run's stamp, as every `<id>.<anything>` does (`restStamps`).
 */
export const labelsFile = (home: string, id: string): string => path.join(runsDir(home), `${id}.labels`);

const isLabels = Schema.is(Schema.Record(Schema.String, Schema.String));

/**
 * The run's labels, read: undefined for a run nobody labelled. A file that does not read as a JSON object of strings labels the run with
 * nothing, and is said once on stderr, naming the file and the verb that writes it whole again.
 */
function readLabels(home: string, id: string): Labels | undefined {
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(labelsFile(home, id), 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
  }
  if (isLabels(json) && !Array.isArray(json)) return Object.keys(json).length ? json : undefined;
  sayOnce(
    `run ${id}: its labels, ${labelsFile(home, id)}, are no JSON object of strings, and are read as none: write them again with nemia label run ${id} <key>=<value> --overwrite, or remove the file`,
  );
  return undefined;
}

/**
 * Write a person's labels on the run whole, through a hidden file renamed over the one there, so a reader never reads half a map; an
 * empty map removes the file, there or not.
 */
export function writeLabels(home: string, id: string, labels: Labels): void {
  if (!Object.keys(labels).length) {
    fs.rmSync(labelsFile(home, id), { force: true });
    return;
  }
  fs.mkdirSync(runsDir(home), { recursive: true });
  writeWhole(labelsFile(home, id), JSON.stringify(labels, null, 2));
}

/** The run as its record reads (`runRecord`), with its labels composed onto it, and whatever the record carried under `labels` dropped. */
function labelled(home: string, run: Run): Run {
  const labels = readLabels(home, run.id);
  const { labels: _, ...bare } = run;
  return labels ? { ...bare, labels } : bare;
}

/**
 * The run a memo kept, noted in `given` by identity: listed as given, labels and all, since its stamp — the `.labels` file among what it
 * stamps — still holds, so its labels are not read again, and the very run is handed back (`keptOf`).
 */
function givenOf(given: Set<Run>, run: Run | undefined): Run | undefined {
  if (run) given.add(run);
  return run;
}

/**
 * That a person asked the run to take the new revisions (`nemia refresh`): `{ at }`, a person's fact in a file of its own for the reason
 * `cancelFile` is. Written by `refresh` alone, exclusively; removed by the pass that takes the revisions it asked for (`removeRefresh`).
 * Never composed onto the record: the pass reads the file itself (`stands`), as a level-triggered reader must.
 */
const refreshFile = (home: string, id: string): string => path.join(runsDir(home), `${id}.refresh`);

/**
 * Write down that a person asked this run to take the new revisions, and answer with the ask written — or null, when one already stands.
 * `wx`, so two people asking at once make one ask, and an ask is never edited: the pass that takes the revisions lifts it.
 */
const writeRefresh = (home: string, id: string): { at: string } | null => {
  fs.mkdirSync(runsDir(home), { recursive: true });
  const ask = { at: new Date().toISOString() };
  try {
    fs.writeFileSync(refreshFile(home, id), JSON.stringify(ask, null, 2), { flag: 'wx' });
    return ask;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return null;
    throw err;
  }
};

/** Lift the refresh ask: whether a file was there. Taken by the pass that wrote the pins it asked for, after the record is written. */
const removeRefresh = (home: string, id: string): boolean => {
  try {
    fs.rmSync(refreshFile(home, id));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
};

/** The run's files directory, `runs/<id>/artifacts`. */
const filesDir = (home: string, id: string): string => path.join(runsDir(home), id, 'artifacts');

/** The run's files directory while it is a directory and no link; else undefined. */
const filesAt = (home: string, id: string): string | undefined =>
  lstatOf(filesDir(home, id))?.isDirectory() ? filesDir(home, id) : undefined;

/** Remove the run's files directory: null once it is gone; else the first line of what the filesystem said. */
function dropFiles(home: string, id: string): string | null {
  try {
    fs.rmSync(filesDir(home, id), { recursive: true, force: true });
    return null;
  } catch (err) {
    return lstatOf(filesDir(home, id)) ? ((err as Error).message.split('\n')[0] ?? '') : null;
  }
}

/** Write the prune marker whole, or remove it for `undefined`. */
const writePruned = (home: string, id: string, marker: Pruned | undefined): void =>
  marker ? fs.writeFileSync(pruneFile(home, id), JSON.stringify(marker, null, 2)) : fs.rmSync(pruneFile(home, id), { force: true });

/**
 * The inbox: cards before they are started, one `<name>.md` per card (`parseInboxCard` in inbox.ts), in the store beside `runs/` — not in a
 * repository, since a card's `repo:` says which one the idea is about.
 */
export const inboxDir = (home: string): string => path.join(home, 'inbox');

/** Where `nemia rm` writes down the engine's tasks of the runs it forgets: beside `runs/`, since each `runs/<id>.*` goes with a record. */
const forgettingDir = (home: string): string => path.join(home, 'forgetting');

/** The marker of the run `id`. */
const forgettingFile = (home: string, id: string): string => path.join(forgettingDir(home), `${id}.json`);

/** A marker as `nemia rm` writes it; any key beside these is left unread. */
const isForgetting = Schema.is(Schema.Struct({ run: Schema.String, taskIds: Schema.Array(Schema.String) }));

/** The marker of the run `id` written whole, through a hidden file renamed over it, the folder made first. */
function writeForgetting(home: string, id: string, taskIds: readonly string[]): void {
  fs.mkdirSync(forgettingDir(home), { recursive: true });
  writeWhole(forgettingFile(home, id), JSON.stringify({ run: id, taskIds: [...taskIds] }, null, 2));
}

/** The task ids the marker of the run `id` lists, or undefined: none there, or one that does not read as a marker. */
function readForgetting(home: string, id: string): string[] | undefined {
  let text: string;
  try {
    text = fs.readFileSync(forgettingFile(home, id), 'utf8');
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
function forgettingRuns(home: string): string[] {
  try {
    return fs
      .readdirSync(forgettingDir(home))
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
function paused(home: string, run: Run, pause: Pause | null = readPause(home)): Run {
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
function runListed(home: string, id: string, said: (line: string) => void, pause: Pause | null): Run | undefined {
  try {
    return paused(home, labelled(home, runRecord(home, id)), pause);
  } catch (err) {
    if (err instanceof UnreadableRecord) said(`left out: ${err.message}`);
    else if (fs.existsSync(runFile(home, id))) throw err;
    return undefined;
  }
}

/**
 * The run `id` names, found among the ids the store lists (`runIds`), never read by a path made of the id, so no id — one climbing out
 * with `..`, an absolute one — can name a file outside `runs/`; with the store's pause composed onto it as `runs.read` composes it, and
 * undefined for an id the store does not list, or that does not read (`runListed`).
 */
function findRun(home: string, id: string, said: (line: string) => void = sayOnce): Run | undefined {
  return runIds(home).includes(id) ? runListed(home, id, said, readPause(home)) : undefined;
}

/** Where the claims of the cards started are, `<card>.json` each: beside `runs/`, so that no listing of runs reads one. */
const startedDir = (home: string): string => path.join(path.dirname(runsDir(home)), 'started');

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
export function claimCard(home: string, card: string, id: string): { taken: true } | { by: string } {
  const file = path.join(startedDir(home), `${card}.json`);
  const create = (): boolean => {
    try {
      fs.writeFileSync(file, JSON.stringify({ run: id }, null, 2), { flag: 'wx' });
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw err;
    }
  };
  fs.mkdirSync(startedDir(home), { recursive: true });
  if (create()) return { taken: true };
  const by = claimedAt(file);
  if (by !== undefined && by !== id && findRun(home, by)?.from?.inbox === card) return { by };
  const tomb = path.join(startedDir(home), `.${card}.${process.pid}.${Math.random().toString(36).slice(2)}`);
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
 * The run store at the store's root `home`: a run's record and a person's files beside it, each a file of its own under `runs/`, with the
 * run's labels and the store's pause composed onto each run read (`labelled`, `paused`); the markers of the runs `nemia rm` forgets, under
 * `forgetting/`.
 */
export const filesStoreAt = (home: string): RunStore => ({
  runs: {
    read: (id) => paused(home, labelled(home, runRecord(home, id))),
    find: (id, said) => findRun(home, id, said),
    list: (said, kept) => {
      const pause = readPause(home);
      const given = new Set<Run>();
      const keeps = kept && ((id: string) => givenOf(given, kept(id)));
      return listRuns(home, said, keeps).map((run) => paused(home, given.has(run) ? run : labelled(home, run), pause));
    },
    create: (run) => writeRun(home, run),
    rewrite: (run) => rewriteRun(home, run),
    stamps: () => restStamps(home),
    exists: (id) => fs.existsSync(runFile(home, id)),
    taken: (id) => runIdTaken(home, id),
    calledOff: (id) => [cancelFile, pruneFile, holdFile].some((file) => fs.existsSync(file(home, id))) || fs.existsSync(pauseFile(home)),
    cancel: (id, actor) => markCancelled(home, id, actor),
    forget: (id) => removeRunFiles(home, id),
    ids: () => runIds(home),
    filesAt: (id) => filesAt(home, id),
    dropFiles: (id) => dropFiles(home, id),
    prune: (id, marker) => writePruned(home, id, marker),
    pruned: (id) => readPruned(home, id),
  },
  asks: {
    read: (id) => readAllAsks(home, id),
    answers: (id) => readAnswers(home, id),
    consume: (run, asks, rounds, voided) => consumeAllAsks(home, run, asks, rounds, voided),
    write: (id, person) => writePersonAsk(home, id, person),
    where: (id, key) => askWhere(home, id, key),
  },
  holds: {
    lift: (id, at) => removeHold(home, id, at),
    put: (id, until, said) => writeHold(home, id, until, said),
    stands: (id) => fs.existsSync(holdFile(home, id)),
  },
  said: { put: (id, step, text) => keepSaid(home, id, step, text) },
  labels: { put: (id, labels) => writeLabels(home, id, labels) },
  refresh: {
    lift: (id) => removeRefresh(home, id),
    put: (id) => writeRefresh(home, id),
    stands: (id) => fs.existsSync(refreshFile(home, id)),
  },
  forgetting: {
    write: (id, taskIds) => writeForgetting(home, id, taskIds),
    read: (id) => readForgetting(home, id),
    list: () => forgettingRuns(home),
    lift: (id) => fs.rmSync(forgettingFile(home, id), { force: true }),
    where: (id) => forgettingFile(home, id),
  },
});

/**
 * Every run of the store as `project` reads it, off `memo` where one is handed in (`keptRecords`): the store stamped before any record
 * is read, each run whose stamp stands answered from memory, and each other read by id. With no memo — the command line's reads, and a
 * test's cold read — every record is read, and nothing is kept. `verify` says whether each kept projection is judged afresh too
 * (`WF_VERIFY_REST`, the program's `StoreConfig`).
 *
 * The store is listed once and its pause read once for the whole read, as `runs.list` lists and reads them once: `runs.find` does both
 * for its one run, and a read that went through it per run would list the store once per run.
 */
export const keptRuns = <P>(home: string, memo: RecordMemo<P> | undefined, project: (run: Run) => P, verify: boolean): P[] => {
  const listed = new Set(runIds(home));
  const pause = readPause(home);
  const find = (id: string) => (listed.has(id) ? runListed(home, id, sayOnce, pause) : undefined);
  return keptRecords(memo, { stamps: restStamps(home), find, verify }, project);
};
