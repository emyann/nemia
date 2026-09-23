/**
 * What a detached session's output says, as a spec's `readOutput` reads it: Codex's `exec --json` stream, `claude -p`'s
 * one result, and `claude -p`'s stream of events — its closeout, what it consumed and cost, whether it spent its budget,
 * and what it was denied. Pure functions of the text.
 */
import type { Denial, Usage } from './domain.ts';
import type { HarnessOutput } from './runner-detached.ts';

/**
 * The item types a Codex `exec --json` stream was seen to carry (0.154.0, seventeen runs): two that
 * are tool calls and one that is said. Any other type cannot be counted either way, so a stream that
 * has one reports no count of tool calls rather than a guessed one.
 */
const CODEX_CALL_ITEMS: readonly string[] = ['command_execution', 'file_change'];
const CODEX_SAID_ITEMS: readonly string[] = ['agent_message'];

/**
 * What a Codex session consumed, read from its `exec --json` stream — measured or absent, never zeros.
 *
 * Tokens come from `turn.completed`, one per prompt run to completion, and only when every turn that
 * started completed with them: a session killed mid-turn has not reported its last one. Nothing is
 * added to `input_tokens` or `output_tokens`: in every run seen, `cached_input_tokens` was below the
 * first and `reasoning_output_tokens` below the second, so each is a part of its total, not beside it.
 * `cache_write_input_tokens` was 0 in every one, so whether `input_tokens` counts it is unknown, and a
 * stream where it is not 0 gives no input count. Tool calls are the call items, counted once by id.
 * No `turns` — it counts model responses, which the stream does not report — and no cost.
 *
 * The input's classes follow from the same counts: `cached_input_tokens` read from the cache, the rest of `input_tokens`
 * uncached, and `cache_write_input_tokens` — 0, as the stream says — written. No peak: a `turn.completed` totals every
 * response of a prompt, and the stream reports none alone (the rollout's `token_count` events do; not read here).
 */
export const codexOutput = (output: string): HarnessOutput => {
  let started = 0;
  const completed: Array<{ input?: number; read?: number; output: number } | null> = [];
  const calls = new Set<string>();
  let uncounted = false;
  for (const line of output.split('\n')) {
    if (!line.includes('"type"')) continue;
    let event: { type?: unknown; usage?: Record<string, unknown>; item?: { id?: unknown; type?: unknown } };
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'turn.started') started++;
    else if (event.type === 'turn.completed') {
      const count = (key: string) => (typeof event.usage?.[key] === 'number' ? (event.usage[key] as number) : undefined);
      const input = count('input_tokens');
      const out = count('output_tokens');
      const read = count('cached_input_tokens');
      completed.push(input === undefined || out === undefined ? null : {
        input: count('cache_write_input_tokens') ? undefined : input,
        ...(read !== undefined && read <= input && count('cache_write_input_tokens') === 0 ? { read } : {}),
        output: out,
      });
    } else if (event.type === 'item.started' || event.type === 'item.completed') {
      const { id, type } = event.item ?? {};
      if (typeof id !== 'string' || typeof type !== 'string') continue;
      if (CODEX_CALL_ITEMS.includes(type)) calls.add(id);
      else if (!CODEX_SAID_ITEMS.includes(type)) uncounted = true;
    }
  }
  if (started === 0 && completed.length === 0) return {};
  const turns = completed.length === started && completed.every((c) => c !== null)
    ? (completed as Array<{ input?: number; read?: number; output: number }>) : undefined;
  const sum = (key: 'input' | 'read') => turns!.reduce((n, t) => n + t[key]!, 0);
  const usage: Usage = {
    ...(uncounted ? {} : { toolCalls: calls.size }),
    ...(turns?.every((t) => t.input !== undefined) ? { inputTokens: sum('input') } : {}),
    ...(turns?.every((t) => t.input !== undefined && t.read !== undefined)
      ? { uncachedTokens: sum('input') - sum('read'), cacheWriteTokens: 0, cacheReadTokens: sum('read') } : {}),
    ...(turns ? { outputTokens: turns.reduce((n, t) => n + t.output, 0) } : {}),
  };
  return Object.keys(usage).length ? { usage } : {};
};

/**
 * What `claude -p --output-format json` says in its one `result` object. The last result line is taken and every other
 * line skipped — the worker captures stderr beside it.
 *
 * The final answer is its `structured_output`, which Claude Code fills when it was given `--json-schema` and the session
 * answered in that shape. No result, a result without the field, or one whose field is `null`, is no answer.
 *
 * What the session cost is its `total_cost_usd`, and the time it waited on the API its `duration_api_ms` (2.1.272). The
 * cost of a `--resume` is not the process's own since 2.1.278: it carries its parent's total on (measured again on
 * 2.1.280: a parent's $0.0209649, and its resume's $0.0257381, the parent's and its own $0.0047732 to the digit — open
 * issue 4). Read here as printed; a spec that knows the parent takes it off (`resumeCostCarried`). The result counts no
 * tool time, and its turns are not read here: `num_turns` counts prompts' turns, not responses.
 *
 * Its tokens are its `usage`'s, in their classes — `input_tokens` uncached, `cache_creation_input_tokens` written,
 * `cache_read_input_tokens` read — and the process's own: on 2.1.278 a `--resume` printed a `usage` of 21,402 input
 * where its `modelUsage` carried its parent's 43,015 on (open issue 4). A `usage` whose input sums to 0 is not a count
 * — every response reads its prompt — and gives none: 2.1.272 printed one beside a `modelUsage` that counted thousands.
 * No peak: `usage.iterations` holds the last response alone, not the largest.
 *
 * A session that stopped at its `--max-budget-usd` says so as its `subtype`, `error_max_budget_usd` — measured on 2.1.272
 * at a $0.01 cap: exit 1, `is_error`, `terminal_reason: budget_exhausted`, "Reached maximum budget ($0.01)", and a
 * `total_cost_usd` of $0.018, since the cap is checked after the response that crosses it.
 *
 * What it was denied is its `permission_denials`, one `{tool_name, tool_use_id, tool_input}` for each tool call Claude
 * Code refused without asking (2.1.280, in every permission mode: under `-p` nothing waits on a prompt, and the session
 * carries on past the refusal). Read as `denialOf` words it, one per call, in the order given.
 */
export const claudeResultOutput = (output: string): HarnessOutput => readClaude(output, [], new Map());

/**
 * `claudeResultOutput`, with the denials a stream named before its result (`claudeStreamOutput`) joined ahead of the
 * result's own. Everything else is the result's alone, and a stream with no result says only what it denied.
 */
const readClaude = (output: string, denied: readonly unknown[], inputs: ReadonlyMap<string, unknown>): HarnessOutput => {
  let result: { type?: unknown; subtype?: unknown; structured_output?: unknown; total_cost_usd?: unknown; duration_api_ms?: unknown; usage?: Record<string, unknown>; permission_denials?: unknown } | undefined;
  for (const line of output.split('\n')) {
    if (!line.includes('"result"')) continue;
    try {
      const parsed = JSON.parse(line) as typeof result;
      if (parsed?.type === 'result') result = parsed;
    } catch { /* not the result line */ }
  }
  if (!result) {
    const denials = deniedCalls(denied, inputs);
    return denials.length ? { denials } : {};
  }
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const [costUsd, apiMs] = [n(result.total_cost_usd), n(result.duration_api_ms)];
  const [uncachedTokens, cacheWriteTokens, cacheReadTokens, outputTokens] = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens']
    .map((key) => n(result.usage?.[key]));
  const tokens = uncachedTokens !== undefined && cacheWriteTokens !== undefined && cacheReadTokens !== undefined && outputTokens !== undefined
    && uncachedTokens + cacheWriteTokens + cacheReadTokens > 0
    ? { inputTokens: uncachedTokens + cacheWriteTokens + cacheReadTokens, uncachedTokens, cacheWriteTokens, cacheReadTokens, outputTokens }
    : {};
  const usage: Usage = { ...tokens, ...(costUsd !== undefined ? { costUsd } : {}), ...(apiMs !== undefined ? { apiMs } : {}) };
  const denials = deniedCalls([...denied, ...(Array.isArray(result.permission_denials) ? result.permission_denials : [])], inputs);
  return {
    ...(result.structured_output != null ? { closeout: { payload: result.structured_output } } : {}),
    ...(Object.keys(usage).length ? { usage } : {}),
    ...(result.subtype === 'error_max_budget_usd' ? { budgetSpent: true as const } : {}),
    ...(denials.length ? { denials } : {}),
  };
};

/** The tools whose calls name one file, and the key of their input that names it. */
const FILE_KEYS: Readonly<Record<string, string>> = { Read: 'file_path', Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' };

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
  const what = tool === 'Bash' ? at('command')?.split(/\s+/)[0]
    : tool === 'Skill' ? at('skill')
    : FILE_KEYS[tool] ? at(FILE_KEYS[tool]!) : undefined;
  return what ? { tool, what } : { tool };
};

/**
 * Denied calls, each once by its `tool_use_id`, in the order first given: `{tool_name, tool_use_id, tool_input?}` as a
 * result's `permission_denials` and a `permission_denied` event write them. An entry with no input takes the one its
 * call was made with (`inputs`, by id), or else the one a later entry for the same call gives. One that names no tool is
 * not a denial anyone can read, and is skipped.
 */
const deniedCalls = (entries: readonly unknown[], inputs: ReadonlyMap<string, unknown>): Denial[] => {
  const seen = new Map<string, { denial: Denial; input: unknown }>();
  let unnamed = 0;
  for (const entry of entries) {
    const { tool_name: tool, tool_use_id: id, tool_input: given } = (entry ?? {}) as Record<string, unknown>;
    if (typeof tool !== 'string' || !tool) continue;
    const key = typeof id === 'string' && id ? id : `(no id ${++unnamed})`;
    const input = given ?? inputs.get(key);
    // Named again, its place stays the first; an input the first naming lacked is taken from the later one.
    const first = seen.get(key);
    if (!first || (first.input === undefined && input !== undefined)) seen.set(key, { denial: denialOf(first?.denial.tool ?? tool, input), input });
  }
  return [...seen.values()].map((d) => d.denial);
};

/**
 * What `claude -p --output-format stream-json --verbose` says: every event of the session, one JSON object a line, the
 * last of them its `result` — read by `claudeResultOutput`, as the one line of `--output-format json` is.
 *
 * What it was denied is read off the stream as well as the result, so a session killed before its result still says
 * it: each `{"type":"system","subtype":"permission_denied","tool_name","tool_use_id",…}` event (2.1.280), which names
 * no input — the input is the one the assistant's `tool_use` block of the same id was called with. Joined with the
 * result's `permission_denials`, one per call, in the order the stream first named each.
 */
export const claudeStreamOutput = (output: string): HarnessOutput => {
  const events: unknown[] = [];
  for (const line of output.split('\n')) {
    if (!line.includes('"permission_denied"')) continue;
    try {
      const e = JSON.parse(line) as { type?: unknown; subtype?: unknown };
      if (e?.type === 'system' && e.subtype === 'permission_denied') events.push(e);
    } catch { /* not an event */ }
  }
  const wanted = new Set(events.map((e) => (e as { tool_use_id?: unknown }).tool_use_id).filter((id): id is string => typeof id === 'string'));
  const inputs = new Map<string, unknown>();
  if (wanted.size) {
    for (const line of output.split('\n')) {
      if (!line.includes('"tool_use"') || ![...wanted].some((id) => line.includes(id))) continue;
      try {
        const e = JSON.parse(line) as { type?: unknown; message?: { content?: unknown } };
        if (e?.type !== 'assistant' || !Array.isArray(e.message?.content)) continue;
        for (const block of e.message.content as Array<Record<string, unknown>>) {
          if (block?.type === 'tool_use' && typeof block.id === 'string' && wanted.has(block.id)) inputs.set(block.id, block.input);
        }
      } catch { /* not an event */ }
    }
  }
  return readClaude(output, events, inputs);
};
