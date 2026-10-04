/**
 * The run store on files under `WF_ROOT`: `filesStore`, the only implementation of `RunStore`, made of the functions of
 * `record.store.ts` and of a person's writes beside them here, and of the inbox's files (`inboxDir`, and the tick's tries of a queued
 * card beside it); and `runStore`, the one binding every controller reads it through, where another implementation would be swapped in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Schema } from 'effect';
import { cordonFile, readCordon } from '../cordon/cordon.store.ts';
import type { Cordon } from '../cordon/cordon.ts';
import type { QueueTry } from '../inbox/inbox.ts';
import type { AskKey, AskKind, AskWritten, PersonAsk, Pruned, Run, RunStore } from './record.ts';
import {
  HOME,
  acceptFile,
  acceptanceIn,
  approvalFile,
  approvalIn,
  askFile,
  askIn,
  asksDir,
  cancelFile,
  consumeAsks,
  holdFile,
  isDirectory,
  listRuns,
  lstatOf,
  markCancelled,
  pruneFile,
  readAnswers,
  readAsks,
  readRun,
  removeHold,
  restStamps,
  rewriteRun,
  roundAskFile,
  roundAskIn,
  runFile,
  runsDir,
  writeAsk,
  writeHold,
  writeRun,
} from './record.store.ts';

/** Each kind of ask: the file it is written at, by run, step and number, and its reader, as the tick reads it. */
const ASKS: Record<
  AskKind,
  { file: (id: string, step: string, n: number) => string; read: (file: string, step: string, n: number) => unknown }
> = {
  retry: { file: askFile, read: askIn },
  round: { file: roundAskFile, read: roundAskIn },
  approve: { file: approvalFile, read: approvalIn },
  accept: { file: acceptFile, read: acceptanceIn },
};

/** The file of the ask `key` of the run `id`. */
const askWhere = (id: string, { kind, step, n }: AskKey): string => ASKS[kind].file(id, step, n);

/**
 * Write a person's ask at its name (`writeAsk`), the ask alone; and, when a file already stands there, why it is no ask of its kind: its
 * reader's words, or null when it reads as one or is gone since.
 */
function writePersonAsk(id: string, { kind, ask }: PersonAsk): AskWritten {
  const n = 'round' in ask ? ask.round : ask.try;
  const where = askWhere(id, { kind, step: ask.step, n });
  if (writeAsk(where, ask)) return { written: true, where };
  const read = ASKS[kind].read(where, ask.step, n);
  return { written: false, where, stray: typeof read === 'string' && lstatOf(where) ? read : null };
}

/** Remove the run's record and a person's files beside it, and its own directory, answering each path removed from `WF_ROOT`. */
function removeRunFiles(id: string): string[] {
  const removed: string[] = [];
  for (const at of [runFile(id), cancelFile(id), pruneFile(id), holdFile(id), asksDir(id), path.join(runsDir(), id)]) {
    const st = lstatOf(at);
    if (!st) continue;
    fs.rmSync(at, { recursive: true, force: true });
    removed.push(`${path.relative(HOME, at)}${st.isDirectory() ? '/' : ''}`);
  }
  return removed;
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

/**
 * The run as it reads with the store's cordon (`readCordon`) composed onto it — the one given, read where none is — or without one while
 * none stands: a run the tick's memo kept is read with the cordon as it stands now, so the cordon is in no run's stamp (`restStamps`): a
 * run at rest has nothing due for it to hold, and one it holds anything of is `running`, never at rest. A run that already reads with
 * the cordon as it stands, or with none while none does, is the very run given, which the memo knows by identity (`keptOf`). Never
 * written into the record.
 */
function cordoned(run: Run, cordon: Cordon | null = readCordon()): Run {
  if (isDeepStrictEqual(run.cordon ?? null, cordon)) return run;
  const { cordon: _, ...bare } = run;
  return cordon ? { ...bare, cordon } : bare;
}

/**
 * A run's record and a person's files beside it, each a file of its own under `runs/`, with the store's cordon composed onto each run read
 * (`cordoned`); the inbox's cards and the tick's tries.
 */
export const filesStore: RunStore = {
  runs: {
    read: (id) => cordoned(readRun(id)),
    list: (said, kept) => {
      const cordon = readCordon();
      return listRuns(said, kept).map((run) => cordoned(run, cordon));
    },
    create: writeRun,
    rewrite: rewriteRun,
    stamps: restStamps,
    exists: (id) => fs.existsSync(runFile(id)),
    calledOff: (id) => [cancelFile, pruneFile, holdFile].some((file) => fs.existsSync(file(id))) || fs.existsSync(cordonFile()),
    cancel: markCancelled,
    forget: removeRunFiles,
    prune: writePruned,
  },
  asks: { read: readAsks, answers: readAnswers, consume: consumeAsks, write: writePersonAsk, where: askWhere },
  holds: { lift: removeHold, put: writeHold, stands: (id) => fs.existsSync(holdFile(id)) },
  inbox: {
    entries: inboxEntries,
    read: readInboxFile,
    filedAt,
    add: addCard,
    rewrite: rewriteCard,
    drop: dropCard,
    where: (file) => path.join(inboxDir(), file),
    tries: queueTries,
    putTry,
    dropTry: (name) => fs.rmSync(path.join(queueDir(), `${name}.json`), { force: true }),
  },
};

/** The run store every controller reads and writes through. */
export const runStore: RunStore = filesStore;
