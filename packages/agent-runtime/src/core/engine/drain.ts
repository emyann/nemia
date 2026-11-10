/**
 * The store's two drains, the runtime's own record: the holder's (`drain.json`), which names the process whose attached sessions' new
 * calls wait, and the sessions' (`sessions-drain.json`), which says every session that holds its calls is to stop at its call's end.
 * Two facts, two files: a restart drains and lifts its holder, and must neither hold nor release the jobs. Each is written whole
 * (`replaceFile`) and decoded by its schema on read, a file that does not decode read as no drain. Which harness a drain holds is
 * judged where it is read: a harness that declares `drain` (`SessionsDrained`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Option, Schema } from 'effect';
import { replaceFile } from '../replace.ts';
import { instantNow } from './now.ts';

/** The holder's drain's file name, in the store's drain folder (`drainFolder`). */
export const DRAIN_FILE = 'drain.json';

/** The sessions' drain's file name, in the store's drain folder (`drainFolder`). */
export const SESSION_DRAIN_FILE = 'sessions-drain.json';

/** The folder of the store at `root` both drains are kept in: the attached sessions' folder, beside their run files. */
export const drainFolder = (root: string): string => path.join(root, 'runs', 'attached');

/**
 * The holder's drain file of the store at `root`.
 * Exported only for the tests that import it.
 */
export const holderDrainFile = (root: string): string => path.join(drainFolder(root), DRAIN_FILE);

/** The sessions' drain file of the store at `root`, apart from the holder's. */
export const sessionDrainFile = (root: string): string => path.join(drainFolder(root), SESSION_DRAIN_FILE);

const SessionDrainSchema = Schema.Struct({
  /** When the drain was put (ISO), what its grace and a job's hold bound are counted from. */
  at: Schema.String,
  /** How long a call in flight is given to finish once the drain is put, in milliseconds, before the job cuts it. */
  graceMs: Schema.Finite,
});

/** The sessions' drain, as its file holds it. */
type SessionDrain = typeof SessionDrainSchema.Type;

/** A process, as a drain names it: its pid, and when it started where that could be read, so a pid taken since is not it. */
const ProcessSchema = Schema.Struct({ pid: Schema.Finite, start: Schema.optional(Schema.String) });

/** The holder's drain: the process held, and who put the drain (`by`), absent on a drain written before it was named. */
const HolderDrainSchema = Schema.Struct({ ...ProcessSchema.fields, by: Schema.optional(ProcessSchema) });

/** The holder's drain, as its file holds it. */
export type HolderDrain = typeof HolderDrainSchema.Type;

/** What `file` holds as JSON, through `decode`; `null` where it is absent, no JSON, or does not decode. */
export const decodedFile = <A>(file: string, decode: (u: unknown) => Option.Option<A>): A | null => {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    return Option.getOrNull(decode(JSON.parse(text)));
  } catch {
    return null;
  }
};

/** Writes `value` whole on `file` as JSON (`replaceFile`), its folder made first, so a reader never reads half of it. */
export const writeWhole = (file: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  replaceFile(file, JSON.stringify(value));
};

const decodeSessionDrain = Schema.decodeUnknownOption(SessionDrainSchema);
const decodeHolderDrain = Schema.decodeUnknownOption(HolderDrainSchema);

/**
 * The sessions' drain put on the store at `root`: every session's next call waits, and a call in flight has `graceMs`. A drain standing
 * with the same grace is kept as it is, so a pass that puts it again on every tick never moves the `at` its grace counts from; one with
 * another grace is stamped now, which is how a grace of 0 cuts a standing drain's calls at once.
 */
export const putSessionDrain = (root: string, { graceMs }: { graceMs: number }): void => {
  if (sessionDrainOf(sessionDrainFile(root))?.graceMs === graceMs) return;
  writeWhole(sessionDrainFile(root), { at: new Date(instantNow().at).toISOString(), graceMs } satisfies SessionDrain);
};

/** The sessions' drain lifted: no session waits. */
export const liftSessionDrain = (root: string): void => fs.rmSync(sessionDrainFile(root), { force: true });

/** The sessions' drain `file` says stands; `null` where none does, or the file does not decode. */
export const sessionDrainOf = (file: string): SessionDrain | null => decodedFile(file, decodeSessionDrain);

/** The holder's drain `drain` put on the store at `root`, written whole. */
export const putHolderDrain = (root: string, drain: HolderDrain): void => writeWhole(holderDrainFile(root), drain);

/** The holder's drain lifted: none waits. */
export const liftHolderDrain = (root: string): void => fs.rmSync(holderDrainFile(root), { force: true });

/** The holder's drain the store at `root` holds; `null` where none does, or its file does not decode. */
export const holderDrainOf = (root: string): HolderDrain | null => decodedFile(holderDrainFile(root), decodeHolderDrain);
