/**
 * A small stdio MCP server, for the capabilities tests and `npm run e2e`: it lists two tools and does nothing else.
 *
 * `HKB_TEST_STARTS`, when set, names a file it adds its pid to each time it starts, so a test can count how often
 * the api asked it. `HKB_TEST_MODE=silent` starts and never answers; `HKB_TEST_MODE=crash` says why on stderr and exits 3.
 */
import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

if (process.env.HKB_TEST_STARTS) fs.appendFileSync(process.env.HKB_TEST_STARTS, `${process.pid}\n`);

if (process.env.HKB_TEST_MODE === 'crash') {
  console.error('fixture: no licence key in FIXTURE_KEY');
  process.exit(3);
}

if (process.env.HKB_TEST_MODE === 'silent') {
  // Keeps stdin open and reads nothing from it, until the api gives up and stops it.
  setInterval(() => {}, 60_000);
} else {
  const server = new McpServer({ name: 'fixture', version: '1.0.0' });
  server.registerTool('echo', { description: 'Say it back.\nA second line, which a one-line description leaves out.' }, async () => ({ content: [] }));
  server.registerTool('wipe', { description: 'Remove everything in the workspace.' }, async () => ({ content: [] }));
  await server.connect(new StdioServerTransport());
}
