/**
 * How the git place runs git: a verb is a generator that yields each command it wants run (`Command`) and is handed how it ended (`Ran`),
 * so one body serves both ways of asking. `answeredNow` runs each command with `spawnSync` and holds the process until the verb ends;
 * `answered` runs each off the event loop. Either way a command leads a process group of its own, the verb's deadline bounds the whole
 * of it, and a command still running at the deadline is stopped with everything it started: SIGTERM, on which git takes its locks away,
 * then SIGKILL after `STOP_GRACE_MS`.
 */
import { type ChildProcessWithoutNullStreams, spawn, spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit } from 'effect';
import { Malformed } from './asked.ts';
import { stopChild, stopGroup, stoppedWords, threwWords, unreadNow } from '../../src/place/place.store.ts';
import type { PlaceAnswers, PlaceOutcome, PlaceVerb } from '../../src/place/place.ts';

/** One command a verb wants run: the program, where, its arguments, and what it reads on stdin. */
export type Command = { readonly cmd: 'git' | 'tar'; readonly cwd?: string; readonly args: readonly string[]; readonly input?: string };

/** How a command ended: its exit status or the signal that ended it, what it printed, and the error that kept it from starting. */
export type Ran = {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
};

/** A verb's body, or a part of one: it yields each command and returns `A`. */
export type Asking<A> = Generator<Command, A, Ran>;

/** A refusal in the place's words. */
export type Refusal = { readonly refused: string };

/** What a verb's body returns: its answer, or its refusal. */
export type Reply<V extends PlaceVerb> = PlaceAnswers[V] | Refusal;

/** A refusal in the place's words. */
export const refused = (words: string): Refusal => ({ refused: words });

/** The most a command may print. */
const MAX_PRINTED = 256 * 1024 * 1024;

/** A command that did not exit 0: its status (null on a signal, or when it never started) and what it printed. */
export class Failed extends Error {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  constructor(command: Command, ran: Ran) {
    super(ran.error?.message ?? `Command failed: ${command.cmd} ${command.args.join(' ')}\n${ran.stderr}`);
    this.status = ran.error ? null : ran.status;
    this.stdout = ran.stdout;
    this.stderr = ran.stderr;
  }
}

/** The last lines a failed command wrote on stderr, or its exit status. */
export function failedWords(err: unknown, lines = 4): string {
  const { stderr, status } = err as { stderr?: unknown; status?: number | null };
  const said = (typeof stderr === 'string' ? stderr : '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return said.length ? said.slice(-lines).join(' / ') : `it exited ${status ?? 'on a signal'}`;
}

/** `command` run, and what it printed as it printed it; it throws `Failed` when it does not exit 0. */
export function* printed(command: Command): Asking<string> {
  const ran = yield command;
  if (ran.error || ran.status !== 0) throw new Failed(command, ran);
  return ran.stdout;
}

/**
 * Git run in `cwd` with `args`, `input` on its stdin when given, its stdout trimmed; it throws `Failed` with git's words when git fails.
 */
export function* git(cwd: string, args: readonly string[], input?: string): Asking<string> {
  return (yield* printed({ cmd: 'git', cwd, args, input })).trim();
}

/** Git's stdout, trimmed, or undefined when git fails: a question whose failure is an answer. */
export function* gitSays(cwd: string, args: readonly string[]): Asking<string | undefined> {
  try {
    return yield* git(cwd, args);
  } catch {
    return undefined;
  }
}

/**
 * The branch the git place names for the cut `leaf` of `run`: the run's prefix (`runBranches`), then the leaf — the one spelling of a
 * run's branches, which every branch a run left already has (decision 2), so none is renamed. The core names the leaf (`cutName`) and
 * the place the branch.
 *
 * The run's own line is the leaf `run` under the prefix, and not the prefix's folder alone: git keeps refs as files, so a ref named for
 * the run cannot sit beside the refs under it that a fork cuts. The leaf keeps both shapes under one ref prefix, which `inventory` lists.
 */
export const runBranch = (run: string, leaf: string): string => `${runBranches(run)}${leaf}`;

/** The prefix every branch of `run` opens with, the run's id between two slashes after the product's short name. */
export const runBranches = (run: string): string => `wf/${run}/`;

/** Whether `dir` is a directory, so that git is never run where it cannot start. */
export const isDirectory = (dir: string): boolean => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false;

/** `.worktreeinclude`, read: what to copy, what is provisioned instead, and what is refused and why. */
export type WorktreeInclude = {
  copy: string[];
  provisioned: string[];
  refused: Array<{ line: string; why: string }>;
};

/**
 * Parse `.worktreeinclude`: one gitignored path per line, file or directory, relative to the repository root. Blank lines and `#` comments
 * are skipped. Paths, not patterns — a glob is a name nothing has. A leading `/` anchors a line at the root, as it does in the gitignore
 * syntax of Claude Code's file: `/.env.local` is the repository's `.env.local`, never the machine's root.
 *
 * Refused by name: a path on a drive (`C:\`), one that climbs out of the repository, the repository itself, and `.git`, which in a worktree
 * is a file git owns. Set aside as `provisioned`, never copied: anything that is or is inside a `node_modules`, which the orchestrator
 * makes, since a copy costs minutes per step. Whether git ignores a path is a fact of the checkout, not the text, so `make` asks git at the
 * cut.
 */
export function worktreeInclude(text: string): WorktreeInclude {
  const out: WorktreeInclude = { copy: [], provisioned: [], refused: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const rel = path.posix.normalize(line.replaceAll('\\', '/').replace(/^\/+/, '') || '.').replace(/\/+$/, '');
    const why = whyRefused(line, rel);
    const into = rel.split('/').includes('node_modules') ? out.provisioned : out.copy;
    if (why) out.refused.push({ line, why });
    else if (!into.includes(rel)) into.push(rel);
  }
  return out;
}

/** Why the `.worktreeinclude` line `line`, normalized to `rel`, is refused: on a drive, outside the repository, it, or git's own. */
function whyRefused(line: string, rel: string): string | null {
  if (/^[A-Za-z]:[\\/]/.test(line)) return 'is absolute';
  if (rel === '..' || rel.startsWith('../')) return 'is outside the repository';
  if (rel === '.' || rel === '') return 'is the repository itself';
  const [first] = rel.split('/');
  return first === '.git' ? "is git's own" : null;
}

/** Each refused line as a person reads it: `"../x" is outside the repository`. */
export const refusalLines = (lines: WorktreeInclude['refused']): string[] => lines.map((r) => `"${r.line}" ${r.why}`);

/**
 * `.worktreeinclude` at the root of `repo`, parsed; null when the repository has none, a link that leads nowhere included; and, when it
 * is there and no file, the words that say so. A link to a file is read as the file. Throws when the file cannot be read.
 */
export function readInclude(repo: string): WorktreeInclude | null | string {
  const file = path.join(repo, '.worktreeinclude');
  const st = fs.statSync(file, { throwIfNoEntry: false });
  if (!st) return null;
  if (!st.isFile()) return `${file} is not a file`;
  return worktreeInclude(fs.readFileSync(file, 'utf8'));
}

/**
 * What a way of asking is given: the verb's deadline, the grace a command stopped at it has to end on SIGTERM (`graceMs`), the
 * environment git runs in, and what to call for each process it starts.
 */
export type Asked = {
  readonly deadlineMs: number;
  readonly graceMs: number;
  readonly env: NodeJS.ProcessEnv;
  readonly started: () => void;
};

/** A body moved one step: what it yields or returns next, or what it threw. */
type Moved<V extends PlaceVerb> = { readonly step: IteratorResult<Command, Reply<V>> } | { readonly threw: unknown };

/** `body` resumed with how its last command ended, or started with none. */
function moved<V extends PlaceVerb>(body: Asking<Reply<V>>, ran?: Ran): Moved<V> {
  try {
    return { step: ran === undefined ? body.next() : body.next(ran) };
  } catch (threw) {
    return { threw };
  }
}

/** What an unread verb says of what its body threw: a request it could not read in that refusal's own words, anything else by name. */
const thrownWords = (verb: PlaceVerb, threw: unknown): string => (threw instanceof Malformed ? threw.message : threwWords(verb, threw));

/** What a body returned, as the verb's outcome. */
const outcomeOf = <V extends PlaceVerb>(reply: Reply<V>): PlaceOutcome<V> =>
  'refused' in reply ? { refused: reply.refused } : { answer: reply };

/** How a command run with `spawnSync` ended, and whether it was stopped at the deadline, and had to be killed. */
function ranNow(
  command: Command,
  leftMs: number,
  asked: Asked,
): { readonly ran: Ran; readonly timedOut: boolean; readonly killed: boolean } {
  asked.started();
  const options: SpawnSyncOptionsWithStringEncoding & { readonly detached: boolean } = {
    cwd: command.cwd,
    input: command.input ?? '',
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: Math.max(1, Math.ceil(leftMs)),
    killSignal: 'SIGTERM',
    maxBuffer: MAX_PRINTED,
    env: asked.env,
    detached: true,
  };
  const child = spawnSync(command.cmd, command.args, options);
  const timedOut = child.error !== undefined && 'code' in child.error && child.error.code === 'ETIMEDOUT';
  const ran = { status: child.status, signal: child.signal, stdout: child.stdout ?? '', stderr: child.stderr ?? '', error: child.error };
  return { ran, timedOut, killed: timedOut && child.pid > 0 && stopGroup(child.pid, asked.graceMs) };
}

/**
 * `verb`, whose body is `body`, answered while this process waits: each command run in turn within what is left of `asked.deadlineMs`,
 * measured on the monotonic clock. Unread when a command is still running at the deadline, in the deadline's words, once its group is
 * stopped; when the body cannot read its request, in that refusal's words; and when it throws, in one sentence naming the verb. Never
 * throws.
 */
export function answeredNow<V extends PlaceVerb>(verb: V, body: Asking<Reply<V>>, asked: Asked): PlaceOutcome<V> {
  const until = performance.now() + asked.deadlineMs;
  let at = moved<V>(body);
  for (;;) {
    if ('threw' in at) return unreadNow(verb, thrownWords(verb, at.threw));
    if (at.step.done) return outcomeOf(at.step.value);
    const { ran, timedOut, killed } = ranNow(at.step.value, until - performance.now(), asked);
    if (timedOut) return unreadNow(verb, stoppedWords(asked.deadlineMs, killed, ran.stderr, asked.graceMs));
    at = moved(body, ran);
  }
}

/** What the command running now printed on stderr, and whether stopping it had to kill. */
type Heard = { stderr: Buffer[]; killed: boolean };

/** `command` started in a group of its own, handed its input, what it prints kept. */
function startedChild(command: Command, asked: Asked, out: Buffer[], heard: Heard): ChildProcessWithoutNullStreams {
  asked.started();
  const child = spawn(command.cmd, command.args, { cwd: command.cwd, env: asked.env, detached: true, stdio: 'pipe' });
  heard.stderr = [];
  child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => heard.stderr.push(chunk));
  child.stdin.on('error', () => undefined);
  child.stdin.end(command.input ?? '');
  return child;
}

/** Waits for `child` to end, on its `close` or its `error`. */
const ended = (child: ChildProcessWithoutNullStreams): Effect.Effect<Pick<Ran, 'status' | 'signal' | 'error'>> =>
  Effect.callback((resume) => {
    const closed = (status: number | null, signal: NodeJS.Signals | null) => resume(Effect.succeed({ status, signal }));
    const failed = (error: Error) => resume(Effect.succeed({ status: null, signal: null, error }));
    child.once('close', closed);
    child.once('error', failed);
    return Effect.sync(() => {
      child.off('close', closed);
      child.off('error', failed);
    });
  });

/** `command` run off the event loop: taken in a scope, and stopped with what it started when the scope closes before it ended. */
const ranLater = (command: Command, asked: Asked, heard: Heard): Effect.Effect<Ran> =>
  Effect.suspend(() => {
    const out: Buffer[] = [];
    return Effect.acquireRelease(
      Effect.sync(() => startedChild(command, asked, out, heard)),
      (child, exit) =>
        Exit.isSuccess(exit) ? Effect.void : Effect.map(stopChild(child, asked.graceMs), (killed) => void (heard.killed = killed)),
    ).pipe(
      Effect.flatMap(ended),
      Effect.scoped,
      Effect.map((end) => ({ ...end, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(heard.stderr).toString('utf8') })),
    );
  });

/**
 * `verb`, whose body `make` starts, answered with the event loop free while git runs, within `asked.deadlineMs`. Unread as `answeredNow`
 * says it: a command running at the deadline, or when the ask is interrupted, is stopped with what it started before the ask ends. Never
 * fails.
 */
export const answered = <V extends PlaceVerb>(verb: V, make: () => Asking<Reply<V>>, asked: Asked): Effect.Effect<PlaceOutcome<V>> =>
  Effect.suspend(() => {
    const heard: Heard = { stderr: [], killed: false };
    const body = make();
    const run = Effect.gen(function* () {
      let at = moved<V>(body);
      for (;;) {
        if ('threw' in at) return unreadNow(verb, thrownWords(verb, at.threw));
        if (at.step.done) return outcomeOf(at.step.value);
        at = moved(body, yield* ranLater(at.step.value, asked, heard));
      }
    });
    return run.pipe(
      Effect.timeoutOrElse({
        duration: asked.deadlineMs,
        orElse: () =>
          Effect.sync(() =>
            unreadNow(verb, stoppedWords(asked.deadlineMs, heard.killed, Buffer.concat(heard.stderr).toString('utf8'), asked.graceMs)),
          ),
      }),
    );
  });
