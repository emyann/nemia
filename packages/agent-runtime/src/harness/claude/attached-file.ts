/**
 * An attached session's face to every other process: its run file under `<root>/runs/attached/`, written by the process that holds the
 * session alone, and the files another process writes beside it, each its own: a stop (`<name>.stop`), the words said to the session
 * (`<name>.say.jsonl`, appended, which its holder hands it as it looks), the person's answers to the questions it holds open
 * (`<name>.answers.jsonl`, appended by the answer verb), and the drain (`drain.json`), which names the holder whose new calls wait.
 * The questions it asked, each opened and closed, are its own (`<name>.asks.jsonl`), written by its holder alone and composed on read
 * (`openAsks`, `asksTaken`). What the session said is its capture (`<name>.out.jsonl`), the SDK's
 * messages a reader reads (`claudeStreamKept`), appended as they come.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import type { AskQuestion, SessionAsk, SessionState } from '../../core/index.ts';
import { BridgeFactsSchema } from './attached-bridge.ts';
import { CarriedSchema } from '../detached/run-file.ts';
import type { SpawnRequest } from '../seam.ts';

/**
 * What a holder writes of a session: `working` while a holder runs it, `idle` once a long-lived session's turn ended and it waits with
 * its input open for the next words, `parked` once a holder let it go, between two calls, idle between turns, or with the call it cut
 * kept as `calling`, for the next to resume; `completed`, `failed` or `canceled` once it ended.
 */
export type AttachedState = 'working' | 'idle' | 'parked' | 'completed' | 'failed' | 'canceled';

export type { AttachedBridge } from './attached-bridge.ts';

/**
 * When a process started, as `/proc/<pid>/stat` counts it (its 22nd field): what a run file names its holder and its Claude Code by,
 * so a pid another process has taken since is not read as either. `undefined` where there is no `/proc`. The second field is the
 * command's name in parentheses, which may hold spaces and parentheses, so the fields are counted from the last `)`.
 */
export const processStart = (pid: number): string | undefined => {
  let stat: string;
  try {
    stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  } catch {
    return undefined;
  }
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
};

const RunFileSchema = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.String,
    state: Schema.Literals(['working', 'idle', 'parked', 'completed', 'failed', 'canceled']),
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
    /**
     * The call the session is in, the earliest of those in flight: its tool, and since when, ISO. Kept on a `parked` session whose
     * holder cut the call rather than wait longer for it, which is what tells the next holder to resume with `crashNote`.
     */
    calling: Schema.optional(Schema.Struct({ tool: Schema.String, since: Schema.String })),
    /** How many new calls wait at their hook now, held back by a drain; absent when none waits. */
    heldBack: Schema.optional(Schema.Finite),
    /** What the session resumed from had spent, which its own results print on in theirs: taken off what it reports. */
    carried: Schema.optional(CarriedSchema),
    /** How far into its say file the words were handed to the session, in bytes. */
    heard: Schema.optional(Schema.Finite),
    /** What its claude.ai bridge came to, where one was asked for: its facts, or why there is none. */
    bridge: Schema.optional(BridgeFactsSchema),
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

/**
 * The files of the session under `name`: its run file, its stop, the interrupt another process asks its turn's end with, the words said
 * to it, its capture, and its MCP config — which nothing writes any more, an attached session's servers riding `Options.mcpServers`
 * (`attached-options.ts`), and which the spawn clears so a session started by an older runtime leaves none behind unread.
 */
export const filesOf = (root: string, name: string) => {
  const base = path.join(attachedDir(root), safe(name));
  return {
    run: `${base}.json`,
    stop: `${base}.stop`,
    interrupt: `${base}.interrupt`,
    say: `${base}.say.jsonl`,
    asks: `${base}.asks.jsonl`,
    answers: `${base}.answers.jsonl`,
    out: `${base}.out.jsonl`,
    mcp: `${base}.mcp.json`,
  };
};

/**
 * One line of a session's asks file: the call that asked a person opened, with its questions, or the same call closed once its answer
 * reached it. Appended by the session's holder alone, and read by any process, which composes the two on read (`openAsks`).
 */
export type AskLine = { id: string; at: string; questions?: AskQuestion[]; closed?: string; how?: 'taken' | 'cut' };

/** One line of a session's answers file: a person's answer to the ask `id`, each question's by the question's own text. */
export type AnswerLine = { id: string; at: string; answers: Record<string, string> };

/** The lines of the JSONL file `file`, each parsed, a line that does not parse left out; none where there is no file. */
const jsonLines = <A>(file: string): A[] => {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as A];
      } catch {
        return [];
      }
    });
};

/** Appends `line` to `file`, its folder made first. */
const append = (file: string, line: unknown): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(line)}\n`);
};

/** Appends `line` to the asks file of the session `name`. Its holder is the one writer. */
export const appendAsk = (root: string, name: string, line: AskLine): void => append(filesOf(root, name).asks, line);

/** Appends `line` to the answers file of the session `name`. The answer verb is the one writer. */
export const appendAnswer = (root: string, name: string, line: AnswerLine): void => append(filesOf(root, name).answers, line);

/** Every answer written for the session `name`, oldest first. */
export const readAnswers = (root: string, name: string): AnswerLine[] => jsonLines<AnswerLine>(filesOf(root, name).answers);

/**
 * The asks of the session `name` still waiting on a person: each opened and not closed, oldest first, in the order they were asked.
 * Composed on read, so a holder that was cut before it could write a close leaves the ask open, which is what tells the layer above
 * the answer is owed as words rather than through the call.
 */
export const openAsks = (root: string, name: string): SessionAsk[] => {
  const lines = jsonLines<AskLine>(filesOf(root, name).asks);
  const closed = new Set(lines.filter((l) => l.closed !== undefined).map((l) => l.id));
  return lines.flatMap((l) =>
    l.questions === undefined || closed.has(l.id) ? [] : [{ id: l.id, at: l.at, questions: l.questions } satisfies SessionAsk],
  );
};

/**
 * The asks of the session `name` whose held call took the person's answer, by their ids: what tells an answer that reached the session
 * through its own call from one whose call was cut, which is owed to the session as words instead.
 */
export const asksTaken = (root: string, name: string): string[] =>
  jsonLines<AskLine>(filesOf(root, name).asks)
    .filter((l) => l.how === 'taken')
    .map((l) => l.id);

/**
 * Every ask of the session `name` still open closed as cut: no answer reached its call, and the layer above owes the answer as words.
 * Written where a call can no longer be waiting — a turn that ended, a session parked, a session taken up by a new holder.
 */
export const cutAsks = (root: string, name: string): void => {
  for (const ask of openAsks(root, name)) {
    const at = new Date().toISOString();
    appendAsk(root, name, { id: ask.id, at, closed: at, how: 'cut' });
  }
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
 * A run file's state as a sighting says it, the harness's word translated to A2A's at this edge. A session nobody holds now, its holder
 * gone or its holder let it go (`parked`), is `working`: a holder resumes it on its next look. A long-lived session between two turns
 * (`idle`) is `input-required`, the word a session waiting on a person already has, so `decide` reads it as idle (`idleOf`) with no
 * branch of its own.
 */
export const attachedStateOf = (run: AttachedRun): SessionState =>
  run.state === 'parked' ? 'working' : run.state === 'idle' ? 'input-required' : run.state;

/** The states a holder still runs a session in: one it works, one it waits in with its input open, and one it was let go in. */
export const OPEN_STATES: readonly AttachedState[] = ['working', 'idle', 'parked'];

/** Whether `state` is one a holder still runs the session in (`OPEN_STATES`). */
export const isOpen = (state: AttachedState): boolean => OPEN_STATES.includes(state);

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

/**
 * What a resumed session is told first, when its call to `tool` did not finish: its holder ended during it, or let go and cut it
 * rather than wait longer for it.
 */
export const crashNote = (tool: string): string => `the daemon stopped during its call to ${tool} and the call did not finish`;
