/**
 * What a detached run's output said, read once per change of the output, across processes: `outputIn` reads the harness's
 * capture (`.log`) through the spec's `readOutput`, and once the run is over keeps what it read in a file beside it (`.said`),
 * keyed by the capture's size and mtime and the readers' `SAID_VERSION`, or a version of `SAID_EXTENDED`. A process that finds
 * the file with the key the capture has now takes it and reads no capture; one that finds no file, a file that does not parse
 * or decode, or another key, reads the capture again. The file is never trusted over the capture, and never carried from one
 * pass to the next: its key is read on each.
 *
 * One writer, the harness's own `observe` — the daemon's, the api's or a command's: each writes the same content for a key,
 * through a file of its own renamed into place, so a reader only finds a whole one. Neither name ends in `.json`, so
 * neither is ever read as a run file.
 */
import { Schema } from 'effect';
import fs from 'node:fs';
import { UsageSchema } from '../../core/event-schema.ts';
import { readText } from '../../core/engine/tally.ts';
import type { HarnessOutput, HarnessSpec } from './detached.ts';

/**
 * The shipped readers' version — `claudeResultOutput`, `claudeStreamOutput` and `codexOutput`: a kept output of another
 * version is read again from its capture. Goes up with every change to what a reader reads, as `SAID_DIGEST` does.
 */
export const SAID_VERSION = 4;

/**
 * The former versions whose kept output the shipped readers would read the same but for the fields they have added since:
 * taken as it is, with the capture's key, and its log not read again — the added fields absent, which is the truth of a
 * capture read before they were. A version leaves this list the moment a reader changes what one of its fields says, or
 * stops saying one: the digest pin catches a reader that reads otherwise, never a version wrongly left here.
 */
export const SAID_EXTENDED: readonly number[] = [1, 2, 3];

/**
 * The digest of what the shipped readers read of the streams in `test/reader-streams.ts`: a reader that reads otherwise fails
 * `test/said.test.ts` until this is recorded again, beside a `SAID_VERSION` gone up with it.
 */
export const SAID_DIGEST = 'fd635ab12f5dc55bdf1ede187a7d8a59518be5dfb430ee23799e934443ff4a3c';

/** What a capture is known by: its size and mtime, as `fs.statSync` gives them. */
export type SaidKey = { size: number; mtimeMs: number };

/** What a spec's reader says of one output: what it read, or why it refused it (`wrong`, its words). */
export type Said = { read: HarnessOutput } | { wrong: string };

/** What this process has read of each run's capture, by the run's name, with the key it read it at. */
export type SaidMemo = Map<string, SaidKey & { said: Said }>;

/** A kept output: the key it was read at, and what the reader read (`HarnessOutput`, field for field). */
const KeptSchema = Schema.Struct({
  version: Schema.Finite,
  size: Schema.Finite,
  mtimeMs: Schema.Finite,
  read: Schema.Struct({
    closeout: Schema.optional(Schema.Struct({ payload: Schema.Unknown })),
    usage: Schema.optional(UsageSchema),
    limit: Schema.optional(Schema.String),
    denials: Schema.optional(Schema.Array(Schema.Struct({ tool: Schema.String, what: Schema.optional(Schema.String) }))),
    skills: Schema.optional(Schema.Array(Schema.String)),
    files: Schema.optional(Schema.Array(Schema.String)),
  }),
});

const isKept = Schema.is(KeptSchema);

/** Whether a kept output of `version` is taken: the shipped readers' own, or one of `SAID_EXTENDED`. */
const isTaken = (version: number): boolean => version === SAID_VERSION || SAID_EXTENDED.includes(version);

/** What `file` keeps of a capture known by `key` — or nothing, when it is not there, not whole, not decoded, or of another key. */
export const keptSaid = (file: string, key: SaidKey): HarnessOutput | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readText(file));
  } catch {
    return undefined;
  }
  if (!isKept(parsed) || !isTaken(parsed.version) || parsed.size !== key.size || parsed.mtimeMs !== key.mtimeMs) return undefined;
  return parsed.read as HarnessOutput;
};

/** Keeps `read` in `file`, known by `key`: written beside it under this process's name, then renamed over it. A failure is none. */
export const keepSaid = (file: string, key: SaidKey, read: HarnessOutput): void => {
  const own = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(own, JSON.stringify({ version: SAID_VERSION, ...key, read }));
    fs.renameSync(own, file);
  } catch {
    try {
      fs.rmSync(own, { force: true });
    } catch {}
  }
};

const saidOf = (reader: NonNullable<HarnessSpec['readOutput']>, text: string): Said => {
  try {
    return { read: reader(text) };
  } catch (e) {
    return { wrong: e instanceof Error ? e.message : String(e) };
  }
};

/** What the capture `log`, known by `key`, says: kept in `kept`, else read, and kept there when the run is `over`. */
const saidAt = (
  reader: NonNullable<HarnessSpec['readOutput']>,
  files: { log: string; kept: string },
  key: SaidKey,
  over: boolean,
): Said | undefined => {
  const kept = keptSaid(files.kept, key);
  if (kept) return { read: kept };
  let text: string;
  try {
    text = readText(files.log);
  } catch {
    return undefined;
  }
  const said = saidOf(reader, text);
  if (over && 'read' in said) keepSaid(files.kept, key, said.read);
  return said;
};

/**
 * What the run `name`'s capture says, as `reader` reads it — or why the reader refused it, or nothing where there is no
 * capture yet. Read again only when the capture has changed since `memo` read it, and then from the file it is kept in when
 * that has its key. A refusal is kept in `memo` alone: it fails `observe`, and is read again by the next process.
 *
 * @param over the run is no longer working, so its capture no longer grows: only then is what was read kept on disk.
 */
export const outputIn = (
  reader: NonNullable<HarnessSpec['readOutput']>,
  memo: SaidMemo,
  name: string,
  files: { log: string; kept: string },
  over: boolean,
): { read: HarnessOutput } | { wrong: string } | undefined => {
  let key: SaidKey;
  try {
    const { size, mtimeMs } = fs.statSync(files.log);
    key = { size, mtimeMs };
  } catch {
    return undefined;
  }
  let known = memo.get(name);
  if (!known || known.size !== key.size || known.mtimeMs !== key.mtimeMs) {
    const said = saidAt(reader, files, key, over);
    if (!said) return undefined;
    known = { ...key, said };
    memo.set(name, known);
  }
  return 'wrong' in known.said ? known.said : { read: known.said.read };
};
