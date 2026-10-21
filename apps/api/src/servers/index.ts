/**
 * A factory's own MCP servers, as app.ts answers them: the record with each server's state, and the servers Nemia ships; and the words
 * of the routes that record one and take one off.
 */
export { factoryServers, FACTORY_SERVER_WORDS, SHIPPED_SERVERS, shippedServers } from './servers.ts';
export type { FactoryServersRead, ShippedServer } from './servers.ts';
