/**
 * Nemia's version: the release's, the `version` the repository's root package.json says, which `tools/release/release.ts` bumps when
 * it cuts a release. Read from that file as the module loads, by its path from this one: a checkout and an install hold it at the same
 * place, since the release archive is the tracked tree (`tools/release/archive.ts`). `nemia version` prints it first, the api serves it
 * (`GET /api/version`) and the board shows it in its bottom bar. Read as a file rather than imported as JSON, so the package.json is no
 * module of the graph a dev server watches. The orchestrator's own package.json keeps npm's version field of a workspace, read by
 * nothing (`tools/guards/test/release.test.ts` holds this read to the bump's file).
 */
import fs from 'node:fs';

/** The root package.json, four folders up from this file's: `packages/agent-orchestrator/src/version/`. */
const RELEASE_MANIFEST = new URL('../../../../package.json', import.meta.url);

const manifest = JSON.parse(fs.readFileSync(RELEASE_MANIFEST, 'utf8')) as { version?: unknown };

if (typeof manifest.version !== 'string')
  throw new Error(
    `${RELEASE_MANIFEST.pathname} has no version: set its version field, as tools/release/release.ts writes it when it cuts a release`,
  );

export const VERSION: string = manifest.version;
