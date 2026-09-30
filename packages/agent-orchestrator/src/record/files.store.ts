/**
 * The run store on files under `WF_ROOT`: `filesStore`, the only implementation of `RunStore`, made of the functions of
 * `record.store.ts`; and `runStore`, the one binding every controller reads it through, where another implementation would be swapped in.
 */
import fs from 'node:fs';
import type { RunStore } from './record.ts';
import {
  cancelFile,
  consumeAsks,
  holdFile,
  listRuns,
  pruneFile,
  readAnswers,
  readAsks,
  readRun,
  removeHold,
  restStamps,
  rewriteRun,
  runFile,
  writeRun,
} from './record.store.ts';

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
  },
  asks: { read: readAsks, answers: readAnswers, consume: consumeAsks },
  holds: { lift: removeHold },
};

/** The run store every controller reads and writes through. */
export const runStore: RunStore = filesStore;
