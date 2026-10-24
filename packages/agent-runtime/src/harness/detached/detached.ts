/**
 * A runner for any harness that runs a prompt to completion and exits.
 *
 * A harness that runs a prompt in the foreground and exits — Codex's `codex exec`, a Claude Code job's own process — has no
 * registry somebody else maintains. So for those we detach a worker per session and maintain the registry ourselves, as a
 * directory of run files (`bin/ae-worker.ts` writes them).
 *
 * **What this costs, stated plainly**: a heartbeat. A worker that is killed leaves a run file that
 * says `working` forever, and nothing on disk distinguishes that from a session thinking hard. So
 * the worker beats every 5s and `observe` calls a stale beat dead. That is a lease, in the only
 * form a lease has ever taken. It is the price of not having somebody else's registry to read,
 * and therefore the price of running more than one harness.
 *
 * What it buys: this file has no idea what a harness is. It needs a command, a working directory
 * and an exit code — so a new harness is a `HarnessSpec` value, not new code. The three shipped are
 * `codex` (`harness/codex/codex.ts`), a Claude Code job (`claudeJobSpec`, `harness/claude/code.ts`) and `commandHarness`
 * (`harness/command/command.ts`).
 */
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Denial, Sighting, Usage } from '../../core/index.ts';
import { RunnerError, type McpServer, type RunnerOps, type SessionKept, type SpawnRequest, type TranscriptEvent } from '../seam.ts';
import { forgetFiles, keptOf } from '../forget.ts';
import { withoutTelemetry } from '../telemetry.ts';
import { readTranscript } from '../transcript.ts';
import { countRead, countSpawn, readText } from '../../core/engine/tally.ts';
import { instantNow } from '../../core/engine/now.ts';
import type { Instant } from '../../core/clock.ts';
import { quote } from '../../core/quote.ts';
import { outputIn, saidFilesAt, saidWhen, type SaidMemo } from './said.ts';
import { compactOps } from './compact.ts';
import { lookedFor } from './looked.ts';
import { detachedStateOf, firstRunFile, leased, runFileIn, type Carried, type Run, type RunFile } from './run-file.ts';
import { carriedOf, lessCarried } from './carried.ts';
import { workerBoundsOf, type DetachedOptions } from './detached-options.ts';
import { spawnFiles, spawnInput } from './spawn-files.ts';

export { detachedStateOf, STALE_MS } from './run-file.ts';
export { WORKER_BEAT_MS, WORKER_STOP_GRACE_MS } from './worker-bounds.ts';
export type { DetachedOptions } from './detached-options.ts';
import { followOf, type PartialMark } from './follow.ts';

/** Everything this engine needs to know about a harness. Add one by writing one of these. */
export type HarnessSpec = {
  name: string;
  /**
   * The command that runs a brief to completion. Exit 0 is success; anything else is failure. `env`, when given, is laid over
   * the worker's own environment for this process alone: the engine's, less its telemetry (`withoutTelemetry`).
   */
  command: (r: SpawnRequest, io?: HarnessIO) => { cmd: string; args: string[]; env?: Record<string, string> };
  /**
   * What this harness needs to know about the machine before it runs — read from disk, from git —
   * kept out of `command` so that stays a pure function of what it is given. Merged into the `io`
   * the command receives. A throw refuses the spawn: nothing has run, and the attempt ends
   * `unstartable` in its words. `beside` names a file beside the run's own under the end it is given (`<name>.<end>`), which
   * the runner keeps with the run's — `forget` removes it, `kept` lists it — for a harness whose process writes a file of its
   * own there (a job's bridge, `bridgeFile`); an end of `json` is the runner's own, and refused.
   */
  prepare?: (r: SpawnRequest, beside: (end: string) => string) => Partial<HarnessIO>;
  /**
   * The harness is a process of ours that reads the spawn request itself, and the runner writes it one: `<name>.request.json`,
   * holding `{ request, io }` — the request whole and the `io` the runner computed — whose path `command` is given as
   * `io.requestFile`. For a spec whose command is not a third party's CLI but a bin of this package (`claudeJobSpec`,
   * `bin/ae-claude-job.ts`), which needs everything a runner knows and cannot be handed it on an argv. Absent: no file is written
   * and `io.requestFile` is undefined, so the seam reaches no other harness.
   */
  needsRequest?: true;
  /**
   * How the harness's start event decodes, the one place its own session id is read from: what a later task resumes, and what
   * `transcript.file` is given (`StartEvent`). Absent, a run keeps no id: the name is the key, the id just a handle.
   */
  start?: StartEvent;
  /**
   * What this harness cannot be asked for, as a sentence that names what to write instead — or
   * `undefined` when it can do what the task says. Permission modes and efforts are its own words,
   * so the check lives on the spec, and `file()` asks it before anything is journalled. A spec
   * without one is asked nothing.
   */
  refuses?: (task: Omit<SpawnRequest, 'name'>) => string | undefined;
  /**
   * What the harness says in its own output, for one that prints its final answer rather than
   * writing it where the runner chose. Handed the worker's capture of the harness's stdout and
   * stderr whenever it has changed, and returns what it found there — nothing it did not. A pure
   * function of the text, as `command` is of the request. A throw refuses the output, that run's alone: it is unread while its
   * process runs, and read as failed once it has ended, with why said in its words on every look (`outputRefusalOf`).
   */
  readOutput?: (output: string) => HarnessOutput;
  /**
   * Where the harness keeps its own record of a session's conversation, and what one line of it says —
   * for a harness that keeps one. `file` is given the harness's own session id, the run's `nativeId`,
   * and may read the disk to find it, as `prepare` does; `events` is pure, given the line parsed, the
   * byte offset it starts at, and the file, for a refusal to name. Absent, the runner has no `transcript`, and `logs` is what it gives.
   * `records`, optional, finds the record of many sessions in one pass, each id's paths, where `file` asked once an id would
   * list the harness's folders once an id.
   */
  transcript?: {
    file: (nativeId: string) => string | undefined;
    events: (entry: unknown, offset: number, file: string) => TranscriptEvent[];
    records?: (nativeIds: readonly string[]) => Map<string, string[]>;
  };
  /**
   * Why a session of this harness cannot be told anything while it runs, in its own words and saying what to
   * do instead. A spec without `input` has no `say` — a harness that runs a prompt and exits takes nothing in the
   * meantime — so `say` refuses every task of it with this sentence, and a spec without one with the engine's.
   */
  noChannel?: string;
  /**
   * A harness that reads its messages as lines on its stdin, and so can be told something while it runs: `claudeJob`
   * (`bin/ae-claude-job.ts`, the SDK's streaming input). Set, `command` leaves the brief out, and the worker writes it as the first
   * line on the harness's stdin; each word a person says after it is appended by `say` to the run's inbox — a file of
   * lines beside its run file, the person's, which the worker only reads — and the worker writes it on. At the first line
   * of the harness's output that closes (`closesOn`) the worker ends stdin: a harness that reads its stdin for more waits
   * for its end before it exits, and words said after it are refused.
   */
  input?: {
    /** The one line a message is written as — the brief, then each word said. Pure, and holds no newline. */
    line: (text: string) => string;
    /**
     * The line of the harness's output after which it takes no more words: one that parses as a JSON object whose own
     * `key` is `value`. Read as data, never as a prefix: Claude Code prints its result's `type` far down the line.
     */
    closesOn: { key: string; value: string };
  };
  /**
   * The context windows this harness can be given, in tokens, both ends included: a task's `contextTokens` is handed to
   * `command`, and `file()` refuses one outside the range. Absent: the harness has no such knob, and `file()` refuses a
   * task that sets one rather than let it run on a window it did not ask for.
   */
  contextTokens?: { least: number; most: number };
  /**
   * The harness is Claude Code, and its process hands a task's `config.claude` to it as flags (`attachedOptions`). Absent: the
   * harness has no such flags, and `file()` refuses a task that carries any rather than start a session without them.
   */
  claudeFlags?: true;
  /**
   * The harness is Codex, and `prepare` reads a task's `config.codex` (`CodexArgs`). Absent: the harness has no such
   * arguments, and `file()` refuses a task that carries them rather than start a session without them.
   */
  codexArgs?: true;
  /**
   * The harness prints a resumed session's cost and API time as totals that carry its parent's on, not as its own:
   * a resumed Claude Code job does. Set, the run file keeps the id it resumed and, read once at its spawn, the parent's printed
   * totals (`carried`) — the latest run started before it under that id, as its own output read them — which a look takes
   * off. Where there is no such run, or it printed no total, the attempt carries no cost rather than its parent's too.
   */
  resumeCostCarried?: true;
  /**
   * The harness runs the process a task's `config.command` names, with its `config.env` and `config.niceness` (`commandHarness`).
   * Absent: the harness has no such arguments, and `file()` refuses a task that carries them rather than run something else.
   */
  commandArgs?: true;
  /**
   * The harness lays a task's `config.env` under its own environment, in the process it spawns. Absent, and no `commandArgs`:
   * `file()` refuses a task that carries one rather than start its session without it.
   */
  env?: true;
  /**
   * The harness can leave the checkout's `.mcp.json` out of a session, whole or but for the entries a task's `config.checkoutMcp`
   * names, and loads those it names. Absent: `file()` refuses a task that carries it rather than start a session with servers it
   * did not ask for, or without those it did.
   */
  checkoutMcp?: true;
  /**
   * The harness gives a session exactly the skills a task's `config.enabledSkills` lists, and hides and refuses every other. Absent:
   * `file()` refuses a task with a list rather than start a session that holds skills it was not given.
   */
  enabledSkills?: true;
  /**
   * The modes of a task's `config.mounts` this harness holds, and `command` renders: `readOnly`, a folder the session can read and
   * not write; `writable`, one it can write too. Absent, or a mode left out: `file()` refuses a task with such a mount rather than
   * start a session that would not see the folder, or could write where it was told it may only read.
   */
  mounts?: { readOnly?: true; writable?: true };
  /**
   * The harness runs a task's `config.callAdmission` before each call to the tools it names, and does what it answers (`Admission`).
   * Absent: `file()` refuses a task that carries one rather than run its calls unadmitted.
   */
  callAdmission?: true;
  /**
   * The worker keeps the harness's stdout and its stderr each whole, in a file of its own beside the log (`.stdout`, `.stderr`),
   * and the runner reads them (`output`), until its session has ended: then stdout as `keepOutput` keeps it, where the spec has one.
   * Absent: the log alone, both streams in one, and the runner has no `output`.
   */
  streams?: true;
  /**
   * What a capture of this harness keeps once its session has ended, as text: the log, and stdout where it is kept whole (`streams`),
   * each rewritten so at the read that keeps what was read (`outputIn`, `keepCapture`), and only when `readOutput` reads the kept
   * text as it read the whole. Pure, and keeping what it keeps of a kept capture. Absent: a capture is kept whole.
   */
  keepOutput?: (output: string) => string;
  /**
   * What the harness's stdout says of the text it is writing, before the text is whole (`PartialMark`), read from its whole lines
   * after `before` lines: set, with `streams` and `transcript`, the runner follows a session live (`follow`, `followOf`).
   */
  partials?: (output: string, before: number) => { marks: PartialMark[] } | { wrong: string };
};

/**
 * A harness's start event, as data the worker reads (`bin/ae-worker.ts`): the first whole line of its stdout that is a JSON object
 * whose own keys hold each of `event`'s values. Its `id` field must be a string of hex and dashes, 16 or more, the session's own id;
 * anything else there, or nothing, refuses the start (`RunFile.startRefused`): the session is unread while its process runs, and
 * read as failed, with no id, once it has ended.
 */
export type StartEvent = { event: Readonly<Record<string, string>>; id: string };

/**
 * Where a harness that can take a structured final answer should put it.
 *
 * Chosen by the runner, per run, OUTSIDE the workspace: anything written inside a step's worktree
 * travels down its git branch, and the next step would be cut a directory that already says it is
 * finished.
 */
export type HarnessIO = {
  /** Present when the task asked for a closeout: its JSON Schema, written to a file. */
  closeoutSchemaFile?: string;
  /** Where the harness should write the final answer that satisfies the schema. */
  closeoutFile?: string;
  /** Directories to treat as trusted for this run. Codex loads a project's rules only when trusted. */
  trustedDirs?: string[];
  /**
   * Present when the session has MCP servers of the task's: its `mcp` and the entries its `checkoutMcp` picks, written as an MCP
   * config (`{"mcpServers": …}`).
   */
  mcpConfigFile?: string;
  /** The checkout's own `.mcp.json`, when there is one. Found by a spec's `prepare`, which reads the disk. */
  checkoutMcpConfig?: string;
  /** The entries a task's `checkoutMcp` picked from its checkout's `.mcp.json`, for a harness that takes servers as arguments. */
  pickedMcp?: Record<string, McpServer>;
  /** `ionice -c3` runs on this machine, so a command can be put in the idle IO class. Found by a spec's `prepare`. */
  idleIo?: true;
  /**
   * Where the spawn request whole, and the `io` the runner computed for it, were written for the harness to read
   * (`HarnessSpec.needsRequest`). Present only for a spec that asks.
   */
  requestFile?: string;
  /**
   * Where a Claude Code job's own process writes what its claude.ai bridge came to (`AttachedBridge`, decoded by
   * `BridgeFactsSchema`), and each `bridge_state` its stream says after: named by its spec's `prepare` beside the run's own files
   * where the task asks for a bridge (`claude.remoteControl`), and read into the job's sighting by its runner. Absent: none was asked.
   */
  bridgeFile?: string;
};

/** What a harness's output said, as its spec's `readOutput` found it. Each part absent when it does not say. */
export type HarnessOutput = {
  /** The final answer, wrapped so that an answer is told apart from none by presence, not by value. */
  closeout?: { payload: unknown };
  /** What the session consumed, as far as the output says: every field a measurement, absent when not. */
  usage?: Usage;
  /**
   * The process's own token counts, `{}` when it counted none, where `usage`'s are the whole session's, which a resumed one carries
   * its parent's on in (`claudeResultOutput`): what a resume reads when its parent's cannot be taken off. Never a sighting's.
   */
  ownTokens?: Usage;
  /** A limit its configuration set that the harness says it ended the session at — `budget`, its spend cap. */
  limit?: string;
  /** The tool calls the harness denied the session, in the order it first did. Absent when none, or when it does not say. */
  denials?: Denial[];
  /** Each skill the session loaded, one per call: `[]` when it loaded none. Absent when the harness cannot say. */
  skills?: string[];
  /** Each file the session read or wrote, once, relative to its folder: `[]` when it touched none. Absent when the harness cannot say. */
  files?: string[];
  /**
   * What the session really ran on, as its own start line resolved the alias it was asked for — `config.model` is what was asked,
   * this is what happened, and the two are different facts. Absent when the harness does not say.
   */
  ranOn?: string;
};

/** The worker a detached run is spawned with, `bin/ae-worker.ts`, found from this file's own folder. */
export const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'bin', 'ae-worker.ts');
const safe = (name: string) => name.replace(/[^a-zA-Z0-9]+/g, '_');
const isDirectory = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
/**
 * What the worker is given to write on a harness's stdin: the brief's line first; then each line of the inbox from `from`
 * on — the inbox's size when the run was spawned, so a run spawned again under a name finds no words said to the one
 * before it — until a line of the harness's output `closesOn`.
 */
export type RunInput = { first: string; inbox: string; from: number; closesOn: { key: string; value: string } };

/**
 * A run's sighting, field for field: its state, `failed` where it is read as failed (`lookOf`); its closeout the file its harness wrote
 * (`statement`), else what its output says, with no time: the spawn cleared both before it launched the run, so either was written by
 * the run's own process, and the engine keeps it whatever the clock says; its exit code once it has one, never the worker's -1; and
 * what its output says it used, reached and was denied, and the skills it loaded and the files it touched: an empty list kept, since it
 * says they were counted.
 */
const sightingOf = (
  name: string,
  run: RunFile,
  now: Instant,
  statement: Sighting['closeout'],
  output: { read: HarnessOutput } | undefined,
  usage: Usage | undefined,
  failed: boolean,
): Sighting => ({
  sessionId: name,
  state: failed ? 'failed' : detachedStateOf(run, now),
  nativeId: run.nativeId,
  closeout: statement ?? (output?.read.closeout && { payload: output.read.closeout.payload }),
  ...(typeof run.exitCode === 'number' && run.exitCode >= 0 ? { exitCode: run.exitCode } : {}),
  ...(usage ? { usage } : {}),
  ...(output?.read.limit ? { limit: output.read.limit } : {}),
  ...(output?.read.denials?.length ? { denials: output.read.denials } : {}),
  ...(output?.read.skills ? { skills: output.read.skills } : {}),
  ...(output?.read.files ? { files: output.read.files } : {}),
  ...(output?.read.ranOn ? { ranOn: output.read.ranOn } : {}),
});

/** What a spec's reader said of a run's output (`outputIn`): what it read, why it refused it, or nothing, with no output yet. */
type Told = { read: HarnessOutput } | { wrong: string } | undefined;

/**
 * How a run is read on one look, each run alone: `read`, with what its output says (`output`); `unread` while its process runs
 * where its start (`startRefused`) or its output was refused; `failed` once such a run has ended. `warning` says why a refused
 * start or output is not read, on every look its run file lasts.
 */
type RunLook = { as: 'read' | 'unread' | 'failed'; output?: { read: HarnessOutput }; warning?: string };

/**
 * How the run under `name` is read as of `now` (`RunLook`), its output read through `told` and named by `log`. A run whose start
 * was refused is unread at work, its output not read, and once ended failed with what its output says, whose refusal, often of that
 * same start event, is read as nothing said (`startRefusalOf`). Any other run whose output is refused is unread at work, and once
 * ended failed with nothing its output says (`outputRefusalOf`). The harness's other runs are read either way.
 */
const lookOf = (spec: HarnessSpec, name: string, run: RunFile, now: Instant, told: () => Told, log: string): RunLook => {
  const atWork = detachedStateOf(run, now) === 'working';
  if (run.startRefused) {
    const warning = startRefusalOf(spec, name, run.startRefused);
    if (atWork) return { as: 'unread', warning };
    const said = told();
    return { as: 'failed', output: said && 'read' in said ? said : undefined, warning };
  }
  const said = told();
  if (!said || 'read' in said) return { as: 'read', output: said };
  const warning = outputRefusalOf(spec, name, log, said.wrong);
  return atWork ? { as: 'unread', warning } : { as: 'failed', warning };
};

/**
 * Why the run under `name` is not read: its spec refused its output, `log`, in its reader's words (`wrong`). Names the run, the
 * file, the reader's words, what the run is read as, and what to do.
 */
export const outputRefusalOf = (spec: HarnessSpec, name: string, log: string, wrong: string): string =>
  `${spec.name}: \`${name}\`'s output, ${log}, cannot be read: ${wrong.replace(/\.?\s*$/, '.')} It is unread while its process runs,` +
  ` and read as failed once it has ended; the other sessions of ${spec.name} are read. Once its task has settled, \`ae forget\`` +
  ` lets this session go.`;

/**
 * Why the run under `name` has no session id: its harness printed its start event with no id this runtime reads (`startRefused`).
 * Names the run, the line of its stdout, the event, the field and what was there, quoted, what the run is read as, and what to do.
 */
export const startRefusalOf = (spec: HarnessSpec, name: string, refused: NonNullable<RunFile['startRefused']>): string => {
  const event = Object.values(spec.start?.event ?? {}).join('`/`');
  return (
    `${spec.name}: \`${name}\` has no session id: line ${refused.line} of its stdout is its \`${event}\` start event, and its \`${refused.field}\`` +
    ` holds ${quote(refused.found)}, where this runtime reads its session's id, a string of hex and dashes, 16 or more. It is unread` +
    ` while its process runs, and read as failed once it has ended; the other sessions of ${spec.name} are read. File the task again` +
    ` on a ${spec.name} whose start event this runtime reads, or under a runtime whose \`start\` on the \`${spec.name}\` spec reads` +
    ` this one; once the task has settled, \`ae forget\` lets this session go.`
  );
};

/** What `look` answers, once each of its `warnings`, why a run is not read (`RunLook`), is said as a warning. */
const sayingUnread = <A, E>(look: Effect.Effect<{ value: A; warnings: readonly string[] }, E>): Effect.Effect<A, E> =>
  look.pipe(
    Effect.tap(({ warnings }) => Effect.forEach(warnings, (w) => Effect.logWarning(w), { discard: true })),
    Effect.map(({ value }) => value),
  );

/** The ends of the JSON files beside a run's that are not run files: its closeout, its schema, its MCP config, its spawn request. */
const NO_RUN_FILES = ['.closeout.json', '.schema.json', '.mcp.json', '.request.json'];

const runFileOf = (spec: HarnessSpec, root: string, name: string) => path.join(root, 'runs', spec.name, `${safe(name)}.json`);

/**
 * A file beside the run of `spec` under `name`, `<name>.<end>`, kept with the run's own: what a spec's `prepare` is given to name one
 * of its process's (`HarnessSpec.prepare`), and what its runner reads it by. An end of `json` would be listed as a run file, and is
 * refused.
 */
export const besideRun = (spec: Pick<HarnessSpec, 'name'>, root: string, name: string, end: string): string => {
  if (end === 'json' || end.endsWith('.json') || !/^[a-z][a-z.-]*$/.test(end))
    throw new Error(`\`${end}\` is no end for a file beside a run: give a lowercase word other than \`json\`, as \`bridge\` is`);
  return path.join(root, 'runs', spec.name, `${safe(name)}.${end}`);
};
const inboxFileOf = (spec: HarnessSpec, root: string, name: string) => path.join(root, 'runs', spec.name, `${safe(name)}.inbox.jsonl`);

/**
 * The run under `name`, from its own run file alone: no other file is read. No file there, or a file whose name is
 * another — `safe` folds two names into one path — is no run (`undefined`). A file that is there and cannot be read, or
 * is in no shape a worker writes, is `unread`, in words saying why: it may be a worker's half-written file.
 */
const runAt = (spec: HarnessSpec, root: string, name: string): { run: RunFile } | { unread: string } | undefined => {
  let text: string;
  try {
    text = readText(runFileOf(spec, root, name));
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT' ? undefined : { unread: e instanceof Error ? e.message : String(e) };
  }
  const run = runFileIn(text);
  if (typeof run === 'string') return { unread: run };
  return run.name === name ? { run } : undefined;
};

/**
 * A run found by its name, from its own run file alone: no other run is read, and no output. A detached run's handle
 * is its name, so that is the id found. A file whose name is not this one — `safe` folds two names into one path — is
 * not this run, and a file that cannot be read yet is not found.
 */
export const detachedFind =
  (spec: HarnessSpec, root: string) =>
  (name: string): Effect.Effect<{ sessionId: string } | undefined> =>
    Effect.sync(() => {
      const at = runAt(spec, root, name);
      return at && 'run' in at ? { sessionId: name } : undefined;
    });

/** When a run file says its harness started: `NaN` for one that does not say, which is before and after nothing. */
const startOf = (run: RunFile) => (run.startedAt ? new Date(run.startedAt).getTime() : NaN);

/**
 * The parent of a run that resumed `resumeFrom`, among `all`: the run under that id that started last `before` — a resume keeps its
 * parent's id, so a later run under it is a child, never the parent — and never the run named `except`, the one being spawned.
 */
const parentOf = (all: readonly Run[], resumeFrom: string, before: number, except?: string): Run | undefined =>
  all
    .filter((o) => o.name !== except && o.run.nativeId === resumeFrom && startOf(o.run) < before)
    .sort((a, b) => startOf(b.run) - startOf(a.run))[0];

/**
 * `say` for a spec with `input`: the words appended to the inbox of the run under the session's name, as the line its harness
 * reads, for its worker to write on. Its own run file alone is read. Refused, with nothing appended, where no worker would
 * write the words on (`detachedOps`).
 */
const sayTo =
  (spec: HarnessSpec, root: string, input: NonNullable<HarnessSpec['input']>): NonNullable<RunnerOps['say']> =>
  (session, text) =>
    Effect.try({
      try: () => {
        const { name } = session;
        let run: RunFile | string | undefined;
        try {
          run = runFileIn(fs.readFileSync(runFileOf(spec, root, name), 'utf8'));
        } catch {}
        if (typeof run === 'string')
          throw new Error(
            `\`${name}\` cannot be told anything: its run file, ${runFileOf(spec, root, name)}, is unreadable — ${run}. Its worker writes that file; if it is being written, say it again in a moment. Nothing was said.`,
          );
        if (!run || run.name !== name) throw new Error(`no session \`${name}\` is running to hear anything: there is no run of it.`);
        if (!run.input)
          throw new Error(
            `\`${name}\` was started with no way in: its worker writes nothing on its input. Continue its session with a new task that carries the words (\`resumeFrom\`).`,
          );
        if (run.inputClosed)
          throw new Error(
            `\`${name}\` has given its result and reads no more words: its input is closed. Continue its session with a new task that carries the words (\`resumeFrom\`).`,
          );
        const state = leased(run, instantNow());
        if (state !== 'working') throw new Error(`\`${name}\` is \`${state}\`, not running: it takes no more words.`);
        const line = input.line(text);
        if (/[\r\n]/.test(line))
          throw new Error(`the words make a line with a line break in it, which the harness would read as two. Nothing was said.`);
        fs.appendFileSync(inboxFileOf(spec, root, name), `${line}\n`);
      },
      catch: (cause) =>
        new RunnerError({ verb: 'say', message: `${spec.name}: ${cause instanceof Error ? cause.message : String(cause)}` }),
    });

/** A look at `spec`'s runs that threw, as the `RunnerError` `observe` and `observeFor` fail with, in its words. */
const observeErrorOf = (spec: HarnessSpec) => (cause: unknown) =>
  new RunnerError({ verb: 'observe', message: `${spec.name}: ${cause instanceof Error ? cause.message : String(cause)}` });

/** One of a process's two output streams, by the name its file and `output` give it. */
export type StreamName = 'stdout' | 'stderr';

/**
 * What `file` holds, or its last `lastBytes` bytes, as text; `undefined` when there is no such file. A cut that falls inside a
 * character starts after it: the bytes that continue a character cut in two are left off.
 */
const streamIn = (file: string, lastBytes?: number): string | undefined => {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
  try {
    const size = fs.fstatSync(fd).size;
    const from = lastBytes === undefined ? 0 : Math.max(0, size - lastBytes);
    const buf = Buffer.alloc(size - from);
    const n = fs.readSync(fd, buf, 0, buf.length, from);
    countRead(n);
    const whole = from === 0 ? 0 : buf.subarray(0, n).findIndex((byte) => (byte & 0xc0) !== 0x80);
    return buf.subarray(whole === -1 ? n : whole, n).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
};

/** The run `name` names under `spec`'s folder at `root`, or `undefined` when it has none or its file cannot be read. */
const runNamed = (spec: HarnessSpec, root: string, name: string): Run | undefined => {
  const at = runAt(spec, root, name);
  return at && 'run' in at ? { name, run: at.run } : undefined;
};

/** The file a run's `stream` is kept whole in, beside its run file in `dir`. */
const streamFileOf = (dir: string, name: string, stream: StreamName) => path.join(dir, `${safe(name)}.${stream}`);

/** The runner's `output`, for a spec that keeps its streams (`streams`): each read from its own file in `dir` (`streamIn`). */
const outputOps = (spec: HarnessSpec, dir: string): Pick<RunnerOps, 'output'> =>
  spec.streams
    ? {
        output: (name, stream, lastBytes) =>
          Effect.try({
            try: () => streamIn(streamFileOf(dir, name, stream), lastBytes),
            catch: (cause) => new RunnerError({ verb: 'output', message: `${spec.name}: ${String(cause)}` }),
          }),
      }
    : {};

/**
 * What a detached runner keeps of a session, off one listing of its run folder: `files`, the session's run file and every file
 * beside it, each named by the run's name and an end after a dot, a name with no dot being no session's; and `records`, by
 * session name, the harness's own record of each of the sessions given, when the spec keeps one, found in one pass where the
 * spec has one (`transcript.records`).
 */
const sessionFilesOf = (spec: HarnessSpec, root: string) => {
  const dir = path.join(root, 'runs', spec.name);
  const listed = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const byRun = new Map<string, string[]>();
  for (const f of listed) {
    const dot = f.indexOf('.');
    if (dot < 0) continue;
    byRun.set(f.slice(0, dot), [...(byRun.get(f.slice(0, dot)) ?? []), path.join(dir, f)]);
  }
  return {
    files: (name: string): string[] => byRun.get(safe(name)) ?? [],
    records: (sessions: readonly { name: string; nativeId?: string }[]): Map<string, string[]> => {
      const reader = spec.transcript;
      const ids = sessions.flatMap((s) => (s.nativeId ? [s.nativeId] : []));
      if (!reader || !ids.length) return new Map();
      const found = reader.records?.(ids);
      const of = (id: string) => {
        if (found) return found.get(id) ?? [];
        const file = reader.file(id);
        return file ? [file] : [];
      };
      return new Map(sessions.flatMap((s) => (s.nativeId ? [[s.name, of(s.nativeId)] as const] : [])));
    },
  };
};

/**
 * A detached runner's `forget`: the session's run file and every file beside it, each named by the run's name and an end
 * after a dot; the harness's own record of its conversation, when the spec keeps one, left and named.
 */
const forgetRunOf =
  (spec: HarnessSpec, root: string): NonNullable<RunnerOps['forget']> =>
  (session, { dry }) =>
    Effect.suspend(() => {
      const keeps = sessionFilesOf(spec, root);
      return forgetFiles(spec.name, keeps.files(session.name), () => keeps.records([session]).get(session.name) ?? [], dry);
    });

/** The ends of the files a detached runner keeps a session's streams in: its log, and each stream kept whole (`streamFileOf`). */
const OUTPUT_ENDS = ['.log', '.stdout', '.stderr'];

/** A session's `files`, beside its run file, split into its streams (`output`, by `OUTPUT_ENDS`) and the rest (`files`). */
const outputApart = (files: readonly string[]): Pick<SessionKept, 'files' | 'output'> => {
  const isOutput = (file: string) => OUTPUT_ENDS.some((end) => file.endsWith(end));
  return { files: files.filter((file) => !isOutput(file)), output: files.filter(isOutput) };
};

/**
 * A detached runner's `kept`: what `forgetRunOf` would remove of each session, its streams apart (`outputApart`), and the record it
 * leaves, off one listing.
 */
const keptRunOf =
  (spec: HarnessSpec, root: string): NonNullable<RunnerOps['kept']> =>
  (sessions) =>
    Effect.suspend(() => {
      const keeps = sessionFilesOf(spec, root);
      const records = keeps.records(sessions);
      return keptOf(spec.name, sessions, ({ name }) => ({ ...outputApart(keeps.files(name)), records: records.get(name) ?? [] }));
    });

/**
 * A detached runner's `transcript`, for a spec that keeps one: read from the harness's own record, found by the run's `nativeId`
 * off its own run file; a name with no run file is taken for that id itself.
 */
const transcriptOf =
  (spec: HarnessSpec, root: string, reader: NonNullable<HarnessSpec['transcript']>): NonNullable<RunnerOps['transcript']> =>
  (sessionId, after) =>
    Effect.tryPromise({
      try: async () => {
        const hit = runNamed(spec, root, sessionId);
        const nativeId = hit ? hit.run.nativeId : sessionId;
        return readTranscript(nativeId ? reader.file(nativeId) : undefined, after, reader.events);
      },
      catch: (cause) =>
        new RunnerError({ verb: 'transcript', message: `${spec.name}: ${cause instanceof Error ? cause.message : String(cause)}` }),
    });

/**
 * The runner's `follow`, for a spec that keeps its streams, its transcript, and says what its stdout tells of text being written
 * (`partials`): the run under the name followed by its own run file, its stdout and its transcript (`followOf`).
 */
const followOps = (spec: HarnessSpec, root: string, dir: string): Pick<RunnerOps, 'follow'> => {
  const { streams, transcript, partials } = spec;
  if (!streams || !transcript || !partials) return {};
  const runOf = (name: string) => {
    const at = runAt(spec, root, name);
    if (!at || 'unread' in at) return at;
    return { state: detachedStateOf(at.run, instantNow()), ...(at.run.nativeId ? { nativeId: at.run.nativeId } : {}) };
  };
  return {
    follow: (name) =>
      followOf(
        {
          harness: spec.name,
          run: () => runOf(name),
          stdout: streamFileOf(dir, name, 'stdout'),
          dir,
          prefix: `${safe(name)}.`,
          partials,
          transcript,
        },
        name,
      ),
  };
};

/**
 * The verbs of a detached runner over the files beside a run's: its streams (`outputOps`, `followOps`), `forget`, `kept` and
 * `compact`.
 */
const runFileOps = (spec: HarnessSpec, root: string, dir: string) => ({
  ...outputOps(spec, dir),
  ...followOps(spec, root, dir),
  ...compactOps(spec, dir),
  forget: forgetRunOf(spec, root),
  kept: keptRunOf(spec, root),
});

/**
 * Starts the detached worker on the run file `file`, in `cwd`, and lets it go: in its own process group, its streams closed, in the
 * engine's environment less its telemetry (`withoutTelemetry`), which a runner hands a session itself.
 */
const startWorker = (file: string, cwd: string): void => {
  const child = spawn(process.execPath, [WORKER, file], { detached: true, stdio: 'ignore', cwd, env: withoutTelemetry(process.env) });
  child.on('error', () => {});
  child.unref();
  countSpawn();
};

/**
 * The runner of a detached harness: a worker per session (`bin/ae-worker.ts`), and the directory `runs/<spec's name>`
 * under `root` as its registry, read fresh every pass, the same shape as `claude agents`. Beside each run file: the
 * harness's output (`.log`), what was read of it once the run was over (`.said`, `harness/detached/said.ts`), its closeout
 * and the closeout's schema, its MCP config, the spawn request where its spec reads one (`.request.json`, left out of the
 * listing as the closeout and the schema are), its inbox (`.inbox.jsonl`, so never read as a run file), and a stop asked of it
 * (`.stop`: a file of its own, so the run file keeps one writer, the worker, and not `.json`, so never a run file).
 *
 * A look told which sessions to read (`observeFor`) reads each one's own run file, output and closeout, and no other run's;
 * `observe` lists them all (`readAll`), for the views and verbs that read every session. A run file is listed by its name
 * alone: a closeout, a schema or an MCP config is also JSON, and a payload that carried a `name` would otherwise be read as a
 * session. Listed, a half-written file, one in no shape a worker writes, or one gone between the listing and the read, is
 * skipped: the next pass reads it whole. Asked for by name, one there that cannot be read is `unread`, never gone.
 *
 * What a run said, as a sighting carries it:
 *
 * - `statementOf`: the harness's final answer, if it wrote one, with no time: `spawn` cleared the file before it launched the
 *   run, so the run's own process wrote it, and a resumed run's parent wrote its own under its own name. Text that does not
 *   parse is carried as text — what counts as a valid closeout is the reader's business, not the runner's.
 * - `outputOf`: what the spec reads in the harness's output, whose statement has no time for the same reason: `spawn`
 *   cleared the output first. Read again only when the capture has changed, so a finished run's output is read once per
 *   change of it, by any process: what was read is kept beside it (`outputIn`).
 *   A refusal is kept by this process alone, as a read is.
 * - `usageOf`: what a run's output says it used, as the attempt's own. A resumed run of a spec whose totals carry the
 *   parent's (`resumeCostCarried`) has the parent's taken off, as its spawn wrote them on its run file (`carried`): the
 *   parent is the run under the id it resumed that started last before it (`parentOf`). A run file spawned before
 *   `carried` was written has its parent looked for among every run file, on that look alone. No parent, a parent that
 *   printed no total, or a total that would go below nothing: that measure is dropped, never overcounted.
 *
 * - `spawn`, in order:
 *   1. Resolves the task's `cwd` from the process that launches: relative, the worker would start in
 *      it and launch the harness in the same path again, from inside it (`spawn sh ENOENT` for `cwd: 'repo'`). `file`
 *      refuses one; this is for a journal written otherwise, or by hand, and a caller of the runner itself.
 *   2. Refuses a `cwd` that is not a directory, because `spawn` does not throw for it: the child emits the error later,
 *      and, unheard, that event kills the process that launched the worker — the engine.
 *   3. Clears what the previous attempt under the name left and writes the files the run is given, taking the `io` they say
 *      (`spawnFiles`): a re-spawn of the same attempt must not find the previous one's answer waiting for it, nor a stop
 *      asked of it; it is given the closeout's schema, the servers its task names and no more, and, for a spec with
 *      `needsRequest`, the spawn request itself. The inbox is never written or cleared: it is the person's, and a run
 *      spawned again under the name starts past what was said to the one before it (`RunInput.from`).
 *   4. Writes the run file before the launch, with no pid: the run is intended, and a crash here leaves a file that says
 *      so. The worker overwrites it with its own pid the moment it starts, keeping what the spawn wrote. A resumed run of a
 *      spec with `resumeCostCarried` carries its parent's totals on it (`carried`), found among the run files once, here.
 *   5. Launches the worker detached, stdio ignored, unref'd: it outlives this process by design. Its `error` event is
 *      heard, so a launch that fails after `spawn` returns never takes the engine down with it; the run file it leaves
 *      says working with no pid, and the lease calls that dead.
 *
 *   Every step runs before the worker is launched, or is the launch: whatever threw, no session is running under the
 *   name, and the spawn is refused.
 * - `observe`: a sighting per run file, whose `sessionId` is the run's name, this runner's handle. `nativeId` is the
 *   harness's own, read by the worker from its start event (`HarnessSpec.start`) — present only once the harness has printed
 *   it, which is why resume is best-effort for this kind of harness and exact for one with a registry. The closeout is the file the harness
 *   wrote its answer to, when it wrote one (`statementOf`), otherwise what its output says (`outputOf`). The exit code is
 *   the process's own, once it has one: the worker writes -1 when there is none — killed by a signal, or never started —
 *   and that is reported as no code, not as a code. A run whose output the spec refuses, or whose start event its worker
 *   refused (`startRefused`), is left out while its process runs, and read as `failed` once it has ended (`lookOf`): with no id
 *   for a refused start, and nothing its output says for a refused output. Why is said as a warning on every look
 *   (`startRefusalOf`, `outputRefusalOf`), and the harness's others are read.
 * - `observeFor`: the same sighting for each name expected that has a run file, and the name `unread` for one whose file is
 *   there and unreadable, or whose start or output was refused and whose process still runs, said as `observe` says it and
 *   answered by name (`unreadWhy`).
 * - `find`: the run under a name, off its own run file alone, as `detachedFind`; `stop` and `transcript` read by it.
 * - `stop`, in order, for a run that is working:
 *   1. Leaves the stop on disk (`.stop`). The run file exists before the worker has written its own pid, and a stop in
 *      that window has no process to signal; the worker reads the stop once its pid is published, before it starts the
 *      harness, writes `stopped` and starts nothing.
 *   2. Reads the run file again, and sends SIGTERM to a working worker whose pid is above 0: `process.kill(0, …)` signals
 *      this process's entire process group. The worker kills the harness's process group and writes `stopped` — that
 *      state is the worker's to write, as the one that saw it happen. It hears SIGTERM from the moment its pid is on
 *      disk, and a worker already gone is no error.
 *
 *   Whichever came first, one of the two sees the other — a worker that read no stop published its pid before the stop
 *   was written, so the second read finds it — and a stop that lands at any moment is heard, on the pass that sends it.
 * - `logs`: the last 8000 characters of the harness's output.
 * - `output` (a spec with `streams`): one stream of the run under a name, whole or its last bytes, read from its own file
 *   alone; `undefined` when there is none, a run spawned before the spec kept streams among them.
 * - `transcript` (a spec with `transcript`): the conversation, from the harness's own record, found by the harness's own
 *   id — the run's `nativeId`, which the worker reads off the harness's start event, so until it has printed one there is
 *   nothing to read. A name with no run file is taken for that id itself: the id an attempt's end was recorded with,
 *   which is what the engine asks by once the run file is gone.
 * - `say` (a spec with `input`, `sayTo`): words for a running session, appended to its inbox as the line its harness reads,
 *   for its worker to write on. Its own run file alone is read, as `find` reads it. Appended is not read: the worker writes a
 *   line on within a second, and one appended in the second before the harness's closing line is never written on.
 *   Refused, with nothing appended, where no worker would write the words on: no run under the name, or a run file that
 *   cannot be read; a run its worker started with no input; a run whose harness has printed its closing line; one that is
 *   not working; and words whose line holds a line break, which would reach the harness as two, or as half a message.
 */
export const detachedOps = (spec: HarnessSpec, root: string, options: DetachedOptions = {}): RunnerOps =>
  runnerOf(spec, root, workerBoundsOf(options));

/** `detachedOps`, its workers' bounds read. */
const runnerOf = (spec: HarnessSpec, root: string, bounds: ReturnType<typeof workerBoundsOf>): RunnerOps => {
  const dir = path.join(root, 'runs', spec.name);
  const runFile = (name: string) => runFileOf(spec, root, name);
  const logFile = (name: string) => path.join(dir, `${safe(name)}.log`);
  const closeoutFile = (name: string) => path.join(dir, `${safe(name)}.closeout.json`);
  const schemaFile = (name: string) => path.join(dir, `${safe(name)}.schema.json`);
  const mcpFile = (name: string) => path.join(dir, `${safe(name)}.mcp.json`);
  const requestFile = (name: string) => path.join(dir, `${safe(name)}.request.json`);
  const inboxFile = (name: string) => inboxFileOf(spec, root, name);
  const stopFile = (name: string) => path.join(dir, `${safe(name)}.stop`);
  const saidFiles = (name: string) => saidFilesAt(path.join(dir, safe(name)), spec.streams);

  const readAll = (): Run[] => {
    if (!fs.existsSync(dir)) return [];
    const out: Run[] = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || NO_RUN_FILES.some((end) => f.endsWith(end))) continue;
      try {
        const run = runFileIn(readText(path.join(dir, f)));
        if (typeof run !== 'string' && run.name) out.push({ name: run.name, run });
      } catch {}
    }
    return out;
  };

  const find = (name: string): Run | undefined => runNamed(spec, root, name);

  const statementOf = (name: string): Sighting['closeout'] => {
    let text: string;
    try {
      text = readText(closeoutFile(name));
    } catch {
      return undefined;
    }
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {}
    return { payload };
  };

  const outputs: SaidMemo = new Map();
  const outputOf = (name: string, run: RunFile): { read: HarnessOutput } | { wrong: string } | undefined =>
    spec.readOutput && outputIn(spec.readOutput, outputs, name, saidFiles(name), saidWhen(run, spec.keepOutput));

  const carriedBy = (all: readonly Run[], resumeFrom: string, before: number, except?: string): Carried => {
    const parent = parentOf(all, resumeFrom, before, except);
    const told = parent && outputOf(parent.name, parent.run);
    return carriedOf(told && 'read' in told ? told.read : undefined);
  };

  const usageOf = (run: RunFile, read: HarnessOutput | undefined, all: () => readonly Run[]): Usage | undefined =>
    !read?.usage || !spec.resumeCostCarried || !run.resumeFrom
      ? read?.usage
      : lessCarried(read.usage, run.carried ?? carriedBy(all(), run.resumeFrom, startOf(run)), read.ownTokens);

  const lookAt = (name: string, run: RunFile, now: Instant, all: () => readonly Run[]): { sighting?: Sighting; warning?: string } => {
    const { as, output, warning } = lookOf(spec, name, run, now, () => outputOf(name, run), logFile(name));
    if (as === 'unread') return { warning };
    const usage = usageOf(run, output?.read, all);
    return { sighting: sightingOf(name, run, now, statementOf(name), output, usage, as === 'failed'), warning };
  };

  return {
    spawn: (asked) =>
      Effect.try({
        try: () => {
          const r = { ...asked, cwd: path.resolve(asked.cwd) };
          if (!isDirectory(r.cwd)) throw new Error(`cwd ${r.cwd} is not a directory`);
          fs.mkdirSync(dir, { recursive: true });
          const streams = { stdout: streamFileOf(dir, r.name, 'stdout'), stderr: streamFileOf(dir, r.name, 'stderr') };
          outputs.delete(r.name);
          const io = spawnFiles(spec, r, {
            beside: (end) => besideRun(spec, root, r.name, end),
            schema: schemaFile(r.name),
            answer: closeoutFile(r.name),
            mcp: mcpFile(r.name),
            request: requestFile(r.name),
            log: logFile(r.name),
            kept: saidFiles(r.name).kept,
            stop: stopFile(r.name),
            streams,
          });
          const { cmd, args, env } = spec.command(r, io);
          const input = spawnInput(spec, r, inboxFile(r.name));
          const plan = {
            name: r.name,
            cmd,
            args,
            cwd: r.cwd,
            logFile: logFile(r.name),
            ...(env ? { env } : {}),
            ...(spec.streams ? { streams } : {}),
            stopFile: stopFile(r.name),
            ...(spec.start ? { start: spec.start } : {}),
            ...(spec.resumeCostCarried && r.resumeFrom
              ? { resumeFrom: r.resumeFrom, carried: carriedBy(readAll(), r.resumeFrom, Date.now(), r.name) }
              : {}),
            ...(input ? { input } : {}),
          };
          fs.writeFileSync(runFile(r.name), firstRunFile({ ...plan, ...bounds }));

          startWorker(runFile(r.name), r.cwd);
        },
        catch: (cause) => new RunnerError({ verb: 'spawn', message: `${spec.name}: ${String(cause)}`, refused: true }),
      }),

    observe: sayingUnread(
      Effect.try({
        try: () => {
          const now = instantNow();
          const all = readAll();
          const looks = all.map(({ name, run }) => ({ name, ...lookAt(name, run, now, () => all) }));
          const value = new Map(looks.flatMap(({ name, sighting }) => (sighting ? [[name, sighting] as const] : [])));
          return { value, warnings: looks.flatMap(({ warning }) => (warning ? [warning] : [])) };
        },
        catch: observeErrorOf(spec),
      }),
    ),

    observeFor: (expected) =>
      sayingUnread(
        Effect.try({
          try: () => {
            const now = instantNow();
            let listing: Run[] | undefined;
            const all = () => (listing ??= readAll());
            return lookedFor(
              expected.map((e) => e.name),
              (name) => {
                const at = runAt(spec, root, name);
                return !at ? undefined : 'run' in at ? lookAt(name, at.run, now, all) : {};
              },
            );
          },
          catch: observeErrorOf(spec),
        }),
      ),

    stop: (sessionId) =>
      Effect.try({
        try: () => {
          const hit = find(sessionId);
          if (!hit || hit.run.state !== 'working') return;
          fs.writeFileSync(stopFile(sessionId), '');
          const now = find(sessionId);
          if (now && now.run.state === 'working' && now.run.pid > 0) {
            try {
              process.kill(now.run.pid, 'SIGTERM');
            } catch {}
          }
        },
        catch: (cause) => new RunnerError({ verb: 'stop', message: String(cause) }),
      }),

    logs: (sessionId) =>
      Effect.try({
        try: () => {
          const f = logFile(sessionId);
          return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').slice(-8000) : '(no output yet)';
        },
        catch: (cause) => new RunnerError({ verb: 'logs', message: String(cause) }),
      }),

    ...runFileOps(spec, root, dir),
    ...(spec.transcript ? { transcript: transcriptOf(spec, root, spec.transcript) } : {}),
    ...(spec.input ? { say: sayTo(spec, root, spec.input) } : {}),
  };
};
