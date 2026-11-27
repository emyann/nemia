/** The rows of an agent's own, as the page keeps them. Pure. */
import type { OwnRows } from '../../contracts/own-rows.contract.ts';

/**
 * The rows of `rows` that are the agent's, in the order given.
 * @param rows The steps at work.
 * @param agent The agent's name.
 */
export const ownRows: OwnRows = (rows, agent) => rows.filter((row) => row.agent === agent);
