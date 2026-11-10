/**
 * The orchestrator's version: the `version` its package.json says, read from that file as the module loads, so a bump there is the one
 * edit; the api serves it (`GET /api/version`) and the board shows it in its bottom bar. Read as a file rather than imported as JSON, so
 * the package.json is no module of the graph a dev server watches.
 */
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version?: unknown };

if (typeof manifest.version !== 'string') throw new Error("agent-orchestrator's package.json has no version: set its version field");

export const VERSION: string = manifest.version;
