/**
 * A factory's repositories named by git URL: what `--repo` is read as, in the facts that span two values a law cannot state
 * (`cloneTarget`'s table); and the person's story, told as one test — `nemia factory add --repo <url>` cloning before it files, refused
 * with nothing filed where the URL is no clone's, and the daemon's sweep (`clonesOnce`) making again a clone whose folder went, saying
 * one it cannot make once, and asking nothing of a factory given no URL. On the test place, a store of its own at `ROOT`.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Effect, Logger } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../../../place/memory/index.ts';
import { eachTest } from '../../../test/placed.ts';
import { placeOver } from '../../../test/place-over.ts';
import { heldUnasked } from '../../../test/unasked.ts';
import { story } from '../../../test/story.ts';
import { typed as handlerOf } from '../../../test/typed.ts';
import { engineOf } from '../../runtime-client.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { PlaceService, type Place } from '../../place/place.store.ts';
import { readFactoriesAt } from '../factory.store.ts';
import { cloneFolder, cloneTarget, isCloneFolder } from './clones.ts';
import { clonesOnce, freshCloneMemory } from './clones.verb.ts';
import type { Env } from '../../config/config.store.ts';

const ROOT = scratch('wf-clones-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
heldUnasked(engine);

test('a checkout read as a clone the store keeps exactly when it lies inside its clones/ folder: never the store, clones/ itself, a sibling or a path that climbs out', async (t) => {
  const rows: readonly (readonly [string, boolean])[] = [
    [path.join(ROOT, 'clones', 'h', 'o', 'r'), true],
    [ROOT, false],
    [path.join(ROOT, 'clones'), false],
    [path.join(ROOT, 'clones-x', 'o'), false],
    [path.join(ROOT, 'clones', '..', 'x'), false],
  ];
  for (const [repo, cloned] of rows)
    await t.test(path.relative(ROOT, repo) || '(the store)', () => assert.equal(isCloneFolder(ROOT, repo), cloned));
});

test('a --repo value read as a path or as the folder its clone is kept in, one repository named any way one folder, a plain URL kept under its host', async (t) => {
  const rows: readonly (readonly [string, string])[] = [
    ['git@GitHub.com:o/r.git', 'github.com/o/r'],
    ['ssh://git@github.com/o/r', 'github.com/o/r'],
    ['ssh://git@github.com:22/o/r.git', 'github.com/o/r'],
    ['https://github.com/o/r.git', 'github.com/o/r'],
    ['https://github.com/o/r/', 'github.com/o/r'],
    ['https://u@github.com/o/r', 'github.com/o/r'],
    ['file:///srv/o/r.git', 'localhost/srv/o/r'],
    ['https://example.com/team/tool', 'example.com/team/tool'],
    ['git@example.com:team/tool', 'example.com/team/tool'],
    ['git@example.com:/srv/tool.git/', 'example.com/srv/tool'],
    ['./a:b', 'path'],
    ['/abs', 'path'],
    ['repo', 'path'],
    ['ftp://h/o/r', 'refused'],
    ['https://u:p@h/o/r', 'refused'],
    ['https://h', 'refused'],
    ['https://h/o/../r', 'refused'],
    ['git@h:', 'refused'],
  ];
  for (const [given, read] of rows)
    await t.test(given, () => {
      const target = cloneTarget(given);
      const kept = target.kind === 'url' ? path.relative(path.join(ROOT, 'clones'), cloneFolder(ROOT, target.folder)) : target.kind;
      assert.equal(kept, read);
    });
});

/** `nemia <argv>` on `place` (this test's by default), run onto its entry's handler as the api calls it. */
async function typed(_t: TestContext, argv: string[], place: Place = stand().place): Promise<void> {
  await handlerOf(argv, engineOf(engine().layer), undefined, place, ENV);
}

/** A repository of this test's place at a folder of its own, one commit on it, and its `file://` URL. */
function origin(): { dir: string; url: string; head: string } {
  const dir = path.join(scratch('wf-clones-origin-'), 'o', 'r');
  fs.mkdirSync(dir, { recursive: true });
  stand().world.repository(dir, { 'a.txt': 'one\n' });
  return { dir, url: pathToFileURL(dir).href, head: stand().world.head(dir) };
}

/** Where the store keeps the clone of `dir`'s `file://` URL. */
const cloneOf = (dir: string): string => path.join(ROOT, 'clones', 'localhost', ...dir.split(path.sep).filter(Boolean));

/** One sweep of the clones on `place`, the warnings it said pushed onto `warned`. */
const swept = (place: Place, memory: ReturnType<typeof freshCloneMemory>, warned: string[]) =>
  Effect.runPromise(
    clonesOnce(memory).pipe(
      Effect.provideService(StoreRoot, ROOT),
      Effect.provideService(PlaceService, place),
      Effect.provide(Logger.layer([Logger.make(({ message }) => void warned.push(String(message)))])),
    ),
  );

/** That `typed` was refused `Invalid`, exit 2, and filed no factory `name`. */
const refusedFiling = async (t: TestContext, argv: string[], name: string) => {
  await assert.rejects(typed(t, argv), (err: Error & { _tag?: string; exitCode?: number }) => {
    assert.equal(err._tag, 'Invalid');
    assert.equal(err.exitCode, 2);
    return true;
  });
  assert.ok(!readFactoriesAt(ROOT).some((f) => f.name === name), `${name} was filed`);
};

test('a factory on a repository named by URL: cloned as it is added, refused with nothing filed, and kept by the sweep', async (t) => {
  const s = story(t);
  const { dir, url, head } = origin();
  const into = cloneOf(dir);

  await s.test('added by URL, the repository is cloned under clones/ and filed with its origin', async (c) => {
    await typed(c, ['factory', 'add', 'mill', '--repo', url, '--no-trust']);
    const mill = readFactoriesAt(ROOT).find((f) => f.name === 'mill');
    assert.ok(mill && !('error' in mill));
    assert.deepEqual(mill.repos, [into]);
    assert.deepEqual(mill.origins, { [into]: url });
    assert.equal(stand().world.head(into), head);
  });

  await s.test('REFUSED: a scheme no clone is made over, a URL with a password, and one naming no repository, nothing filed', async (c) => {
    await refusedFiling(c, ['factory', 'add', 'ftp', '--repo', 'ftp://h/o/r'], 'ftp');
    await refusedFiling(c, ['factory', 'add', 'secret', '--repo', 'https://u:p@h/o/r'], 'secret');
    const none = pathToFileURL(path.join(scratch('wf-clones-none-'), 'none')).href;
    await refusedFiling(c, ['factory', 'add', 'none', '--repo', none], 'none');
  });

  await s.test('the sweep makes a clone whose folder went again, and asks nothing of one that is there', async () => {
    const memory = freshCloneMemory();
    const warned: string[] = [];
    fs.rmSync(into, { recursive: true, force: true });
    assert.deepEqual(await swept(stand().place, memory, warned), [into]);
    assert.equal(stand().world.head(into), head);
    assert.deepEqual(await swept(stand().place, memory, warned), []);
    assert.deepEqual(warned, []);
  });

  await s.test('REFUSED: a clone the place will not make is said once over two sweeps', async () => {
    const memory = freshCloneMemory();
    const warned: string[] = [];
    const deaf = placeOver(stand().place, { clone: () => ({ refused: 'this machine holds no credential for it' }) });
    fs.rmSync(into, { recursive: true, force: true });
    assert.deepEqual(await swept(deaf, memory, warned), []);
    assert.deepEqual(await swept(deaf, memory, warned), []);
    assert.equal(warned.length, 1);
    assert.ok(!fs.existsSync(into));
  });

  await s.test('a factory given no URL asks the place no clone', async (c) => {
    fs.rmSync(path.join(ROOT, 'factories'), { recursive: true, force: true });
    const plain = scratch('wf-clones-plain-');
    stand().world.repository(plain, {});
    await typed(c, ['factory', 'add', 'plain', '--repo', plain, '--no-trust']);
    const asked: string[] = [];
    const recording = placeOver(stand().place, {
      clone: ({ into: folder }) => {
        asked.push(folder);
        return { refused: 'not asked' };
      },
    });
    await swept(recording, freshCloneMemory(), []);
    assert.deepEqual(asked, []);
  });
});
