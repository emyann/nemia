/**
 * The verbs — and the first consumer of the engine's own public API.
 *
 * This file imports `createEngine` and nothing else from the engine's internals. That is
 * deliberate and it is a test: if the Promise API were not enough to write the CLI with, it would
 * not be enough for anyone else either.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createEngine, type Attempt, type Engine, type Event, type ResumePolicy, type State, type TaskSpec, type TaskView, type Usage } from './facade.ts';

/**
 * Every key a brief may have — a closed list, on purpose.
 *
 * The parser used to collect any `key: value` line and read the ones it knew, so a typo was a
 * default and a bad value was a surprise: `maxAtempts: 3` ran once, and `deadlineSeconds: 5m`
 * became NaN, was journalled as `null`, and stopped the task on its first pass. A key this list
 * does not name is refused by name, with the list. A test feeds every key through the parser, so
 * none can be accepted here and then dropped.
 */
export const BRIEF_KEYS = [
  'cwd', 'harness', 'model', 'permissionMode', 'maxAttempts', 'deadlineSeconds',
  'resume', 'resumeFrom', 'worktree', 'closeoutSchema', 'tools', 'effort', 'budgetUsd',
  'contextTokens',
] as const satisfies readonly (keyof TaskSpec)[];
export type BriefKey = (typeof BRIEF_KEYS)[number];

const isBriefKey = (key: string): key is BriefKey => (BRIEF_KEYS as readonly string[]).includes(key);

/** Exhaustive by type: a policy added to `ResumePolicy` and not here does not compile. */
const RESUME_POLICIES: Record<ResumePolicy, true> = { interrupted: true, always: true, never: true };

/** A refusal: exit code 2, and a sentence that says what to write instead. */
const refuse = (message: string) => Object.assign(new Error(`brief: ${message}`), { exitCode: 2 });

const isDirectory = (p: string) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/**
 * A brief is a markdown file: optional `key: value` frontmatter, body is the prompt.
 *
 * It refuses rather than guesses: a key not in `BRIEF_KEYS`, a key given twice, a line that is not
 * `key: value`, an empty value, a count or a number of seconds that is not one, a `resume` that is
 * not a policy, a `cwd` or schema file that is not there, and a brief with nothing to do. What a
 * value means to a harness — a permission mode, a harness name — is the engine's to check, and
 * `file()` checks it, so this is not the only door that does.
 */
export function parseBrief(text: string, fallbackCwd: string): TaskSpec {
  const source = text.replace(/\r\n/g, '\n');
  const m = /^---\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/.exec(source);
  if (!m && source.startsWith('---\n')) throw refuse('the frontmatter opened with `---` is never closed. End it with a `---` line of its own.');

  const meta = new Map<BriefKey, string>();
  for (const raw of m?.[1]?.split('\n') ?? []) {
    // `#` after a space starts a comment, as it would in YAML — so `harness: codex  # the reviewer`
    // means codex, and not a harness called "codex  # the reviewer".
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i <= 0) throw refuse(`\`${line}\` is not a \`key: value\` line. Write it as \`key: value\`, or delete it.`);
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (!isBriefKey(key)) throw refuse(`\`${key}\` is not a key a brief has. A brief's keys are: ${BRIEF_KEYS.join(', ')}.`);
    if (meta.has(key)) throw refuse(`\`${key}\` is given twice. Keep one.`);
    if (!value) throw refuse(`\`${key}:\` has no value. Give it one, or delete the line.`);
    meta.set(key, value);
  }

  const brief = (m ? source.slice(m[0].length) : source).trim();
  if (!brief) throw refuse('there is no prompt. Write what the session should do below the frontmatter.');

  const maxAttempts = meta.get('maxAttempts');
  // Digits alone are not a count: 309 nines is `Infinity` once converted, so the number is checked too.
  if (maxAttempts !== undefined && !(/^[1-9]\d*$/.test(maxAttempts) && Number.isSafeInteger(Number(maxAttempts)))) {
    throw refuse(`\`maxAttempts: ${maxAttempts}\` is not a number of attempts. Write a whole number from 1, like \`maxAttempts: 2\`.`);
  }
  const deadlineSeconds = meta.get('deadlineSeconds');
  if (deadlineSeconds !== undefined && !(Number.isFinite(Number(deadlineSeconds)) && Number(deadlineSeconds) > 0)) {
    throw refuse(`\`deadlineSeconds: ${deadlineSeconds}\` is not a number of seconds. Write seconds above 0, like \`deadlineSeconds: 900\` for fifteen minutes.`);
  }
  const budgetUsd = meta.get('budgetUsd');
  // Digits and a point: `$5` and `5 USD` are what a person writes, and `Number` would make the one NaN and refuse neither.
  if (budgetUsd !== undefined && !(/^\d*\.?\d+$/.test(budgetUsd) && Number.isFinite(Number(budgetUsd)) && Number(budgetUsd) > 0)) {
    throw refuse(`\`budgetUsd: ${budgetUsd}\` is not an amount of dollars. Write dollars above 0, digits only, like \`budgetUsd: 5\` or \`budgetUsd: 0.25\`.`);
  }
  const contextTokens = meta.get('contextTokens');
  // Digits: a number of tokens. `200k` is what a person writes, and the refusal does the arithmetic. Whether the harness takes the
  // number is `file()`'s to say.
  if (contextTokens !== undefined && !(/^[1-9]\d*$/.test(contextTokens) && Number.isSafeInteger(Number(contextTokens)))) {
    const k = /^(\d+)\s*([kKmM])$/.exec(contextTokens);
    throw refuse(`\`contextTokens: ${contextTokens}\` is not a number of tokens. Write a whole number in digits${k ? ` — \`contextTokens: ${Number(k[1]) * (k[2]!.toLowerCase() === 'k' ? 1_000 : 1_000_000)}\`` : ', like `contextTokens: 200000`'}.`);
  }
  const resume = meta.get('resume');
  if (resume !== undefined && !Object.hasOwn(RESUME_POLICIES, resume)) {
    throw refuse(`\`resume: ${resume}\` is not a retry policy. It is one of: ${Object.keys(RESUME_POLICIES).join(', ')}. To continue a particular session, that is \`resumeFrom: <session id>\`.`);
  }
  const cwd = meta.get('cwd');
  if (cwd !== undefined && !isDirectory(path.resolve(cwd))) {
    throw refuse(`\`cwd: ${cwd}\` is not a directory (${path.resolve(cwd)}). Give the directory the session should work in.`);
  }

  // A path to a JSON Schema file: frontmatter is one line per key, and a schema is not.
  let closeoutSchema: object | undefined;
  const schemaPath = meta.get('closeoutSchema');
  if (schemaPath !== undefined) {
    let schemaText: string;
    try { schemaText = fs.readFileSync(path.resolve(schemaPath), 'utf8'); }
    catch (e) { throw refuse(`\`closeoutSchema: ${schemaPath}\` cannot be read (${(e as Error).message}). It is a path to a JSON Schema file, relative to where you run \`ae\`.`); }
    let parsed: unknown;
    try { parsed = JSON.parse(schemaText); }
    catch (e) { throw refuse(`\`closeoutSchema: ${schemaPath}\` is not JSON (${(e as Error).message}).`); }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw refuse(`\`closeoutSchema: ${schemaPath}\` is not a JSON Schema: a schema is a JSON object.`);
    }
    closeoutSchema = parsed;
  }

  // One line, comma-separated: `tools: Read, Grep, Glob`. Which names a harness has is its to say.
  const toolList = meta.get('tools')?.split(',').map((t) => t.trim());
  if (toolList?.some((t) => !t)) {
    throw refuse(`\`tools: ${meta.get('tools')}\` has an empty name in it. List tool names separated by commas, like \`tools: Read, Grep, Glob\`.`);
  }

  const worktree = meta.get('worktree');
  return {
    brief,
    cwd: cwd !== undefined ? path.resolve(cwd) : fallbackCwd,
    model: meta.get('model'),
    permissionMode: meta.get('permissionMode'),
    harness: meta.get('harness'),
    maxAttempts: maxAttempts !== undefined ? Number(maxAttempts) : 1,
    deadlineSeconds: deadlineSeconds !== undefined ? Number(deadlineSeconds) : undefined,
    resume: resume as ResumePolicy | undefined,
    // Which session to CONTINUE, as opposed to `resume` which is the retry policy between
    // attempts of this task. Two different questions that the same English word answers.
    resumeFrom: meta.get('resumeFrom'),
    closeoutSchema,
    // `worktree: true` lets the harness name it, `false` is no worktree, any other value names it.
    worktree: worktree === undefined || worktree === 'false' ? undefined : worktree === 'true' ? true : worktree,
    tools: toolList,
    effort: meta.get('effort'),
    budgetUsd: budgetUsd !== undefined ? Number(budgetUsd) : undefined,
    contextTokens: contextTokens !== undefined ? Number(contextTokens) : undefined,
  };
}

/** What `ae show` says of the limits a task was filed with: its spend cap and its context window, each only when it has one. */
export const limitLines = (state: Pick<State, 'budgetUsd' | 'contextTokens'>): string[] => [
  ...(state.budgetUsd !== undefined ? [`budget: $${state.budgetUsd} an attempt`] : []),
  ...(state.contextTokens !== undefined ? [`context: ${state.contextTokens} tokens a session, compacted past about it`] : []),
];

/** A count for a person: 20400 → 20.4k, 1234567 → 1.2M. */
const count = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

/**
 * What an attempt consumed, for a person — and when its runner measured nothing, saying so. A zero
 * would read as "cost nothing"; the truth is "nobody counted".
 */
export const usageLine = (u: Usage | null): string => {
  if (!u) return 'usage not measured';
  const tokens = u.inputTokens !== undefined && u.outputTokens !== undefined
    ? ` · ${count(u.inputTokens)} in · ${count(u.outputTokens)} out` : ' · tokens not measured';
  const turns = u.turns !== undefined ? `${u.turns} turns` : 'turns not measured';
  const calls = u.toolCalls !== undefined ? `${u.toolCalls} tool calls` : 'tool calls not measured';
  return `${turns} · ${calls}${tokens} · ${costLine(u)}`;
};

/** Dollars for a person, to the cent: $3.01. Under a cent is `<$0.01` — `$0.00` would read as free. */
export const usd = (n: number): string => (n > 0 && n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`);

/** What an attempt cost, for a person: dollars, or that nobody measured it — and why, when the harness said. */
const costLine = (u: Usage | null | undefined): string =>
  u?.costUsd !== undefined ? usd(u.costUsd) : u?.unpricedModel ? 'cost not measured (a model without a price)' : 'cost not measured';

/** A length of time for a person: 42s, 4m 59s, 1h 02m. */
const duration = (ms: number): string => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;
};

/**
 * When an attempt ran, read off the record: start → end (how long), in UTC as the journal lines
 * above it are. One still running has no end to print, and a length up to now would need a clock
 * this line is not handed.
 */
const ranLine = (a: Attempt): string => a.endedAt === null
  ? `since ${a.startedAt.slice(11, 19)}`
  : `${a.startedAt.slice(11, 19)} → ${a.endedAt.slice(11, 19)} (${duration(Date.parse(a.endedAt) - Date.parse(a.startedAt))})`;

/** One attempt, for `ae show`: how it ended, when it ran, how its process exited if it has one, what it consumed. */
export const attemptLine = (a: Attempt): string => {
  const when = ranLine(a);
  if (a.ended === null) return `attempt ${a.n}  running ${when}`;
  if (a.reason === 'unstartable') return `attempt ${a.n}  ${a.ended} (unstartable)  ${when}  ${a.error?.split('\n')[0] ?? ''}`.trimEnd();
  const how = `${a.ended}${a.reason === 'lost' || a.reason === 'budget' ? ` (${a.reason})` : ''}`;
  const exit = a.exitCode !== null ? `  exit ${a.exitCode}` : '';
  const failedCall = a.error ? `  — the spawn call failed: ${a.error.split('\n')[0]}` : '';
  return `attempt ${a.n}  ${how}  ${when}${exit}  ${usageLine(a.usage)}${failedCall}`;
};

/**
 * One task, for `ae ls`: its priority when it was filed with one — `priority 2` — and its latest attempt's cost beside its
 * turns — `$3.01 · 12t`, or `cost not measured` — once it has an attempt. An attempt still running has none yet: Claude
 * Code writes a session's cost as its process exits.
 */
export const taskLine = (v: TaskView) => {
  const u = v.usage ?? v.state.attempts.at(-1)?.usage ?? undefined;
  const priority = v.state.priority !== undefined ? `  priority ${v.state.priority}` : '';
  const meter = v.state.attempts.length ? `  ${[costLine(u), ...(u?.turns !== undefined ? [`${u.turns}t`] : [])].join(' · ')}` : '';
  return `${v.id}  ${(v.state.harness ?? 'claude').padEnd(9)} ${v.phase.padEnd(18)} ${v.state.attempts.length}/${v.state.maxAttempts}${priority}${meter}  ${v.state.brief.split('\n')[0]!.slice(0, 44)}`;
};

/**
 * One journal entry, for a person. Shared by `feed`, `show` and `watch` so the same event does not
 * read three different ways depending on which verb printed it.
 */
const KINDS: Record<string, string> = {
  filed: 'filed', starting: 'starting', spawned: 'started',
  ended: 'ended', measured: 'measured', settled: 'SETTLED', 'stop-requested': 'stop asked', said: 'said',
};

const entryLine = (taskId: string, event: Event) => {
  const extra = event.kind === 'settled' ? `  ${event.outcome}`
    : event.kind === 'measured' ? `  attempt ${event.attempt}: ${costLine(event.usage)}`
    : event.kind === 'ended' ? `  ${event.observed}${event.reason === 'harness' ? '' : ` (${event.reason})`}${event.error ? `: ${event.error.split('\n')[0]!.slice(0, 160)}` : ''}`
    : event.kind === 'spawned' && event.error ? `  but the call failed: ${event.error.split('\n')[0]!.slice(0, 160)}`
    : event.kind === 'said' ? `  to attempt ${event.attempt}: ${event.text.trim().split('\n')[0]!.slice(0, 160)}`
    : '';
  return `${event.at.slice(11, 19)}  ${taskId.padEnd(34)} ${(KINDS[event.kind] ?? event.kind).padEnd(10)}${extra}`;
};

const HELP = `ae — an engine for agent sessions

  ae start <brief.md|"text">   file a task
  ae tick                      one reconcile pass
  ae up [ms]                   reconcile on a timer
  ae ls                        every task, desired vs observed
  ae show <id>                 the journal, line by line
  ae logs <id>                 the session's output
  ae stop <id>                 ask it to stop
  ae say <id> "<text>"         tell its running session something, and journal it
  ae feed [cursor]             what happened, since a cursor — the upper layer's API
  ae watch [cursor]            the same, followed

  a brief is markdown with optional frontmatter:
    cwd, model, maxAttempts, permissionMode
    harness          claude (default) | codex | claude-detached
    deadlineSeconds  wall clock across all attempts
    resume           interrupted (default) | always | never — the RETRY policy
    resumeFrom       a session id to continue, instead of starting cold
    worktree         true, or a name — the harness cuts it
    closeoutSchema   a JSON Schema file — the workload ends by answering in that shape
    tools            Read, Grep, Glob — the only tools the session has (codex: read-only
                     unless the list has Bash, Write or Edit)
    effort           claude: low | medium | high | xhigh | max
                     codex:  none | minimal | low | medium | high | xhigh | max
    budgetUsd        dollars one attempt may spend — claude-detached only: claude -p
                     ends the session at it; a --bg session keeps no cap
    contextTokens    the session's context window, in tokens: it compacts past about it —
                     claude and claude-detached, 100000 to 1000000
  a key not listed here, or a value the harness cannot take, is refused (exit 2)

  AE_ROOT            a different board, the way a kubeconfig points at a different cluster
  AE_MAX_CONCURRENT  sessions at work at once per pool: claude and claude-detached
                     share one, codex has its own (default 3)`;

export async function main(argv: string[]): Promise<void> {
  const [verb, arg] = argv;
  const engine: Engine = createEngine({
    root: process.env.AE_ROOT ?? path.join(os.homedir(), '.agent-engine'),
    maxConcurrent: Number(process.env.AE_MAX_CONCURRENT) || undefined,
  });

  switch (verb) {
    case 'start': {
      if (!arg) return console.log(HELP);
      const text = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : arg;
      const spec = parseBrief(text, process.cwd());
      const id = await engine.file(spec);
      console.log(`${id}  filed → ${spec.cwd}`);
      console.log(`run 'ae tick' (or 'ae up') to start it`);
      return;
    }

    case 'ls': {
      const views = await engine.list();
      if (!views.length) return console.log('no tasks');
      for (const v of views) console.log(taskLine(v));
      return;
    }

    case 'show': {
      if (!arg) return console.log(HELP);
      const v = await engine.view(arg);
      if (!v.state.brief && !v.state.attempts.length) return console.log(`no such task: ${arg}`);
      const { entries } = await engine.feed(0);
      for (const e of entries.filter((x) => x.taskId === arg)) console.log(entryLine(e.taskId, e.event));
      console.log(`\ncwd: ${v.state.cwd}\nbrief: ${v.state.brief.slice(0, 200)}`);
      for (const line of limitLines(v.state)) console.log(line);
      for (const a of v.state.attempts) console.log(attemptLine(a));
      return;
    }

    case 'logs':
      if (!arg) return console.log(HELP);
      return console.log(await engine.logs(arg));

    case 'stop':
      if (!arg) return console.log(HELP);
      await engine.stop(arg);
      return console.log(`${arg}  stop requested`);

    // The words are everything after the id, so an unquoted sentence is one message. An empty one is the
    // engine's to refuse, as every refusal is: exit 2, and nothing journalled.
    case 'say': {
      if (!arg) return console.log(HELP);
      const said = await engine.say(arg, argv.slice(2).join(' '));
      return console.log(entryLine(arg, { kind: 'said', ...said }));
    }

    case 'tick': {
      const r = await engine.tick();
      const load = Object.entries(r.running).map(([h, n]) => `${h}:${n}`).join(' ') || 'idle';
      return console.log(`${r.actions} action(s) over ${r.tasks} task(s)  [${load}]`);
    }

    case 'feed': {
      const { entries, cursor } = await engine.feed(Number(arg) || 0);
      for (const e of entries) console.log(entryLine(e.taskId, e.event));
      return console.log(`cursor: ${cursor}`);
    }

    // `engine.watch`, not a poll loop of `engine.feed`. The store PUSHES (the file journal watches
    // the feed), the timer is only the backstop for a store that cannot or an OS event that got
    // dropped, and a drain guard keeps "at-least-once, in order" true when a push and a tick land
    // together. All of that already exists behind one method; re-implementing the easy half of it
    // here is how a CLI ends up being the worst consumer of its own API.
    case 'watch': {
      const from = Number(arg) || 0;
      console.log(`watching from ${from}, ^C to stop`);
      await new Promise<void>(() => {
        engine.watch({
          from,
          onEntry: ({ taskId, event }) => console.log(entryLine(taskId, event)),
          onError: (e) => console.error(String(e)),
        });
      });
      return;
    }

    case 'up': {
      const every = Number(arg) || 3_000;
      console.log(`up — ticking every ${every}ms, ^C to stop`);
      await new Promise<void>(() => {
        engine.start({
          intervalMs: every,
          onTick: (r) => {
            if (!r.actions) return;
            const load = Object.entries(r.running).map(([h, n]) => `${h}:${n}`).join(' ');
            console.log(`${new Date().toISOString().slice(11, 19)}  ${r.actions} action(s) over ${r.tasks} task(s)  [${load}]`);
          },
          onError: (e) => console.error(String(e)),
        });
      });
      return;
    }

    default:
      return console.log(HELP);
  }
}
