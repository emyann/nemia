/**
 * A stand-in for Claude Code as the Agent SDK runs it (`pathToClaudeCodeExecutable`), speaking the SDK's stdio protocol as
 * `@anthropic-ai/claude-agent-sdk` 0.3.270 does: control requests both ways (`initialize`, `hook_callback`, `can_use_tool`), and
 * stream-json lines out. What it does is its plan, `STANDIN_PLAN` (`Plan`), and what it saw it writes into `STANDIN_DIR`:
 * `argv.jsonl` (each start's arguments), `said.jsonl` (each user message's text), `asked.jsonl` (each hook it asked, as it asks),
 * `answers.jsonl` (each answer to a control request it sent), and `pid` (its own, on each start).
 *
 * Its session id is `stand-in-session`, or the one `--resume=<id>` names, as the SDK writes it.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

/**
 * What the stand-in does after the first user message, in order: `deny`, print a `permission_denied` line for that tool; `ask`, send
 * a `can_use_tool` request for that tool; `call`, run that tool, its `PreToolUse` hooks asked first, held until the file `release`
 * appears in its folder; `hold`, wait until the file `end` appears; then its result, `output` as its `structured_output`.
 */
type Plan = { deny?: string; ask?: string; call?: string; hold?: boolean; output?: unknown };

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

/** Waits until `file` appears in the stand-in's folder. */
const appears = async (file: string) => {
  while (!fs.existsSync(path.join(dir, file))) await new Promise((r) => setTimeout(r, 50));
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

/** The work, once the first user message came. */
const work = async () => {
  print({ type: 'system', subtype: 'init', session_id: sessionId, cwd: process.cwd(), tools: [], model: 'stand-in' });
  if (plan.deny) print({ type: 'system', subtype: 'permission_denied', tool_name: plan.deny, tool_use_id: 'denied-1', session_id: sessionId });
  if (plan.ask)
    note('answers.jsonl', { event: 'can_use_tool', answer: await ask({ subtype: 'can_use_tool', tool_name: plan.ask, input: {}, tool_use_id: 'asked-1' }) });
  if (plan.call) {
    print({ type: 'assistant', session_id: sessionId, message: { role: 'assistant', content: [{ type: 'tool_use', id: 'call-1', name: plan.call, input: {} }] } });
    await hooked('PreToolUse', plan.call, 'call-1');
    await appears('release');
    await hooked('PostToolUse', plan.call, 'call-1');
    print({ type: 'user', session_id: sessionId, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'ok' }] } });
  }
  if (plan.hold) await appears('end');
  print({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: sessionId,
    num_turns: 1,
    total_cost_usd: 0.01,
    usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 },
    ...(plan.output !== undefined ? { structured_output: plan.output } : {}),
  });
};

let started = false;
readline.createInterface({ input: process.stdin }).on('line', (text) => {
  const line = JSON.parse(text) as { type: string; request_id?: string; request?: { subtype: string; hooks?: typeof hooks }; response?: { request_id: string; response?: unknown }; message?: { content: unknown } };
  if (line.type === 'control_request' && line.request?.subtype === 'initialize') hooks = line.request.hooks ?? {};
  if (line.type === 'control_request') print({ type: 'control_response', response: { subtype: 'success', request_id: line.request_id, response: {} } });
  else if (line.type === 'control_response') pending.get(line.response!.request_id)?.(line.response!.response);
  else if (line.type === 'user') {
    note('said.jsonl', line.message?.content);
    if (!started) {
      started = true;
      void work();
    }
  }
}).on('close', () => process.exit(0));
