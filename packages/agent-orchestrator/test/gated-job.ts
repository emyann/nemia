/**
 * A fake Claude Code for a test that needs a `claude` job to hold its slot until the test lets it go: every Claude Code session is a
 * job on the Agent SDK, which spawns the Claude Code `AE_CLAUDE_EXECUTABLE` names (`agent-runtime/bin/ae-claude-job.ts`) and speaks
 * its stdio protocol to it. Left to the SDK's own Claude Code, a job of a test runs the real one, which ends on its own a moment
 * later, and a slot a test counts is freed by nothing it did.
 *
 * The script answers each control request the SDK sends, `initialize` first, with an empty success; takes the first user message
 * as its brief; and, once a file named for the brief appears in `gates`, prints a result and leaves when its stdin ends, as the
 * worker closes it at the result. `head` is code run first, for a fake that answers a command line of its own (`claude agents`).
 */
import fs from 'node:fs';
import path from 'node:path';

/** The text of the fake, its shebang this process's node. */
export const gatedJobScript = (gates: string, head = ''): string => `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const args = process.argv.slice(2);
${head}
const print = (line) => process.stdout.write(JSON.stringify(line) + '\\n');
const sessionId = require('node:crypto').randomUUID();
let brief;
const input = readline.createInterface({ input: process.stdin });
input.on('close', () => process.exit(0));
input.on('line', (text) => {
  let line;
  try {
    line = JSON.parse(text);
  } catch {
    return;
  }
  if (line.type === 'control_request')
    print({ type: 'control_response', response: { subtype: 'success', request_id: line.request_id, response: {} } });
  else if (line.type === 'user' && brief === undefined) {
    brief = String(line.message?.content ?? '');
    print({ type: 'system', subtype: 'init', session_id: sessionId, cwd: process.cwd(), tools: [], model: 'gated' });
    const gate = path.join(${JSON.stringify(gates)}, brief);
    const wait = () =>
      fs.existsSync(gate)
        ? print({ type: 'result', subtype: 'success', is_error: false, result: '', session_id: sessionId, num_turns: 1, total_cost_usd: 0 })
        : setTimeout(wait, 50);
    wait();
  }
});
`;

/**
 * Writes the fake as `claude` in `bin` and names it the job's Claude Code (`AE_CLAUDE_EXECUTABLE`) for the rest of this process,
 * whose engine's workers inherit it; answers its path.
 */
export const gatedJob = (bin: string, gates: string, head = ''): string => {
  const claude = path.join(bin, 'claude');
  fs.writeFileSync(claude, gatedJobScript(gates, head), { mode: 0o755 });
  process.env.AE_CLAUDE_EXECUTABLE = claude;
  return claude;
};
