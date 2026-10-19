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
 */
import fs from 'node:fs';
import readline from 'node:readline';

const answer = process.env.STANDIN_ANSWER!;
const mode = process.env.STANDIN_MODE!;
const calls = process.env.STANDIN_CALLS!;

const note = (line: string): void => fs.appendFileSync(calls, `${line}\n`);

if (fs.readFileSync(mode, 'utf8').trim() === 'exit') {
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

readline
  .createInterface({ input: process.stdin })
  .on('line', (text) => {
    const line = JSON.parse(text) as { type?: string; request_id?: string; request?: { subtype?: string } };
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
