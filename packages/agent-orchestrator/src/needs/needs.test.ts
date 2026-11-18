/**
 * The needs read: a check that answers past its time or whose shell does not start reads `unknown` and holds nothing (`checkRan`, on a
 * shortened bound and a shell that is not there); a workflow's needs read off its README's frontmatter, which its instruction no longer
 * shows (`workflowNeeds`, `workflowReadme`); a workflow need that fills a place's goes before it (`needsOfRun`); and the sweep reads the
 * places' needs, every declared harness's, every trusted factory's workflows' and the places' repository needs in each trusted factory's
 * repository (`needsOnce`), a workflow's own need of `scope: repository` read in its factory's first repository and never where it has
 * none (`ownCheckOf`, `workflowCheckOf`). The laws of `needStateOf`, `needsHolding` and `fixRefusal` are proved by
 * `contracts/needs.contract.ts`.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import type { Need } from 'objects';
import {
  checkRan,
  checkKey,
  harnessCheckOf,
  needsMemo,
  needsOnce,
  needsEnv,
  ownCheckOf,
  repositoryCheckOf,
  workflowCheckOf,
} from './needs.verb.ts';
import { needsHolding, needsOfRun, needStateOf } from './needs.ts';
import { workflowNeeds, workflowNeedsRead, workflowReadme } from '../folder/folder.store.ts';
import { toolsDir } from '../config/root.store.ts';
import { createFactoryAt } from '../factory/factory.store.ts';
import { carriedDirOf } from '../frozen/frozen.store.ts';
import { PlaceService } from '../place/place.store.ts';
import { trustPlaces } from '../trust/trust.verb.ts';
import { testPlace } from '../../place/memory/place.ts';

const ROOT = scratch('wf-needs-read-');

/** What `check` reads, run in the store with the shell and the bound given. */
const stateOf = (check: string, ms = 2_000, shell?: string) =>
  Effect.runPromise(checkRan(ROOT, { check }, { ms, ...(shell === undefined ? {} : { shell }) })).then(needStateOf);

describe('a check reads met on exit 0, missing on any other exit, and unknown past its time or with no shell, holding nothing', () => {
  test('exit 0 is met, exit 1 missing', async () => {
    assert.equal(await stateOf('exit 0'), 'met');
    assert.equal(await stateOf('exit 1'), 'missing');
  });
  test('a check past its bound is stopped and reads unknown, which holds no fresh run', async () => {
    const state = await stateOf('sleep 30', 100);
    assert.equal(state, 'unknown');
    assert.deepEqual(needsHolding(false, [{ name: 'slow', state }]), []);
  });
  test('a check whose shell cannot start reads unknown', async () => {
    assert.equal(await stateOf('exit 1', 2_000, path.join(ROOT, 'no-such-shell')), 'unknown');
  });
  test('a check runs with the tools folder first on its PATH and named as NEMIA_TOOLS', async () => {
    const env = needsEnv(ROOT, { PATH: '/usr/bin:/bin' });
    assert.equal(env.PATH.split(path.delimiter)[0], path.join(toolsDir(ROOT), 'bin'));
    assert.equal(env.NEMIA_TOOLS, toolsDir(ROOT));
    assert.equal(await stateOf(`test "$NEMIA_TOOLS" = "${toolsDir(ROOT)}"`), 'met');
    fs.mkdirSync(path.join(toolsDir(ROOT), 'bin'), { recursive: true });
    fs.writeFileSync(path.join(toolsDir(ROOT), 'bin', 'nemia-test-tool'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    assert.equal(await stateOf('nemia-test-tool'), 'met', 'a tool installed in the tools folder is found by name');
  });
});

/** A workflow folder whose README holds `readme`. */
const withReadme = (readme: string): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'README.md'), readme);
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  return dir;
};

describe("a workflow's needs are its README's frontmatter, which its instruction leaves out", () => {
  test('the needs read, and the README text without the frontmatter', () => {
    const dir = withReadme('---\nneeds:\n  - name: tool\n    message: the tool\n    check: command -v tool\n---\n# Build\n\nBuilds it.\n');
    assert.deepEqual(workflowNeeds(dir), [{ name: 'tool', message: 'the tool', check: 'command -v tool' }]);
    assert.equal(workflowReadme(dir), '# Build\n\nBuilds it.\n');
  });
  test('a README with no frontmatter declares none, and reads whole', () => {
    const dir = withReadme('# Build\n');
    assert.deepEqual(workflowNeeds(dir), []);
    assert.equal(workflowReadme(dir), '# Build\n');
  });
  test('needs that do not read are none, and say why', () => {
    const read = workflowNeedsRead(withReadme('---\nneeds:\n  - name: tool\n---\n'));
    assert.deepEqual(read.needs, []);
    assert.equal(typeof read.error, 'string');
  });
});

test("a workflow's need that fills a place's goes before the place's own fixes, and adds no need of its own; a harness's goes last", () => {
  const place: Need[] = [
    { name: 'git-identity', message: 'identity', check: 'true', fixes: [{ command: 'place-fix', message: 'by hand' }] },
  ];
  const workflow: Need[] = [
    { name: 'tool', message: 'tool', check: 'true' },
    {
      name: 'from-host',
      message: 'from the host',
      check: 'true',
      fills: 'git-identity',
      fixes: [{ command: 'host-fix', message: 'host' }],
    },
  ];
  const needs = needsOfRun(workflow, place);
  assert.deepEqual(
    needs.map((n) => n.name),
    ['tool', 'git-identity'],
  );
  assert.deepEqual(
    needs[1]?.fixes?.map((f) => f.command),
    ['host-fix', 'place-fix'],
  );
  const harness: Need[] = [
    { name: 'git-identity', message: 'named twice', check: 'false' },
    { name: 'some-harness', message: 'installed', check: 'true' },
  ];
  assert.deepEqual(
    needsOfRun(workflow, place, harness).map((n) => n.name),
    ['tool', 'git-identity', 'some-harness'],
    "a harness's need follows, and one another need names is left out",
  );
});

/** A workflow `dev` of a factory's own repository, under `home`, its README declaring one need checked by `check`. */
const devRepo = (home: string, check: string): { repo: string; dir: string } => {
  const repo = fs.mkdtempSync(path.join(home, 'repo-'));
  const dir = path.join(repo, 'workflows', 'dev');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), `---\nneeds:\n  - name: tool\n    message: the tool\n    check: ${check}\n---\n`);
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  return { repo, dir };
};

test("a sweep reads the places', the harnesses' and every trusted factory's workflows' and repository's needs, each kept by its check and folders, and runs no check of an untrusted one", async () => {
  const home = scratch('wf-needs-sweep-');
  const trusted = devRepo(home, 'exit 1');
  const untrusted = devRepo(home, 'touch ran');
  createFactoryAt(home, { name: 'acme', repos: [trusted.repo], workflows: ['dev'], hires: {}, schedules: {} });
  createFactoryAt(home, { name: 'stray', repos: [untrusted.repo], workflows: ['dev'], hires: {}, schedules: {} });
  const placed = PlaceService.layer(testPlace().place);
  await Effect.runPromise(trustPlaces([trusted.repo]).pipe(Effect.provide(placed)));
  const memo = needsMemo(home, 2_000);
  const toolchain: Need = { name: 'toolchain', message: 'the toolchain', check: 'touch ran-here && test -f here', scope: 'repository' };
  memo.placeNeeds = [{ name: 'identity', message: 'identity', check: 'exit 0' }, toolchain];
  fs.writeFileSync(path.join(trusted.repo, 'here'), '');
  const read = await Effect.runPromise(needsOnce(memo).pipe(Effect.provide(placed)));
  assert.equal(read.get(checkKey({ check: 'exit 0' })), 'met');
  const own = { workflowFiles: trusted.dir, carriedFiles: carriedDirOf(trusted.dir) };
  assert.equal(read.get(checkKey({ check: 'exit 1', ...own })), 'missing');
  assert.equal(
    read.get(checkKey(repositoryCheckOf(toolchain, trusted.repo))),
    'met',
    "a repository need is read in the factory's repository",
  );
  assert.equal(read.has(checkKey({ check: toolchain.check })), false, 'and never on the machine alone');
  assert.ok(memo.harnessNeeds.length > 0, 'the runtime declares harnesses with needs');
  for (const need of memo.harnessNeeds) assert.ok(read.has(checkKey(harnessCheckOf(need))), `${need.name} is swept`);
  assert.equal(read.size, 3 + memo.harnessNeeds.length, "the untrusted factory's checks are not swept");
  assert.equal(fs.existsSync(path.join(home, 'ran')), false, 'and never ran');
  assert.equal(fs.existsSync(path.join(untrusted.repo, 'ran-here')), false, 'nor its repository need');
  assert.equal(memo.version, read.size);
});

test("a workflow's need of scope repository is swept in its factory's repository, where the same check unscoped reads the store's folder", async () => {
  const home = scratch('wf-needs-scoped-');
  const repo = fs.mkdtempSync(path.join(home, 'repo-'));
  const dir = path.join(repo, 'workflows', 'dev');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    [
      '---',
      'needs:',
      '  - name: inside',
      '    message: met inside the repository',
      '    check: test -f only-here && test -n "$WF_CARRIED_FILES"',
      '    scope: repository',
      '  - name: outside',
      '    message: the same check, unscoped',
      '    check: test -f only-here',
      '---',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  fs.writeFileSync(path.join(repo, 'only-here'), '');
  createFactoryAt(home, { name: 'acme', repos: [repo], workflows: ['dev'], hires: {}, schedules: {} });
  const placed = PlaceService.layer(testPlace().place);
  await Effect.runPromise(trustPlaces([repo]).pipe(Effect.provide(placed)));
  const memo = needsMemo(home, 2_000);
  memo.placeNeeds = [];
  const read = await Effect.runPromise(needsOnce(memo).pipe(Effect.provide(placed)));
  const w = { factory: 'acme', workflow: 'dev', dir, repository: repo };
  const [inside, outside] = workflowNeedsRead(dir).needs;
  assert.ok(inside !== undefined && outside !== undefined);
  const scoped = workflowCheckOf(w, inside);
  assert.equal(scoped?.cwd, repo, "it runs in the factory's repository");
  assert.equal(read.get(checkKey(scoped ?? { check: 'none' })), 'met', 'told the carried files, as an unscoped check is');
  const unscoped = workflowCheckOf(w, outside);
  assert.equal(unscoped?.cwd, undefined, 'a need that says no scope runs where it always has');
  assert.equal(read.get(checkKey(unscoped ?? { check: 'none' })), 'missing');
});

test("a workflow's need of scope repository is never checked where there is no repository; one with no scope is checked without one", () => {
  const folders = { workflowFiles: '/w', carriedFiles: '/c' };
  const scoped: Need = { name: 'n', message: 'm', check: 'true', scope: 'repository' };
  const unscoped: Need = { name: 'n', message: 'm', check: 'true' };
  const rows: Array<[string, Need, string | undefined, ReturnType<typeof ownCheckOf>]> = [
    ['scoped, in a repository', scoped, '/r', { check: 'true', ...folders, cwd: '/r' }],
    ['scoped, with no repository', scoped, undefined, undefined],
    ['unscoped, in a repository', unscoped, '/r', { check: 'true', ...folders }],
    ['unscoped, with no repository', unscoped, undefined, { check: 'true', ...folders }],
  ];
  for (const [row, need, repository, want] of rows) assert.deepEqual(ownCheckOf(need, folders, repository), want, row);
  assert.equal(workflowCheckOf({ factory: 'f', workflow: 'w', dir: '/w' }, scoped), undefined, 'a factory with no repository');
});
