/**
 * The needs read: a check that answers past its time or whose shell does not start reads `unknown` and holds nothing (`checkRan`, on a
 * shortened bound and a shell that is not there); a workflow's needs read off its README's frontmatter, which its instruction no longer
 * shows (`workflowNeeds`, `workflowReadme`); a workflow need that fills a place's goes before it (`needsOfRun`); and the sweep reads the
 * places' needs and every factory's workflows' (`needsOnce`). The laws of `needStateOf`, `needsHolding` and `fixRefusal` are proved by
 * `contracts/needs.contract.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import type { Need } from 'objects';
import { checkRan, checkKey, needsMemo, needsOnce, needsEnv } from './needs.verb.ts';
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

test('a check reads met on exit 0, missing on any other exit, and unknown past its time or with no shell, holding nothing', async (t) => {
  await t.test('exit 0 is met, exit 1 missing', async () => {
    assert.equal(await stateOf('exit 0'), 'met');
    assert.equal(await stateOf('exit 1'), 'missing');
  });
  await t.test('a check past its bound is stopped and reads unknown, which holds no fresh run', async () => {
    const state = await stateOf('sleep 30', 100);
    assert.equal(state, 'unknown');
    assert.deepEqual(needsHolding(false, [{ name: 'slow', state }]), []);
  });
  await t.test('a check whose shell cannot start reads unknown', async () => {
    assert.equal(await stateOf('exit 1', 2_000, path.join(ROOT, 'no-such-shell')), 'unknown');
  });
  await t.test('a check runs with the tools folder first on its PATH and named as NEMIA_TOOLS', async () => {
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

test("a workflow's needs are its README's frontmatter, which its instruction leaves out", async (t) => {
  await t.test('the needs read, and the README text without the frontmatter', () => {
    const dir = withReadme('---\nneeds:\n  - name: tool\n    message: the tool\n    check: command -v tool\n---\n# Build\n\nBuilds it.\n');
    assert.deepEqual(workflowNeeds(dir), [{ name: 'tool', message: 'the tool', check: 'command -v tool' }]);
    assert.equal(workflowReadme(dir), '# Build\n\nBuilds it.\n');
  });
  await t.test('a README with no frontmatter declares none, and reads whole', () => {
    const dir = withReadme('# Build\n');
    assert.deepEqual(workflowNeeds(dir), []);
    assert.equal(workflowReadme(dir), '# Build\n');
  });
  await t.test('needs that do not read are none, and say why', () => {
    const read = workflowNeedsRead(withReadme('---\nneeds:\n  - name: tool\n---\n'));
    assert.deepEqual(read.needs, []);
    assert.equal(typeof read.error, 'string');
  });
});

test("a workflow's need that fills a place's goes before the place's own fixes, and adds no need of its own", () => {
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

test("a sweep reads the places' needs and every trusted factory's workflows', each kept by its check and folders, and runs no check of an untrusted one", async () => {
  const home = scratch('wf-needs-sweep-');
  const trusted = devRepo(home, 'exit 1');
  const untrusted = devRepo(home, 'touch ran');
  createFactoryAt(home, { name: 'acme', repos: [trusted.repo], workflows: ['dev'], hires: {}, schedules: {} });
  createFactoryAt(home, { name: 'stray', repos: [untrusted.repo], workflows: ['dev'], hires: {}, schedules: {} });
  const placed = PlaceService.layer(testPlace().place);
  await Effect.runPromise(trustPlaces([trusted.repo]).pipe(Effect.provide(placed)));
  const memo = needsMemo(home, 2_000);
  memo.placeNeeds = [{ name: 'identity', message: 'identity', check: 'exit 0' }];
  const read = await Effect.runPromise(needsOnce(memo).pipe(Effect.provide(placed)));
  assert.equal(read.get(checkKey({ check: 'exit 0' })), 'met');
  const own = { workflowFiles: trusted.dir, carriedFiles: carriedDirOf(trusted.dir) };
  assert.equal(read.get(checkKey({ check: 'exit 1', ...own })), 'missing');
  assert.equal(read.size, 2, "the untrusted factory's check is not swept");
  assert.equal(fs.existsSync(path.join(home, 'ran')), false, 'and never ran');
  assert.equal(memo.version, 2);
});
