/**
 * The orchestrator's version: the `version` its package.json says, as a constant the api serves (`GET /api/version`) and the board shows
 * in its bottom bar. Pure: `version.test.ts` holds it equal to package.json, so a bump of one without the other fails the suite.
 */
export const VERSION = '1.0.0';
