/**
 * What a held session and a held job share: how long a call may wait at its `PreToolUse` hook, which call belongs to a sub-agent and is
 * never held, the calls in flight a session keeps, and the two files a Claude Code job holds by — the store's jobs' drain, which says
 * every job is to stop at its call's end, and the job's own hold file, which says what it is doing about it.
 *
 * The jobs' drain is apart from the holder's (`putDrain`, `attached-file.ts`): a restart drains and lifts its holder, and must neither
 * hold nor release the jobs (two facts, two files). It carries when it was put and its grace, so a job that reads it judges by itself,
 * on every poll, whether its call has outlived the grace or its hold the bound (`bin/ae-claude-job.ts`): nothing is carried between two
 * reads but the file.
 *
 * The hold file is the job's word on what it was doing, written whole as it changes (a temp file renamed over it), and read by the
 * runner's look beside its run: a call in flight (`calling`), a drain read standing (`draining`), a call waiting at its hook
 * (`heldBack`), and its end under the drain (`parked`, with the call it cut). Both files are decoded by their schema, and one that does
 * not decode is read as absent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Option, Schema } from 'effect';
import { instantNow } from '../../core/engine/now.ts';
import { attachedDir } from './attached-file.ts';

/** How long a call is held at its hook before Claude Code answers for it, in seconds: a day, longer than any drain. */
export const HOOK_HOLD_S = 86_400;

/**
 * How long a job is held under a drain before it gives up and parks, in milliseconds: 23 h, an hour under `HOOK_HOLD_S`, so Claude
 * Code's own timeout of the hook never fires first and lets a held call run under a pause. A job's request shortens it (`holdMs`).
 */
export const JOB_HOLD_MS = 23 * 3_600_000;

/** How often a job reads the drain file, in milliseconds, held or not. A job's request shortens it (`holdPollMs`). */
export const JOB_HOLD_POLL_MS = 250;

/**
 * Whether the call a `PreToolUse` hook was given belongs to a call already in flight: the SDK marks a sub-agent's call with
 * `agent_id`, and absent for the main thread (the SDK's hook input), so such a call is answered however the session's calls are held.
 */
export const inside = (input: unknown): boolean => typeof (input as { agent_id?: unknown }).agent_id === 'string';

/** A call in flight: the tool it calls, and since when (ISO). */
export type Call = { tool: string; since: string };

/** A session's calls in flight, by the call's id, as its hooks keep them. */
export type CallsInFlight = Map<string, Call>;

/** The earliest of `calls`: what a file names as `calling`; nothing where none is in flight. */
export const firstCall = (calls: CallsInFlight): Call | undefined => [...calls.values()].sort((a, b) => a.since.localeCompare(b.since))[0];

/** The call a `PreToolUse` hook was given, written in flight under `id` with its tool, as its hook names it. */
export const callStarted = (calls: CallsInFlight, id: string | undefined, input: unknown): void => {
  const tool = (input as { tool_name?: unknown }).tool_name;
  if (id) calls.set(id, { tool: typeof tool === 'string' ? tool : 'a tool', since: new Date().toISOString() });
};

const CallSchema = Schema.Struct({ tool: Schema.String, since: Schema.String });

const JobDrainSchema = Schema.Struct({
  /** When the drain was put (ISO), what its grace and a job's hold bound are counted from. */
  at: Schema.String,
  /** How long a call in flight is given to finish once the drain is put, in milliseconds, before the job cuts it. */
  graceMs: Schema.Finite,
});

/** The jobs' drain, as its file holds it. */
export type JobDrain = typeof JobDrainSchema.Type;

const JobHoldSchema = Schema.Struct({
  calling: Schema.optional(CallSchema),
  draining: Schema.optional(Schema.Struct({ since: Schema.String })),
  heldBack: Schema.optional(Schema.Struct({ since: Schema.String })),
  parked: Schema.optional(Schema.Struct({ at: Schema.String, calling: Schema.optional(CallSchema) })),
});

/** A job's hold file: its call in flight, the drain it read standing, a call waiting at its hook, and its end under the drain. */
export type JobHold = typeof JobHoldSchema.Type;

/** The jobs' drain file of the store at `root`, beside the attached sessions' files and apart from the holder's drain. */
export const jobDrainFile = (root: string): string => path.join(attachedDir(root), 'jobs-drain.json');

/** Writes `value` whole on `file`, through a file beside it renamed over it, so a reader never reads half of it. */
const writeWhole = (file: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value));
  fs.renameSync(temp, file);
};

/** What `file` holds as JSON, through `decode`; `null` where it is absent, no JSON, or does not decode. */
const readDecoded = <A>(file: string, decode: (u: unknown) => Option.Option<A>): A | null => {
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

const decodeDrain = Schema.decodeUnknownOption(JobDrainSchema);
const decodeHold = Schema.decodeUnknownOption(JobHoldSchema);

/** The jobs' drain put on the store at `root`, stamped now: every job's next call waits, and a call in flight has `graceMs`. */
export const putJobDrain = (root: string, { graceMs }: { graceMs: number }): void =>
  writeWhole(jobDrainFile(root), { at: new Date(instantNow().at).toISOString(), graceMs } satisfies JobDrain);

/** The jobs' drain lifted: no job waits. */
export const liftJobDrain = (root: string): void => fs.rmSync(jobDrainFile(root), { force: true });

/** The jobs' drain `file` says stands; `null` where none does, or the file does not decode. */
export const jobDrainOf = (file: string): JobDrain | null => readDecoded(file, decodeDrain);

/** The job's hold file `file`; `null` where it is absent or does not decode. */
export const readJobHold = (file: string): JobHold | null => readDecoded(file, decodeHold);

/** Writes `hold` whole on the job's hold file `file`. */
export const writeJobHold = (file: string, hold: JobHold): void => writeWhole(file, hold);
