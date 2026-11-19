/** A clone's folder, of its host and path: read by `clones.ts` and its contract (`contracts/clone-target.contract.ts`). */

/**
 * A clone's folder of its host and path. The folder `cloneTarget` answers is judged whole after it is joined, so its contract proves
 * the judgement over the folder as one value (`assume`, pure) rather than over the join.
 * @param host The clone's host.
 * @param rest The clone's path on its host.
 */
export const joinedFolder = (host: string, rest: string) => host + '/' + rest;
