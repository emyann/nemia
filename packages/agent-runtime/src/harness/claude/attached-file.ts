/**
 * An attached session's face to every other process: its run file under `<root>/runs/attached/`, written by the process that holds the
 * session alone, and the files another process writes beside it, each its own: a stop (`<name>.stop`), the words said to the session
 * (`<name>.say.jsonl`, appended, which its holder hands it as it looks), the person's answers to the questions it holds open
 * (`<name>.answers.jsonl`, appended by the answer verb), and the store's two drains (`core/engine/drain.ts`), kept in the same folder.
 * The questions it asked, each opened and closed, are its own (`<name>.asks.jsonl`), written by its holder alone and composed on read
 * (`openAsks`, `asksTaken`). What the session said is its capture (`<name>.out.jsonl`), the SDK's
 * messages a reader reads (`claudeStreamKept`), appended as they come.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import type { AskQuestion, PermissionFacts, SessionAsk, SessionState } from '../../core/index.ts';
import { BridgeFactsSchema } from './session-bridge.ts';
import { CarriedSchema } from '../detached/run-file.ts';
import type { SpawnRequest } from '../seam.ts';
import { IMAGE } from '../image.ts';
import { alive, processStart } from '../../process/alive.ts';
import {
  DRAIN_FILE,
  SESSION_DRAIN_FILE,
  drainFolder,
  holderDrainOf,
  putHolderDrain,
  writeWhole,
  type HolderDrain,
} from '../../core/engine/drain.ts';

/**
 * What a holder writes of a session: `working` while a holder runs it, `idle` once a long-lived session's turn ended and it waits with
 * its input open for the next words, `parked` once a holder let it go, between two calls, idle between turns, or with the call it cut
 * kept as `calling`, for the next to resume; `completed`, `failed` or `canceled` once it ended.
 */
export type AttachedState = 'working' | 'idle' | 'parked' | 'completed' | 'failed' | 'canceled';

export type { AttachedBridge } from './session-bridge.ts';

const RunFileSchema = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.String,
    state: Schema.Literals(['working', 'idle', 'parked', 'completed', 'failed', 'canceled']),
    /** The pid of the process that holds the session, and so writes this file. */
    owner: Schema.Finite,
    /** When that process started (`processStart`), so a pid another process has taken since is not read as the holder. */
    ownerStart: Schema.optional(Schema.String),
    /**
     * The code that holder runs (`IMAGE`), written with `owner` by each holder that takes the session up: the session's
     * `Sighting.image`. Absent from a run file a holder wrote before it was recorded.
     */
    image: Schema.optional(Schema.String),
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
    /**
     * Since when a new call of the main thread waits at its hook, held back by a drain, and the main-thread call that ended last before
     * it (`after`), where one did: the session's `Sighting.heldBack`. Absent when none waits.
     */
    hold: Schema.optional(Schema.Struct({ since: Schema.String, after: Schema.optional(Schema.Struct({ tool: Schema.String })) })),
    /**
     * The call the sessions' drain cut, its turn interrupted past the drain's grace, and since when (ISO): kept until the drain is
     * lifted, when the session is told the cut (`cutWords`), or the next holder resumes it told so. Its sighting says `heldBack` meanwhile.
     */
    cut: Schema.optional(Schema.Struct({ tool: Schema.String, since: Schema.String })),
    /** What the session resumed from had spent, which its own results print on in theirs: taken off what it reports. */
    carried: Schema.optional(CarriedSchema),
    /** How far into its say file the words were handed to the session, in bytes. */
    heard: Schema.optional(Schema.Finite),
    /**
     * The limit the session was ended at without being resumed: `budget`, where a holder taking it up found its attempt had already
     * spent its whole cap (`capSpent`, `src/core/cap.ts`). Carried onto its sighting as the harness's own end at its cap would be.
     */
    limit: Schema.optional(Schema.Literal('budget')),
    /**
     * For a session run under a memory limit (`resources.limits.memory`): what its scope said of its memory, read by its holder off
     * Claude Code's cgroup where it rewrites this file and once before it ends the session, the last read kept: the session's
     * `Sighting.memory`. Best-effort: a scope that emptied with Claude Code killed in it reads nothing more. Absent with no limit.
     */
    memory: Schema.optional(
      Schema.Struct({ limitBytes: Schema.Finite, peakBytes: Schema.optional(Schema.Finite), oomKills: Schema.Finite, oom: Schema.optional(Schema.Finite) }),
    ),
    /**
     * The scope the session's Claude Code runs in, its folder under the cgroup mount, read off Claude Code on the first message it sent
     * (`cgroupNow`): what its end, a let-go and a take-up end whole, once `scopeToEnd` allows it, and what `release` asks again while it
     * holds a process. Absent where it runs in no scope, or sent no message.
     */
    cgroup: Schema.optional(Schema.String),
    /** Why a session with no limit runs bare on a host that passed the probe: its scope's program refused (`scopedOrBare`). */
    unscoped: Schema.optional(Schema.String),
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

/** The folder of an engine's attached sessions: the store's drains' folder too (`drainFolder`), where they are kept beside them. */
const attachedDir = (root: string): string => drainFolder(root);

/** A session's name as a file name: the engine's `ae/<task>/<n>`, its slashes taken out. */
const safe = (name: string): string => name.replace(/[^A-Za-z0-9._-]/g, '_');

/**
 * The files of the session under `name`: its run file, its stop, the interrupt another process asks its turn's end with, the words said
 * to it, its capture, and its MCP config — which nothing writes any more, an attached session's servers riding `Options.mcpServers`
 * (`session-options.ts`), and which the spawn clears so a session started by an older runtime leaves none behind unread.
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
 * reached it. Appended by the session's holder alone, and read by any process, which composes the two on read (`openAsks`). A
 * permission's line says `kind: 'permission'` and carries its facts; a line with no `kind` is a question, as every line was before
 * a permission was held.
 */
export type AskLine = {
  id: string;
  at: string;
  questions?: AskQuestion[];
  kind?: 'permission';
  permission?: PermissionFacts;
  closed?: string;
  how?: 'taken' | 'cut';
};

/** The facts a permission's line carries, as `PermissionFacts` declares them: what is read of a line written by another process. */
const PermissionFactsSchema = Schema.Struct({
  tool: Schema.String,
  command: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  displayName: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  decisionReason: Schema.optional(Schema.String),
  blockedPath: Schema.optional(Schema.String),
  always: Schema.Boolean,
  defaultToNo: Schema.Boolean,
});

const decodePermission = Schema.decodeUnknownOption(PermissionFactsSchema);

/** The ask an opening line says: a question, or a permission whose facts decode; nothing where they do not, which is unread. */
const askOf = (l: AskLine & { questions: AskQuestion[] }): SessionAsk[] => {
  if (l.kind === undefined) return [{ id: l.id, at: l.at, kind: 'question', questions: l.questions }];
  if (l.kind !== 'permission') return [];
  const facts = decodePermission(l.permission);
  return facts._tag === 'Some' ? [{ id: l.id, at: l.at, kind: 'permission', questions: l.questions, permission: facts.value }] : [];
};

/** One line of a session's answers file: a person's answer to the ask `id`, each question's by the question's own text. */
type AnswerLine = { id: string; at: string; answers: Record<string, string> };

/** A question as an asks file holds it (`AskQuestion`). */
const AskQuestionSchema = Schema.Struct({
  question: Schema.String,
  header: Schema.String,
  options: Schema.Array(Schema.Struct({ label: Schema.String, description: Schema.String, preview: Schema.optional(Schema.String) })),
  multiSelect: Schema.Boolean,
});

/** A line of an asks file (`AskLine`): a permission's facts decoded apart (`askOf`), so a line whose facts do not is unread alone. */
const AskLineSchema = Schema.Struct({
  id: Schema.String,
  at: Schema.String,
  questions: Schema.optional(Schema.Array(AskQuestionSchema)),
  kind: Schema.optional(Schema.Literal('permission')),
  permission: Schema.optional(Schema.Unknown),
  closed: Schema.optional(Schema.String),
  how: Schema.optional(Schema.Literals(['taken', 'cut'])),
});

/** A line of an answers file (`AnswerLine`). */
const AnswerLineSchema = Schema.Struct({ id: Schema.String, at: Schema.String, answers: Schema.Record(Schema.String, Schema.String) });

/** The lines of a JSONL file read through a schema, and how many it left unread: lines that do not parse, or do not decode. */
type DecodedLines<A> = { readonly lines: A[]; readonly unread: number };

/** The lines of the JSONL file `file`, each decoded by `schema` (`DecodedLines`); none, and none unread, where there is no file. */
const jsonLines = <A>(file: string, schema: Schema.Decoder<A>): DecodedLines<A> => {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { lines: [], unread: 0 };
  }
  const decode = Schema.decodeUnknownOption(schema);
  const lines: A[] = [];
  let unread = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      unread++;
      continue;
    }
    const decoded = decode(parsed);
    if (decoded._tag === 'Some') lines.push(decoded.value);
    else unread++;
  }
  return { lines, unread };
};

/**
 * The lines of the asks file of the session `name`, decoded (`AskLineSchema`), and how many did not decode.
 * Exported only for the tests that import it.
 */
export const askLinesOf = (root: string, name: string): DecodedLines<AskLine> => {
  const read = jsonLines(filesOf(root, name).asks, AskLineSchema);
  return {
    lines: read.lines.map((l) => ({ ...l, ...(l.questions ? { questions: [...l.questions] } : {}) }) as AskLine),
    unread: read.unread,
  };
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
export const readAnswers = (root: string, name: string): AnswerLine[] => jsonLines(filesOf(root, name).answers, AnswerLineSchema).lines;

/**
 * The asks of the session `name` still waiting on a person: each opened and not closed, oldest first, in the order they were asked.
 * Composed on read, so a holder that was cut before it could write a close leaves the ask open, which is what tells the layer above
 * the answer is owed as words rather than through the call.
 */
export const openAsks = (root: string, name: string): SessionAsk[] => {
  const { lines } = askLinesOf(root, name);
  const closed = new Set(lines.filter((l) => l.closed !== undefined).map((l) => l.id));
  return lines.flatMap((l) => (l.questions === undefined || closed.has(l.id) ? [] : askOf({ ...l, questions: l.questions })));
};

/**
 * The asks of the session `name` whose held call took the person's answer, by their ids: what tells an answer that reached the session
 * through its own call from one whose call was cut, which is owed to the session as words instead.
 */
export const asksTaken = (root: string, name: string): string[] =>
  askLinesOf(root, name)
    .lines.filter((l) => l.how === 'taken')
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

/** Writes `run` whole (`writeWhole`, `replaceFile`), so no reader sees half of it. */
export const writeRun = (root: string, run: AttachedRun): void => writeWhole(filesOf(root, run.name).run, run);

/** Every attached run file under `root`, by its session's name: neither drain's file (`DRAIN_FILE`, `SESSION_DRAIN_FILE`) is one. */
export const everyRun = (root: string): Map<string, AttachedRun> => {
  const dir = attachedDir(root);
  let names: string[];
  try {
    names = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json') && !f.endsWith('.mcp.json') && f !== DRAIN_FILE && f !== SESSION_DRAIN_FILE);
  } catch {
    return new Map();
  }
  return new Map(names.flatMap((f) => [readRun(path.join(dir, f)) ?? []].flat().map((run) => [run.name, run] as const)));
};

/** The spawn as a run file keeps it: everything but the brief, which a resume does not say again. */
export const keptRequest = ({ brief: _, ...kept }: SpawnRequest): Record<string, unknown> => kept;

/** This process, as a run file names its holder: its pid, when it started, and the code it runs (`IMAGE`). */
export const thisHolder = (): { owner: number; ownerStart?: string; image: string } => {
  const start = processStart(process.pid);
  return { owner: process.pid, ...(start ? { ownerStart: start } : {}), image: IMAGE };
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
const OPEN_STATES: readonly AttachedState[] = ['working', 'idle', 'parked'];

/** Whether `state` is one a holder still runs the session in (`OPEN_STATES`). */
export const isOpen = (state: AttachedState): boolean => OPEN_STATES.includes(state);

/**
 * The drain put for the holder `pid`: its new calls wait until it is lifted, or until the process that put it ends. Written by that
 * process, with when `pid` started, so a later process given the same pid is not held, and with who put it (`by`: its pid and start),
 * so a drain whose putter was killed before it lifted it holds nothing.
 */
export const putDrain = (root: string, pid: number): void => {
  const start = processStart(pid);
  const byStart = processStart(process.pid);
  putHolderDrain(root, { pid, ...(start ? { start } : {}), by: { pid: process.pid, ...(byStart ? { start: byStart } : {}) } });
};

/** Whether the process that put a drain (`by`) is gone: its pid dead, or another process's now, where the drain says when it started. */
const putterGone = (by: HolderDrain['by']): boolean =>
  by !== undefined && (!alive(by.pid) || (by.start !== undefined && processStart(by.pid) !== by.start));

/**
 * Whether the drain put names this very process: its pid, and, where the drain says it, when it started; and its putter still runs
 * (`putterGone`), so a take-over killed before it lifted its drain leaves nothing held. A drain that names no putter, written before it
 * did, is never read as one whose putter is gone; one whose file does not decode drains nothing.
 */
export const drainsThis = (root: string): boolean => {
  const drain = holderDrainOf(root);
  return (
    drain !== null &&
    drain.pid === process.pid &&
    (drain.start === undefined || drain.start === processStart(process.pid)) &&
    !putterGone(drain.by)
  );
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
