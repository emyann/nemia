/**
 * The store's pause on disk: `$WF_ROOT/<PAUSE_FILE>`, a person's file, `{at, by, why?, timeoutMs?}`, put by `nemia pause` and deleted by
 * `nemia resume`; `timeoutMs`, the timeout a call in flight is given before the sessions' drain cuts it, absent on a pause that parks no
 * session (the take-over's own, or one put before the timeout was written), and set to 0 by `nemia pause --now` (`cutPause`).
 * A take-over's pause also names the process that holds it (`heldBy`, `PauseHolder`), kept in the file and off the `Pause` the store
 * serves: once the process table says that process is gone, the next pass lifts the pause (`liftLapsedPause`), so a take-over's pause
 * never outlives its command, however the command ended. A person's names none, and stands until `nemia resume`.
 * Every pass reads it, as the Run door composes it onto each run it reads, so a pause put or lifted between two passes is honoured by the
 * next. The file keeps the name it had before the verbs were renamed, so a pause put then still stands and `nemia resume` lifts it.
 *
 * Beneath the controllers, beside `files.store.ts`, which imports it: it imports no store of runs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Schema } from 'effect';
import { oneLine } from '../record/record.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import type { Identity } from '../daemon/daemon.ts';
import { pauseLapsed, RESUME_LINE, type Pause, type PauseHolder } from './pause.ts';
import { writeWhole } from '../whole-file/whole-file.store.ts';
import { wfRoot } from '../config/config.store.ts';

/**
 * The name of the pause's file in the store. The store keeps the name it had before the verbs became `nemia pause` and `nemia resume`,
 * so that a pause put then still stands and is lifted: a file renamed would leave it standing, unseen.
 */
const PAUSE_FILE = 'cordon';

/** The pause's file: one for the whole store. */
export const pauseFile = (home: string): string => path.join(home, PAUSE_FILE);

/** A field of the file as it was written: one line of words, or absent. */
const Said = Schema.optional(Schema.String);

/** The pause's file as `putPause` writes it; a field it does not read is left empty, never a reason to lift the pause. */
const isPauseFile = Schema.is(
  Schema.Struct({ at: Said, by: Said, why: Said, timeoutMs: Schema.optional(Schema.Unknown), heldBy: Schema.optional(Schema.Unknown) }),
);

/** The pause's holder as the file names it: a pid and, where written, its start. One that does not read is none, so the pause stands. */
const isHolder = Schema.is(Schema.Struct({ pid: Schema.Int.check(Schema.isGreaterThan(0)), procStart: Schema.optional(Schema.Int) }));

/** A timeout as the file holds it: whole milliseconds from 0, or none. */
const timeoutRead = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

/** The text as JSON, or undefined where it is not: a file half written, or another program's. */
const jsonOr = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** The pause's file as one read gave it: the pause, the process that holds it where the file names one, and the text read. */
export type PauseFileRead = { pause: Pause; heldBy?: PauseHolder; text: string };

/**
 * The store's pause and its holder in one read, or null when none stands. A file that is there pauses the store whatever it holds: one
 * that does not read as the pause gives its fields empty, so a person's hand edit never lets new work start.
 */
export function readPauseFile(home: string): PauseFileRead | null {
  let text: string;
  try {
    text = fs.readFileSync(pauseFile(home), 'utf8');
  } catch {
    return null;
  }
  const read = jsonOr(text);
  const file = isPauseFile(read) ? read : {};
  const why = oneLine(file.why ?? '', Infinity);
  const timeoutMs = timeoutRead('timeoutMs' in file ? file.timeoutMs : undefined);
  const held = 'heldBy' in file ? file.heldBy : undefined;
  const heldBy: PauseHolder | undefined = isHolder(held)
    ? { pid: held.pid, ...(held.procStart === undefined ? {} : { procStart: held.procStart }) }
    : undefined;
  const pause: Pause = {
    at: oneLine(file.at ?? '', Infinity),
    by: oneLine(file.by ?? '', Infinity),
    ...(why ? { why } : {}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
  return { pause, ...(heldBy ? { heldBy } : {}), text };
}

/** The store's pause, or null when none stands (`readPauseFile`, its holder left in the file). */
export const readPause = (home: string): Pause | null => readPauseFile(home)?.pause ?? null;

/** The store's root as this module loaded, as `record.store.ts` reads its `HOME`: what `files.store.ts`'s run store still reads by. */
const MODULE_ROOT = wfRoot(process.env);

/**
 * The pause of the store at the module's root, and its file: for the run store of `files.store.ts` alone, which still reads that root as
 * it loads (`test/global-roots.baseline.ts`). Every other caller names its root.
 */
export const pauseAtModuleRoot = (): Pause | null => readPause(MODULE_ROOT);
/** The pause's file at the module's root (`pauseAtModuleRoot`). */
export const pauseFileAtModuleRoot = (): string => pauseFile(MODULE_ROOT);

/** Who the machine says runs this process, or undefined where it cannot say. */
function osUser(): string | undefined {
  try {
    return os.userInfo().username || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Pauses the store: writes its file, created only where none is, and answers the pause as written — `by` the name given, else the
 * machine's user, and `timeoutMs` where one is given, which the pass puts on the sessions' drain; with none the pause parks no session.
 * A take-over names itself as the pause's holder (`heldBy`), written to the file and not answered, so the pass lifts the pause once that
 * process is gone. Refuses (`Conflict`) a store already paused, naming who paused it, `nemia resume`, and `nemia pause --now`.
 */
export function putPause(
  home: string,
  said: { why?: string; by?: string },
  now: Date = new Date(),
  timeoutMs?: number,
  heldBy?: PauseHolder,
): Pause {
  const by = said.by ?? osUser() ?? 'someone';
  const pause: Pause = {
    at: now.toISOString(),
    by,
    ...(said.why ? { why: said.why } : {}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
  fs.mkdirSync(home, { recursive: true });
  try {
    fs.writeFileSync(pauseFile(home), `${JSON.stringify(heldBy ? { ...pause, heldBy } : pause)}\n`, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const stands = readPause(home);
    throw new Conflict({
      message: `the store is already paused${stands?.by ? ` by ${stands.by}` : ''}${stands?.at ? ` since ${stands.at}` : ''}: ${RESUME_LINE} lifts it first, and nemia pause --now stops what still finishes under it.`,
    });
  }
  return pause;
}

/**
 * The store's pause with its timeout cut to 0, as `nemia pause --now` cuts every call in flight: since when, by whom and why kept as they
 * were put, the file written whole through a hidden file renamed over it. Answers the pause as written. Refuses (`Missing`) a store no
 * pause stands on.
 */
export function cutPause(home: string): Pause {
  const stands = readPauseFile(home);
  if (stands === null) throw new Missing({ message: 'the store is not paused: there is nothing to cut (nemia pause --now puts one).' });
  const pause: Pause = { ...stands.pause, timeoutMs: 0 };
  const file = pauseFile(home);
  writeWhole(file, `${JSON.stringify(stands.heldBy ? { ...pause, heldBy: stands.heldBy } : pause)}\n`);
  return pause;
}

/** Lifts the store's pause and answers the pause lifted. Refuses (`Missing`) a store no pause stands on. */
export function resumePause(home: string): Pause {
  const pause = readPause(home);
  try {
    fs.unlinkSync(pauseFile(home));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    throw new Missing({ message: 'the store is not paused: there is nothing to resume (nemia pause puts one).' });
  }
  return pause ?? { at: '', by: '' };
}

/**
 * Lifts the store's pause where it has outlived the process that holds it (`pauseLapsed`, on what `identify` says of `heldBy`), and
 * answers the pause lifted with its holder; null where none stands, none is held, or its holder still runs. Judged afresh on each pass
 * from the file and the process table, never remembered. The file is unlinked only while it holds the text judged, so a pause put again
 * between the read and the lift — a person's `nemia resume` then `nemia pause` — stands.
 */
export function liftLapsedPause(home: string, identify: (holder: PauseHolder) => Identity): { pause: Pause; heldBy: PauseHolder } | null {
  const read = readPauseFile(home);
  if (read === null || read.heldBy === undefined) return null;
  if (!pauseLapsed(identify(read.heldBy))) return null;
  const file = pauseFile(home);
  try {
    if (fs.readFileSync(file, 'utf8') !== read.text) return null;
    fs.unlinkSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  return { pause: read.pause, heldBy: read.heldBy };
}
