/**
 * One value read off an argv the **Agent SDK** wrote for the Claude Code it spawned for a step's session.
 *
 * The SDK spells a flag's value two ways, and which way is its own choice: `--flag=value` for nearly everything it builds (the
 * mode, the prompts, the tool lists, the setting sources, `--add-dir`, `--plugin-dir`, `--resume`), and `--flag value` for
 * `--mcp-config`, `--managed-settings` and every `extraArgs` key, `--settings` among them. SDK 0.3.295 moved the first group to the
 * joined form, which read as `args[args.indexOf(flag) + 1]` silently answered `args[0]` — `indexOf` gives `-1`, and `-1 + 1` is a
 * real index. So a test of the argv a step's session was started with reads it here, in both forms, and is refused where the flag is
 * not there at all. The runtime's own copy, for its own tests, is `packages/agent-runtime/test/sdk-argv.ts`.
 *
 * For the argv the SDK wrote alone: an MCP server's `args` from a checkout's config, or `ae`'s own command line, is ours to spell,
 * and a test of one reads it as it is written there.
 */

/**
 * The value `flag` carries on `args`, from `--flag=value` or from the argument after `--flag`. Throws, naming the whole argv, where
 * the flag is not there: a flag the SDK stopped passing is a fact to see, never a value read off the wrong index.
 */
export const sdkArgValue = (args: readonly string[], flag: string): string => {
  const joined = args.find((a) => a.startsWith(`${flag}=`));
  if (joined !== undefined) return joined.slice(flag.length + 1);
  const at = args.indexOf(flag);
  if (at >= 0 && at + 1 < args.length) return args[at + 1];
  throw new Error(
    `the Agent SDK passed no ${flag} to Claude Code, in either \`${flag}=value\` or \`${flag} value\` form: it gave ${args.join(' ')}. ` +
      `Read what the SDK builds for it in node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs, and say in the test what moved.`,
  );
};
