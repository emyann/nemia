/**
 * The MCP port, `/mcp`: its handler (`mcpPort`), which serves the tools generated from the command table (tools.ts), each annotated by
 * its verb's class and its endpoint's method (hints.ts), and how often a pending call is told as progress (`PROGRESS_EVERY_MS`).
 */
export { mcpPort, PROGRESS_EVERY_MS } from './port.ts';
