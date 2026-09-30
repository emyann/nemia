/**
 * The run store on files under `WF_ROOT`: `filesStore`, the only implementation of `RunStore`, made of the functions of
 * `record.store.ts` and of a person's writes beside them here; and `runStore`, the one binding every controller reads it through, where
 * another implementation would be swapped in.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AskKey, AskKind, AskWritten, PersonAsk, Pruned, RunStore } from './record.ts';
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

/** A run's record and a person's files beside it, each a file of its own under `runs/`. */
export const filesStore: RunStore = {
  runs: {
    read: readRun,
    list: listRuns,
    create: writeRun,
    rewrite: rewriteRun,
    stamps: restStamps,
    exists: (id) => fs.existsSync(runFile(id)),
    calledOff: (id) => [cancelFile, pruneFile, holdFile].some((file) => fs.existsSync(file(id))),
    cancel: markCancelled,
    forget: removeRunFiles,
    prune: writePruned,
  },
  asks: { read: readAsks, answers: readAnswers, consume: consumeAsks, write: writePersonAsk, where: askWhere },
  holds: { lift: removeHold, put: writeHold, stands: (id) => fs.existsSync(holdFile(id)) },
};

/** The run store every controller reads and writes through. */
export const runStore: RunStore = filesStore;
