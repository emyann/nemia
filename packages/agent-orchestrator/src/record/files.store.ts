/**
 * A person's markers beside a run, files under the store's root a caller hands it: the cancellation, the pruning, the hold, the labels,
 * what was said before a step was filed, a refresh ask, and the markers of what `nemia rm` forgets; and the path of the inbox
 * (`inboxDir`), whose cards are the Card door's (`src/cards/cards.store.ts`). The run's record, its claim and its asks are records of the
 * keyspace (`src/runs/records.store.ts`), which reads and writes these files beside them: the Run door (`src/runs/runs.store.ts`) is the
 * one way src reads and writes a run (`test/run-store.test.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Option, Schema } from 'effect';
import { readPause } from '../pause/pause.store.ts';
import type { Pause } from '../pause/pause.ts';
import type { Pruned, Run } from './record.ts';
import type { Labels } from '../labels/labels.ts';
import { cancelFile, holdFile, lstatOf, marksAt, pruneFile, runsDir, saidDir, sayOnce, unheldFile } from './record.store.ts';
import { writeWhole } from '../whole-file/whole-file.store.ts';
import { runMarkMove } from '../run-marks/run-marks.ts';

/**
 * Remove a person's files beside the run — its labels among them — and its own directory, answering each path removed from `WF_ROOT`, a
 * directory's with a trailing `/`.
 * @param home The store's root folder.
 * @param id The run's id.
 */
export function removeMarkerFiles(home: string, id: string) {
  const removed: string[] = [];
  const files = [
    cancelFile(home, id),
    pruneFile(home, id),
    holdFile(home, id),
    unheldFile(home, id),
    refreshFile(home, id),
    labelsFile(home, id),
    saidDir(home, id),
    path.join(runsDir(home), id),
  ];
  for (const at of files) {
    const st = lstatOf(at);
    if (!st) continue;
    fs.rmSync(at, { recursive: true, force: true });
    removed.push(`${path.relative(home, at)}${st.isDirectory() ? '/' : ''}`);
  }
  return removed;
}

/**
 * The ids a person's file or a run's own directory names under `runs/`: what a new run may not take beside its record and asks.
 * @param home The store's root folder.
 */
export function markerRunIds(home: string) {
  try {
    return fs.readdirSync(runsDir(home)).map((name) => (name.includes('.') ? name.slice(0, name.indexOf('.')) : name));
  } catch {
    return [];
  }
}

/**
 * Whether a person called the run off by a marker: cancelled it, pruned it, or holds it.
 * @param home The store's root folder.
 * @param id The run's id.
 */
export const calledOffByMarker = (home: string, id: string) =>
  [cancelFile, pruneFile, holdFile].some((file) => fs.existsSync(file(home, id)));

/**
 * A person's labels on the run (`nemia label run`, and `nemia start`'s copy at creation): a JSON object of strings, a person's fact in a
 * file of its own for the reason `cancelFile` is. Written whole by `writeLabels`, which removes it for an empty map, and removed by
 * `nemia rm` with the run. Composed onto the run as `labels` by every read of the store (`labelled`), and never written into the record
 * (`rewriteRun`, `writeRun`). Every write moves the run's stamp, as every `<id>.<anything>` does (`restStamps`).
 * @param home The store's root folder.
 * @param id The run's id.
 */
export const labelsFile = (home: string, id: string) => path.join(runsDir(home), `${id}.labels`);

const labelsIn = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)));

/**
 * The run's labels, read: undefined for a run nobody labelled. A file that does not read as a JSON object of strings labels the run with
 * nothing, and is said once on stderr, naming the file and the verb that writes it whole again.
 */
function readLabels(home: string, id: string) {
  let text = '';
  try {
    text = fs.readFileSync(labelsFile(home, id), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
  }
  const json = labelsIn(text);
  if (Option.isSome(json) && !Array.isArray(json.value)) return Object.keys(json.value).length ? json.value : undefined;
  sayOnce(
    `run ${id}: its labels, ${labelsFile(home, id)}, are no JSON object of strings, and are read as none: write them again with nemia label run ${id} <key>=<value> --overwrite, or remove the file`,
  );
  return undefined;
}

/**
 * Write a person's labels on the run whole, through a hidden file renamed over the one there, so a reader never reads half a map; an
 * empty map removes the file, there or not.
 * @param home The store's root folder.
 * @param id The run's id.
 * @param labels The run's labels, whole; an empty map removes them.
 */
export function writeLabels(home: string, id: string, labels: Labels) {
  if (!Object.keys(labels).length) {
    fs.rmSync(labelsFile(home, id), { force: true });
    return;
  }
  fs.mkdirSync(runsDir(home), { recursive: true });
  writeWhole(labelsFile(home, id), JSON.stringify(labels, null, 2));
}

/**
 * The run with its labels composed onto it, and whatever the record carried under `labels` dropped.
 * @param home The store's root folder.
 * @param run The run as its record reads.
 */
export function labelled(home: string, run: Run) {
  const labels = readLabels(home, run.id);
  const { labels: _, ...bare } = run;
  return labels ? { ...bare, labels } : bare;
}

/**
 * That a person asked the run to take the new revisions (`nemia refresh`): `{ at }`, a person's fact in a file of its own for the reason
 * `cancelFile` is. Written by `refresh` alone, exclusively; removed by the pass that takes the revisions it asked for (`removeRefresh`).
 * Never composed onto the record: the pass reads the file itself (`stands`), as a level-triggered reader must.
 * @param home The store's root folder.
 * @param id The run's id.
 */
const refreshFile = (home: string, id: string) => path.join(runsDir(home), `${id}.refresh`);

/**
 * Write down that a person asked this run to take the new revisions, and answer with the ask written — or null, when one already stands.
 * `wx`, so two people asking at once make one ask, and an ask is never edited: the pass that takes the revisions lifts it.
 * @param home The store's root folder.
 * @param id The run's id.
 */
export const writeRefresh = (home: string, id: string) => {
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

/**
 * Lift the refresh ask: whether a file was there. Taken by the pass that wrote the pins it asked for, after the record is written.
 * @param home The store's root folder.
 * @param id The run's id.
 */
export const removeRefresh = (home: string, id: string) => {
  try {
    fs.rmSync(refreshFile(home, id));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
};

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
 * Write the prune marker whole, or remove it for `undefined`, as the machine answers the prune or its taking back on the marks that
 * stand (`runMarkMove`): a prune of a run already pruned writes what it recorded since, and a prune taken back of a run not pruned
 * has nothing to remove.
 * @param home The store's root folder.
 * @param id The run's id.
 * @param marker The prune marker written whole, or undefined to take it back.
 */
export const writePruned = (home: string, id: string, marker: Pruned | undefined) => {
  const move = runMarkMove(marksAt(home, id), marker ? 'prune' : 'unprune');
  if (move.kind === 'refused') return;
  if (marker) fs.writeFileSync(pruneFile(home, id), JSON.stringify(marker, null, 2));
  else fs.rmSync(pruneFile(home, id), { force: true });
};

/**
 * The inbox: cards before they are started, one `<name>.md` per card (`parseInboxCard` in inbox.ts), in the store beside `runs/` — not in a
 * repository, since a card's `repo:` says which one the idea is about.
 * @param home The store's root folder.
 */
export const inboxDir = (home: string) => path.join(home, 'inbox');

/** Where `nemia rm` writes down the engine's tasks of the runs it forgets: beside `runs/`, since each `runs/<id>.*` goes with a record. */
const forgettingDir = (home: string) => path.join(home, 'forgetting');

/** The marker of the run `id`. */
const forgettingFile = (home: string, id: string) => path.join(forgettingDir(home), `${id}.json`);

/** A marker as `nemia rm` writes it; any key beside these is left unread. */
const forgettingIn = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ run: Schema.String, taskIds: Schema.Array(Schema.String) })),
);

/**
 * The marker of the run `id` written whole, through a hidden file renamed over it, the folder made first.
 * @param home The store's root folder.
 * @param id The run's id.
 * @param taskIds The engine's tasks of the run, to forget.
 */
export function writeForgetting(home: string, id: string, taskIds: readonly string[]) {
  fs.mkdirSync(forgettingDir(home), { recursive: true });
  writeWhole(forgettingFile(home, id), JSON.stringify({ run: id, taskIds: [...taskIds] }, null, 2));
}

/**
 * The task ids the marker of the run `id` lists, or undefined: none there, or one that does not read as a marker.
 * @param home The store's root folder.
 * @param id The run's id.
 */
export function readForgetting(home: string, id: string) {
  let text: string;
  try {
    text = fs.readFileSync(forgettingFile(home, id), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  const marker = forgettingIn(text);
  return Option.isSome(marker) && marker.value.run === id ? [...marker.value.taskIds] : undefined;
}

/**
 * The runs a marker stands for: each `<id>.json` of the folder, none when there is no folder.
 * @param home The store's root folder.
 */
export function forgettingRuns(home: string) {
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
 * Whether the run's refresh ask is there, read as one or not.
 * @param home The store's root folder.
 * @param id The run's id.
 */
export const refreshStands = (home: string, id: string) => fs.existsSync(refreshFile(home, id));

/**
 * Where a person finds the run's `nemia rm` marker.
 * @param home The store's root folder.
 * @param id The run's id.
 */
export const forgettingWhere = (home: string, id: string) => forgettingFile(home, id);

/**
 * Take the run's `nemia rm` marker away, there or not.
 * @param home The store's root folder.
 * @param id The run's id.
 */
export const liftForgetting = (home: string, id: string) => fs.rmSync(forgettingFile(home, id), { force: true });
