/**
 * Claude Code as the Agent SDK runs it, for the api's test seat: the stand-in the fake `claude` on PATH hands every call that is not
 * `claude agents`. It speaks the SDK's stdio protocol (`@anthropic-ai/claude-agent-sdk` 0.3.270, as
 * `packages/agent-runtime/test/fixtures/stand-in-claude.ts` speaks it for the runtime's own tests): a line of JSON each way, a
 * `control_request` answered by a `control_response` carrying the request's own id.
 *
 * `initialize`, which the SDK opens every query with, is answered with an empty success; the usage request (`get_usage`, which the
 * runtime's quota asks) is answered with the whole recorded control response the seat left in `STANDIN_ANSWER`, `@ID@` in it replaced
 * by the request's own id, so a fixture recorded from Claude Code 2.1.278 is what the SDK parses; any other subtype is an empty
 * success. It notes each usage request it answered on `STANDIN_CALLS`, which the seat's `asks()` counts, and its end there once its
 * stdin closes, as Claude Code exits on a closed stdin.
 *
 * In `exit` mode (`STANDIN_MODE` reads `exit`) it says the seat's sentence on stderr and exits 3 before reading a line, so a test of
 * that road proves it answered nothing first.
 *
 * With `STANDIN_PLAN` it also works a turn (`Plan`), which is what an attached session needs of it: every other file in the api's
 * suite leaves the variable unset and gets exactly what is above — no turn, no transcript, not a line printed unasked.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const answer = process.env.STANDIN_ANSWER!;
const mode = process.env.STANDIN_MODE;
const calls = process.env.STANDIN_CALLS;

/** What it answered, noted where the seat gave it a file to note on; a session the seat did not spawn through its `claude` has none. */
const note = (line: string): void => {
  if (calls !== undefined) fs.appendFileSync(calls, `${line}\n`);
};

if (mode !== undefined && fs.readFileSync(mode, 'utf8').trim() === 'exit') {
  process.stderr.write('claude: the harness was told to fail\n');
  process.exit(3);
}

const print = (line: object): void => void process.stdout.write(`${JSON.stringify(line)}\n`);

/**
 * The whole control response the seat recorded for a usage request, under `id`, the request's own, as one line: a text left without a
 * line break of its own gains one, since the SDK reads its child's stdout line by line.
 */
const usageAnswered = (id: string): string => {
  const text = fs.readFileSync(answer, 'utf8').replaceAll('@ID@', id);
  return text.endsWith('\n') ? text : `${text}\n`;
};

let answered = 0;

/**
 * What the stand-in does with a user message, when `STANDIN_PLAN` gives it one; with the variable unset there is no plan and a user
 * message is ignored, as it always was.
 *
 * `stream` writes one turn's text in two pieces — the first at once, the second only once the file `more` appears in `STANDIN_DIR` —
 * as `claude -p --include-partial-messages` prints them, which is the argument the Agent SDK passes for an attached session. The wait
 * is what makes a live follow provable: until `more` is written, the files hold nothing of the turn, so text a reader has seen came
 * over the wire and nowhere else. `transcript` has it write what it said as a line of Claude Code's own transcript, under
 * `$CLAUDE_CONFIG_DIR/projects/stand-in/<sessionId>.jsonl`, where a transcript read off the files finds it. `id` is the session id it
 * answers under.
 */
type Plan = { id?: string; stream?: boolean; transcript?: boolean };

const plan = process.env.STANDIN_PLAN === undefined ? undefined : (JSON.parse(process.env.STANDIN_PLAN) as Plan);
const argv = process.argv.slice(2);
const sessionId = argv.find((a) => a.startsWith('--resume='))?.slice('--resume='.length) ?? plan?.id ?? 'stand-in-session';

/** The two pieces of text a planned turn writes, and the whole its transcript keeps. */
const SAID = ['Half ', 'a thought'];

/** One `stream_event` line, as `claude -p --include-partial-messages` prints it. */
const streamEvent = (event: object): void =>
  print({ type: 'stream_event', uuid: `stream-${sessionId}`, session_id: sessionId, parent_tool_use_id: null, event });

/** Waits until `file` appears in the stand-in's folder, and takes it, so a second turn waits for its own. */
const appears = async (file: string): Promise<void> => {
  const at = path.join(process.env.STANDIN_DIR ?? '.', file);
  for (;;) {
    if (fs.existsSync(at)) {
      fs.rmSync(at, { force: true });
      return;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
};

/** What it said, written as a line of Claude Code's own transcript, where a follow and `transcript` read it. */
const wrote = (): void => {
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

/** One turn of the plan: the session begun, its text written in two pieces, its transcript line, and the result that ends the turn. */
const work = async (): Promise<void> => {
  print({ type: 'system', subtype: 'init', session_id: sessionId, cwd: process.cwd(), tools: [], model: 'stand-in' });
  if (plan!.stream && argv.includes('--include-partial-messages')) {
    streamEvent({ type: 'message_start', message: { id: `msg_${sessionId}` } });
    streamEvent({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    streamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: SAID[0] } });
    await appears('more');
    streamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: SAID[1] } });
    streamEvent({ type: 'content_block_stop', index: 0 });
  }
  if (plan!.transcript) wrote();
  print({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: sessionId,
    num_turns: 1,
    total_cost_usd: 0.01,
    usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 },
  });
};

let working = false;

readline
  .createInterface({ input: process.stdin })
  .on('line', (text) => {
    const line = JSON.parse(text) as { type?: string; request_id?: string; request?: { subtype?: string } };
    if (line.type === 'user' && plan && !working) {
      working = true;
      void work();
      return;
    }
    if (line.type !== 'control_request') return;
    const id = String(line.request_id ?? '');
    if (line.request?.subtype === 'get_usage') {
      answered += 1;
      note(`usage ${id}`);
      process.stdout.write(usageAnswered(id));
      return;
    }
    print({ type: 'control_response', response: { subtype: 'success', request_id: id, response: {} } });
  })
  .on('close', () => {
    if (answered > 0) note(`usage-ended pid=${process.pid}`);
    process.exit(0);
  });
