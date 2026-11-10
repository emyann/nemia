/**
 * The api's runs, beside the run object's group of `objects`' `Api` (objects/runs.ts): the decision's Hono route (`runs`), and a run
 * started of a workflow (`runStart`) or of an inbox card (`cardStart`), `nemia start`'s entry called by type.
 */
export { runs } from './runs.ts';
export { cardStart, runStart } from './start.ts';
