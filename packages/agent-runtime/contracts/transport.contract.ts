/**
 * An MCP server's transport as Claude Code loads one (agent-runtime, src/harness/mcp.ts, `transportOf`), in the Agent SDK's words for
 * a server a file can declare (`McpServerConfigForProcessTransport['type']`, its in-process `sdk` aside): a word the SDK names is read
 * as itself, and any other word, one the SDK adds later included, as `unknown`.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { McpTransport } from '../src/harness/mcp.ts';

/** The words the Agent SDK has for the transport of a server a `.mcp.json` declares. */
const named = (written: string): boolean => written === 'stdio' || written === 'http' || written === 'sse';

const transportSpec = spec<(written: string) => McpTransport | 'unknown'>({
  ensures: {
    aKnownWordIsItself: {
      description: 'A transport the Agent SDK names is read as itself',
      condition: ({ input: [written], output }) => (named(written) ? output === written : true),
    },
    anyOtherWordIsUnknown: {
      description: 'Any other word is read as unknown',
      condition: ({ input: [written], output }) => (named(written) ? true : output === 'unknown'),
    },
  },
});

export type TransportOf = Implementation<typeof transportSpec>;
