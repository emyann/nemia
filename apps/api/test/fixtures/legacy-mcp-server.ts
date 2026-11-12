/**
 * A stdio MCP server that speaks 2025-11-25 alone and imports no SDK, for the capabilities tests: a server written before 2026-07-28,
 * which never learnt `server/discover`. It reads a JSON-RPC message a line, answers `initialize` with `protocolVersion: '2025-11-25'`
 * and a `tools` capability, `tools/list` with one tool, and any other request with -32601; a notification it ignores.
 *
 * `HKB_TEST_STARTS`, when set, names a file it adds its pid to each time it starts, as `mcp-server.ts` does.
 */
import fs from 'node:fs';
import readline from 'node:readline';

if (process.env.HKB_TEST_STARTS) fs.appendFileSync(process.env.HKB_TEST_STARTS, `${process.pid}\n`);

/** A JSON-RPC message as this server reads one: a request has an `id`, a notification none. */
type Message = { id?: number | string; method?: string };

/** What this server answers `message` with, or nothing where it is a notification. */
const answerOf = (message: Message): object | undefined => {
  if (message.id === undefined) return undefined;
  if (message.method === 'initialize')
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'fixture-legacy', version: '1.0.0' } },
    };
  if (message.method === 'tools/list')
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: { tools: [{ name: 'recall', description: 'Say what was.', inputSchema: { type: 'object' } }] },
    };
  return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } };
};

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim() === '') return;
  const answer = answerOf(JSON.parse(line) as Message);
  if (answer !== undefined) process.stdout.write(`${JSON.stringify(answer)}\n`);
});
