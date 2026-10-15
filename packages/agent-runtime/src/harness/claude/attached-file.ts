/**
 * An attached session's face to every other process: its run file under `<root>/runs/attached/`, written by the process that holds the
 * session alone, and the files another process writes beside it, each its own: a stop (`<name>.stop`), the words said to the session
 * (`<name>.say.jsonl`, appended, which its holder hands it as it looks), and the drain (`drain.json`), which names the holder whose new
 * calls wait. What the session said is its capture (`<name>.out.jsonl`), the SDK's
 * messages a reader reads (`claudeStreamKept`), appended as they come.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import type { SessionState } from '../../core/index.ts';
import { processStart } from './inbox.ts';
import type { SpawnRequest } from '../seam.ts';

/**
 * What a holder writes of a session: `working` while a holder runs it, `parked` once a holder let it go between two calls for the next
 * to resume, `completed`, `failed` or `canceled` once it ended.
 */
export type AttachedState = 'working' | 'parked' | 'completed' | 'failed' | 'canceled';

const RunFileSchema = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.String,
    state: Schema.Literals(['working', 'parked', 'completed', 'failed', 'canceled']),
    /** The pid of the process that holds the session, and so writes this file. */
    owner: Schema.Finite,
    /** When that process started (`processStart`), so a pid another process has taken since is not read as the holder. */
    ownerStart: Schema.optional(Schema.String),
    startedAt: Schema.String,
    /** Claude Code's own id of the session, once its first message named it: what a resume continues. */
    sessionId: Schema.optional(Schema.String),
    /** The process group the session's Claude Code runs in, killed whole before a new holder resumes it. */
    childPid: Schema.optional(Schema.Finite),
    /** When that process started (`processStart`), so a pid another process has taken since is never killed or waited for. */
    childStart: Schema.optional(Schema.String),
    /** The call the session is in, the earliest of those in flight: its tool, and since when, ISO. */
    calling: Schema.optional(Schema.Struct({ tool: Schema.String, since: Schema.String })),
    /** How many new calls wait at their hook now, held back by a drain; absent when none waits. */
    heldBack: Schema.optional(Schema.Finite),
    /** What the session resumed from had spent, which its own results print on in theirs: taken off what it reports. */
    carried: Schema.optional(Schema.Struct({ costUsd: Schema.optional(Schema.Finite), apiMs: Schema.optional(Schema.Finite) })),
    /** How far into its say file the words were handed to the session, in bytes. */
    heard: Schema.optional(Schema.Finite),
    /** The spawn, its brief left out: what a holder resumes the session with. */
    request: Schema.Record(Schema.String, Schema.Unknown),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** An attached session's run file, as its holder wrote it. */
export type AttachedRun = typeof RunFileSchema.Type;

const decode = Schema.decodeUnknownOption(RunFileSchema);

/** The folder of an engine's attached sessions. */
export const attachedDir = (root: string): string => path.join(root, 'runs', 'attached');

/** A session's name as a file name: the engine's `ae/<task>/<n>`, its slashes taken out. */
const safe = (name: string): string => name.replace(/[^A-Za-z0-9._-]/g, '_');

/** The files of the session under `name`: its run file, its stop, the words said to it, its capture, and its MCP config. */
export const filesOf = (root: string, name: string) => {
  const base = path.join(attachedDir(root), safe(name));
  return { run: `${base}.json`, stop: `${base}.stop`, say: `${base}.say.jsonl`, out: `${base}.out.jsonl`, mcp: `${base}.mcp.json` };
};

/** The run file at `file`, or undefined when there is none, or it is not one a holder writes (a holder caught mid-write is not). */
export const readRun = (file: string): AttachedRun | undefined => {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  try {
    const run = decode(JSON.parse(text));
    return run._tag === 'Some' ? run.value : undefined;
  } catch {
    return undefined;
  }
};

/** Writes `run` whole, through a file beside it renamed over it, so no reader sees half of it. */
export const writeRun = (root: string, run: AttachedRun): void => {
  const { run: file } = filesOf(root, run.name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(run));
  fs.renameSync(tmp, file);
};

/** Every attached run file under `root`, by its session's name. */
export const everyRun = (root: string): Map<string, AttachedRun> => {
  const dir = attachedDir(root);
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.mcp.json') && f !== DRAIN);
  } catch {
    return new Map();
  }
  return new Map(names.flatMap((f) => [readRun(path.join(dir, f)) ?? []].flat().map((run) => [run.name, run] as const)));
};

/** The spawn as a run file keeps it: everything but the brief, which a resume does not say again. */
export const keptRequest = ({ brief: _, ...kept }: SpawnRequest): Record<string, unknown> => kept;

/** Whether the process `pid` is there: signal 0 reaches it, or it is another user's. */
export const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** This process, as a run file names its holder: its pid, and when it started. */
export const thisHolder = (): { owner: number; ownerStart?: string } => {
  const start = processStart(process.pid);
  return { owner: process.pid, ...(start ? { ownerStart: start } : {}) };
};

/**
 * Whether the process that holds `run` is gone: no process has its pid, or the one that has it started at another time than its
 * holder did, its pid taken since.
 */
export const holderGone = (run: AttachedRun): boolean =>
  !alive(run.owner) || (run.ownerStart !== undefined && processStart(run.owner) !== run.ownerStart);

/** Whether `run` is held by this very process: its pid, started when this one did. */
export const heldHere = (run: AttachedRun): boolean => run.owner === process.pid && !holderGone(run);

/**
 * A run file's state as a sighting says it. A session nobody holds now, its holder gone or its holder let it go (`parked`), is
 * `working`: a holder resumes it on its next look.
 */
export const attachedStateOf = (run: AttachedRun): SessionState => (run.state === 'parked' ? 'working' : run.state);

/** The drain's file name, beside the run files. */
const DRAIN = 'drain.json';

/**
 * The drain put for the holder `pid`: its new calls wait until it is lifted. Written by the process that puts it, with when `pid`
 * started, so a later process given the same pid is not held.
 */
export const putDrain = (root: string, pid: number): void => {
  const start = processStart(pid);
  fs.mkdirSync(attachedDir(root), { recursive: true });
  fs.writeFileSync(path.join(attachedDir(root), DRAIN), JSON.stringify({ pid, ...(start ? { start } : {}) }));
};

/** The drain lifted: none waits. */
export const liftDrain = (root: string): void => fs.rmSync(path.join(attachedDir(root), DRAIN), { force: true });

/** Whether the drain put names this very process: its pid, and, where the drain says it, when it started. */
export const drainsThis = (root: string): boolean => {
  let drain: { pid?: unknown; start?: unknown };
  try {
    drain = JSON.parse(fs.readFileSync(path.join(attachedDir(root), DRAIN), 'utf8')) as typeof drain;
  } catch {
    return false;
  }
  return drain.pid === process.pid && (drain.start === undefined || drain.start === processStart(process.pid));
};

/**
 * The process group `run`'s Claude Code led, to kill and wait for, unless its pid is another process's now: alive, and started at
 * another time than the recorded one. A leader gone leaves its group's number to its members, never to a new process, so a group
 * whose leader died is still the session's.
 */
export const childOf = (run: AttachedRun): number | undefined => {
  const pid = run.childPid;
  if (pid === undefined) return undefined;
  const taken = run.childStart !== undefined && alive(pid) && processStart(pid) !== run.childStart;
  return taken ? undefined : pid;
};

/** `pid` as a run file names a session's Claude Code: the pid, and when it started. */
export const childFacts = (pid: number): { childPid: number; childStart?: string } => {
  const start = processStart(pid);
  return { childPid: pid, ...(start ? { childStart: start } : {}) };
};

/** What a resumed session is told first, when it was let go between two calls. */
export const CARRY_ON = 'The session was paused between two tool calls and is resumed now. Carry on with the work where you left it.';

/** What a resumed session is told first, when its holder ended during its call to `tool`. */
export const crashNote = (tool: string): string => `the daemon stopped during its call to ${tool} and the call did not finish`;
