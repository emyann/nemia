/**
 * A factory as the api serves it: the factories as objects and their rules, instruction and command lines (`factories.ts`), its parts in
 * the factory's namespace — MCP servers, schedules, hires and volumes, behind their own face (`parts/`) — and where a request is answered,
 * its factory and repository (`place.ts`), as objects/serve.ts provides them to the mount. layer.ts, which every handler reads its services
 * off, takes `placeFor` from `place.ts` alone, so resolving a request's place loads no handler.
 */
export { factoriesHandlers } from './factories.ts';
export { builtinHandlers, hiresHandlers, mcpServersHandlers, schedulesHandlers, volumesHandlers } from './parts/index.ts';
export { placeFor } from './place.ts';
