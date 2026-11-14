/**
 * When the e2e takes `dist/` as built (e2e/built.ts): only where its stamp is the fingerprint of the sources as they stand, which a
 * change to a file of the board or of `objects` moves and a change to a test does not, and never in CI. No browser, so `npm test` runs it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { scratch } from 'test-kit/scratch';
import { current, inputsOf, stamp } from './e2e/built.ts';

/** A repository with a board, built, and `objects`: its root and the board's folder. */
function repository(): { repo: string; web: string } {
  const repo = scratch('nemia-e2e-built-');
  const web = path.join(repo, 'apps', 'web');
  for (const [file, text] of [
    ['apps/web/src/main.tsx', 'a'],
    ['apps/web/test/e2e/pages/010-factory.ts', 'a'],
    ['apps/web/dist/index.html', 'a'],
    ['packages/objects/src/index.ts', 'a'],
    ['package-lock.json', '{}'],
  ]) {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
  }
  return { repo, web };
}

test('a build stamped with its sources is current, until a file of the board or of objects changes; a test or dist/ changes nothing', () => {
  const { repo, web } = repository();
  const built = inputsOf(web, repo);
  assert.equal(current(web, built, {}), false, 'no stamp: nobody says what dist/ was built from');
  stamp(web, built);
  assert.equal(current(web, inputsOf(web, repo), {}), true);
  fs.writeFileSync(path.join(web, 'test', 'e2e', 'pages', '010-factory.ts'), 'longer');
  assert.equal(current(web, inputsOf(web, repo), {}), true, 'a page of the e2e is not built');
  for (const file of ['apps/web/src/main.tsx', 'packages/objects/src/index.ts', 'package-lock.json']) {
    const kept = fs.readFileSync(path.join(repo, file), 'utf8');
    fs.writeFileSync(path.join(repo, file), `${kept} and more`);
    assert.equal(current(web, inputsOf(web, repo), {}), false, file);
    stamp(web, inputsOf(web, repo));
  }
});

test('REFUSED: a stamped build in CI, and a stamp beside no page', () => {
  const { repo, web } = repository();
  stamp(web, inputsOf(web, repo));
  assert.equal(current(web, inputsOf(web, repo), { CI: 'true' }), false, 'nothing a shard decides is read from a cache');
  fs.rmSync(path.join(web, 'dist', 'index.html'));
  assert.equal(current(web, inputsOf(web, repo), {}), false);
});
