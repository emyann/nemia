/**
 * The face of `servers/`: a factory's server record and the names it refuses, re-exported by name. The shipped client secrets
 * (`clients.ts`) are read by the folder's own sign-in alone, and are not on it.
 */
export {
  factoryServerRefusal,
  factoryServersRefusal,
  REFUSED_HEADER,
  serverNameRefusal,
  splitServers,
  type FactoryServer,
  type FactoryServers,
  type FactoryServersFile,
  type ShippedServer,
} from './servers.ts';
