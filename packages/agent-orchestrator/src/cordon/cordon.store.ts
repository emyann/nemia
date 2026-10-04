/**
 * The store's cordon on disk: `$WF_ROOT/cordon`, a person's file, `{at, by, why?}`, put by `wf cordon` and deleted by `wf uncordon`. Every
 * pass reads it, as `runStore` composes it onto each run it reads, so a cordon put or lifted between two passes is honoured by the next.
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
import { UNCORDON, type Cordon } from './cordon.ts';

/** The store whose cordon this is, read once as the package loads, as `record.store.ts` reads its `HOME`. */
const ROOT = wfRoot();

/** The cordon's file: one for the whole store. */
export const cordonFile = (): string => path.join(ROOT, 'cordon');

/** A field of the file as it was written: one line of words, or absent. */
const Said = Schema.optional(Schema.String);

/** The cordon's file as `putCordon` writes it; a field it does not read is left empty, never a reason to lift the cordon. */
const isCordonFile = Schema.is(Schema.Struct({ at: Said, by: Said, why: Said }));

/** The text as JSON, or undefined where it is not: a file half written, or another program's. */
const jsonOr = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * The store's cordon, or null when none stands. A file that is there cordons the store whatever it holds: one that does not read as the
 * cordon gives its fields empty, so a person's hand edit never lets new work start.
 */
export function readCordon(): Cordon | null {
  let text: string;
  try {
    text = fs.readFileSync(cordonFile(), 'utf8');
  } catch {
    return null;
  }
  const read = jsonOr(text);
  const file = isCordonFile(read) ? read : {};
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
 * Cordons the store: writes its file, created only where none is, and answers the cordon as written — `by` the name given, else the
 * machine's user. Refuses (`Conflict`) a store already cordoned, naming who cordoned it and `wf uncordon`.
 */
export function putCordon(said: { why?: string; by?: string }, now: Date = new Date()): Cordon {
  const by = said.by ?? osUser() ?? 'someone';
  const cordon: Cordon = { at: now.toISOString(), by, ...(said.why ? { why: said.why } : {}) };
  fs.mkdirSync(ROOT, { recursive: true });
  try {
    fs.writeFileSync(cordonFile(), `${JSON.stringify(cordon)}\n`, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const stands = readCordon();
    throw new Conflict({
      message: `the store is already cordoned${stands?.by ? ` by ${stands.by}` : ''}${stands?.at ? ` since ${stands.at}` : ''}: ${UNCORDON} lifts it first.`,
    });
  }
  return cordon;
}

/** Lifts the store's cordon and answers the cordon lifted. Refuses (`Missing`) a store no cordon stands on. */
export function liftCordon(): Cordon {
  const cordon = readCordon();
  try {
    fs.unlinkSync(cordonFile());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    throw new Missing({ message: 'the store is not cordoned: there is nothing to lift (wf cordon puts one).' });
  }
  return cordon ?? { at: '', by: '' };
}
