/** The transports of an MCP server, a list and its word, read by `mcp.ts` and its contract (`contracts/transport.contract.ts`). */

/**
 * The transports Claude Code loads a server of a `.mcp.json` over, the Agent SDK's words (`McpServerConfigForProcessTransport`, its
 * in-process `sdk` aside), held equal to them in `claude/session-options.ts`.
 */
export const MCP_TRANSPORTS = ['stdio', 'http', 'sse'] as const;

/** An MCP server's transport: a word of `MCP_TRANSPORTS`. */
export type McpTransport = (typeof MCP_TRANSPORTS)[number];
