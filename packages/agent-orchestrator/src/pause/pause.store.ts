/**
 * The store's pause on disk: `$WF_ROOT/cordon`, a person's file, `{at, by, why?}`, put by `nemia pause` and deleted by `nemia resume`.
 * Every pass reads it, as `runStore` composes it onto each run it reads, so a pause put or lifted between two passes is honoured by the
 * next. The file keeps the name it had before the verbs were renamed, so a pause put then still stands and `nemia resume` lifts it.
 *
 * Beneath the controllers, beside `files.store.ts`, which imports it: it imports no store of runs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Schema } from 'effect';
import { wfRoot } from '../config/config.store.ts';
import { oneLine } from '../record/record.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import { RESUME_LINE, type Pause } from './pause.ts';

/** The store whose pause this is, read once as the package loads, as `record.store.ts` reads its `HOME`. */
const ROOT = wfRoot();

/** The pause's file: one for the whole store. */
export const pauseFile = (): string => path.join(ROOT, 'cordon');

/** A field of the file as it was written: one line of words, or absent. */
const Said = Schema.optional(Schema.String);

/** The pause's file as `putPause` writes it; a field it does not read is left empty, never a reason to lift the pause. */
const isPauseFile = Schema.is(Schema.Struct({ at: Said, by: Said, why: Said }));

/** The text as JSON, or undefined where it is not: a file half written, or another program's. */
const jsonOr = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * The store's pause, or null when none stands. A file that is there pauses the store whatever it holds: one that does not read as the
 * pause gives its fields empty, so a person's hand edit never lets new work start.
 */
export function readPause(): Pause | null {
  let text: string;
  try {
    text = fs.readFileSync(pauseFile(), 'utf8');
  } catch {
    return null;
  }
  const read = jsonOr(text);
  const file = isPauseFile(read) ? read : {};
  const why = oneLine(file.why ?? '', Infinity);
  return { at: oneLine(file.at ?? '', Infinity), by: oneLine(file.by ?? '', Infinity), ...(why ? { why } : {}) };
}

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
 * machine's user. Refuses (`Conflict`) a store already paused, naming who paused it, `nemia resume`, and `nemia pause --now`.
 */
export function putPause(said: { why?: string; by?: string }, now: Date = new Date()): Pause {
  const by = said.by ?? osUser() ?? 'someone';
  const pause: Pause = { at: now.toISOString(), by, ...(said.why ? { why: said.why } : {}) };
  fs.mkdirSync(ROOT, { recursive: true });
  try {
    fs.writeFileSync(pauseFile(), `${JSON.stringify(pause)}\n`, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const stands = readPause();
    throw new Conflict({
      message: `the store is already paused${stands?.by ? ` by ${stands.by}` : ''}${stands?.at ? ` since ${stands.at}` : ''}: ${RESUME_LINE} lifts it first, and nemia pause --now stops what still finishes under it.`,
    });
  }
  return pause;
}

/** Lifts the store's pause and answers the pause lifted. Refuses (`Missing`) a store no pause stands on. */
export function resumePause(): Pause {
  const pause = readPause();
  try {
    fs.unlinkSync(pauseFile());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    throw new Missing({ message: 'the store is not paused: there is nothing to resume (nemia pause puts one).' });
  }
  return pause ?? { at: '', by: '' };
}
