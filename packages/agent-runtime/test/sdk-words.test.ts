/**
 * The runtime's words that are the Agent SDK's: each list is held equal to the SDK's union by the typecheck of this file, so an SDK
 * that names another word fails `npm run typecheck` until the runtime's list names it too, while a line that already says it reads as
 * `unknown`. The test below only runs what the typecheck already judged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { McpServerConfigForProcessTransport, SDKMessageOrigin } from '@anthropic-ai/claude-agent-sdk';
import type { McpTransport } from '../src/harness/mcp.ts';
import type { LocalMcpServer, RemoteMcpServer, TranscriptOriginKind } from '../src/harness/seam.ts';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The seam's origin words (`ORIGIN_KINDS`, `src/harness/seam.ts`) are the SDK's (`SDKMessageOrigin`, `sdk.d.ts:5769`) and `unknown`. */
const originKindsHeld: Same<TranscriptOriginKind, SDKMessageOrigin['kind'] | 'unknown'> = true;

/**
 * The transports of `MCP_TRANSPORTS` (`src/harness/mcp.ts`) are the SDK's for a server a file declares
 * (`McpServerConfigForProcessTransport`, `sdk.d.ts:1319`, its in-process `sdk` aside), and the ones the seam's servers carry.
 */
const mcpTransportsHeld: Same<McpTransport, Exclude<NonNullable<McpServerConfigForProcessTransport['type']>, 'sdk'>> = true;
const seamTransportsHeld: Same<McpTransport, NonNullable<LocalMcpServer['type']> | RemoteMcpServer['type']> = true;

test('the origin words and the MCP transports are the Agent SDK’s, as the typecheck of this file judged', () => {
  assert.deepEqual([originKindsHeld, mcpTransportsHeld, seamTransportsHeld], [true, true, true]);
});
