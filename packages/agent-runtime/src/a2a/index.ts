/**
 * The face of `a2a/`: the in-process seam and remote agents, as the doors take them. It imports no name of the SDK's.
 */
export { a2aOps, a2aRunner } from './client.ts';
export type { SeamOps } from './client.ts';
export { remoteConfigRefusal } from './card.ts';
export { remoteOps, remoteRefuses } from './remote.ts';
export type { Credentials, MissingCredential, RemoteAgent } from './remote.ts';
export { servedOf } from './listener.ts';
export { BEARER } from './served.ts';
export { holderTokenOf } from './holder-token.ts';
export type { Served } from './listener.ts';
export { holderAgentRefusal, holderRefusal, holderSeamOf } from './holder-follow.ts';
export type { HolderAgent } from './holder-follow.ts';
