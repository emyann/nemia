/**
 * The MCP port, `/mcp`: its handler (`mcpPort`), which serves the tools generated from the command table (tools.ts), each annotated by
 * its verb's class and its endpoint's method (hints.ts), how often a pending call is told as progress (`PROGRESS_EVERY_MS`), and the
 * catalog of Nemia's skills it serves (`PortSkills`), with the cache hint the entry loads it by (`SKILLS_CACHE_HINT`).
 */
export { mcpPort, type PortSkills, PROGRESS_EVERY_MS, SKILLS_CACHE_HINT } from './port.ts';
