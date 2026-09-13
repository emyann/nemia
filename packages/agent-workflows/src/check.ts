/**
 * `check` — the exit code an agent session does not have.
 *
 * The engine settles a step `succeeded` when its session ends, and a session always ends
 * successfully, because finishing talking is what it does. A run that files the next step on that
 * word is believing the agent. A `check:` is the fact the run establishes for itself: a shell line
 * the workflow's author wrote, executed by the run in the step's workspace after the step hands
 * off, and a number it exited with. Exit 0 is `verified`; anything else is `failed (check)`, and
 * nothing that waits on the step is filed.
 *
 * **The run knows nothing about what the command does, and must not.** No test-runner parsing, no
 * findings, no special case for a framework — the same line hkb draws (`src/check.ts` there).
 *
 * **Where the command comes from is the whole argument.** It is read from the workflow the run
 * froze at `wf start` (`Run.workflow`), never from a folder a step can edit. A step that could
 * author the command that judges it would be marking its own homework.
 *
 * **It runs as an engine task**, on a harness this file defines and the run hands to the engine.
 * The engine does not learn what a check is: to it this is one more command that runs and exits,
 * which is the contract every detached harness already has. What that buys without a line of engine
 * code: the check survives a tick that dies, `wf cancel` stops a running suite through `e.stop`, a
 * hung suite ends at the task's deadline, and checks have a concurrency pool of their own, so a
 * ten-minute suite never holds an agent's slot or the tick itself.
 *
 * Pure: no disk, no process, no engine. `runner.ts` is the file that files these.
 */

/** The seconds a check may run before the engine stops it. A hung suite must not hold a run for ever. */
export const CHECK_DEADLINE_SECONDS = 600;

/** How many lines of each stream `wf decide` shows for a check that refused. */
export const CHECK_TAIL_LINES = 20;

/** What the command is told about the run it judges. `WF_STDERR` is where its stderr goes. */
export type CheckEnv = {
  WF_RUN: string;
  WF_STEP: string;
  WF_BASE_REF: string;
  WF_WORKSPACE: string;
  WF_STDERR: string;
};

/**
 * The check task's brief: the command, and the environment it runs in.
 *
 * The engine's task carries no environment, and the engine does not change for this, so the brief —
 * the one free-text field a harness is handed — carries both. JSON rather than a shell preamble: it
 * is exact for any value, and it is read back by a function rather than by a shell.
 */
export const checkBrief = (command: string, env: CheckEnv): string => JSON.stringify({ check: command, env });

/**
 * A check brief, read back.
 *
 * Only `WF_` names are carried into the environment: the names become `env` arguments, and a name
 * that began with `-` would be read as an option. A brief that is not a check brief — a task filed
 * on this harness by hand — is taken as the bare command with no environment, rather than throwing:
 * a harness whose `command` throws rejects the engine's whole tick, and every other run with it.
 */
export function readCheckBrief(brief: string): { command: string; env: Record<string, string> } {
  let parsed: unknown;
  try { parsed = JSON.parse(brief); } catch { return { command: brief, env: {} }; }
  if (!parsed || typeof parsed !== 'object' || typeof (parsed as { check?: unknown }).check !== 'string') {
    return { command: brief, env: {} };
  }
  const { check, env } = parsed as { check: string; env?: unknown };
  const carried = Object.entries(env && typeof env === 'object' ? env : {})
    .filter((kv): kv is [string, string] => /^WF_[A-Z_]+$/.test(kv[0]) && typeof kv[1] === 'string');
  return { command: check, env: Object.fromEntries(carried) };
}

const TRAILER = '[wf check] exit';

/**
 * What `sh` runs.
 *
 * - **A subshell**, so a command that says `exit 3` ends the subshell and not the script, and the
 *   number is still printed.
 * - **On lines of its own**, so a command ending in a `# comment` cannot comment out the parenthesis.
 * - **stderr to its own file.** The engine keeps one log for a detached session, and hkb measured a
 *   loud stderr evicting a test runner's stdout verdict from a shared window. Two streams, both kept.
 * - **The exit code printed last**, on stdout, so it is the final line of the log whatever the command
 *   printed. It is for the person reading: the engine's own `succeeded`/`failed` — the worker's reading
 *   of the process's exit — is what the run gates on, so a command that prints a trailer of its own
 *   changes a number on a screen and nothing else.
 */
export const checkScript = (command: string): string =>
  `(\n${command}\n) 2>"\${WF_STDERR:-/dev/stderr}"; c=$?; printf '\\n${TRAILER} %d\\n' "$c"; exit "$c"`;

/**
 * The harness. A `HarnessSpec` in shape, typed here by its shape rather than imported: `runner.ts` is
 * the only file that imports the engine, and hands this to it.
 */
export const CHECK = {
  name: 'check',
  command: (r: { brief: string }): { cmd: string; args: string[] } => {
    const { command, env } = readCheckBrief(r.brief);
    // `env NAME=value … sh -c script`: values reach the shell without being quoted by anyone.
    return { cmd: 'env', args: [...Object.entries(env).map(([k, v]) => `${k}=${v}`), 'sh', '-c', checkScript(command)] };
  },
};

/** A check's verdict, as its log tells it: the exit code, or `unfinished` when no trailer was printed. */
export type Verdict = number | 'unfinished';

/**
 * The last `[wf check] exit N` in a check's log.
 *
 * None means the script never reached its last line: the deadline or a stop killed it, or it never
 * started. That is `unfinished`, never a guessed number.
 */
export function readVerdict(log: string): Verdict {
  const last = [...log.matchAll(/^\[wf check\] exit (\d+)$/gm)].at(-1);
  return last ? Number(last[1]) : 'unfinished';
}

/** A check's stdout, as a person wants to read it: without the trailer, the last `n` lines. */
export const stdoutTail = (log: string, n = CHECK_TAIL_LINES): string =>
  lastLines(log.replace(/\n?\[wf check\] exit \d+\s*$/, ''), n);

/** The last `n` non-trailing lines of some output. */
export function lastLines(text: string, n = CHECK_TAIL_LINES): string {
  const lines = text.replace(/\s+$/, '').split('\n');
  return lines.slice(-n).join('\n');
}

/** How a verdict reads on a screen: `exit 1`, or `unfinished`. */
export const verdictWord = (v: Verdict): string => (v === 'unfinished' ? 'unfinished' : `exit ${v}`);

/**
 * The check, told to a step BEFORE it is judged by one. Appended to the brief of every step that has
 * a `check:`.
 *
 * A contract a step only learns about by failing it costs a whole session to communicate: hkb measured
 * a worker that ran `npm test`, finished green, and failed the check on the `lint` half. Telling it
 * does not weaken the fence — the fence is about who AUTHORS the command, and that stays the run.
 */
export const checkContract = (command: string): string => [
  '', '## Before you sign off', '',
  `This must exit 0 in this workspace: ${codeSpan(command)}`,
  '',
  'The run executes it afterwards, where the work is, and nothing that waits on this step starts',
  'until it does. Do not weaken it to pass it: the command comes from the run, not from this checkout.',
].join('\n');

/** Inline code that survives backticks in the text: a fence longer than any run of them inside. */
function codeSpan(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}
