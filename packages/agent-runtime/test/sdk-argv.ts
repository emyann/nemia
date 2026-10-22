/**
 * One value read off an argv the **Agent SDK** wrote for the Claude Code it spawns.
 *
 * The SDK spells a flag's value two ways, and which way is the SDK's own choice, not ours. Joined, --flag=value, for nearly
 * everything it builds: the mode, the prompts, the tool lists, the setting sources, --add-dir, --plugin-dir, --resume. Two
 * arguments, --flag value, for --mcp-config, --managed-settings and every `extraArgs` key, --settings among them — those it joins
 * only where the value itself opens with a dash — beside the four it opens with (--output-format stream-json --verbose
 * --input-format stream-json). SDK 0.3.295 moved the first group from the two-argument form to the joined one, which read as
 * `argv[argv.indexOf(flag) + 1]` silently answered `argv[0]`: `indexOf` gives -1, and -1 + 1 is a real index. So a test of the
 * SDK's argv reads it here, in both forms, and is refused where the flag is not there at all. Which flag goes which way is read off
 * the installed `sdk.mjs`, where the SDK's two argument builders are.
 *
 * For the argv the SDK wrote alone. The argv **we** write — `claudePrintFlags`' `claude -p` spec, `ae`'s own command line, an MCP
 * server's `args` from a config — is ours to spell, and a test of one reads it as it is written there.
 */

/** Whether `flag` is on `argv`, in either form. */
export const sdkArgGiven = (argv: readonly string[], flag: string): boolean =>
  argv.includes(flag) || argv.some((a) => a.startsWith(`${flag}=`));

/**
 * The value `flag` carries on `argv`, from `--flag=value` or from the argument after `--flag`. Throws, naming the whole argv, where
 * the flag is not there: a flag the SDK stopped passing is a fact to see, never a value read off the wrong index.
 */
export const sdkArgValue = (argv: readonly string[], flag: string): string => {
  const joined = argv.find((a) => a.startsWith(`${flag}=`));
  if (joined !== undefined) return joined.slice(flag.length + 1);
  const at = argv.indexOf(flag);
  if (at >= 0 && at + 1 < argv.length) return argv[at + 1];
  throw new Error(
    `the Agent SDK passed no ${flag} to Claude Code, in either \`${flag}=value\` or \`${flag} value\` form: it gave ${argv.join(' ')}. ` +
      `Read what the SDK builds for it in node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs, and say in the test what moved.`,
  );
};
