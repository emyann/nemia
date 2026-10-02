/**
 * The verbs — and the first consumer of the engine's own public API.
 *
 * This file reaches the engine through its two faces alone, and imports no `effect`: it builds the engine with `promiseEngine` and
 * uses it in Promises. That is deliberate and it is a test: if the Promise API were not enough to write the CLI with, it would not
 * be enough for anyone else either.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Engine as EngineService, promiseEngine } from '../index.ts';
import {
  denialText,
  refusedText,
  retiredKeyRefusal,
  type Attempt,
  type CodexArgs,
  type Engine,
  type Event,
  type HarnessArgs,
  type State,
  type TaskSpec,
  type TaskView,
  type Usage,
} from '../facade.ts';

/**
 * Every key a brief may have — a closed list, on purpose.
 *
 * A key this list does not name is refused by name, with the list, so a typo is never read as a default; each value is
 * checked by `parseBrief`, so `deadlineSeconds: 5m` is refused rather than journalled as `null`. A test feeds every key
 * through the parser, so none can be accepted here and then dropped. A key is one of the task's, one of its harness's
 * arguments, or one of Codex's own, filed under `config.codex`.
 */
export const BRIEF_KEYS = [
  'cwd',
  'harness',
  'model',
  'permissionMode',
  'deadlineSeconds',
  'resumeFrom',
  'worktree',
  'closeoutSchema',
  'tools',
  'effort',
  'budgetUsd',
  'contextTokens',
  'background',
  'holdOpen',
  'queued',
  'restartPolicy',
  'trustFrom',
] as const satisfies readonly (keyof TaskSpec | keyof HarnessArgs | keyof CodexArgs)[];
export type BriefKey = (typeof BRIEF_KEYS)[number];

const isBriefKey = (key: string): key is BriefKey => (BRIEF_KEYS as readonly string[]).includes(key);

/**
 * The keys a brief refuses, since the runtime makes one attempt per start (`RETIRED_KEYS`): each refused by name, at any
 * value, in the words of `retiredKeyRefusal`, which say where trying again goes.
 */
const RETIRED_BRIEF_KEYS = ['maxAttempts', 'resume'] as const;
const isRetiredBriefKey = (key: string): key is (typeof RETIRED_BRIEF_KEYS)[number] =>
  (RETIRED_BRIEF_KEYS as readonly string[]).includes(key);

/** A refusal: exit code 2, and a sentence that says what to write instead. */
const refuse = (message: string) => Object.assign(new Error(`brief: ${message}`), { exitCode: 2 });

const isDirectory = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/**
 * One frontmatter line, its comment cut: its key and its value, trimmed. Refuses a line that is not `key: value`, then a
 * retired key, then a key not in `BRIEF_KEYS`.
 */
const metaEntry = (line: string): [BriefKey, string] => {
  const i = line.indexOf(':');
  if (i <= 0) throw refuse(`\`${line}\` is not a \`key: value\` line. Write it as \`key: value\`, or delete it.`);
  const key = line.slice(0, i).trim();
  if (isRetiredBriefKey(key)) throw refuse(retiredKeyRefusal(key));
  if (!isBriefKey(key)) throw refuse(`\`${key}\` is not a key a brief has. A brief's keys are: ${BRIEF_KEYS.join(', ')}.`);
  return [key, line.slice(i + 1).trim()];
};

/**
 * A brief's frontmatter, each key to its value, and its prompt. Refuses, in this order: frontmatter never closed, a line
 * `metaEntry` refuses, a key given twice, a key with no value, and a brief with no prompt.
 */
const briefParts = (text: string): { meta: Map<BriefKey, string>; brief: string } => {
  const source = text.replace(/\r\n/g, '\n');
  const m = /^---\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/.exec(source);
  if (!m && source.startsWith('---\n'))
    throw refuse('the frontmatter opened with `---` is never closed. End it with a `---` line of its own.');

  const meta = new Map<BriefKey, string>();
  for (const raw of m?.[1]?.split('\n') ?? []) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line) continue;
    const [key, value] = metaEntry(line);
    if (meta.has(key)) throw refuse(`\`${key}\` is given twice. Keep one.`);
    if (!value) throw refuse(`\`${key}:\` has no value. Give it one, or delete the line.`);
    meta.set(key, value);
  }

  const brief = (m ? source.slice(m[0].length) : source).trim();
  if (!brief) throw refuse('there is no prompt. Write what the session should do below the frontmatter.');
  return { meta, brief };
};

/** A `deadlineSeconds` value as its seconds, or `undefined` when there is none. Refuses one that is not a number above 0. */
const secondsOf = (deadlineSeconds: string | undefined): number | undefined => {
  if (deadlineSeconds === undefined) return undefined;
  if (!(Number.isFinite(Number(deadlineSeconds)) && Number(deadlineSeconds) > 0)) {
    throw refuse(
      `\`deadlineSeconds: ${deadlineSeconds}\` is not a number of seconds. Write seconds above 0, like \`deadlineSeconds: 900\` for fifteen minutes.`,
    );
  }
  return Number(deadlineSeconds);
};

/** A `budgetUsd` value as its dollars, or `undefined` when there is none. Refuses one that is not digits and a point, above 0. */
const dollarsOf = (budgetUsd: string | undefined): number | undefined => {
  if (budgetUsd === undefined) return undefined;
  if (!(/^\d*\.?\d+$/.test(budgetUsd) && Number.isFinite(Number(budgetUsd)) && Number(budgetUsd) > 0)) {
    throw refuse(
      `\`budgetUsd: ${budgetUsd}\` is not an amount of dollars. Write dollars above 0, digits only, like \`budgetUsd: 5\` or \`budgetUsd: 0.25\`.`,
    );
  }
  return Number(budgetUsd);
};

/**
 * A `contextTokens` value as its tokens, or `undefined` when there is none. Refuses one that is not a whole number in
 * digits, and writes `200k` or `1M` back as its digits in the refusal.
 */
const tokensOf = (contextTokens: string | undefined): number | undefined => {
  if (contextTokens === undefined) return undefined;
  if (/^[1-9]\d*$/.test(contextTokens) && Number.isSafeInteger(Number(contextTokens))) return Number(contextTokens);
  const k = /^(\d+)\s*([kKmM])$/.exec(contextTokens);
  throw refuse(
    `\`contextTokens: ${contextTokens}\` is not a number of tokens. Write a whole number in digits${k ? ` — \`contextTokens: ${Number(k[1]) * (k[2].toLowerCase() === 'k' ? 1_000 : 1_000_000)}\`` : ', like `contextTokens: 200000`'}.`,
  );
};

/**
 * A `true` or `false` value of `key` as a boolean, or `undefined` when there is none. Refuses anything else, saying what
 * `key: true` does in `use`.
 */
const trueOrFalse = (key: 'background' | 'queued' | 'holdOpen', value: string | undefined, use: string): boolean | undefined => {
  if (value === undefined) return undefined;
  if (value !== 'true' && value !== 'false') throw refuse(`\`${key}: ${value}\` is not true or false. Write \`${key}: true\` ${use}.`);
  return value === 'true';
};

/** A `restartPolicy` value as the policy it names, or `undefined` when there is none. Refuses any word but `Always`. */
const restartOf = (value: string | undefined): 'Always' | undefined => {
  if (value === undefined || value === 'Always') return value;
  throw refuse(
    `\`restartPolicy: ${value}\` is not a restart policy. Write \`restartPolicy: Always\` to keep the session open until \`ae stop\`, or leave it out to run the task to its end.`,
  );
};

/** A `cwd` value as the directory it resolves to, or `undefined` when there is none. Refuses one that is not a directory. */
const directoryOf = (cwd: string | undefined): string | undefined => {
  if (cwd === undefined) return undefined;
  if (!isDirectory(path.resolve(cwd))) {
    throw refuse(`\`cwd: ${cwd}\` is not a directory (${path.resolve(cwd)}). Give the directory the session should work in.`);
  }
  return path.resolve(cwd);
};

/**
 * The JSON Schema a `closeoutSchema` value names, or `undefined` when there is none. Refuses a file that cannot be read, is
 * not JSON, or is not a JSON object.
 */
const schemaAt = (schemaPath: string | undefined): object | undefined => {
  if (schemaPath === undefined) return undefined;
  let schemaText: string;
  try {
    schemaText = fs.readFileSync(path.resolve(schemaPath), 'utf8');
  } catch (e) {
    throw refuse(
      `\`closeoutSchema: ${schemaPath}\` cannot be read (${(e as Error).message}). It is a path to a JSON Schema file, relative to where you run \`ae\`.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(schemaText);
  } catch (e) {
    throw refuse(`\`closeoutSchema: ${schemaPath}\` is not JSON (${(e as Error).message}).`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw refuse(`\`closeoutSchema: ${schemaPath}\` is not a JSON Schema: a schema is a JSON object.`);
  }
  return parsed;
};

/** A `tools` value as its names, trimmed, or `undefined` when there is none. Refuses a list with an empty name in it. */
const toolsOf = (tools: string | undefined): string[] | undefined => {
  const toolList = tools?.split(',').map((t) => t.trim());
  if (toolList?.some((t) => !t)) {
    throw refuse(`\`tools: ${tools}\` has an empty name in it. List tool names separated by commas, like \`tools: Read, Grep, Glob\`.`);
  }
  return toolList;
};

/** A `worktree` value as the harness takes it: `true` to let it name one, a name, or `undefined` for none, which `false` also is. */
const worktreeOf = (worktree: string | undefined): true | string | undefined =>
  worktree === undefined || worktree === 'false' ? undefined : worktree === 'true' ? true : worktree;

/**
 * A brief is a markdown file: optional `key: value` frontmatter, body is the prompt.
 *
 * It refuses rather than guesses: a key not in `BRIEF_KEYS`, a key given twice, a line that is not
 * `key: value`, an empty value, a count or a number of seconds that is not one, a retired
 * `maxAttempts` or `resume`, a `cwd` or schema file that is not there, and a brief with nothing to do. What a
 * value means to a harness — a permission mode, a harness name — is the engine's to check, and
 * `file()` checks it, so this is not the only door that does.
 *
 * How a frontmatter line is read:
 *
 * - `#` after a space starts a comment, as it would in YAML: `harness: codex  # the reviewer` means codex.
 * - `budgetUsd` is digits and a point, above 0: `$5` and `5 USD`, which a person writes, are refused, where `Number` would
 *   read the one as NaN.
 * - `contextTokens` is a whole number in digits; `200k` is refused with the arithmetic done. Whether the harness takes the
 *   number is `file()`'s to say.
 * - `queued`, `holdOpen` and `background` are `true` or `false`; `queued: true` holds the task until `ae admit` starts it.
 * - `restartPolicy` is `Always` alone: the session stays open until `ae stop`, which `file()` takes on `claude --bg` alone.
 * - `closeoutSchema` is a path to a JSON Schema file, relative to where `ae` runs: frontmatter is one line per key, and a
 *   schema is not.
 * - `tools` is one line, comma-separated: `tools: Read, Grep, Glob`. Which names a harness has is its to say.
 * - `worktree: true` lets the harness name it, `false` is no worktree, and any other value names it.
 * - `resumeFrom` names the session to continue: the task's one attempt starts from it rather than cold.
 * - `trustFrom` is the directory whose trust in the operator's Codex config extends to the `cwd`, filed under
 *   `config.codex`; whether it is absolute, and whether the harness is Codex, is `file()`'s to say.
 *
 * The harness's arguments go under `config`, as a task carries them; a brief writes them as keys like any other.
 */
export function parseBrief(text: string, fallbackCwd: string): TaskSpec {
  const { meta, brief } = briefParts(text);
  const deadlineSeconds = secondsOf(meta.get('deadlineSeconds'));
  const budgetUsd = dollarsOf(meta.get('budgetUsd'));
  const contextTokens = tokensOf(meta.get('contextTokens'));
  const background = trueOrFalse(
    'background',
    meta.get('background'),
    'to run the session as `claude --bg`, which a person can attach to, or leave it out to run it as a job',
  );
  const queued = trueOrFalse(
    'queued',
    meta.get('queued'),
    'to have the task wait for `ae admit <id>` before it starts, or leave it out to start it on the next tick',
  );
  const holdOpen = trueOrFalse(
    'holdOpen',
    meta.get('holdOpen'),
    'to have the task wait for `ae answer` or `ae close` when an attempt signs, or leave it out to settle it then',
  );
  const restartPolicy = restartOf(meta.get('restartPolicy'));
  const cwd = directoryOf(meta.get('cwd'));
  const closeoutSchema = schemaAt(meta.get('closeoutSchema'));
  const tools = toolsOf(meta.get('tools'));
  const trustFrom = meta.get('trustFrom');

  const config: HarnessArgs = Object.fromEntries(
    Object.entries({
      model: meta.get('model'),
      permissionMode: meta.get('permissionMode'),
      worktree: worktreeOf(meta.get('worktree')),
      tools,
      effort: meta.get('effort'),
      contextTokens,
      background,
      budgetUsd,
      codex: trustFrom === undefined ? undefined : { trustFrom },
    }).filter(([, value]) => value !== undefined),
  );
  return {
    brief,
    cwd: cwd ?? fallbackCwd,
    harness: meta.get('harness'),
    deadlineSeconds,
    resumeFrom: meta.get('resumeFrom'),
    closeoutSchema,
    ...(holdOpen === true ? { holdOpen: true as const } : {}),
    ...(queued !== undefined ? { queued } : {}),
    ...(restartPolicy ? { restartPolicy } : {}),
    ...(Object.keys(config).length ? { config } : {}),
  };
}

/** What `ae show` says of the limits a task was filed with: its spend cap and its context window, each only when it has one. */
export const limitLines = (state: Pick<State, 'config'>): string[] => [
  ...(state.config?.budgetUsd !== undefined ? [`budget: $${state.config.budgetUsd} an attempt`] : []),
  ...(state.config?.contextTokens !== undefined
    ? [`context: ${state.config.contextTokens} tokens a session, compacted past about it`]
    : []),
];

/** A count for a person: 20400 → 20.4k, 1234567 → 1.2M. */
const count = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

/**
 * What an attempt consumed, for a person — and when its runner measured nothing, saying so. A zero
 * would read as "cost nothing"; the truth is "nobody counted".
 */
export const usageLine = (u: Usage | null): string => (u ? `${countsLine(u)} · ${costLine(u)}${readLine(u)}` : 'usage not measured');

/** What an attempt has consumed so far, for a person, with no cost: a long-lived attempt's is written only at its end. */
const runningLine = (u: Usage): string => `${countsLine(u)}${readLine(u)}`;

/** An attempt's turns, tool calls and tokens, for a person, each one its runner could not see named not measured. */
const countsLine = (u: Usage): string => {
  const tokens =
    u.inputTokens !== undefined && u.outputTokens !== undefined
      ? ` · ${count(u.inputTokens)} in · ${count(u.outputTokens)} out`
      : ' · tokens not measured';
  const turns = u.turns !== undefined ? `${u.turns} turns` : 'turns not measured';
  const calls = u.toolCalls !== undefined ? `${u.toolCalls} tool calls` : 'tool calls not measured';
  return `${turns} · ${calls}${tokens}`;
};

/**
 * What an attempt read, by class, and how large its context got — after its cost, since the classes are what the cost is
 * made of: ` · read 21.4M · wrote 412.0k · uncached 1.2k · peak 167.0k`, and how often it compacted, which happens well
 * short of its window, so its peak alone never says it got there. Nothing for an attempt whose runner counted no
 * tokens, which already says so; a class or a peak its runner could not see is named not measured.
 */
const readLine = (u: Usage): string => {
  if (u.inputTokens === undefined) return '';
  const classes =
    u.cacheReadTokens !== undefined && u.cacheWriteTokens !== undefined && u.uncachedTokens !== undefined
      ? `read ${count(u.cacheReadTokens)} · wrote ${count(u.cacheWriteTokens)} · uncached ${count(u.uncachedTokens)}`
      : 'cache not measured';
  const peak = u.peakContextTokens !== undefined ? `peak ${count(u.peakContextTokens)}` : 'peak not measured';
  const compacted = u.compactions ? ` · compacted ${u.compactions === 1 ? 'once' : `${u.compactions} times`}` : '';
  return ` · ${classes} · ${peak}${compacted}`;
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
const ranLine = (a: Attempt): string =>
  a.endedAt === null
    ? `since ${a.startedAt.slice(11, 19)}`
    : `${a.startedAt.slice(11, 19)} → ${a.endedAt.slice(11, 19)} (${duration(Date.parse(a.endedAt) - Date.parse(a.startedAt))})`;

/**
 * `done (no statement)` for an end whose task asked for a closing statement and was given none (`stated: false`): the fact
 * the runtime records. What it means for the work is the layer above's to say; `ae` says only what happened.
 */
const unstated = (stated: boolean | undefined): string => (stated === false ? ' (no statement)' : '');

/**
 * One attempt, for `ae show`: how it ended, when it ran, how its process exited if it has one, what it consumed. A session
 * its harness ended at its spend cap says so as `failed (budget)`, the limit beside the end; what the harness denied the
 * session is said as the rules a person would write to allow it: the calls it went on without.
 */
export const attemptLine = (a: Attempt): string => {
  const when = ranLine(a);
  if (a.ended === null) return `attempt ${a.n}  running ${when}`;
  if (a.reason === 'unstartable') return `attempt ${a.n}  ${a.ended} (unstartable)  ${when}  ${a.error?.split('\n')[0] ?? ''}`.trimEnd();
  const how = `${a.ended}${a.reason === 'lost' ? ' (lost)' : a.limit ? ` (${a.limit})` : unstated(a.stated)}`;
  const exit = a.exitCode !== null ? `  exit ${a.exitCode}` : '';
  const failedCall = a.error ? `  — the spawn call failed: ${a.error.split('\n')[0]}` : '';
  const denied = a.denials?.length ? `  denied: ${a.denials.map(denialText).join(', ')}` : '';
  return `attempt ${a.n}  ${how}  ${when}${exit}  ${usageLine(a.usage)}${denied}${failedCall}`;
};

/**
 * One task, for `ae ls`: `queued` while it waits for `ae admit`, and its latest attempt's cost beside its turns
 * — `$3.01 · 12t`, or `cost not measured` — once it has an attempt. An attempt still running has none yet: Claude
 * Code writes a session's cost as its process exits. A long-lived attempt's turns are those journalled as it grows, its
 * cost the one recorded at its end. A task held open and answered says which turn it is on — `turn 1`.
 */
export const taskLine = (v: TaskView) => {
  const turn = v.state.inputs.length;
  const tries = turn ? `turn ${turn}` : '';
  const u = v.usage ?? v.state.attempts.at(-1)?.usage ?? undefined;
  const queued = v.admission === 'queued' ? '  queued' : '';
  const meter = v.state.attempts.length ? `  ${[costLine(u), ...(u?.turns !== undefined ? [`${u.turns}t`] : [])].join(' · ')}` : '';
  return `${v.id}  ${(v.state.harness ?? 'claude').padEnd(9)} ${v.phase.padEnd(18)}${tries ? ` ${tries}` : ''}${queued}${meter}  ${v.state.brief.split('\n')[0].slice(0, 44)}`;
};

/** The word each kind of journal entry is printed with. */
const KINDS: Record<string, string> = {
  filed: 'filed',
  starting: 'starting',
  spawned: 'started',
  ended: 'ended',
  measured: 'measured',
  counted: 'counted',
  settled: 'SETTLED',
  'stop-requested': 'stop asked',
  said: 'said',
  input: 'answered',
  closed: 'closed',
  admitted: 'admitted',
};

/** What follows each kind of journal entry's word, for a person; nothing for a kind not named. */
const EXTRAS: { [K in Event['kind']]?: (event: Extract<Event, { kind: K }>) => string } = {
  settled: (e) => `  ${e.outcome}`,
  measured: (e) => `  attempt ${e.attempt}: ${costLine(e.usage)}`,
  counted: (e) => `  attempt ${e.attempt}: ${runningLine(e.usage)}`,
  ended: (e) =>
    `  ${e.observed}${e.limit ? ` (${e.limit})` : e.reason === 'harness' ? unstated(e.stated) : ` (${e.reason})`}${e.error ? `: ${e.error.split('\n')[0].slice(0, 160)}` : ''}`,
  spawned: (e) => (e.error ? `  but the call failed: ${e.error.split('\n')[0].slice(0, 160)}` : ''),
  said: (e) => `  to attempt ${e.attempt}: ${e.text.trim().split('\n')[0].slice(0, 160)}`,
  input: (e) =>
    `  ${e.text.trim().split('\n')[0].slice(0, 160)}${e.config?.budgetUsd !== undefined ? `  (budget $${e.config.budgetUsd})` : ''}`,
};

/**
 * One journal entry, for a person. Shared by `feed`, `show` and `watch` so the same event does not
 * read three different ways depending on which verb printed it.
 */
export const entryLine = (taskId: string, event: Event) => {
  const extra = (EXTRAS[event.kind] as ((e: Event) => string) | undefined)?.(event) ?? '';
  return `${event.at.slice(11, 19)}  ${taskId.padEnd(34)} ${(KINDS[event.kind] ?? event.kind).padEnd(10)}${extra}`;
};

const HELP = `ae — an engine for agent sessions

  ae start <brief.md|"text">   file a task
  ae tick                      one reconcile pass
  ae up [ms]                   reconcile on a timer
  ae ls                        every task, desired vs observed
  ae show <id>                 the journal, line by line
  ae logs <id>                 the session's output
  ae output <id> [stdout|stderr]
                               one stream of its latest attempt, whole, as a harness that
                               keeps them apart kept it (the command harness): stdout by default
  ae stop <id>                 ask it to stop
  ae say <id> "<text>"         tell its running session something, and journal it: a job on
                               its stdin until its result, a background session in its inbox
  ae answer <id> "<text>" [--budget <usd>]
                               answer a task held open that waits (input-required): its
                               next turn resumes the session that signed, told the words
  ae close <id>                settle a task held open that waits: succeeded
  ae admit <id>...             let tasks filed queued start (ae ls: queued): the next
                               tick starts them — one a store filed before stage 4c too
  ae feed [cursor]             what happened, since a cursor — the upper layer's API
  ae watch [cursor]            the same, followed

  a brief is markdown with optional frontmatter:
    cwd, model, permissionMode
    harness          claude (default) | codex | claude-detached
    deadlineSeconds  wall clock of the task's attempt (of a turn's, when held open)
    resumeFrom       a session id to continue, instead of starting cold
    worktree         true, or a name — the harness cuts it
    closeoutSchema   a JSON Schema file — the workload ends by answering in that shape
    tools            Read, Grep, Glob — the only tools the session has (codex: read-only
                     unless the list has Bash, Write or Edit)
    effort           claude: low | medium | high | xhigh | max
                     codex:  none | minimal | low | medium | high | xhigh | max
    budgetUsd        dollars one attempt may spend — a job on claude, or claude-detached:
                     claude -p ends the session at it; a background session keeps no cap
    background       true — claude only: run the session as claude --bg, which a person
                     can attach to, instead of as a job (claude -p, the default); ae say
                     reaches either
    holdOpen         true — when a turn ends done, wait for ae answer or ae close
                     rather than settle: input-required, with nothing running
    queued           true — wait for ae admit <id> before it starts
    restartPolicy    Always — background only: keep the session open between turns, idle
                     until ae stop; ae say gives it its next words
    contextTokens    the session's context window, in tokens: it compacts past about it —
                     claude and claude-detached, 100000 to 1000000
    trustFrom        codex only: an absolute directory you trust in ~/.codex/config.toml,
                     whose trust extends to cwd — name it to work in a worktree of it
  a key not listed here, or a value the harness cannot take, is refused (exit 2)
  one attempt per start: a task that fails settles failed — file it again, with
  resumeFrom to continue its session (maxAttempts and resume are retired)

  every task filed starts on the next tick: there is no ceiling. To hold one back,
  file it with queued: true and start it with ae admit <id>

  AE_ROOT            a different board, the way a kubeconfig points at a different cluster`;

/**
 * Why `ae` refuses to run with `AE_MAX_CONCURRENT` set, empty too: the runtime keeps no ceiling, and read and dropped, the
 * variable would have a person who set it believe in a ceiling nothing keeps.
 */
export const AE_MAX_CONCURRENT_RETIRED =
  'ae: `AE_MAX_CONCURRENT` is retired: the runtime keeps no ceiling, and starts every task it is given. Unset it, file with `queued: true` and start each with `ae admit <id>` when it may run; in a workflow the orchestrator admits under `WF_MAX_CONCURRENT`.';

/**
 * The words and the `--budget <usd>` of `ae answer`, taken from the arguments after its id; refuses, with exit code 2, a budget
 * that is not dollars above 0 in digits.
 */
const answerArgs = (rest: string[]): { words: string; budget: string | undefined } => {
  const at = rest.indexOf('--budget');
  const budget = at === -1 ? undefined : rest[at + 1];
  if (at !== -1 && !(budget !== undefined && /^\d*\.?\d+$/.test(budget) && Number(budget) > 0)) {
    throw Object.assign(
      new Error(
        `answer: \`--budget ${budget ?? ''}\` is not an amount of dollars. Write dollars above 0, digits only, like \`--budget 5\` or \`--budget 0.25\`, or leave it out for the task's own.`,
      ),
      { exitCode: 2 },
    );
  }
  return { words: (at === -1 ? rest : [...rest.slice(0, at), ...rest.slice(at + 2)]).join(' '), budget };
};

/**
 * Prints the stream `stream` of task `id` whole, as `engine.output` answers it, or says on stderr that none is kept; the engine
 * refuses a stream that is neither `stdout` nor `stderr`.
 */
const printOutput = async (engine: Engine, id: string, stream: string): Promise<void> => {
  const text = await engine.output(id, stream as 'stdout' | 'stderr');
  if (text === undefined) return console.error(`${id}: no ${stream} kept: no attempt has run yet, or its run kept no streams`);
  process.stdout.write(text);
};

/**
 * Runs the `ae` verb `argv` names on the board at `AE_ROOT`, or prints `HELP`; refuses first, with exit code 2, to run with
 * `AE_MAX_CONCURRENT` set (`AE_MAX_CONCURRENT_RETIRED`).
 *
 * - `say` and `answer` take everything after the id as the words, so an unquoted sentence is one message — for `answer`,
 *   but a `--budget <usd>`, the next turn's cap. An empty message is the engine's to refuse, as every refusal is: exit 2,
 *   and nothing journalled.
 * - `watch` is `engine.watch`, never a poll loop of `engine.feed`: the store PUSHES (the file journal watches the feed), a
 *   timer is only the backstop for a store that cannot or an OS event that is dropped, and a drain guard keeps
 *   "at-least-once, in order" true when a push and a tick land together, all behind one method: a CLI that re-implemented
 *   its easy half would be the worst consumer of its own API.
 */
export async function main(argv: string[]): Promise<void> {
  const [verb, arg] = argv;
  if (process.env.AE_MAX_CONCURRENT !== undefined) throw Object.assign(new Error(AE_MAX_CONCURRENT_RETIRED), { exitCode: 2 });
  const root = process.env.AE_ROOT ?? path.join(os.homedir(), '.agent-engine');
  const engine: Engine = promiseEngine(EngineService.layer({ root }));

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
      const { views, unreadable } = await engine.list();
      if (!views.length && !unreadable.length) return console.log('no tasks');
      for (const v of views) console.log(taskLine(v));
      for (const u of unreadable) console.error(`left out: ${u.why}`);
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

    case 'output':
      if (!arg) return console.log(HELP);
      return printOutput(engine, arg, argv[2] ?? 'stdout');

    case 'stop':
      if (!arg) return console.log(HELP);
      await engine.stop(arg);
      return console.log(`${arg}  stop requested`);

    case 'say': {
      if (!arg) return console.log(HELP);
      const said = await engine.say(arg, argv.slice(2).join(' '));
      return console.log(entryLine(arg, { kind: 'said', ...said }));
    }

    case 'answer': {
      if (!arg) return console.log(HELP);
      const { words, budget } = answerArgs(argv.slice(2));
      const input = await engine.answer(arg, words, budget !== undefined ? { config: { budgetUsd: Number(budget) } } : {});
      console.log(entryLine(arg, { kind: 'input', ...input }));
      return console.log(`run 'ae tick' (or 'ae up') to start its next turn`);
    }

    case 'close':
      if (!arg) return console.log(HELP);
      await engine.close(arg);
      return console.log(`${arg}  closed: the next tick settles it`);

    case 'admit': {
      if (!arg) return console.log(HELP);
      const ids = argv.slice(1);
      const admitted = new Set(await engine.admit(ids));
      for (const id of ids)
        console.log(`${id}  ${admitted.has(id) ? 'admitted: the next tick starts it' : 'waits for no admission: left as it is'}`);
      return;
    }

    case 'tick': {
      const r = await engine.tick();
      const load =
        Object.entries(r.running)
          .map(([h, n]) => `${h}:${n}`)
          .join(' ') || 'idle';
      console.log(`${r.actions} action(s) over ${r.tasks} task(s)  [${load}]`);
      for (const m of r.refused) console.log(refusedText(m));
      for (const why of r.unreadable) console.error(`left out: ${why}`);
      return;
    }

    case 'feed': {
      const { entries, cursor, refused = [] } = await engine.feed(Number(arg) || 0);
      for (const e of entries) console.log(entryLine(e.taskId, e.event));
      for (const r of refused) console.error(`skipped: ${r.why}`);
      return console.log(`cursor: ${cursor}`);
    }

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
      let leftOut = new Set<string>();
      await new Promise<void>(() => {
        engine.start({
          intervalMs: every,
          onTick: (r) => {
            for (const why of r.unreadable) if (!leftOut.has(why)) console.error(`left out: ${why}`);
            leftOut = new Set(r.unreadable);
            if (!r.actions) return;
            const load = Object.entries(r.running)
              .map(([h, n]) => `${h}:${n}`)
              .join(' ');
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
