/**
 * The engine's `mcpState`: the state of each server a caller hands, read inside one short-lived Claude Code session, and what the
 * engine refuses to read before it opens one.
 */
import { Effect, Schema } from 'effect';
import { mcpServersRead, type McpServersRead } from '../harness/mcp-state.ts';
import type { RemoteMcpServer } from '../harness/seam.ts';
import { heldHarnessesOf, mcpStateRefusal, type HarnessConfig } from './options.ts';

/**
 * A state read this engine will not make, and why: a record that is no map of remote servers, an empty one, an entry with no `url`,
 * or an engine with no Claude Code harness to read it through. Nothing was opened.
 */
export class McpStateRefused extends Schema.TaggedError<McpStateRefused>()('McpStateRefused', {
  message: Schema.String,
}) {}

/**
 * `mcpState` over the harnesses this engine has: refused where the record is no record of remote servers (`mcpStateRefusal`), then
 * where the engine runs no Claude Code harness — the state is read through the Agent SDK's own `query()`, which is the road a harness
 * configured as `claude` runs on (`heldHarnessesOf`), so an engine with none has nothing to read it through.
 *
 * Traced where it opens a session, as `Engine.mcpState` with how many servers were asked: a refusal opens nothing and makes no span.
 */
export const mcpStateVerbOf = (
  harnesses: Record<string, HarnessConfig>,
  cwd: string,
  executable: string | undefined,
): ((servers: Record<string, RemoteMcpServer>) => Effect.Effect<McpServersRead, McpStateRefused>) =>
  Effect.fnUntraced(function* (servers: Record<string, RemoteMcpServer>) {
    const refuse = (message: string) => Effect.fail(new McpStateRefused({ message }));
    const refused = mcpStateRefusal(servers);
    if (refused) return yield* refuse(refused);
    const held = heldHarnessesOf(harnesses);
    if (!held.length) {
      return yield* refuse(
        `a server's state is read inside a Claude Code session, and this engine runs no Claude Code harness. Its harnesses are: ${Object.keys(harnesses).join(', ') || 'none'}.`,
      );
    }
    return yield* Effect.promise(() => mcpServersRead(servers, cwd, executable === undefined ? {} : { executable })).pipe(
      Effect.withSpan('Engine.mcpState', { attributes: { servers: Object.keys(servers).length } }),
    );
  });
