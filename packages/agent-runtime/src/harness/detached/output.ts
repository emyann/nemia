/**
 * What a detached session's output says, as a spec's `readOutput` reads it: `claude -p`'s one result, and `claude -p`'s stream
 * of events — its closeout, what it consumed and cost, whether it spent its budget, what it was denied, and, off the stream,
 * the skills it loaded and the files it touched. Pure functions of the text. Codex's `exec --json` stream is read by `codexOutput` (`harness/codex/stream.ts`).
 */
import path from 'node:path';
import type { Denial, Usage } from '../../core/index.ts';
import type { HarnessOutput } from './detached.ts';

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
 */
export const claudeResultOutput = (output: string): HarnessOutput => readClaude(output, [], new Map());

/**
 * `claudeResultOutput`, with the denials a stream named before its result (`claudeStreamOutput`) joined ahead of the
 * result's own. Everything else is the result's alone, and a stream with no result says only what it denied. A line that
 * is not JSON is passed over, and the last `result` line is the one read.
 */
const readClaude = (output: string, denied: readonly unknown[], inputs: ReadonlyMap<string, unknown>): HarnessOutput => {
  let result:
    | {
        type?: unknown;
        subtype?: unknown;
        structured_output?: unknown;
        total_cost_usd?: unknown;
        duration_api_ms?: unknown;
        usage?: Record<string, unknown>;
        permission_denials?: unknown;
      }
    | undefined;
  for (const line of output.split('\n')) {
    if (!line.includes('"result"')) continue;
    try {
      const parsed = JSON.parse(line) as typeof result;
      if (parsed?.type === 'result') result = parsed;
    } catch {}
  }
  if (!result) {
    const denials = deniedCalls(denied, inputs);
    return denials.length ? { denials } : {};
  }
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const [costUsd, apiMs] = [n(result.total_cost_usd), n(result.duration_api_ms)];
  const [uncachedTokens, cacheWriteTokens, cacheReadTokens, outputTokens] = [
    'input_tokens',
    'cache_creation_input_tokens',
    'cache_read_input_tokens',
    'output_tokens',
  ].map((key) => n(result.usage?.[key]));
  const tokens =
    uncachedTokens !== undefined &&
    cacheWriteTokens !== undefined &&
    cacheReadTokens !== undefined &&
    outputTokens !== undefined &&
    uncachedTokens + cacheWriteTokens + cacheReadTokens > 0
      ? {
          inputTokens: uncachedTokens + cacheWriteTokens + cacheReadTokens,
          uncachedTokens,
          cacheWriteTokens,
          cacheReadTokens,
          outputTokens,
        }
      : {};
  const usage: Usage = { ...tokens, ...(costUsd !== undefined ? { costUsd } : {}), ...(apiMs !== undefined ? { apiMs } : {}) };
  const denials = deniedCalls([...denied, ...(Array.isArray(result.permission_denials) ? result.permission_denials : [])], inputs);
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
 * A denied call as a person reads it, and as a permission rule would name it: a command by its first word
 * (`Bash(pytest)`), a skill by its name (`Skill(look)`), a file tool by its path. Any other tool, or an input that says
 * none of these, is the tool alone — never a guess at what the rest of its input meant.
 */
export const denialOf = (tool: string, input: unknown): Denial => {
  const at = (key: string): string | undefined => {
    const v = (input as Record<string, unknown> | null | undefined)?.[key];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  const what =
    tool === 'Bash' ? at('command')?.split(/\s+/)[0] : tool === 'Skill' ? at('skill') : FILE_KEYS[tool] ? at(FILE_KEYS[tool]) : undefined;
  return what ? { tool, what } : { tool };
};

/**
 * Denied calls, each once by its `tool_use_id`, in the order first given: `{tool_name, tool_use_id, tool_input?}` as a
 * result's `permission_denials` and a `permission_denied` event write them. An entry with no input takes the one its
 * call was made with (`inputs`, by id), or else the one a later entry for the same call gives: a call named again keeps
 * the place of its first naming. One that names no tool is not a denial anyone can read, and is skipped.
 */
const deniedCalls = (entries: readonly unknown[], inputs: ReadonlyMap<string, unknown>): Denial[] => {
  const seen = new Map<string, { denial: Denial; input: unknown }>();
  let unnamed = 0;
  for (const entry of entries) {
    const { tool_name: tool, tool_use_id: id, tool_input: given } = (entry ?? {}) as Record<string, unknown>;
    if (typeof tool !== 'string' || !tool) continue;
    const key = typeof id === 'string' && id ? id : `(no id ${++unnamed})`;
    const input = given ?? inputs.get(key);
    const first = seen.get(key);
    if (!first || (first.input === undefined && input !== undefined))
      seen.set(key, { denial: denialOf(first?.denial.tool ?? tool, input), input });
  }
  return [...seen.values()].map((d) => d.denial);
};

/**
 * What `claude -p --output-format stream-json --verbose` says: every event of the session, one JSON object a line, the
 * last of them its `result` — read by `claudeResultOutput`, as the one line of `--output-format json` is.
 *
 * What it was denied is read off the stream as well as the result, so a session killed before its result still says
 * it: each `{"type":"system","subtype":"permission_denied","tool_name","tool_use_id",…}` event, which names no input —
 * the input is the one the assistant's `tool_use` block of the same id was called with. Joined with the result's
 * `permission_denials`, one per call, in the order the stream first named each. A line that is not JSON is passed over.
 *
 * The skills it loaded are read off the stream alone (`loadedSkills`), and said only by a stream with its `init` line; the files
 * it read or wrote (`touchedFiles`), only by one whose `init` line names its folder.
 */
export const claudeStreamOutput = (output: string): HarnessOutput => {
  const { events, inputs } = streamDenials(output);
  const skills = loadedSkills(output);
  const files = touchedFiles(output);
  return { ...readClaude(output, events, inputs), ...(skills ? { skills } : {}), ...(files ? { files } : {}) };
};

/**
 * A stream's `permission_denied` events, in the order given, and the input each denied call was made with, by its id
 * (`callInputs`).
 */
const streamDenials = (output: string): { events: unknown[]; inputs: Map<string, unknown> } => {
  const events: unknown[] = [];
  for (const line of output.split('\n')) {
    if (!line.includes('"permission_denied"')) continue;
    const e = parsedLine(line);
    if (e?.type === 'system' && e.subtype === 'permission_denied') events.push(e);
  }
  const wanted = new Set(events.map((e) => (e as { tool_use_id?: unknown }).tool_use_id).filter((id) => typeof id === 'string'));
  return { events, inputs: wanted.size ? callInputs(output, wanted) : new Map() };
};

/** The input each call of the ids `wanted` was made with: the input of the assistant's `tool_use` block of that id. */
const callInputs = (output: string, wanted: ReadonlySet<string>): Map<string, unknown> => {
  const inputs = new Map<string, unknown>();
  for (const line of output.split('\n')) {
    if (!line.includes('"tool_use"') || ![...wanted].some((id) => line.includes(id))) continue;
    const e = parsedLine(line);
    if (e?.type !== 'assistant' || !Array.isArray(e.message?.content)) continue;
    for (const block of e.message.content as Array<Record<string, unknown> | null>) {
      if (block?.type === 'tool_use' && typeof block.id === 'string' && wanted.has(block.id)) inputs.set(block.id, block.input);
    }
  }
  return inputs;
};

/** A line of a stream, as far as its type, its folder, its denials and the calls it makes are read off it. */
type StreamLine = {
  type?: unknown;
  subtype?: unknown;
  cwd?: unknown;
  tool_use_id?: unknown;
  permission_denials?: unknown;
  message?: { content?: unknown };
};

/** `line` parsed, when it is a JSON object: anything else is passed over. */
const parsedLine = (line: string): StreamLine | undefined => {
  try {
    const e: unknown = JSON.parse(line);
    return e && typeof e === 'object' ? e : undefined;
  } catch {
    return undefined;
  }
};

/** The calls an assistant's line makes to the tools `named`, each as its `id`, its tool and its input. */
const toolCalls = (e: StreamLine, named: (tool: string) => boolean): Array<[string, string, unknown]> =>
  e.type === 'assistant' && Array.isArray(e.message?.content)
    ? (e.message.content as Array<Record<string, unknown> | null>)
        .filter((b) => b?.type === 'tool_use' && typeof b.name === 'string' && named(b.name) && typeof b.id === 'string')
        .map((b) => [b?.id as string, b?.name as string, b?.input])
    : [];

/** The `Skill` calls an assistant's line makes, each as its `id` and its input. */
const skillCalls = (e: StreamLine): Array<[string, unknown]> => toolCalls(e, (t) => t === 'Skill').map(([id, , input]) => [id, input]);

/** The ids of the calls a line says were denied: a `permission_denied` event's one, or a result's `permission_denials`. */
const deniedIds = (e: StreamLine): unknown[] => {
  if (e.type === 'system' && e.subtype === 'permission_denied') return [e.tool_use_id];
  if (e.type !== 'result' || !Array.isArray(e.permission_denials)) return [];
  return e.permission_denials.map((d: unknown) => (d as { tool_use_id?: unknown } | null)?.tool_use_id);
};

/** The skill a `Skill` call's input names, after its last `:` — a plugin's skill by its bare name — or none. */
const skillNamed = (input: unknown): string | undefined => {
  const v = (input as Record<string, unknown> | null | undefined)?.skill;
  const name = typeof v === 'string' ? v.slice(v.lastIndexOf(':') + 1).trim() : '';
  return name || undefined;
};

/**
 * Each skill a stream's session loaded, once per call by its `id`, in the order first called: the input of an assistant's
 * `Skill` `tool_use` block, a subagent's included, named by `skillNamed`. A call the session was denied, by its event or
 * its result, loaded nothing; a call naming no skill is skipped. Nothing where the stream has no `system` `init` line:
 * no session is known to have started.
 */
const loadedSkills = (output: string): string[] | undefined => {
  const calls = new Map<string, unknown>();
  const denied = new Set<unknown>();
  let started = false;
  for (const line of output.split('\n')) {
    if (!line.includes('"Skill"') && !line.includes('"init"')) continue;
    const e = parsedLine(line);
    if (!e) continue;
    if (e.type === 'system' && e.subtype === 'init') started = true;
    for (const [id, input] of skillCalls(e)) if (!calls.has(id)) calls.set(id, input);
    for (const id of deniedIds(e)) denied.add(id);
  }
  if (!started) return undefined;
  return [...calls].flatMap(([id, input]) => (denied.has(id) ? [] : (skillNamed(input) ?? [])));
};

/** The file a file tool's call names, as `FILE_KEYS` reads it, made relative to `cwd`: none when it names none, or one outside `cwd`. */
const fileIn = (cwd: string, tool: string, input: unknown): string | undefined => {
  const v = (input as Record<string, unknown> | null | undefined)?.[FILE_KEYS[tool]];
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const rel = path.relative(cwd, path.resolve(cwd, v.trim()));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : undefined;
};

/**
 * Each file a stream's session read or wrote through its file tools (`FILE_KEYS`), a subagent's calls included, once, in the
 * order first touched, relative to the folder its `system` `init` line names (`cwd`). A call the session was denied, by its event
 * or its result, touched nothing; a file outside its folder is not counted. Nothing where no `init` line names a folder: no
 * session is known to have started, or no path can be read against it.
 */
const touchedFiles = (output: string): string[] | undefined => {
  const calls = new Map<string, [string, unknown]>();
  const denied = new Set<unknown>();
  let cwd: string | undefined;
  for (const line of output.split('\n')) {
    if (!line.includes('"tool_use"') && !line.includes('"init"') && !line.includes('denied') && !line.includes('"result"')) continue;
    const e = parsedLine(line);
    if (!e) continue;
    if (e.type === 'system' && e.subtype === 'init' && typeof e.cwd === 'string' && e.cwd) cwd ??= e.cwd;
    for (const [id, tool, input] of toolCalls(e, (t) => t in FILE_KEYS)) if (!calls.has(id)) calls.set(id, [tool, input]);
    for (const id of deniedIds(e)) denied.add(id);
  }
  if (cwd === undefined) return undefined;
  const at = cwd;
  const files = [...calls].flatMap(([id, [tool, input]]) => (denied.has(id) ? [] : (fileIn(at, tool, input) ?? [])));
  return [...new Set(files)];
};
