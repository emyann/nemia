/**
 * The verbs — and the first consumer of the engine's own public API.
 *
 * This file reaches the engine through its entries alone: it builds the `Engine` service from its layer and runs each verb as an Effect,
 * a refusal worded by the runtime (`refusalWords`), so `bin/ae.ts` prints it and exits 2.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Effect, ManagedRuntime } from 'effect';
import { admissionHook, Engine as EngineService, refusalWords, type EngineOptions, type EngineShape } from '../index.ts';
import { refusedText, retiredKeyRefusal, TAKEN_ARGS, type CodexArgs, type ForgetReport, type HarnessArgs } from '../index.ts';
import type { SweepReport, TaskSpec } from '../index.ts';
import { attemptLine, entryLine, limitLines, runningText, taskLine } from './lines.ts';
import { compactAsked, compactLines } from './compact.ts';

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

/**
 * The keys a brief refuses because what they asked for is gone, each with what to write instead: `background` ran the session as
 * `claude --bg`, which the runtime no longer runs (`TAKEN_ARGS`, in `file()`'s words).
 */
const TAKEN_BRIEF_KEYS: Readonly<Record<string, string>> = TAKEN_ARGS;

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
 * retired key, then a key taken away (`TAKEN_BRIEF_KEYS`), then a key not in `BRIEF_KEYS`.
 */
const metaEntry = (line: string): [BriefKey, string] => {
  const i = line.indexOf(':');
  if (i <= 0) throw refuse(`\`${line}\` is not a \`key: value\` line. Write it as \`key: value\`, or delete it.`);
  const key = line.slice(0, i).trim();
  if (isRetiredBriefKey(key)) throw refuse(retiredKeyRefusal(key));
  const taken = Object.hasOwn(TAKEN_BRIEF_KEYS, key) ? TAKEN_BRIEF_KEYS[key] : undefined;
  if (taken !== undefined) throw refuse(`${taken} Delete the \`${key}:\` line.`);
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
  const [, digits, unit] = /^(\d+)\s*([kKmM])$/.exec(contextTokens) ?? [];
  throw refuse(
    `\`contextTokens: ${contextTokens}\` is not a number of tokens. Write a whole number in digits${digits !== undefined && unit !== undefined ? ` — \`contextTokens: ${Number(digits) * (unit.toLowerCase() === 'k' ? 1_000 : 1_000_000)}\`` : ', like `contextTokens: 200000`'}.`,
  );
};

/**
 * A `true` or `false` value of `key` as a boolean, or `undefined` when there is none. Refuses anything else, saying what
 * `key: true` does in `use`.
 */
const trueOrFalse = (key: 'queued' | 'holdOpen', value: string | undefined, use: string): boolean | undefined => {
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
 * - `queued` and `holdOpen` are `true` or `false`; `queued: true` holds the task until `ae admit` starts it.
 * - `background` is refused, whatever its value, with what to write instead: the runtime runs no `claude --bg` session.
 * - `restartPolicy` is `Always` alone: the session stays open until `ae stop`, which `file()` takes on `claude`, held attached
 *   while a process holds the sessions (`ae up`).
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
  const queued = trueOrFalse(
    'queued',
    meta.get('queued'),
    'to have the task wait for `ae admit <id>` before it starts, or leave it out to start it on the next tick',
  );
  const holdOpen = trueOrFalse(
    'holdOpen',
    meta.get('holdOpen'),
    'to have the task wait for `ae answer` or `ae close` when an attempt ends, or leave it out to settle it then',
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

const HELP = `ae — an engine for agent sessions

  ae file <brief.md|"text">    file a task (ae start, its old name, still does)
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
                               its stdin until its result, a long-lived session on its input
  ae interrupt <id>            end the turn its session is in, and leave the session open to
                               hear the next words: only a session attached on the Agent SDK
  ae answer <id> "<text>" [--budget <usd>]
                               answer a task held open that waits (input-required): its
                               next turn resumes the session that ended, told the words
  ae close <id>                settle a task held open that waits: succeeded
  ae admit <id>...             let tasks filed queued start (ae ls: queued): the next
                               tick starts them — one a store filed before stage 4c too
  ae admission -- <command…>   the hook a Claude Code session runs before a call its task's
                               admission sees: hands the call to the command, prints its answer
  ae feed [cursor]             what happened, since a cursor — the upper layer's API
  ae forget <id>... [--yes]    count what settled tasks keep: their journals, their lines in
                               the feed, their sessions' files; --yes removes them
  ae sweep [--yes]             count the bodies no journal names, put over a day ago: a long
                               text is kept once, named by its sha256; --yes removes them
  ae compact [--yes]           count the captures of ended sessions and what they would keep:
                               what their readers read; --yes rewrites them so, once
  ae watch [cursor]            the same, followed

  a brief is markdown with optional frontmatter:
    cwd, model, permissionMode
    harness          claude (default) | codex | command
    deadlineSeconds  wall clock of the task's attempt (of a turn's, when held open)
    resumeFrom       a session id to continue, instead of starting cold
    worktree         true, or a name — the harness cuts it
    closeoutSchema   a JSON Schema file — the workload ends by answering in that shape
    tools            Read, Grep, Glob — the only tools the session has (codex: read-only
                     unless the list has Bash, Write or Edit)
    effort           claude: low | medium | high | xhigh | max
                     codex:  none | minimal | low | medium | high | xhigh | max
    budgetUsd        dollars one attempt may spend — claude: the session ends at it
    holdOpen         true — when a turn ends done, wait for ae answer or ae close
                     rather than settle: input-required, with nothing running
    queued           true — wait for ae admit <id> before it starts
    restartPolicy    Always — claude: keep the session open between turns, idle until ae
                     stop, held attached while ae up holds the sessions (refused
                     unstartable with none); ae say gives it its next words
    contextTokens    the session's context window, in tokens: it compacts past about it —
                     claude, 100000 to 1000000
    trustFrom        codex only: an absolute directory you trust in ~/.codex/config.toml,
                     whose trust extends to cwd — name it to work in a worktree of it
  a key not listed here, or a value the harness cannot take, is refused (exit 2)
  one attempt per start: a task that fails settles failed — file it again, with
  resumeFrom to continue its session (maxAttempts and resume are retired)

  every task filed starts on the next tick: there is no ceiling. To hold one back,
  file it with queued: true and start it with ae admit <id>

  AE_ROOT            a different store, the way a kubeconfig points at a different cluster`;

/**
 * Why `ae` refuses to run with `AE_MAX_CONCURRENT` set, empty too: `ae` builds its engine with no ceiling, since a ceiling is the
 * engine's option (`maxConcurrent`) and no variable's; read and dropped, the variable would have a person who set it believe in a
 * ceiling nothing keeps.
 */
export const AE_MAX_CONCURRENT_RETIRED =
  'ae: `AE_MAX_CONCURRENT` is retired: `ae` runs its engine with no ceiling, since a ceiling is the option `maxConcurrent` a program gives `Engine.layer`. Unset it, file with `queued: true` and start each with `ae admit <id>` when it may run.';

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
const printOutput = async (engine: EngineShape, id: string, stream: string): Promise<void> => {
  const text = await run('output', engine.output(id, stream as 'stdout' | 'stderr'));
  if (text === undefined) return console.error(`${id}: no ${stream} kept: no attempt has run yet, or its run kept no streams`);
  process.stdout.write(text);
};

/** `ae show <id>`: task `id`'s journal, line by line, then its folder, the head of its brief, its limits and its attempts. */
const show = async (engine: EngineShape, id: string): Promise<void> => {
  const v = await run('view', engine.view(id));
  if (!v.state.brief && !v.state.attempts.length) return console.log(`no such task: ${id}`);
  const { entries } = await run('feed', engine.feed(0));
  for (const e of entries.filter((x) => x.taskId === id)) console.log(entryLine(e.taskId, e.event));
  console.log(`\ncwd: ${v.state.cwd}\nbrief: ${v.state.brief.slice(0, 200)}`);
  for (const line of limitLines(v.state)) console.log(line);
  for (const a of v.state.attempts) console.log(attemptLine(a));
};

/**
 * `ae file <brief.md|"text">`: the brief at the path `arg`, or `arg` itself as one, parsed and filed; the help, given nothing. `ae start`
 * is its old spelling, still taken, so scripts already written keep working.
 */
const fileBrief = async (engine: EngineShape, arg: string | undefined): Promise<void> => {
  if (!arg) return console.log(HELP);
  const text = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : arg;
  const spec = parseBrief(text, process.cwd());
  const id = await run('file', engine.file(spec));
  console.log(`${id}  filed → ${spec.cwd}`);
  console.log(`run 'ae tick' (or 'ae up') to start it`);
};

/** `ae tick`: one pass, and a line for what it did, each move it refused and each task it left out. */
const tickOnce = async (engine: EngineShape): Promise<void> => {
  const r = await run('tick', engine.tick());
  const load = runningText(r.running) || 'idle';
  console.log(`${r.actions} action(s) over ${r.tasks} task(s)  [${load}]`);
  for (const m of r.refused) console.log(refusedText(m));
  for (const why of r.unreadable) console.error(`left out: ${why}`);
};

/** What `ae sweep` is asked, off the arguments after it: `{ yes }`, given `--yes`. Refuses, with exit code 2, any other argument. */
export const sweepAsked = (rest: readonly string[]): { yes: boolean } => {
  const other = rest.filter((a) => a !== '--yes');
  if (other.length)
    throw Object.assign(new Error(`sweep: takes \`--yes\` to remove, or nothing to count; it was handed ${other.join(' ')}.`), {
      exitCode: 2,
    });
  return { yes: rest.length > 0 };
};

const bodies = (n: number) => `${n} bod${n === 1 ? 'y' : 'ies'}`;

/** The line `ae sweep` prints for `report`: what it removed, when `yes`, else what it would remove; and what it keeps. */
export const sweepLine = (report: SweepReport, yes: boolean): string =>
  yes
    ? `${bodies(report.removed)} removed (${report.removedBytes} bytes), ${report.kept} kept`
    : `${bodies(report.removable)} no journal names (${report.bytes} bytes): \`ae sweep --yes\` removes them; ${report.kept} kept`;

/** `ae sweep [--yes]`: the bodies no journal and no feed entry names, counted, and removed given `--yes` (`Engine.sweep`). */
const sweepBodies = async (engine: EngineShape, rest: readonly string[]): Promise<void> => {
  const { yes } = sweepAsked(rest);
  console.log(sweepLine(await run('sweep', engine.sweep({ yes })), yes));
};

/**
 * What `ae forget` is asked, off the arguments after it: the task ids, and `yes`, given `--yes`. Refuses, with exit code 2, no id or
 * a flag.
 */
export const forgetAsked = (rest: readonly string[]): { taskIds: string[]; yes: boolean } => {
  const taskIds = rest.filter((a) => a !== '--yes');
  const flags = taskIds.filter((a) => a.startsWith('-'));
  if (!taskIds.length || flags.length)
    throw Object.assign(
      new Error(
        `forget: takes the ids of settled tasks, and \`--yes\` to remove them; it was handed ${rest.join(' ') || 'nothing'}: nothing was forgotten.`,
      ),
      { exitCode: 2 },
    );
  return { taskIds, yes: taskIds.length < rest.length };
};

/**
 * The lines `ae forget` prints for `report`: per task what went, or without `yes` what would, what each harness leaves, and the next
 * command.
 */
export const forgetLines = (report: ForgetReport): string[] => {
  const lines: string[] = [];
  for (const t of report.tasks) {
    const files = t.sessions.flatMap((s) => s.files);
    lines.push(`${t.taskId}: journal ${t.journalBytes} bytes, ${t.feedLines} feed line(s), ${files.length} session file(s)`);
    for (const file of files) lines.push(`  ${file}`);
    for (const left of t.sessions.flatMap((s) => s.left)) lines.push(`  left: ${left}`);
  }
  const ids = report.tasks.map((t) => t.taskId).join(' ');
  if (!report.forgotten) lines.push(`nothing was forgotten: \`ae forget ${ids} --yes\` removes it`);
  else if (report.feed)
    lines.push(
      `forgotten; the feed lost ${report.feed.linesForgotten} line(s), ${report.feed.bytesBefore} bytes to ${report.feed.bytesAfter}`,
    );
  else lines.push('forgotten');
  return lines;
};

/** `ae forget <id>... [--yes]`: what settled tasks keep, counted, and removed given `--yes` (`Engine.forget`). */
const forgetTasks = async (engine: EngineShape, rest: readonly string[]): Promise<void> => {
  const { taskIds, yes } = forgetAsked(rest);
  for (const line of forgetLines(await run('forget', engine.forget(taskIds, { yes })))) console.log(line);
};

/** The line `ae feed` prints after a read from `after` when lines after it were forgotten, else none. */
export const forgottenLine = (forgotten: number | undefined, after: number): string[] =>
  forgotten ? [`${forgotten} lines of forgotten tasks were here, after cursor ${after}`] : [];

/** `ae feed [cursor]`: the entries after `after`, what was forgotten after it, what was skipped, and the cursor to resume from. */
const printFeed = async (engine: EngineShape, after: number): Promise<void> => {
  const { entries, cursor, refused = [], forgotten } = await run('feed', engine.feed(after));
  for (const line of forgottenLine(forgotten, after)) console.log(line);
  for (const e of entries) console.log(entryLine(e.taskId, e.event));
  for (const r of refused) console.error(`skipped: ${r.why}`);
  console.log(`cursor: ${cursor}`);
};

/** `ae ls`: a line per task, and on stderr each journal left out and why. */
const listTasks = async (engine: EngineShape): Promise<void> => {
  const { views, unreadable } = await run('list', engine.list());
  if (!views.length && !unreadable.length) return console.log('no tasks');
  for (const v of views) console.log(taskLine(v));
  for (const u of unreadable) console.error(`left out: ${u.why}`);
};

/** The engine's verb `verb`, `effect`, as a Promise: a refusal rejected in the runtime's words (`refusalWords`), else as it failed. */
const run = <A, E>(verb: string, effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.mapError(refusalWords(verb))));

/** `ae compact [--yes]`: the captures of ended sessions, counted, and rewritten to what their readers read given `--yes`. */
const compactCaptures = async (engine: EngineShape, rest: readonly string[]): Promise<void> => {
  const { yes } = compactAsked(rest);
  for (const line of compactLines(await run('compact', engine.compact({ yes })))) console.log(line);
};

/**
 * The verbs written to the session of a task in flight, each given the task's id and the words after it: `ae say <id> <words>`, the
 * words put to its session and printed as the entry they were journalled as, and `ae interrupt <id>`, the turn it is in asked to end,
 * its session left open to hear the next words.
 */
const WRITING: Readonly<Record<string, (engine: EngineShape, id: string, words: readonly string[]) => Promise<void>>> = {
  say: async (engine, id, words) => console.log(entryLine(id, { kind: 'said', ...(await run('say', engine.say(id, words.join(' ')))) })),
  interrupt: async (engine, id) => {
    const ended = await run('interrupt', engine.interrupt(id));
    console.log(`${id}  turn of attempt ${ended.attempt} asked to end at ${ended.at}`);
  },
};

/**
 * The first word of `argv` handled as a verb written to a session (`WRITING`): false where it names none, so the caller goes on to the
 * rest; true once it was handled, the help printed where it named no task.
 */
const wroteToSession = async (engine: EngineShape, argv: readonly string[]): Promise<boolean> => {
  const [verb, id, ...words] = argv;
  const write = verb !== undefined && Object.hasOwn(WRITING, verb) ? WRITING[verb] : undefined;
  if (write && id) await write(engine, id, words);
  else if (write) console.log(HELP);
  return write !== undefined;
};

/** The verbs over what the store keeps, each given the arguments after it: `sweep`, `forget` and `compact`. */
const KEEPING: Readonly<Record<string, (engine: EngineShape, rest: readonly string[]) => Promise<void>>> = {
  sweep: sweepBodies,
  forget: forgetTasks,
  compact: compactCaptures,
};

/** The verb `verb` names among `KEEPING`, or, for any other word, the help printed. */
const keepingVerb = (verb: string | undefined) =>
  (verb !== undefined && Object.hasOwn(KEEPING, verb) ? KEEPING[verb] : undefined) ?? (async () => console.log(HELP));

/**
 * The engine over `options`, its layer built once and kept for the process. Refused — rejects with an `Error` whose `exitCode` is 2, led
 * by `ae` (`refusalWords`) — for options the engine refuses; any other failure to build it is rejected as it is.
 */
export const engineAt = (options: EngineOptions): Promise<EngineShape> =>
  ManagedRuntime.make(EngineService.layer(options))
    .runPromise(
      Effect.gen(function* () {
        return yield* EngineService;
      }),
    )
    .catch((e: unknown) => {
      throw refusalWords('ae')(e);
    });

/** `ae up`: the engine ticking every `every` ms until the process stops, a line for each pass that acted and each task left out anew. */
const up = async (engine: EngineShape, every: number): Promise<void> => {
  console.log(`up — ticking every ${every}ms, ^C to stop`);
  let leftOut = new Set<string>();
  await new Promise<void>(() => {
    Effect.runSync(
      engine.up({
        intervalMs: every,
        onTick: (r) => {
          for (const why of r.unreadable) if (!leftOut.has(why)) console.error(`left out: ${why}`);
          leftOut = new Set(r.unreadable);
          if (!r.actions) return;
          console.log(
            `${new Date().toISOString().slice(11, 19)}  ${r.actions} action(s) over ${r.tasks} task(s)  [${runningText(r.running)}]`,
          );
        },
        onError: (e) => console.error(String(e)),
      }),
    );
  });
};

/**
 * Refuses, with exit code 2, to run with `AE_MAX_CONCURRENT` set (`AE_MAX_CONCURRENT_RETIRED`); then runs the verb `argv` names where
 * it needs no engine — `admission`, the hook's (`admissionHook`), which `bin/ae.ts` runs before any engine loads. Answers whether it ran.
 */
function engineless(argv: string[]): boolean {
  if (process.env.AE_MAX_CONCURRENT !== undefined) throw Object.assign(new Error(AE_MAX_CONCURRENT_RETIRED), { exitCode: 2 });
  switch (argv[0]) {
    case 'admission':
      admissionHook(argv.slice(1));
      return true;
    default:
      return false;
  }
}

/**
 * Runs the `ae` verb `argv` names on the store at `AE_ROOT`, or prints `HELP`; refuses first, with exit code 2, to run with
 * `AE_MAX_CONCURRENT` set (`AE_MAX_CONCURRENT_RETIRED`).
 *
 * - `say` and `answer` take everything after the id as the words, so an unquoted sentence is one message — for `answer`,
 *   but a `--budget <usd>`, the next turn's cap. An empty message is the engine's to refuse, as every refusal is: exit 2,
 *   and nothing journalled.
 * - `watch` is `engine.watch`, never a poll loop of `engine.feed`: the store PUSHES (the file journal watches the feed), a
 *   timer is only the backstop for a store that cannot or an OS event that is dropped, and a drain guard keeps
 *   "at-least-once, in order" true when a push and a tick land together, all behind one method: a CLI that re-implemented
 *   its easy half would be the worst consumer of its own API.
 * - `admission` is the hook's, served with no engine (`engineless`).
 */
export async function main(argv: string[]): Promise<void> {
  const [verb, arg] = argv;
  if (engineless(argv)) return;
  const root = process.env.AE_ROOT ?? path.join(os.homedir(), '.agent-engine');
  const engine = await engineAt({ root });
  if (await wroteToSession(engine, argv)) return;

  switch (verb) {
    case 'start':
      console.error('ae: `ae start` is `ae file` now, and still files for now: type `ae file <brief.md|"text">`.');
      return fileBrief(engine, arg);

    case 'file':
      return fileBrief(engine, arg);

    case 'ls':
      return listTasks(engine);

    case 'show':
      if (!arg) return console.log(HELP);
      return show(engine, arg);

    case 'logs':
      if (!arg) return console.log(HELP);
      return console.log(await run('logs', engine.logs(arg)));

    case 'output':
      if (!arg) return console.log(HELP);
      return printOutput(engine, arg, argv[2] ?? 'stdout');

    case 'stop':
      if (!arg) return console.log(HELP);
      await run('stop', engine.stop(arg));
      return console.log(`${arg}  stop requested`);

    case 'answer': {
      if (!arg) return console.log(HELP);
      const { words, budget } = answerArgs(argv.slice(2));
      const input = await run('answer', engine.answer(arg, words, budget !== undefined ? { config: { budgetUsd: Number(budget) } } : {}));
      console.log(entryLine(arg, { kind: 'input', ...input }));
      return console.log(`run 'ae tick' (or 'ae up') to start its next turn`);
    }

    case 'close':
      if (!arg) return console.log(HELP);
      await run('close', engine.close(arg));
      return console.log(`${arg}  closed: the next tick settles it`);

    case 'admit': {
      if (!arg) return console.log(HELP);
      const ids = argv.slice(1);
      const admitted = new Set(await run('admit', engine.admit(ids)));
      for (const id of ids)
        console.log(`${id}  ${admitted.has(id) ? 'admitted: the next tick starts it' : 'waits for no admission: left as it is'}`);
      return;
    }

    case 'tick':
      return tickOnce(engine);

    case 'feed':
      return printFeed(engine, Number(arg) || 0);

    case 'watch': {
      const from = Number(arg) || 0;
      console.log(`watching from ${from}, ^C to stop`);
      await new Promise<void>(() => {
        Effect.runSync(
          engine.watch({
            from,
            onEntry: ({ taskId, event }) => console.log(entryLine(taskId, event)),
            onError: (e) => console.error(String(e)),
          }),
        );
      });
      return;
    }

    case 'up':
      return up(engine, Number(arg) || 3_000);

    default:
      return keepingVerb(verb)(engine, argv.slice(1));
  }
}
