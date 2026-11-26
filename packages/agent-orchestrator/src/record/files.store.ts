/**
 * What the Run door keeps beside the keyspace in files under the store's root: a run's files directory (`runs/<id>/artifacts`), and the
 * store's pause composed onto a run read (`paused`). A run's record, its claim, its asks and its person's markers (cancellation, pruning,
 * hold, labels, what was said before a step was filed, a refresh ask, `nemia rm`'s marker) are records of the keyspace
 * (`src/runs/records.store.ts`): the Run door (`src/runs/runs.store.ts`) is the one way src reads and writes a run
 * (`test/run-store.test.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readPause } from '../pause/pause.store.ts';
import type { Pause } from '../pause/pause.ts';
import type { Run } from './record.ts';
import { lstatOf, runsDir } from './record.store.ts';

/** The run's files directory, `runs/<id>/artifacts`. */
const filesDir = (home: string, id: string) => path.join(runsDir(home), id, 'artifacts');

/**
 * The run's files directory while it is a directory and no link; else undefined.
 * @param home The store's root folder.
 * @param id The run's id.
 */
export const filesAt = (home: string, id: string) => (lstatOf(filesDir(home, id))?.isDirectory() ? filesDir(home, id) : undefined);

/**
 * Remove the run's files directory: null once it is gone; else the first line of what the filesystem said.
 * @param home The store's root folder.
 * @param id The run's id.
 */
export function dropFiles(home: string, id: string) {
  try {
    fs.rmSync(filesDir(home, id), { recursive: true, force: true });
    return null;
  } catch (err) {
    return lstatOf(filesDir(home, id)) ? ((err as Error).message.split('\n')[0] ?? '') : null;
  }
}

/**
 * The run as it reads with the store's pause (`readPause`) composed onto it — the one given, read where none is — or without one while
 * none stands: a run the tick's memo kept is read with the pause as it stands now, so the pause is in no run's stamp: a run at rest has
 * nothing due for it to hold, and one it holds anything of is `running`, never at rest. A run that already reads with the pause as it
 * stands now, or with none while none does, is the very run given, which the memo knows by identity (`keptOf`). Never written into the
 * record.
 * @param home The store's root folder.
 * @param run The run as its record reads.
 * @param pause The store's pause, read where none is given.
 */
export function paused(home: string, run: Run, pause: Pause | null = readPause(home)) {
  if (isDeepStrictEqual(run.pause ?? null, pause)) return run;
  const { pause: _, ...bare } = run;
  return pause ? { ...bare, pause } : bare;
}

/**
 * The inbox: cards before they are started, one `<name>.md` per card (`parseInboxCard` in inbox.ts), in the store beside `runs/` — not in a
 * repository, since a card's `repo:` says which one the idea is about.
 * @param home The store's root folder.
 */
export const inboxDir = (home: string) => path.join(home, 'inbox');
