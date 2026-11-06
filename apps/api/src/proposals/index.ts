/**
 * A factory's Proposals and Delegations, served through `objects`' Api: each kind's handlers (`proposals.ts`, `delegations.ts`) and the
 * routes that hand each path on with the words their writes are guarded in (`routes.ts`), as objects/serve.ts provides and mounts them.
 */
export { delegationsHandlers } from './delegations.ts';
export { proposalsHandlers } from './proposals.ts';
export { PROPOSAL_WRITES, proposalsRoutes } from './routes.ts';
