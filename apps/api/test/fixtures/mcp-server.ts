/**
 * A small stdio MCP server, for the capabilities tests and `npm run e2e`: it lists two tools and does nothing else.
 *
 * `HKB_TEST_STARTS`, when set, names a file it adds its pid to each time it starts, so a test can count how often the api asked it.
 * `HKB_TEST_MODE=silent` starts and never answers: it keeps stdin open and reads nothing from it, until the api gives up and stops it.
 * `HKB_TEST_MODE=deaf` never answers either, but exits as its stdin ends: a server the SDK's close ends at once, with no grace waited out.
 * `HKB_TEST_MODE=crash` says why on stderr and exits 3. `HKB_TEST_MODE=refuse` answers the client's `initialize` with an error, and says
 * why on stderr only `REFUSE_SAYS_MS` later, then exits 3, whatever its stdin does: a server whose refusal reaches the client before its
 * stderr does. `HKB_TEST_MODE=prompts` registers a prompt and no tools, so it declares no `tools`
 * capability and has no `tools/list` to answer. `HKB_TEST_MODE=env` lists one tool, whose description is what the server was started with,
 * so a test reads how the api started it.
 */
import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

if (process.env.HKB_TEST_STARTS) fs.appendFileSync(process.env.HKB_TEST_STARTS, `${process.pid}\n`);

if (process.env.HKB_TEST_MODE === 'crash') {
  console.error('fixture: no licence key in FIXTURE_KEY');
  process.exit(3);
}

/** How long after its refusal a `refuse` server says why on stderr: longer than any settling a reader of its stderr could guess at. */
const REFUSE_SAYS_MS = 300;

if (process.env.HKB_TEST_MODE === 'refuse') {
  let read = '';
  process.stdin.on('data', (chunk: Buffer) => {
    read += chunk.toString();
    const line = read.split('\n')[0];
    if (line === undefined || !read.includes('\n')) return;
    const { id } = JSON.parse(line) as { id: number };
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: 'refused to start' } })}\n`);
    setTimeout(() => {
      console.error('fixture: no licence key in FIXTURE_KEY');
      process.exit(3);
    }, REFUSE_SAYS_MS);
  });
} else if (process.env.HKB_TEST_MODE === 'silent') {
  setInterval(() => {}, 60_000);
} else if (process.env.HKB_TEST_MODE === 'deaf') {
  process.stdin.on('end', () => process.exit(0));
  process.stdin.resume();
} else if (process.env.HKB_TEST_MODE === 'env') {
  const { HKB_TEST_NAMED, HKB_TEST_DEFAULTED, HKB_TEST_INHERITED, CLAUDE_PROJECT_DIR, PORT } = process.env;
  const seen = { argv: process.argv.slice(2), HKB_TEST_NAMED, HKB_TEST_DEFAULTED, HKB_TEST_INHERITED, CLAUDE_PROJECT_DIR, PORT };
  const server = new McpServer({ name: 'fixture-env', version: '1.0.0' });
  server.registerTool('env', { description: JSON.stringify(seen) }, async () => ({ content: [] }));
  await server.connect(new StdioServerTransport());
} else if (process.env.HKB_TEST_MODE === 'prompts') {
  const server = new McpServer({ name: 'fixture-prompts', version: '1.0.0' });
  server.registerPrompt('greet', { description: 'Say hello.' }, () => ({ messages: [] }));
  await server.connect(new StdioServerTransport());
} else {
  const server = new McpServer({ name: 'fixture', version: '1.0.0' });
  server.registerTool('echo', { description: 'Say it back.\nA second line, which a one-line description leaves out.' }, async () => ({ content: [] }));
  server.registerTool('wipe', { description: 'Remove everything in the workspace.' }, async () => ({ content: [] }));
  await server.connect(new StdioServerTransport());
}
