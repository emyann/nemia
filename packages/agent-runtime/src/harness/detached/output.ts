/**
 * What a detached session's output says, as a spec's `readOutput` reads it: `claude -p`'s one result, and `claude -p`'s stream
 * of events — its closeout, what it consumed and cost, whether it spent its budget, what it was denied, and, off the stream,
 * the skills it loaded and the files it touched. Pure functions of the lines `printedLinesOf` (`harness/claude/print.ts`) decodes:
 * an output it refuses is thrown in its words, never read as saying nothing. Codex's `exec --json` stream is read by `codexOutput`
 * (`harness/codex/stream.ts`).
 */
import path from 'node:path';
import type { Denial, Usage } from '../../core/index.ts';
import { partialMarksOf, printedKindOf, printedLinesOf, type PrintedKind, type PrintedLine, type Printed } from '../claude/print.ts';
import type { HarnessOutput } from './detached.ts';
import type { PartialMark } from './follow.ts';

/** The lines of `kinds` in `output`, decoded; throws an `Error` whose message is `printedLinesOf`'s `wrong` when one does not decode. */
const decoded = (output: string, kinds: readonly PrintedKind[]): PrintedLine[] => {
  const read = printedLinesOf(output, kinds);
  if ('wrong' in read) throw new Error(read.wrong);
  return read.lines;
};

/** A denied call as a result's `permission_denials` or a `permission_denied` event names it. */
type DeniedEntry = { tool_name: string; tool_use_id?: string; tool_input?: unknown };

/**
 * What `claude -p --output-format json` says in its one `result` object. The last result line is taken and every other
 * line skipped — the worker captures stderr beside it.
 *
 * The final answer is its `structured_output`, which Claude Code fills when it was given `--json-schema` and the session
 * answered in that shape. No result, a result without the field, or one whose field is `null`, is no answer.
 *
 * What the session cost is its `total_cost_usd`, and the time it waited on the API its `duration_api_ms`. The cost of
 * a `--resume` is not the process's own: it carries its parent's total on, to the digit. Read here as printed; a spec
 * that knows the parent takes it off (`resumeCostCarried`). The result counts no tool time, and its turns are not read
 * here: `num_turns` counts prompts' turns, not responses.
 *
 * Its tokens are its `usage`'s, in their classes — `input_tokens` uncached, `cache_creation_input_tokens` written,
 * `cache_read_input_tokens` read — and the process's own: a `--resume`'s `usage` counts its own input, where its
 * `modelUsage` carries its parent's on. A `usage` whose input sums to 0 is not a count — every response reads its prompt
 * — and gives none: Claude Code can print one beside a `modelUsage` that counts thousands. No peak: `usage.iterations`
 * holds the last response alone, not the largest.
 *
 * A session that stopped at its `--max-budget-usd` says so as its `subtype`, `error_max_budget_usd`, and exits 1 with
 * `is_error`, `terminal_reason: budget_exhausted` and "Reached maximum budget ($0.01)" for a $0.01 cap. Its
 * `total_cost_usd` can pass the cap: the cap is checked after the response that crosses it.
 *
 * What it was denied is its `permission_denials`, one `{tool_name, tool_use_id, tool_input}` for each tool call Claude
 * Code refused without asking — in every permission mode: under `-p` nothing waits on a prompt, and the session carries
 * on past the refusal. A `--resume`'s result names only what the resume was denied, though its cost is its session's.
 * Read as `denialOf` words it, one per call, in the order given.
 *
 * Throws an `Error` naming the line, its field and the fix when a `result` line does not decode (`printedLinesOf`).
 */
export const claudeResultOutput = (output: string): HarnessOutput => {
  const results = decoded(output, ['result']).flatMap((l) => (l.kind === 'result' ? [l.line] : []));
  return readClaude(results.at(-1), [], new Map());
};

/** A result's token counts, in their classes, when it gives every class and its input sums to more than 0; else none. */
const tokensOf = (usage: Printed<'result'>['usage']): Usage => {
  const { input_tokens: uncachedTokens, cache_creation_input_tokens: cacheWriteTokens } = usage ?? {};
  const { cache_read_input_tokens: cacheReadTokens, output_tokens: outputTokens } = usage ?? {};
  if (uncachedTokens === undefined || cacheWriteTokens === undefined || cacheReadTokens === undefined || outputTokens === undefined)
    return {};
  const inputTokens = uncachedTokens + cacheWriteTokens + cacheReadTokens;
  return inputTokens > 0 ? { inputTokens, uncachedTokens, cacheWriteTokens, cacheReadTokens, outputTokens } : {};
};

/**
 * `claudeResultOutput`'s reading of `result`, with the denials a stream named before its result (`claudeStreamOutput`) joined
 * ahead of the result's own. Everything else is the result's alone, and a stream with no result says only what it denied.
 */
const readClaude = (
  result: Printed<'result'> | undefined,
  denied: readonly DeniedEntry[],
  inputs: ReadonlyMap<string, unknown>,
): HarnessOutput => {
  const denials = deniedCalls([...denied, ...(result?.permission_denials ?? [])], inputs);
  if (!result) return denials.length ? { denials } : {};
  const { total_cost_usd: costUsd, duration_api_ms: apiMs } = result;
  const usage: Usage = {
    ...tokensOf(result.usage),
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(apiMs !== undefined ? { apiMs } : {}),
  };
  return {
    ...(result.structured_output != null ? { closeout: { payload: result.structured_output } } : {}),
    ...(Object.keys(usage).length ? { usage } : {}),
    ...(result.subtype === 'error_max_budget_usd' ? { limit: 'budget' } : {}),
    ...(denials.length ? { denials } : {}),
  };
};

/** The tools whose calls name one file, and the key of their input that names it. */
const FILE_KEYS: Readonly<Record<string, string>> = {
  Read: 'file_path',
  Write: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
};

/**
 * The one key of each tool's input a reader reads: a command (`denialOf` reads its first word), a skill, and each file tool's path
 * (`FILE_KEYS`). Every other key of a call's input, and every key of another tool's, is read by none.
 */
export const READ_INPUT_KEYS: Readonly<Record<string, string>> = { Bash: 'command', Skill: 'skill', ...FILE_KEYS };

/** The key of `tool`'s input a reader reads (`READ_INPUT_KEYS`), or none. */
const readKeyOf = (tool: string): string | undefined => (Object.hasOwn(READ_INPUT_KEYS, tool) ? READ_INPUT_KEYS[tool] : undefined);

/** The first word of a command, as `denialOf` names a denied one. */
const firstWord = (command: string): string => command.trim().split(/\s+/)[0];

/**
 * A denied call as a person reads it, and as a permission rule would name it: a command by its first word
 * (`Bash(pytest)`), a skill by its name (`Skill(look)`), a file tool by its path. Any other tool, or an input that says
 * none of these, is the tool alone — never a guess at what the rest of its input meant.
 */
export const denialOf = (tool: string, input: unknown): Denial => {
  const key = readKeyOf(tool);
  const v = key === undefined ? undefined : (input as Record<string, unknown> | null | undefined)?.[key];
  const given = typeof v === 'string' && v.trim() ? v.trim() : undefined;
  const what = tool === 'Bash' && given ? firstWord(given) : given;
  return what ? { tool, what } : { tool };
};

/**
 * Denied calls, each once by its `tool_use_id`, in the order first given: `{tool_name, tool_use_id, tool_input?}` as a
 * result's `permission_denials` and a `permission_denied` event write them. An entry with no input takes the one its
 * call was made with (`inputs`, by id), or else the one a later entry for the same call gives: a call named again keeps
 * the place of its first naming. An entry with no id is a call of its own.
 */
const deniedCalls = (entries: readonly DeniedEntry[], inputs: ReadonlyMap<string, unknown>): Denial[] => {
  const seen = new Map<string, { denial: Denial; input: unknown }>();
  let unnamed = 0;
  for (const { tool_name: tool, tool_use_id: id, tool_input: given } of entries) {
    const key = id || `(no id ${++unnamed})`;
    const input = given ?? inputs.get(key);
    const first = seen.get(key);
    if (!first || (first.input === undefined && input !== undefined))
      seen.set(key, { denial: denialOf(first?.denial.tool ?? tool, input), input });
  }
  return [...seen.values()].map((d) => d.denial);
};

/** The kinds of line a stream is read for. */
export const STREAM_KINDS: readonly PrintedKind[] = ['result', 'system permission_denied', 'system init', 'assistant'];

/** A call an assistant's line makes, as its `tool_use` block decodes. */
type ToolUse = Extract<Exclude<Printed<'assistant'>['message']['content'], string>[number], { type: 'tool_use' }>;

const isCall = (block: Exclude<Printed<'assistant'>['message']['content'], string>[number]): block is ToolUse => block.type === 'tool_use';

/**
 * What a stream says, gathered from its decoded lines in one pass: its last result; its `permission_denied` events, in order; the
 * input each call was made with, by id; whether an `init` line started it, the first folder one names and the first model one
 * names; its `Skill` calls and its file tools' calls, each once by id, first called first; and the ids of the calls an event or a
 * result says were denied.
 */
type StreamFacts = {
  result?: Printed<'result'>;
  events: DeniedEntry[];
  inputs: Map<string, unknown>;
  started: boolean;
  cwd?: string;
  /** The model the session really started on, as its `init` line resolved the alias it was asked for. */
  model?: string;
  skills: Map<string, unknown>;
  files: Map<string, [string, unknown]>;
  denied: Set<string>;
};

/** What `facts` learn from the calls an assistant's line makes. */
const gatherCalls = (facts: StreamFacts, line: Printed<'assistant'>): void => {
  const { content } = line.message;
  for (const { id, name, input } of typeof content === 'string' ? [] : content.filter(isCall)) {
    facts.inputs.set(id, input);
    if (name === 'Skill' && !facts.skills.has(id)) facts.skills.set(id, input);
    if (Object.hasOwn(FILE_KEYS, name) && !facts.files.has(id)) facts.files.set(id, [name, input]);
  }
};

/** What `facts` learn from one decoded line of a stream. */
const gather = (facts: StreamFacts, printed: PrintedLine): void => {
  if (printed.kind === 'result') {
    facts.result = printed.line;
    for (const { tool_use_id: id } of printed.line.permission_denials ?? []) if (id) facts.denied.add(id);
  } else if (printed.kind === 'system permission_denied') {
    facts.events.push(printed.line);
    if (printed.line.tool_use_id) facts.denied.add(printed.line.tool_use_id);
  } else if (printed.kind === 'system init') {
    facts.started = true;
    facts.cwd ??= printed.line.cwd;
    facts.model ??= printed.line.model;
  } else if (printed.kind === 'assistant') gatherCalls(facts, printed.line);
};

/**
 * What `claude -p --output-format stream-json --verbose` says: every event of the session, one JSON object a line, the
 * last of them its `result` — read by `claudeResultOutput`, as the one line of `--output-format json` is.
 *
 * What it was denied is read off the stream as well as the result, so a session killed before its result still says
 * it: each `{"type":"system","subtype":"permission_denied","tool_name","tool_use_id",…}` event, which names no input —
 * the input is the one the assistant's `tool_use` block of the same id was called with. Joined with the result's
 * `permission_denials`, one per call, in the order the stream first named each.
 *
 * The skills it loaded are read off the stream alone (`loadedSkills`), and said only by a stream with its `init` line; the files
 * it read or wrote (`touchedFiles`), only by one whose `init` line names its folder; the model it really started on, only by one
 * whose `init` line names a model, which is the alias — `opus` — already resolved to the model id the harness chose for it; what it
 * answers it `ranOn`, so no field of a recorded fact is spelt as the harness argument that asked for it.
 *
 * Throws an `Error` naming the line, its field and the fix when a line of a kind it reads does not decode (`printedLinesOf`).
 */
export const claudeStreamOutput = (output: string): HarnessOutput => {
  const facts: StreamFacts = { events: [], inputs: new Map(), started: false, skills: new Map(), files: new Map(), denied: new Set() };
  for (const printed of decoded(output, STREAM_KINDS)) gather(facts, printed);
  const skills = facts.started ? loadedSkills(facts) : undefined;
  const files = facts.cwd === undefined ? undefined : touchedFiles(facts.cwd, facts);
  return {
    ...readClaude(facts.result, facts.events, facts.inputs),
    ...(skills ? { skills } : {}),
    ...(files ? { files } : {}),
    ...(facts.model ? { ranOn: facts.model } : {}),
  };
};

/** The skill a `Skill` call's input names, after its last `:` — a plugin's skill by its bare name — or none. */
const skillNamed = (input: unknown): string | undefined => {
  const v = (input as Record<string, unknown> | null | undefined)?.[READ_INPUT_KEYS.Skill];
  const name = typeof v === 'string' ? v.slice(v.lastIndexOf(':') + 1).trim() : '';
  return name || undefined;
};

/**
 * Each skill a stream's session loaded, once per call by its `id`, in the order first called: the input of an assistant's
 * `Skill` `tool_use` block, a subagent's included, named by `skillNamed`. A call the session was denied, by its event or
 * its result, loaded nothing; a call naming no skill is skipped. Read only of a stream with a `system` `init` line: else
 * no session is known to have started.
 */
const loadedSkills = ({ skills, denied }: StreamFacts): string[] =>
  [...skills].flatMap(([id, input]) => (denied.has(id) ? [] : (skillNamed(input) ?? [])));

/** The file a file tool's call names, as `FILE_KEYS` reads it, made relative to `cwd`: none when it names none, or one outside `cwd`. */
const fileIn = (cwd: string, tool: string, input: unknown): string | undefined => {
  const v = (input as Record<string, unknown> | null | undefined)?.[READ_INPUT_KEYS[tool]];
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const rel = path.relative(cwd, path.resolve(cwd, v.trim()));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : undefined;
};

/**
 * Each file a stream's session read or wrote through its file tools (`FILE_KEYS`), a subagent's calls included, once, in the
 * order first touched, relative to the folder its `system` `init` line names (`cwd`). A call the session was denied, by its event
 * or its result, touched nothing; a file outside its folder is not counted. Read only of a stream whose `init` line names a folder:
 * else no session is known to have started, or no path can be read against it.
 */
const touchedFiles = (cwd: string, { files, denied }: StreamFacts): string[] => {
  const touched = [...files].flatMap(([id, [tool, input]]) => (denied.has(id) ? [] : (fileIn(cwd, tool, input) ?? [])));
  return [...new Set(touched)];
};

/** An assistant's `tool_use` block, written again: its id, its tool, and its input whole, or only what a reader reads of it. */
const callKept = ({ id, name, input }: ToolUse, denied: ReadonlySet<string>): object => {
  if (input === undefined) return { type: 'tool_use', id, name };
  if (denied.has(id)) return { type: 'tool_use', id, name, input };
  const key = readKeyOf(name);
  if (key === undefined || !Object.hasOwn(input, key)) return { type: 'tool_use', id, name };
  const v = input[key];
  return { type: 'tool_use', id, name, input: { [key]: name === 'Bash' && typeof v === 'string' ? firstWord(v) : v } };
};

/** An assistant's line cut to the calls it makes (`callKept`), or none when it makes none. */
const assistantKept = (line: Printed<'assistant'>, denied: ReadonlySet<string>): string | undefined => {
  const { content } = line.message;
  const calls = typeof content === 'string' ? [] : content.filter(isCall);
  return calls.length ? JSON.stringify({ type: 'assistant', message: { content: calls.map((c) => callKept(c, denied)) } }) : undefined;
};

/**
 * What a `claude -p --output-format stream-json --verbose` capture keeps once its session has ended: what the shipped readers read of
 * it, and nothing of the conversation they do not, in the order printed. Kept whole: a line that is no JSON object (stderr, the
 * worker's own words, a line torn mid-write), and each line of a kind `claudeStreamOutput` reads whole — its `result`, its `system`
 * `init` and `permission_denied` lines. An `assistant` line is cut to its `tool_use` blocks, each its id, its tool and its input:
 * whole for a call the stream says was denied, else only the key a reader reads (`READ_INPUT_KEYS`), a command by its first word;
 * one that makes no call is dropped. Every other JSON line is dropped: tool results, partial messages, text and thinking, other
 * `system` lines. A capture kept so keeps the same, and reads the same.
 *
 * Throws, as `claudeStreamOutput` does, when a line of a kind it reads does not decode: a refused capture is kept whole.
 */
export const claudeStreamKept = (output: string): string => {
  const facts: StreamFacts = { events: [], inputs: new Map(), started: false, skills: new Map(), files: new Map(), denied: new Set() };
  for (const printed of decoded(output, STREAM_KINDS)) gather(facts, printed);
  return output
    .split('\n')
    .flatMap((text) => lineKept(text, facts.denied) ?? [])
    .join('\n');
};

/** What a capture keeps of its line `text` (`claudeStreamKept`), the calls `denied` named whole, or nothing. */
const lineKept = (text: string, denied: ReadonlySet<string>): string | undefined => {
  const kind = printedKindOf(text);
  if (kind === undefined) return text;
  if (kind === 'other' || !STREAM_KINDS.includes(kind)) return undefined;
  if (kind !== 'assistant') return text;
  const read = printedLinesOf(text, ['assistant']);
  const line = 'lines' in read ? read.lines[0] : undefined;
  return line?.kind === 'assistant' ? assistantKept(line.line, denied) : undefined;
};

/**
 * What `claude -p --include-partial-messages` says of the text it is writing, in `output`'s whole lines after `before` lines: a
 * message begun, a piece of a text block, a block written whole (`PartialMark`); every other line passes. Or why it is refused
 * (`wrong`), naming the line as numbered in the whole output, when a `stream_event` line does not decode (`printedLinesOf`).
 */
export const claudePartials = (output: string, before: number): { marks: PartialMark[] } | { wrong: string } => {
  const read = printedLinesOf('\n'.repeat(before) + output, ['stream_event']);
  if ('wrong' in read) return read;
  return { marks: read.lines.flatMap(({ line }) => partialMarksOf((line as Printed<'stream_event'>).event)) };
};
