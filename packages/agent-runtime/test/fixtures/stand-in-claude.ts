/**
 * A stand-in for Claude Code as the Agent SDK runs it (`pathToClaudeCodeExecutable`), speaking the SDK's stdio protocol as
 * `@anthropic-ai/claude-agent-sdk` 0.3.270 does: control requests both ways (`initialize`, `hook_callback`, `can_use_tool`,
 * `interrupt`, `remote_control`), and stream-json lines out. What it does is its plan, `STANDIN_PLAN` (`Plan`), and what it saw it
 * writes into `STANDIN_DIR`: `argv.jsonl` (each start's arguments), `said.jsonl` (each user message's text), `asked.jsonl` (each hook
 * it asked, as it asks), `answers.jsonl` (each answer to a control request it sent), `taken.jsonl` (each control request the SDK sent
 * it, by subtype, with what it carried) and `pid` (its own, on each start).
 *
 * Its session id is `stand-in-session`, or the one `--resume=<id>` names, as the SDK writes it.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

/**
 * What the stand-in does after each user message, in order: `deny`, print a `permission_denied` line for that tool; `ask`, send
 * a `can_use_tool` request for that tool; `call`, run that tool, its `PreToolUse` hooks asked first, held until the file `release`
 * appears in its folder; `hold`, wait until the file `end` appears, or until an `interrupt` request comes; then its result, `output` as
 * its `structured_output` and `cost` as its `total_cost_usd` (0.01 when absent).
 *
 * `turns` says what it does after its first result: `one`, close its stdin as a job does, and `many`, keep it open and work each
 * further user message as another turn, as a session on streaming input does.
 */
type Plan = { deny?: string; ask?: string; call?: string; hold?: boolean; output?: unknown; cost?: number; turns?: 'one' | 'many' };

const dir = process.env.STANDIN_DIR!;
const plan = JSON.parse(process.env.STANDIN_PLAN ?? '{}') as Plan;
const argv = process.argv.slice(2);
const resumed = argv.find((a) => a.startsWith('--resume='))?.slice('--resume='.length);
const sessionId = resumed ?? 'stand-in-session';
const note = (file: string, value: unknown) => fs.appendFileSync(path.join(dir, file), `${JSON.stringify(value)}\n`);
note('argv.jsonl', argv);
fs.writeFileSync(path.join(dir, 'pid'), String(process.pid));

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

/** Waits until `file` appears in the stand-in's folder, or the turn is interrupted. */
const appears = async (file: string) => {
  while (!fs.existsSync(path.join(dir, file)) && !interrupted) await new Promise((r) => setTimeout(r, 50));
};

/** Asks each hook of `event` for the call `id` of `tool`, in turn. */
const hooked = async (event: string, tool: string, id: string) => {
  for (const matcher of hooks[event] ?? [])
    for (const callback of matcher.hookCallbackIds) {
      note('asked.jsonl', event);
      note('answers.jsonl', {
        event,
        answer: await ask({ subtype: 'hook_callback', callback_id: callback, tool_use_id: id, input: { hook_event_name: event, tool_name: tool } }),
      });
    }
};

/** One turn's work, once a user message came. */
const work = async () => {
  print({ type: 'system', subtype: 'init', session_id: sessionId, cwd: process.cwd(), tools: [], model: 'stand-in' });
  if (plan.deny) print({ type: 'system', subtype: 'permission_denied', tool_name: plan.deny, tool_use_id: 'denied-1', session_id: sessionId });
  if (plan.ask)
    note('answers.jsonl', { event: 'can_use_tool', answer: await ask({ subtype: 'can_use_tool', tool_name: plan.ask, input: {}, tool_use_id: 'asked-1' }) });
  if (plan.call && !interrupted) {
    print({ type: 'assistant', session_id: sessionId, message: { role: 'assistant', content: [{ type: 'tool_use', id: 'call-1', name: plan.call, input: {} }] } });
    await hooked('PreToolUse', plan.call, 'call-1');
    await appears('release');
    await hooked('PostToolUse', plan.call, 'call-1');
    print({ type: 'user', session_id: sessionId, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'ok' }] } });
  }
  if (plan.hold) await appears('end');
  const cut = interrupted;
  interrupted = false;
  print({
    type: 'result',
    subtype: cut ? 'error_during_execution' : 'success',
    is_error: cut,
    ...(cut ? { errors: ['Interrupted by user'] } : {}),
    session_id: sessionId,
    num_turns: 1,
    total_cost_usd: plan.cost ?? 0.01,
    usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 },
    ...(plan.output !== undefined ? { structured_output: plan.output } : {}),
  });
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
  if (request.subtype === 'initialize') hooks = request.hooks ?? {};
  if (request.subtype === 'interrupt') {
    interrupted = true;
    return { still_queued: [] };
  }
  if (request.subtype !== 'initialize' && process.env.STANDIN_NO_BRIDGE !== '1') return bridged(request as Parameters<typeof bridged>[0]);
  return {};
};

let working = false;
let everStarted = false;
const queued: string[] = [];

/**
 * Works the next queued user message, one turn at a time, so a second message waits for the turn in flight. A plan whose session is
 * one turn (`turns` other than `many`) works its first message and no other, as a job does.
 */
const next = () => {
  if (working || queued.length === 0 || (everStarted && plan.turns !== 'many')) return;
  queued.shift();
  working = true;
  everStarted = true;
  void work().then(() => {
    working = false;
    next();
  });
};

readline.createInterface({ input: process.stdin }).on('line', (text) => {
  const line = JSON.parse(text) as { type: string; request_id?: string; request?: { subtype: string; hooks?: typeof hooks }; response?: { request_id: string; response?: unknown }; message?: { content: unknown } };
  if (line.type === 'control_request')
    print({ type: 'control_response', response: { subtype: 'success', request_id: line.request_id, response: answered(line.request ?? {}) } });
  else if (line.type === 'control_response') pending.get(line.response!.request_id)?.(line.response!.response);
  else if (line.type === 'user') {
    note('said.jsonl', line.message?.content);
    queued.push(String(line.message?.content ?? ''));
    next();
  }
}).on('close', () => process.exit(0));
