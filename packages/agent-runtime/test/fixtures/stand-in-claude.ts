/**
 * A stand-in for Claude Code as the Agent SDK runs it (`pathToClaudeCodeExecutable`), speaking the SDK's stdio protocol as
 * `@anthropic-ai/claude-agent-sdk` 0.3.316 does: control requests both ways (`initialize`, `hook_callback`, `can_use_tool`,
 * `interrupt`, `remote_control`, `get_usage` — that one answered by `usageAnswer` from the recorded answer `STANDIN_USAGE` names,
 * after `STANDIN_USAGE_MS`), and stream-json lines out. What it does is its plan, `STANDIN_PLAN` (`Plan`), and what it saw it
 * writes into `STANDIN_DIR`: `argv.jsonl` (each start's arguments), `initialize.jsonl` (each `initialize` request's payload, the
 * system prompt the SDK sends included), `said.jsonl` (each user message's text), `asked.jsonl` (each hook it asked, as it asks),
 * `answers.jsonl` (each answer to a control request it sent), `taken.jsonl` (each control request the SDK sent it, by subtype, with
 * what it carried), `env.json` (the environment it was started with, whole) and `pid` (its own, on each start).
 *
 * `STANDIN_POST_LOG` has it post one `api_request` log to the collector its own environment names, before its result, as Claude
 * Code exports from the environment it is given (`postLog`).
 *
 * Its session id is `stand-in-session`, its plan's `id` where it gives one, or the one `--resume=<id>` names, as the SDK writes it.
 *
 * Its cost is Claude Code's as the SDK documents `total_cost_usd` (`sdk.d.ts:6100-6103`) and `docs/harness.md` measures it: a running
 * total of this process, each turn charged its plan's `cost` as it starts — so an interrupted turn has spent it — and each result
 * printing the total so far. Once its stdin ends, after the turn an interrupt cut prints its result, it saves that total as a
 * `cost-state` line in `cost-state.jsonl` of its folder, where Claude Code saves one in its transcript; a `--resume=<id>` starts
 * from the last total saved for that session, and a process killed saves nothing, so its resume starts from nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

/**
 * What the stand-in does after each user message, in order: `deny`, print a `permission_denied` line for that tool; `ask`, send
 * a `can_use_tool` request for that tool; `call`, run that tool, its `PreToolUse` hooks asked first, held until the file `release`
 * appears in its folder or until an `interrupt` request comes, which ends the turn with that call still held and unanswered, as
 * Claude Code leaves it; `nested`, once the file `nest` appears, ask the `PreToolUse` hooks of a second call of that tool, while
 * `call`'s is still in flight and before its release, carrying `agent_id` as a sub-agent's call does where `fromSubAgent`; `hold`,
 * wait until the file `end` appears, or until an `interrupt` request comes; then its result, `output` as its `structured_output`, and
 * `cost` what the turn adds to the running total its `total_cost_usd` prints (0.01 when absent).
 *
 * `stream` makes it print, before its result and only when its argv carries `--include-partial-messages` — the argument the SDK
 * passes for `includePartialMessages` — a message begun, a text block opened, one piece of text, then, once the file `more` appears
 * in its folder, a second piece and the block written whole; interrupted at `more`, it prints neither, so its open block is left for
 * the result to close. `transcript` has it write what it said as a line of Claude Code's own transcript, under
 * `$CLAUDE_CONFIG_DIR/projects/stand-in/<sessionId>.jsonl`, before the result. `id` is the session id it answers under, so two
 * sessions of one test process keep their transcripts apart.
 *
 * `turns` says what it does after its first result: `one`, close its stdin as a job does, and `many`, keep it open and work each
 * further user message as another turn, as a session on streaming input does. `fold` works a message that came while a turn ran into
 * that turn instead, as Claude Code does for words pushed while a tool call runs: one result, listing every message it consumed on
 * `user_message_uuids`, and no turn of its own.
 */
type Plan = {
  id?: string;
  stream?: boolean;
  transcript?: boolean;
  deny?: string;
  ask?: string;
  /** The input the `can_use_tool` request for `ask` carries; `{}` when none. */
  askInput?: unknown;
  call?: string;
  /** The `tool_input` the `PreToolUse` hooks of `call` are given; absent when none. */
  callInput?: unknown;
  nested?: string;
  fromSubAgent?: boolean;
  hold?: boolean;
  fold?: boolean;
  output?: unknown;
  cost?: number;
  turns?: 'one' | 'many';
};

const dir = process.env.STANDIN_DIR!;
const plan = JSON.parse(process.env.STANDIN_PLAN ?? '{}') as Plan;
const argv = process.argv.slice(2);
const resumed = argv.find((a) => a.startsWith('--resume='))?.slice('--resume='.length);
const sessionId = resumed ?? plan.id ?? 'stand-in-session';
const note = (file: string, value: unknown) => fs.appendFileSync(path.join(dir, file), `${JSON.stringify(value)}\n`);
note('argv.jsonl', argv);
fs.writeFileSync(path.join(dir, 'pid'), String(process.pid));
fs.writeFileSync(path.join(dir, 'env.json'), JSON.stringify(process.env));

/** Where the stand-in saves its running total on a clean exit, a `cost-state` line per exit, as Claude Code's transcript keeps it. */
const COST_STATE = path.join(dir, 'cost-state.jsonl');

/** The running total of the session `id` saved by the last process of it that exited cleanly: nothing where none did. */
const savedCost = (id: string | undefined): number => {
  if (id === undefined || !fs.existsSync(COST_STATE)) return 0;
  const saved = fs
    .readFileSync(COST_STATE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { sessionId: string; totalCostUSD: number })
    .filter((l) => l.sessionId === id);
  return saved.at(-1)?.totalCostUSD ?? 0;
};

/** What this process's session has cost so far: a resume's saved total carried on, and each turn's `cost` as it starts. */
let spent = savedCost(resumed);

const print = (line: object) => process.stdout.write(`${JSON.stringify(line)}\n`);
const pending = new Map<string, (response: unknown) => void>();
let hooks: Record<string, { hookCallbackIds: string[] }[]> = {};
let asked = 0;

/** Sends a control request and waits for the SDK's answer. */
const ask = (request: object): Promise<unknown> => {
  const id = `standin-${++asked}`;
  print({ type: 'control_request', request_id: id, request });
  return new Promise((resolve) => pending.set(id, resolve));
};

/** Whether the turn in flight was interrupted, set by the SDK's `interrupt` control request and read by the turn. */
let interrupted = false;

/** Waits until `file` appears in the stand-in's folder, and takes it so the next turn waits for its own; nothing once interrupted. */
const appears = async (file: string) => {
  for (;;) {
    if (interrupted) return;
    if (fs.existsSync(path.join(dir, file))) {
      fs.rmSync(path.join(dir, file), { force: true });
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
};

/** Asks each hook of `event` for the call `id` of `tool`, in turn, `more` added to the input each is given. */
const hooked = async (event: string, tool: string, id: string, more: object = {}) => {
  for (const matcher of hooks[event] ?? [])
    for (const callback of matcher.hookCallbackIds) {
      note('asked.jsonl', event);
      note('answers.jsonl', {
        event,
        answer: await ask({
          subtype: 'hook_callback',
          callback_id: callback,
          tool_use_id: id,
          input: { hook_event_name: event, tool_name: tool, ...more },
        }),
      });
    }
};

/**
 * One `api_request` log posted to the collector its own environment names, as Claude Code exports from the environment it was
 * started in: the resource attributes of `OTEL_RESOURCE_ATTRIBUTES` and the trace of `TRACEPARENT`, read off that environment and
 * nothing else. Nothing where it names no collector.
 */
const postLog = async (): Promise<void> => {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  const attributes = (process.env.OTEL_RESOURCE_ATTRIBUTES ?? '')
    .split(',')
    .filter(Boolean)
    .map((pair) => {
      const at = pair.indexOf('=');
      return { key: pair.slice(0, at), value: { stringValue: decodeURIComponent(pair.slice(at + 1)) } };
    });
  const traceId = (process.env.TRACEPARENT ?? '').split('-')[1] ?? '';
  await fetch(`${endpoint}/v1/logs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      resourceLogs: [{ resource: { attributes }, scopeLogs: [{ logRecords: [{ body: { stringValue: 'api_request' }, traceId }] }] }],
    }),
  });
};

/**
 * Waits until the turn in flight is interrupted, or until `held` settles, whichever comes first: a call held at its hooks when an
 * interrupt comes is left unanswered, as Claude Code leaves it, and the turn ends all the same with a result of its own.
 */
const cutOff = async (held: Promise<unknown>) => {
  let over = false;
  void held.then(() => {
    over = true;
  });
  for (;;) {
    if (interrupted || over) return;
    await new Promise((r) => setTimeout(r, 50));
  }
};

/** The uuids of the user messages the turn in flight consumed: the one it took, and any it folded in as it ended. */
let mine: string[] = [];

/**
 * One turn's work, once a user message came. An interrupted turn's result carries `errors`: the SDK reads them off a result whose
 * subtype is not `success`, and throws as it reads the stream without them.
 */
const work = async () => {
  print({ type: 'system', subtype: 'init', session_id: sessionId, cwd: process.cwd(), tools: [], model: 'stand-in' });
  spent += plan.cost ?? 0.01;
  if (plan.deny) print({ type: 'system', subtype: 'permission_denied', tool_name: plan.deny, tool_use_id: 'denied-1', session_id: sessionId });
  if (plan.ask)
    note('answers.jsonl', {
      event: 'can_use_tool',
      answer: await ask({ subtype: 'can_use_tool', tool_name: plan.ask, input: plan.askInput ?? {}, tool_use_id: 'asked-1' }),
    });
  if (plan.call && !interrupted) {
    print({ type: 'assistant', session_id: sessionId, message: { role: 'assistant', content: [{ type: 'tool_use', id: 'call-1', name: plan.call, input: {} }] } });
    await cutOff(hooked('PreToolUse', plan.call, 'call-1', plan.callInput === undefined ? {} : { tool_input: plan.callInput }));
  }
  if (plan.nested) {
    await appears('nest');
    await hooked('PreToolUse', plan.nested, 'call-2', plan.fromSubAgent ? { agent_id: 'stand-in-sub-agent' } : {});
  }
  if (plan.call && !interrupted) {
    await appears('release');
  }
  if (plan.call && !interrupted) {
    await hooked('PostToolUse', plan.call, 'call-1');
    print({ type: 'user', session_id: sessionId, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'ok' }] } });
  }
  if (plan.stream && argv.includes('--include-partial-messages')) await streamed();
  if (plan.transcript) wrote();
  if (plan.hold) await appears('end');
  if (process.env.STANDIN_POST_LOG) await postLog();
  const cut = interrupted;
  interrupted = false;
  if (plan.fold) mine = [...mine, ...queued.splice(0).map((q) => q.uuid)];
  print({
    type: 'result',
    user_message_uuids: mine,
    subtype: cut ? 'error_during_execution' : 'success',
    is_error: cut,
    ...(cut ? { errors: ['Interrupted by user'] } : {}),
    session_id: sessionId,
    num_turns: 1,
    total_cost_usd: spent,
    usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 },
    ...(plan.output !== undefined ? { structured_output: plan.output } : {}),
  });
};

/** The two pieces of text the stand-in writes, and the whole its transcript keeps. */
const SAID = ['Half ', 'a thought'];

/** One `stream_event` line, as `claude -p --include-partial-messages` prints it. */
const streamEvent = (event: object) =>
  print({ type: 'stream_event', uuid: `stream-${sessionId}`, session_id: sessionId, parent_tool_use_id: null, event });

/**
 * The text written as it is written: a message begun, a block opened, the first piece, then — unless the turn was interrupted while
 * it waited for `more` — the second piece and the block written whole.
 */
const streamed = async () => {
  streamEvent({ type: 'message_start', message: { id: `msg_${sessionId}` } });
  streamEvent({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  streamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: SAID[0] } });
  await appears('more');
  if (interrupted) return;
  streamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: SAID[1] } });
  streamEvent({ type: 'content_block_stop', index: 0 });
};

/** What it said, written as a line of Claude Code's own transcript, where a follow and `transcript` read it. */
const wrote = () => {
  const at = path.join(process.env.CLAUDE_CONFIG_DIR ?? '', 'projects', 'stand-in');
  fs.mkdirSync(at, { recursive: true });
  fs.appendFileSync(
    path.join(at, `${sessionId}.jsonl`),
    `${JSON.stringify({
      type: 'assistant',
      uuid: `said-${sessionId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      message: { id: `msg_${sessionId}`, role: 'assistant', content: [{ type: 'text', text: SAID.join('') }] },
    })}\n`,
  );
};

/** The bridge's facts a `remote_control` request is answered with, and the `bridge_state` messages it drives onto the stream. */
const bridged = (request: { enabled?: unknown; reattach_session_id?: unknown }): object => {
  const kept = typeof request.reattach_session_id === 'string' ? request.reattach_session_id : undefined;
  const id = kept ?? `cse_${sessionId}`;
  setTimeout(() => {
    print({ type: 'system', subtype: 'bridge_state', session_id: sessionId, state: 'ready' });
    print({ type: 'system', subtype: 'bridge_state', session_id: sessionId, state: 'connected' });
  }, 10);
  return {
    session_url: `https://claude.ai/s/${id}`,
    connect_url: `https://claude.ai/connect/${id}`,
    environment_id: 'env-stand-in',
    bridge_epoch: 1,
    bridge_session_id: id,
  };
};

/** The answer to a control request the SDK sent, by its subtype: what the stand-in says back as its `response`. */
const answered = (request: { subtype?: string; hooks?: typeof hooks } & Record<string, unknown>): object => {
  note('taken.jsonl', { subtype: request.subtype ?? null, ...request });
  if (request.subtype === 'initialize') {
    hooks = request.hooks ?? {};
    note('initialize.jsonl', request);
  }
  if (request.subtype === 'interrupt') {
    interrupted = true;
    return { still_queued: [] };
  }
  if (request.subtype !== 'initialize' && process.env.STANDIN_NO_BRIDGE !== '1') return bridged(request as Parameters<typeof bridged>[0]);
  return {};
};

let working = false;
let everStarted = false;
const queued: { text: string; uuid: string }[] = [];

/**
 * Works the next queued user message, one turn at a time, so a second message waits for the turn in flight. A plan whose session is
 * one turn (`turns` other than `many`) works its first message and no other, as a job does.
 */
const next = () => {
  if (working || queued.length === 0 || (everStarted && plan.turns !== 'many')) return;
  mine = [queued.shift()!.uuid];
  working = true;
  everStarted = true;
  void work().then(() => {
    working = false;
    next();
  });
};

/**
 * The usage of the recorded answer `STANDIN_USAGE` names, as Claude Code answers a `get_usage` control request, under the request's
 * own id and after the wait `STANDIN_USAGE_MS` asks for (none by default): a wait longer than the asker's own makes a stand-in that
 * is started and never answers, which the asker must still let go of.
 */
const usageAnswer = async (id: string | undefined): Promise<void> => {
  const waitMs = Number(process.env.STANDIN_USAGE_MS ?? 0);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  const recorded = JSON.parse(fs.readFileSync(process.env.STANDIN_USAGE!, 'utf8')) as { response: { response: object } };
  print({ type: 'control_response', response: { subtype: 'success', request_id: id, response: recorded.response.response } });
};

readline.createInterface({ input: process.stdin }).on('line', (text) => {
  const line = JSON.parse(text) as { type: string; uuid?: string; request_id?: string; request?: { subtype: string; hooks?: typeof hooks }; response?: { request_id: string; response?: unknown }; message?: { content: unknown } };
  if (line.type === 'control_request' && line.request?.subtype === 'get_usage') void usageAnswer(line.request_id);
  else if (line.type === 'control_request')
    print({ type: 'control_response', response: { subtype: 'success', request_id: line.request_id, response: answered(line.request ?? {}) } });
  else if (line.type === 'control_response') pending.get(line.response!.request_id)?.(line.response!.response);
  else if (line.type === 'user') {
    note('said.jsonl', line.message?.content);
    queued.push({ text: String(line.message?.content ?? ''), uuid: String(line.uuid ?? '') });
    next();
  }
}).on('close', () => void ended());

/**
 * Ends this process cleanly, its running total saved where a resume reads it: at once, or once the turn an interrupt cut has printed
 * its result. A turn in flight that no interrupt cut is not waited for, as a job's stdin ends at its result.
 */
const ended = async () => {
  for (;;) {
    if (!working || !interrupted) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  if (everStarted) fs.appendFileSync(COST_STATE, `${JSON.stringify({ type: 'cost-state', sessionId, totalCostUSD: spent })}\n`);
  process.exit(0);
};
