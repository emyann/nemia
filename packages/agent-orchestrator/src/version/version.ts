/**
 * The orchestrator's version: the `version` its package.json says, read from that file as the module loads, so a bump there is the one
 * edit; the api serves it (`GET /api/version`) and the board shows it in its bottom bar.
 */
import manifest from '../../package.json' with { type: 'json' };

export const VERSION: string = manifest.version;
