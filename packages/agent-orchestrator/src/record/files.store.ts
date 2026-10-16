/**
 * The run store on files under `WF_ROOT`: `filesStore`, the only implementation of `RunStore`, made of the functions of
 * `record.store.ts` and of a person's writes beside them here, and of the inbox's files (`inboxDir`, and the tick's tries of a queued
 * card beside it); and `runStore`, the one binding every controller reads it through, where another implementation would be swapped in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Schema } from 'effect';
import { pauseFile, readPause } from '../pause/pause.store.ts';
import type { Pause } from '../pause/pause.ts';
import { inboxNameOf, type QueueTry } from '../inbox/index.ts';
import type { AskKey, AskKind, AsksRead, AskWritten, PersonAsk, Pruned, Run, RunStore } from './record.ts';
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
  isDirectory,
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

/** Each kind of ask: the file it is written at, by run, step and number, and its reader, as the tick reads it. */
const ASKS: Record<
  AskKind,
  { file: (id: string, step: string, n: number) => string; read: (file: string, step: string, n: number) => unknown }
> = {
  retry: { file: askFile, read: askIn },
  round: { file: roundAskFile, read: roundAskIn },
  approve: { file: approvalFile, read: approvalIn },
  accept: { file: acceptFile, read: acceptanceIn },
  merge: { file: mergeAskFile, read: mergeAskIn },
};

/** The file of the ask `key` of the run `id`. */
const askWhere = (id: string, { kind, step, n }: AskKey): string => ASKS[kind].file(id, step, n);

/**
 * Write a person's ask at its name (`writeAsk`), the ask alone; and, when a file already stands there, why it is no ask of its kind: its
 * reader's words, or null when it reads as one or is gone since.
 */
function writePersonAsk(id: string, person: PersonAsk): AskWritten {
  const { kind, ask } = person;
  const [step, n] =
    person.kind === 'merge' ? [person.ask.merge.target, person.ask.merge.try] : [ask.step, 'round' in ask ? ask.round : ask.try];
  const where = askWhere(id, { kind, step, n });
  if (writeAsk(where, askHeld(person))) return { written: true, where };
  const read = ASKS[kind].read(where, step, n);
  return { written: false, where, stray: typeof read === 'string' && lstatOf(where) ? read : null };
}

/** What a person's ask file holds: the ask as its verb gave it, but a merge's, which holds its loop, round, base, commit and time. */
function askHeld(person: PersonAsk): Parameters<typeof writeAsk>[1] {
  if (person.kind !== 'merge') return person.ask;
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
  if ('refused' in read) return read.refused === 'at' ? 'it says no time it was given' : 'it is not an ask nemia merge wrote';
  const { loop, round, onto, sha, at, landing } = read.read;
  return { step: loop, round, at, merge: { target: step, try: n, onto, sha, ...(landing ? { landing: { ...landing } } : {}) } };
}

/** The merge asks waiting in a run's directory, and a line for each file named as one that cannot be read as one. */
function readMergeAsks(id: string): { rounds: RoundAsk[]; notes: string[] } {
  const rounds: RoundAsk[] = [];
  const notes: string[] = [];
  for (const name of fileNames(asksDir(id)) ?? []) {
    const named = /^merge-(.+)-(\d+)$/.exec(name);
    const file = path.join(asksDir(id), name);
    const ask = named ? mergeAskIn(file, named[1], Number(named[2])) : undefined;
    if (typeof ask === 'string') notes.push(`${file}: ${ask}, so it is not honoured — remove it, and ask with nemia merge`);
    else if (ask) rounds.push(ask);
  }
  return { rounds, notes };
}

/** Move each merge ask among `rounds` the run's record already answers (`mergeSpent`) into `done/`: the tick's one touch on it. */
function consumeMergeAsks(run: Run, rounds: readonly RoundAsk[]): void {
  const spent = rounds.filter((a) => a.merge && mergeSpent(run, a)).map((a) => mergeAskFile(run.id, a.merge!.target, a.merge!.try));
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

/** The name of the inbox card `given` is a path to, links resolved on the way to it and to the inbox (`inboxNameOf`); else null. */
function inboxNameAt(given: string): string | null {
  const real = (at: string): string => {
    try {
      return fs.realpathSync(at);
    } catch {
      return at;
    }
  };
  const at = path.resolve(given);
  return inboxNameOf(path.join(real(path.dirname(at)), path.basename(at)), real(inboxDir()));
}

/** Write the prune marker whole, or remove it for `undefined`. */
const writePruned = (id: string, marker: Pruned | undefined): void =>
  marker ? fs.writeFileSync(pruneFile(id), JSON.stringify(marker, null, 2)) : fs.rmSync(pruneFile(id), { force: true });

/**
 * The inbox: cards before they are started, one `<name>.md` per card (`parseInboxCard` in inbox.ts), in the store beside `runs/` — not in a
 * repository, since a card's `repo:` says which one the idea is about.
 */
export const inboxDir = (): string => path.join(HOME, 'inbox');

/**
 * Where the tick writes down a queued card's start it tried and did not make (`QueueTry`): `$WF_ROOT/queue/<name>.json`, outside the inbox,
 * which is a person's. The tick is its one writer: it writes one when a start does not happen, and removes it once the card is not queued
 * as it was — started, taken back, dropped or edited.
 */
const queueDir = (): string => path.join(HOME, 'queue');

/** The inbox's entries: a folder by its name and a trailing `/`, a markdown file with its text, any other file with none. */
function inboxEntries(): Array<{ file: string; text: string }> {
  let names: string[];
  try {
    names = fs.readdirSync(inboxDir());
  } catch {
    return [];
  }
  return names.map((name) => {
    const at = path.join(inboxDir(), name);
    if (isDirectory(at)) return { file: `${name}/`, text: '' };
    try {
      return { file: name, text: name.endsWith('.md') ? fs.readFileSync(at, 'utf8') : '' };
    } catch {
      return { file: name, text: '' };
    }
  });
}

/** The text of the inbox's entry `file`, or null when it is not there. */
function readInboxFile(file: string): string | null {
  try {
    return fs.readFileSync(path.join(inboxDir(), file), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** When the inbox's entry `file` was last written, or null when it is gone. */
const filedAt = (file: string): string | null =>
  fs.statSync(path.join(inboxDir(), file), { throwIfNoEntry: false })?.mtime.toISOString() ?? null;

/** A card filed at `file` exclusively, the inbox made first: false when a file stands at its name. */
function addCard(file: string, text: string): boolean {
  fs.mkdirSync(inboxDir(), { recursive: true });
  try {
    fs.writeFileSync(path.join(inboxDir(), file), text, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
  return true;
}

/** A card written whole at `file` through a hidden file renamed over it, its prior time set back when it can be. */
function rewriteCard(file: string, text: string): void {
  const at = path.join(inboxDir(), file);
  const filed = fs.statSync(at, { throwIfNoEntry: false })?.mtime;
  const hidden = path.join(inboxDir(), `.${file}.${process.pid}`);
  fs.writeFileSync(hidden, text);
  fs.renameSync(hidden, at);
  if (!filed) return;
  try {
    fs.utimesSync(at, filed, filed);
  } catch {}
}

/** A card removed at `file`: false when it is not there. */
function dropCard(file: string): boolean {
  try {
    fs.rmSync(path.join(inboxDir(), file));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
  return true;
}

/** A try as the tick writes it (`QueueTry`); any key beside these is left unread. */
const isQueueTry = Schema.is(
  Schema.Struct({ at: Schema.String, text: Schema.String, repo: Schema.String, why: Schema.String, refused: Schema.Boolean }),
);

/** The tries the tick has written down, by card name; a file that does not read as one is none. */
function queueTries(): Map<string, QueueTry> {
  const tries = new Map<string, QueueTry>();
  let names: string[];
  try {
    names = fs.readdirSync(queueDir()).filter((n) => n.endsWith('.json'));
  } catch {
    return tries;
  }
  for (const file of names) {
    try {
      const r: unknown = JSON.parse(fs.readFileSync(path.join(queueDir(), file), 'utf8'));
      if (isQueueTry(r))
        tries.set(file.slice(0, -'.json'.length), { at: r.at, text: r.text, repo: r.repo, why: r.why, refused: r.refused });
    } catch {}
  }
  return tries;
}

/** The tick's try of the card `name` written whole, the queue's folder made first. */
function putTry(name: string, tried: QueueTry): void {
  fs.mkdirSync(queueDir(), { recursive: true });
  fs.writeFileSync(path.join(queueDir(), `${name}.json`), JSON.stringify(tried, null, 2));
}

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
 * The run `id` names, found among the ids the store lists (`runIds`), never read by a path made of the id, so no id — one climbing out
 * with `..`, an absolute one — can name a file outside `runs/`; with the store's pause composed onto it as `runs.read` composes it.
 * Undefined for an id the store does not list, for a record removed between the listing and the read, and for one that does not read as
 * a run (`UnreadableRecord`), which is said once on `said`, as `listRuns` says it: the run page answers that there is no such run where
 * it used to throw.
 */
function findRun(id: string, said: (line: string) => void = sayOnce): Run | undefined {
  if (!runIds().includes(id)) return undefined;
  try {
    return paused(readRun(id));
  } catch (err) {
    if (err instanceof UnreadableRecord) said(`left out: ${err.message}`);
    else if (fs.existsSync(runFile(id))) throw err;
    return undefined;
  }
}

/**
 * A run's record and a person's files beside it, each a file of its own under `runs/`, with the store's pause composed onto each run read
 * (`paused`); the markers of the runs `nemia rm` forgets, under `forgetting/`; the inbox's cards and the tick's tries.
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
  inbox: {
    entries: inboxEntries,
    read: readInboxFile,
    filedAt,
    add: addCard,
    rewrite: rewriteCard,
    drop: dropCard,
    where: (file) => path.join(inboxDir(), file),
    nameAt: inboxNameAt,
    tries: queueTries,
    putTry,
    dropTry: (name) => fs.rmSync(path.join(queueDir(), `${name}.json`), { force: true }),
  },
};

/** The run store every controller reads and writes through. */
export const runStore: RunStore = filesStore;

/**
 * Every run of the store as `project` reads it, off `memo` where one is handed in (`keptRecords`): the store stamped before any record
 * is read, each run whose stamp stands answered from memory, and each other found by id (`runs.find`). With no memo — the command
 * line's reads, and a test's cold read — every record is read, as `runs.list` reads them, and nothing is kept. `env` says whether each
 * kept projection is judged afresh too (`WF_VERIFY_REST`).
 */
export const keptRuns = <P>(memo: RecordMemo<P> | undefined, project: (run: Run) => P, env: NodeJS.ProcessEnv = process.env): P[] =>
  keptRecords(memo, { stamps: runStore.runs.stamps(), find: (id) => runStore.runs.find(id), verify: verifiesRest(env) }, project);
