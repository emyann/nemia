/**
 * The readiness read (`readinessOf`) over facts the test hands it (`ReadinessFacts`): every area it reads is there, in the read's order;
 * the default harness's token is said as set and loading, never as good, which only a refused session or quota shows; a place's need is
 * read by its check and carries the command that fixes it; the service, linger, bind and machine pieces follow what their commands and
 * the environment answer; and the read is `ready` only where no piece is missing. The test's store is its own, at `ROOT`.
 */
import { createFactoryAt } from '../factory/factory.store.ts';
import path from 'node:path';
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import type { Need } from 'objects';
import { testPlace } from '../../place/memory/index.ts';
import { declared } from '../../place/memory/place.ts';
import { PlaceService } from '../place/place.store.ts';
import { StoreRoot, toolsBinDir } from '../config/root.store.ts';
import { TOKEN_NAME, TOKEN_VARIABLE } from '../sign-in/sign-in.store.ts';
import { readinessOf, type CommandRead, type ReadinessFacts } from './readiness.verb.ts';

const ROOT = scratch('wf-readiness-');

/** The place need the test place declares here: met, or missing, as `check` says. */
const identity = (check: string): Need => ({
  name: 'identity',
  message: 'an identity is set',
  check,
  fixes: [{ command: 'set-identity', message: 'set it' }],
});

/** Facts of a machine whose environment is `env`, each command answering as `answers` says (by default exit 0, nothing printed). */
const facts = (env: Record<string, string>, answers: Record<string, CommandRead> = {}): ReadinessFacts => ({
  env,
  user: 'someone',
  exists: () => true,
  run: (command, args) =>
    Object.hasOwn(answers, [command, ...args].join(' ')) ? answers[[command, ...args].join(' ')] : { code: 0, out: '' },
  signIn: () => ({ state: 'unknown' }),
  ownSignIn: () => 'signed-out',
  running: { kind: 'checkout', root: ROOT },
});

/** The read, over `given` facts, the test place declaring `need`. */
const read = (given: ReadinessFacts, need: Need) =>
  Effect.runPromise(
    readinessOf(given).pipe(
      Effect.provide(PlaceService.layer({ ...testPlace().place, declared: { ...declared, needs: [need] } })),
      Effect.provideService(StoreRoot, ROOT),
    ),
  );

test('the read says each area in order, the token as set and loading, never as good, and a place need by its check', async () => {
  const PATH = `${toolsBinDir(ROOT)}:/usr/bin`;
  const got = await read(facts({ [TOKEN_VARIABLE]: 'a-token', PATH, NEMIA_BIND: '127.0.0.1' }), identity('exit 0'));
  const areas = [...new Set(got.pieces.map((p) => p.area))];
  assert.deepEqual(areas, ['harness', 'service', 'bind', 'machine', 'place', 'factory', 'release']);
  const token = got.pieces.find((p) => p.name === TOKEN_NAME);
  assert.equal(token?.state, 'met');
  assert.doesNotMatch(token?.message ?? '', /\bvalid\b|\bgood\b(?! shows)/);
  const need = got.pieces.find((p) => p.name === 'identity');
  assert.equal(need?.state, 'met');
  assert.equal(got.pieces.find((p) => p.area === 'bind')?.addressKind, 'loopback');
});

test('a missing place need, a missing token and a stopped service each read missing with their fixes, and the read is not ready', async () => {
  const stopped = { 'systemctl --user is-active nemia.service': { code: 3, out: 'inactive\n' } };
  const got = await read(facts({ PATH: '/usr/bin' }, stopped), identity('exit 1'));
  assert.equal(got.ready, false);
  const need = got.pieces.find((p) => p.name === 'identity');
  assert.equal(need?.state, 'missing');
  assert.ok(need?.fixes.some((f) => f.command.startsWith('nemia readiness fix identity')));
  assert.equal(got.pieces.find((p) => p.name === TOKEN_NAME)?.state, 'missing');
  assert.equal(got.pieces.find((p) => p.area === 'service')?.state, 'missing');
});

test("with no token kept or given, Claude Code's own login meets the harness piece, said as signed in, never as good", async () => {
  const got = await read({ ...facts({ PATH: '/usr/bin' }), ownSignIn: () => 'signed-in' }, identity('exit 0'));
  const token = got.pieces.find((p) => p.name === TOKEN_NAME);
  assert.equal(token?.state, 'met');
  assert.doesNotMatch(token?.message ?? '', /\bvalid\b|\bgood\b(?! shows)/);
});

test('a need of a factory whose places are not trusted is unknown, its check never run, with the command that trusts them', async () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'stray-'));
  const dir = path.join(repo, 'workflows', 'dev');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), '---\nneeds:\n  - name: stray-tool\n    message: the tool\n    check: touch ran\n---\n');
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  createFactoryAt(ROOT, { name: 'stray', repos: [repo], workflows: ['dev'], hires: {}, schedules: {} });
  const got = await read(facts({ PATH: '/usr/bin' }), identity('exit 0'));
  const need = got.pieces.find((p) => p.name === 'stray-tool');
  assert.equal(need?.state, 'unknown');
  assert.deepEqual(
    need?.fixes.map((f) => f.command),
    ['nemia factory trust stray'],
  );
  assert.equal(fs.existsSync(path.join(ROOT, 'ran')), false, 'its check never ran');
});

test('every piece declares what it costs while missing: linger and the bind keep the server up or open, the token and a need a run waits on; and the read says whether a run was ever started', async () => {
  const home = scratch('wf-readiness-ran-');
  const readAt = (given: ReadinessFacts) =>
    Effect.runPromise(
      readinessOf(given).pipe(
        Effect.provide(PlaceService.layer({ ...testPlace().place, declared: { ...declared, needs: [identity('exit 1')] } })),
        Effect.provideService(StoreRoot, home),
      ),
    );
  const unlingered = { 'loginctl show-user someone -p Linger': { code: 0, out: 'Linger=no\n' } };
  const before = await readAt(facts({ PATH: '/usr/bin' }, unlingered));
  assert.ok(
    before.pieces.every((p) => p.cost !== undefined),
    'each piece declares its cost',
  );
  const costOf = (name: string) => before.pieces.find((p) => p.name === name)?.cost;
  assert.equal(before.pieces.find((p) => p.name === 'linger')?.state, 'missing');
  assert.equal(costOf('linger'), 'server');
  assert.equal(costOf('bind'), 'server');
  assert.equal(costOf(TOKEN_NAME), 'run');
  assert.equal(costOf('identity'), 'run');
  assert.equal(costOf('factory'), 'run');
  assert.equal(before.ran, false, 'no run was started in a store with no run record');
  fs.mkdirSync(path.join(home, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(home, 'runs', 'r-1.json'), '{}');
  assert.equal((await readAt(facts({ PATH: '/usr/bin' }))).ran, true, "a run's record says a run was started");
});

test('cgroup v2 and the user manager cost a run only where the daemon files its sessions under a memory limit', async () => {
  const without = await read({ ...facts({ PATH: '/usr/bin' }), exists: () => false }, identity('exit 0'));
  assert.equal(without.pieces.find((p) => p.name === 'cgroup-v2')?.cost, 'server');
  const limited = await read({ ...facts({ PATH: '/usr/bin', WF_MEMORY_LIMIT: '2Gi' }), exists: () => false }, identity('exit 0'));
  assert.equal(limited.pieces.find((p) => p.name === 'cgroup-v2')?.cost, 'run');
  assert.equal(limited.pieces.find((p) => p.name === 'systemd-user')?.cost, 'run');
});
