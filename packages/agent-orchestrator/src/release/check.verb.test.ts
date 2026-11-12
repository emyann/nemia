/**
 * The daemon's release check on a scratch store, its install's download base a `file:` folder holding `latest/download/latest.json`: an
 * archive install's check keeps what it read in `releases/latest.json`; one turned off by `NEMIA_RELEASE_CHECK=off`, and the check of a
 * checkout or a build, read and write nothing; a base with nothing published is a check that could not read, never a failure.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { configGiven } from '../../test/config-given.ts';
import { checkOnce, releaseCheck } from './check.verb.ts';
import { latestFile, readLatest } from './archive.store.ts';
import type { Running } from './release.ts';

const BASE = scratch('wf-check-base-');
fs.mkdirSync(path.join(BASE, 'latest', 'download'), { recursive: true });
fs.writeFileSync(path.join(BASE, 'latest', 'download', 'latest.json'), JSON.stringify({ tag: 'v1.3.0', version: '1.3.0' }));

/** An install of `v1.2.0` whose release came as `from`, its download base `source`. */
const install = (from: 'archive' | 'build', source = pathToFileURL(BASE).href): Running => ({
  kind: 'install',
  root: '/r/v1.2.0',
  tag: 'v1.2.0',
  commit: 'c0ffee',
  source,
  builtAt: '',
  from,
});

/** One check of a fresh store, with the settings `env` names. */
const checked = (running: Running, env: Record<string, string> = {}) => {
  const root = scratch('wf-check-');
  return Effect.runPromise(checkOnce(running).pipe(Effect.provide(configGiven(root, env)))).then((done) => ({ done, root }));
};

test('an archive install keeps the newest release it read in releases/latest.json', async () => {
  const { done, root } = await checked(install('archive'));
  assert.deepEqual(done, { kind: 'read', latest: { tag: 'v1.3.0', version: '1.3.0' } });
  assert.deepEqual(readLatest(root), { tag: 'v1.3.0', version: '1.3.0' });
});

test('NEMIA_RELEASE_CHECK=off, a build and a checkout read nothing and write nothing', async () => {
  for (const [running, env, kind] of [
    [install('archive'), { NEMIA_RELEASE_CHECK: 'off' }, 'off'],
    [install('build'), {}, 'unarchived'],
    [{ kind: 'checkout', root: '/r' }, {}, 'unarchived'],
  ] as const) {
    const { done, root } = await checked(running, env);
    assert.equal(done.kind, kind);
    assert.equal(fs.existsSync(latestFile(root)), false, kind);
  }
});

test('a base with nothing published, or a setting that does not read, is a check that read nothing, never a failure', async () => {
  const empty = await checked(install('archive', pathToFileURL(scratch('wf-check-empty-')).href));
  assert.equal(empty.done.kind, 'unread');
  assert.equal(fs.existsSync(latestFile(empty.root)), false);
  const wrong = await checked(install('archive'), { NEMIA_RELEASE_CHECK: 'nope' });
  assert.equal(wrong.done.kind, 'unread');
});

test('the sweep ends at once where the check is off', async () => {
  const root = scratch('wf-check-sweep-');
  const ended = await Effect.runPromise(
    releaseCheck(install('archive')).pipe(Effect.provide(configGiven(root, { NEMIA_RELEASE_CHECK: 'off' }))),
  );
  assert.equal(ended.kind, 'off');
});
