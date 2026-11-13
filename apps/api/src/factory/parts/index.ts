/**
 * A factory's parts the api serves through the `Api` of `objects`, each in the factory's namespace: its MCP servers and their sign-in
 * (`mcp-servers.ts`) beside Nemia's builtin ones, its schedules (`schedules.ts`), its hires (`hires.ts`) and its volumes (`volumes.ts`);
 * and what they and the factories' handlers share (`parts.ts`), as objects/serve.ts provides them to the mount.
 */
export { hiresHandlers } from './hires.ts';
export { builtinHandlers, mcpServersHandlers } from './mcp-servers.ts';
export { factoryNamed, queryOf } from './parts.ts';
export { schedulesHandlers } from './schedules.ts';
export { volumesHandlers } from './volumes.ts';
