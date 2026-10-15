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
 *
 * A spec that keeps less of a capture once its session has ended (`HarnessSpec.keepOutput`) has it rewritten at that read, once its
 * run file says its worker wrote its end: the capture, and its stdout kept whole beside it, each to what `keepOutput` keeps, through a
 * file of its own renamed over it, its times kept, and only when the reader reads the kept text as it read the whole (`keepCapture`);
 * what was read is then kept under the kept capture's key. `SAID_VERSION` stays the readers': a capture kept so reads the same.
 */
import { Schema } from 'effect';
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { UsageSchema } from '../../core/event-schema.ts';
import { readText } from '../../core/engine/tally.ts';
import type { HarnessOutput, HarnessSpec } from './detached.ts';
import { overNow, type RunFile } from './run-file.ts';

/**
 * The shipped readers' version — `claudeResultOutput`, `claudeStreamOutput` and `codexOutput`: a kept output of another
 * version is read again from its capture. Goes up with every change to what a reader reads, as `SAID_DIGEST` does.
 */
export const SAID_VERSION = 5;

/**
 * The former versions whose kept output the shipped readers would read the same but for the fields they have added since:
 * taken as it is, with the capture's key, and its log not read again — the added fields absent, which is the truth of a
 * capture read before they were. A version leaves this list the moment a reader changes what one of its fields says, or
 * stops saying one: the digest pin catches a reader that reads otherwise, never a version wrongly left here.
 */
export const SAID_EXTENDED: readonly number[] = [1, 2, 3, 4];

/**
 * The digest of what the shipped readers read of the streams in `test/reader-streams.ts`: a reader that reads otherwise fails
 * `test/said.test.ts` until this is recorded again, beside a `SAID_VERSION` gone up with it.
 */
export const SAID_DIGEST = 'f5bfcb068f89ee4e9f657a5cce81e44608ca006285d4b4ee0c757d89057210ac';

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

/** What `reader` says of `text`: what it read, or why it refused it, in its words. */
export const saidOf = (reader: NonNullable<HarnessSpec['readOutput']>, text: string): Said => {
  try {
    return { read: reader(text) };
  } catch (e) {
    return { wrong: e instanceof Error ? e.message : String(e) };
  }
};

/**
 * What `keep` keeps of a capture's `text`, which `reader` reads as `read` (read here when not given): `{ kept, read }`, all of it
 * for a capture already kept, and what both read; or why it is left whole (`why`): the reader refuses the whole text, `keep` throws, or the reader reads the
 * kept text otherwise.
 */
export const keptText = (
  reader: NonNullable<HarnessSpec['readOutput']>,
  keep: (output: string) => string,
  text: string,
  read?: HarnessOutput,
): { kept: string; read: HarnessOutput } | { why: string } => {
  const whole = read ? { read } : saidOf(reader, text);
  if ('wrong' in whole) return { why: `its reader refuses it: ${whole.wrong}` };
  let kept: string;
  try {
    kept = keep(text);
  } catch (e) {
    return { why: `what it keeps could not be told: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (kept !== text && !isDeepStrictEqual(saidOf(reader, kept), whole)) return { why: 'its reader reads it otherwise once kept' };
  return { kept, read: whole.read };
};

/**
 * Writes `kept` over the capture `file`, known by `key`, and answers its key now; or answers nothing and leaves it whole, when the
 * file has changed since `key` or the write fails. Written beside it under this process's name, given the file's own access and
 * modification times, then renamed over it, so a reader finds the whole capture or the kept one, never a part.
 */
export const replaceCapture = (file: string, key: SaidKey, kept: string): SaidKey | undefined => {
  const own = `${file}.${process.pid}.tmp`;
  try {
    const { size, mtimeMs, atimeMs } = fs.statSync(file);
    if (size !== key.size || mtimeMs !== key.mtimeMs) return undefined;
    fs.writeFileSync(own, kept);
    fs.utimesSync(own, atimeMs / 1000, mtimeMs / 1000);
    fs.renameSync(own, file);
    const now = fs.statSync(file);
    return { size: now.size, mtimeMs: now.mtimeMs };
  } catch {
    try {
      fs.rmSync(own, { force: true });
    } catch {}
    return undefined;
  }
};

/**
 * Rewrites the capture `file`, known by `key`, to what `keep` keeps of its `text` (`keptText`, `replaceCapture`), and answers its key
 * now; or answers nothing and leaves it whole, where either says so, or `keep` keeps all of it.
 */
const keepCapture = (
  reader: NonNullable<HarnessSpec['readOutput']>,
  keep: (output: string) => string,
  file: string,
  capture: { key: SaidKey; text: string },
  read?: HarnessOutput,
): SaidKey | undefined => {
  const told = keptText(reader, keep, capture.text, read);
  return 'kept' in told && told.kept !== capture.text ? replaceCapture(file, capture.key, told.kept) : undefined;
};

/** A capture `file`'s key and text, or nothing when it cannot be read. */
export const captureAt = (file: string): { key: SaidKey; text: string } | undefined => {
  try {
    const { size, mtimeMs } = fs.statSync(file);
    return { key: { size, mtimeMs }, text: readText(file) };
  } catch {
    return undefined;
  }
};

/** Where a run's capture is (`log`), what was read of it is kept (`kept`), and, for a spec that keeps it, its whole stdout (`stdout`). */
export type SaidFiles = { log: string; kept: string; stdout?: string };

/** The files of the run whose files begin `base`: `.log`, `.said`, and `.stdout` for a spec that keeps its `streams` whole. */
export const saidFilesAt = (base: string, streams?: true): SaidFiles => ({
  log: `${base}.log`,
  kept: `${base}.said`,
  ...(streams ? { stdout: `${base}.stdout` } : {}),
});

/**
 * What to do with a run's capture once read: `over`, the run no longer works, so what was read is kept on disk; `ended`, its run
 * file says its worker wrote its end, so nothing writes the capture again, and `keep`, a spec's `keepOutput`, rewrites it.
 */
export type SaidWhen = { over: boolean; ended?: boolean; keep?: (output: string) => string };

/** When `run`'s capture is read (`SaidWhen`): over as of now, its lease gone included; ended once its worker wrote its end. */
export const saidWhen = (run: RunFile, keep?: (output: string) => string): SaidWhen => ({
  over: overNow(run),
  ended: run.state !== 'working',
  ...(keep ? { keep } : {}),
});

/**
 * What the capture `log`, known by `key`, says, and the key it is known by now: kept in `kept`, else read; once the run is `over`,
 * what was read is kept there, after the capture and its stdout are rewritten to what `keep` keeps, once `ended` (`keepCapture`).
 */
const saidAt = (
  reader: NonNullable<HarnessSpec['readOutput']>,
  files: SaidFiles,
  key: SaidKey,
  when: SaidWhen,
): { said: Said; key: SaidKey } | undefined => {
  const kept = keptSaid(files.kept, key);
  if (kept) return { said: { read: kept }, key };
  let text: string;
  try {
    text = readText(files.log);
  } catch {
    return undefined;
  }
  const said = saidOf(reader, text);
  if (!when.over || !('read' in said)) return { said, key };
  let now = key;
  if (when.ended && when.keep) {
    now = keepCapture(reader, when.keep, files.log, { key, text }, said.read) ?? key;
    const stdout = files.stdout === undefined ? undefined : captureAt(files.stdout);
    if (files.stdout && stdout) keepCapture(reader, when.keep, files.stdout, stdout);
  }
  keepSaid(files.kept, now, said.read);
  return { said, key: now };
};

/**
 * What the run `name`'s capture says, as `reader` reads it — or why the reader refused it, or nothing where there is no
 * capture yet. Read again only when the capture has changed since `memo` read it, and then from the file it is kept in when
 * that has its key. A refusal is kept in `memo` alone: it leaves that run unread, or failed once ended, and is read again by the
 * next process.
 *
 * @param when whether the run is over, so its capture no longer grows: only then is what was read kept on disk; and whether its
 *   worker wrote its end, so its capture is rewritten to what `keep` keeps of it (`SaidWhen`).
 */
export const outputIn = (
  reader: NonNullable<HarnessSpec['readOutput']>,
  memo: SaidMemo,
  name: string,
  files: SaidFiles,
  when: SaidWhen,
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
    const at = saidAt(reader, files, key, when);
    if (!at) return undefined;
    known = { ...at.key, said: at.said };
    memo.set(name, known);
  }
  return 'wrong' in known.said ? known.said : { read: known.said.read };
};
