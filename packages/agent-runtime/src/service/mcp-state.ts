/**
 * The engine's `mcpState`: the state of each server a caller hands, read inside one short-lived Claude Code session, and what the
 * engine refuses to read before it opens one.
 */
import { Effect, Schema } from 'effect';
import { claudeExecutableOf } from '../harness/mcp-sign-in.ts';
import { tokenFilesOf, withTokenHelpers } from '../harness/mcp-token.ts';
import { mcpServersRead, type McpServersRead, type McpStatusAsk } from '../harness/mcp-state.ts';
import type { RemoteMcpServer } from '../harness/seam.ts';
import { verbHarnessOf, type HarnessDeclared } from '../harness/declaration.ts';
import { mcpStateRefusal, type HarnessConfig } from './options.ts';
import { declaredOf } from './verb-harness.ts';

/**
 * A state read this engine will not make, and why: a record that is no map of remote servers, an empty one, an entry with no `url`,
 * or an engine with no Claude Code harness to read it through. Nothing was opened.
 */
export class McpStateRefused extends Schema.TaggedError<McpStateRefused>()('McpStateRefused', {
  message: Schema.String,
}) {}

/**
 * Why `mcpState` is refused by an engine none of whose harnesses, `declared`, declares `mcp`: the harnesses it has.
 * @param declared The engine's harnesses, each with what it declares.
 */
export const noMcpHarness = (declared: readonly HarnessDeclared[]) =>
  `a server's state is read inside a Claude Code session, and this engine runs no Claude Code harness. Its harnesses are: ${declared.map((h) => h.name).join(', ') || 'none'}.`;

/**
 * `mcpState` over the harnesses this engine has: refused where the record is no record of remote servers (`mcpStateRefusal`), then
 * where the engine runs no Claude Code harness — the state is read through the Agent SDK's own `query()`, which is the road a harness
 * that declares `mcp` runs on (`verbHarnessOf`), so an engine with none has nothing to read it through.
 *
 * Traced where it opens a session, as `Engine.mcpState` with how many servers were asked: a refusal opens nothing and makes no span.
 *
 * A server signed in to by a code is read with the helper that reads its held token (`withTokenHelpers`), as a session is handed it, so
 * it reads `connected` where a session would.
 *
 * `cwd` is the engine's own `root` (`engine.ts`), which is required and defaults to nothing: the probe lists the servers of the folder
 * it is opened in, so a cwd read off the process instead would list another checkout's. `ask` is the harness seam, the real one by
 * default; a test gives its own and reads the cwd the session was opened in. The Claude Code it opens is found at each read
 * (`claudeExecutableOf`): `executable`, else the one in `harnessBin`, else the SDK's bundled one, else the one on PATH.
 * @param harnesses The engine's harnesses, each by its name.
 * @param cwd The engine's own root, the folder the probe is opened in.
 * @param executable The harness program the probe opens, or undefined to look for one.
 * @param ask The harness seam the state is read through, or undefined for the real one.
 * @param harnessBin The folder the harness's program is looked for in first, or undefined for none.
 */
export const mcpStateVerbOf = (
  harnesses: Record<string, HarnessConfig>,
  cwd: string,
  executable: string | undefined,
  ask?: McpStatusAsk,
  harnessBin?: string,
) =>
  Effect.fnUntraced(function* (servers: Record<string, RemoteMcpServer>) {
    const refuse = (message: string) => Effect.fail(new McpStateRefused({ message }));
    const refused = mcpStateRefusal(servers);
    if (refused) return yield* refuse(refused);
    const declared = declaredOf(harnesses);
    if (verbHarnessOf('mcp', undefined, declared).kind === 'refused') return yield* refuse(noMcpHarness(declared));
    const found = claudeExecutableOf(executable, harnessBin);
    return yield* Effect.promise(async () => {
      return mcpServersRead(withTokenHelpers(servers, tokenFilesOf(cwd, servers)), cwd, {
        ...(found === undefined ? {} : { executable: found }),
        ...(ask === undefined ? {} : { ask }),
      });
    }).pipe(Effect.withSpan('Engine.mcpState', { attributes: { servers: Object.keys(servers).length } }));
  }) satisfies (servers: Record<string, RemoteMcpServer>) => Effect.Effect<McpServersRead, McpStateRefused>;
