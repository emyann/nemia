/**
 * The face of `servers/`: a factory's server record and the names it refuses, re-exported by name. The builtin client secrets
 * (`clients.ts`) are read by the folder's own sign-in alone, and are not on it.
 */
export {
  factoryServerRefusal,
  maskedHeaders,
  serverNameRefusal,
  splitServers,
  type FactoryServer,
  type FactoryServers,
  type BuiltinServer,
} from './servers.ts';
