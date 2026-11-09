/**
 * A factory's parts the api serves through the `Api` of `objects`, each in the factory's namespace: its MCP servers and their sign-in
 * (`mcp-servers.ts`) beside Nemia's builtin ones, its schedules (`schedules.ts`), its hires (`hires.ts`) and its volumes (`volumes.ts`);
 * and what they and the factories' handlers share, with the routes that hand each path on and the words their writes are guarded in
 * (`parts.ts`), as objects/serve.ts provides and mounts them.
 */
export { hiresHandlers } from './hires.ts';
export { builtinHandlers, mcpServersHandlers } from './mcp-servers.ts';
export { defaultRepo, factoryNamed, PART_WRITES, partsRoutes, queryOf } from './parts.ts';
export { schedulesHandlers } from './schedules.ts';
export { volumesHandlers } from './volumes.ts';
