/**
 * The face of `a2a/`: the in-process seam and remote agents, as the doors take them. It imports no name of the SDK's.
 */
export { a2aOps, a2aRunner } from './client.ts';
export type { SeamOps } from './client.ts';
export { remoteConfigRefusal, remoteOps, remoteRefuses } from './remote.ts';
export type { Credentials, MissingCredential, RemoteAgent } from './remote.ts';
