/** The stand-in's MCP-state verb (`testEngine`), in a file of its own: `test-engine.ts` is at its length. */
import { Effect } from 'effect';
import type { McpServerState, McpServersRead } from '../harness/mcp-state.ts';
import type { RemoteMcpServer } from '../harness/seam.ts';
import type { EngineShape } from './engine.ts';
import { McpStateRefused } from './mcp-state.ts';
import { mcpStateRefusal } from './options.ts';

/**
 * What a test plants of one server's state: its words, and the tool count and error that go with them. A server a test plants nothing
 * for reads `pending`, as the real read reads a server the harness named nothing of.
 */
export type TestMcpState = Omit<McpServerState, 'name'>;

/**
 * `mcpState` over what a test planted: refuses a record as the real verb refuses one (`mcpStateRefusal`, its own words and its own
 * order), counts the read in `reads`, then answers a planted look that failed, else each server of the record once, in the record's
 * order, with what was planted of it and `pending` where nothing was.
 *
 * It keeps no harness, so unlike the real verb it refuses no engine for having none: that difference is declared on `APART`.
 */
const mcpStateOf = (
  planted: Map<string, TestMcpState>,
  reads: Array<readonly string[]>,
  failures: { why: string | undefined },
): EngineShape['mcpState'] =>
  function (servers: Record<string, RemoteMcpServer>) {
    const refused = mcpStateRefusal(servers);
    if (refused) return Effect.fail(new McpStateRefused({ message: refused }));
    reads.push(Object.keys(servers));
    const why = failures.why;
    if (why !== undefined) return Effect.succeed<McpServersRead>({ read: false, why });
    return Effect.succeed<McpServersRead>({
      read: true,
      servers: Object.keys(servers).map((name) => ({ name, ...(planted.get(name) ?? { status: 'pending' as const }) })),
    });
  };

/**
 * What the stand-in holds about MCP states: what a read answers for each server planted, the failure a read is made to answer instead,
 * and every read asked of it, in order — with the verb that serves them and the two a test moves them by.
 */
export const mcpHeld = () => {
  const planted = new Map<string, TestMcpState>();
  const failure: { why: string | undefined } = { why: undefined };
  const mcpReads: Array<readonly string[]> = [];
  return {
    mcpState: mcpStateOf(planted, mcpReads, failure),
    read: {
      mcpReads,
      plantMcpState: (name: string, state: TestMcpState) => void planted.set(name, state),
      failMcpState: (why: string | undefined) => void Object.assign(failure, { why }),
    },
  };
};
