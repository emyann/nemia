/**
 * The readiness read (`readinessOf`) over facts the test hands it (`ReadinessFacts`): every area it reads is there, in the read's order;
 * each declared harness gives two pieces, its install and its sign-in, each naming its harness and part, read by its check as every need
 * is — a stand-in program in the tools folder, which answers the version the test asks; the install says whether that version is the one
 * the release was tested with, and offers its removal once in place; a sign-in a person types is offered as typed, never started; the
 * default harness's kept token reaches its sign-in check, said as set and loading, never as good, and a token file others may read is
 * missing with the `chmod 600` that fixes it; a place's need is read by its check and carries the command that fixes it; a place's
 * repository need is read per factory; the service, linger, bind and machine pieces follow what their commands and the environment
 * answer; and the read is `ready` only where no piece is missing. The test's store is its own, at `ROOT`.
 */
import { createFactoryAt } from '../factory/factory.store.ts';
import path from 'node:path';
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { CLAUDE_PIN, DEFAULT_HARNESS } from 'agent-runtime/vocabulary';
import type { Need } from 'objects';
import { testPlace } from '../../place/memory/index.ts';
import { declared } from '../../place/memory/place.ts';
import { PlaceService } from '../place/place.store.ts';
import { StoreRoot, toolsBinDir } from '../config/root.store.ts';
import { claudeTokenFile, TOKEN_VARIABLE, writeClaudeToken } from '../sign-in/sign-in.store.ts';
import { signInNeedOf } from './harness.ts';
import { readinessOf, type CommandRead, type ReadinessFacts } from './readiness.verb.ts';

const ROOT = scratch('wf-readiness-');
delete process.env[TOKEN_VARIABLE];

/** The file whose presence signs the stand-in in, as its own login would. */
const SIGNED_IN = path.join(ROOT, 'signed-in');

/**
 * The default harness's program, a stand-in in the store's tools folder: signed in where `SIGNED_IN` is there or a token is given in its
 * variable, and printing a version to `--version`, which the read asks through `facts.run` instead.
 */
const planted = (): void => {
  fs.mkdirSync(toolsBinDir(ROOT), { recursive: true });
  fs.writeFileSync(
    path.join(toolsBinDir(ROOT), DEFAULT_HARNESS),
    `#!/bin/sh\ncase "$1" in\n  auth) test -f "${SIGNED_IN}" || test -n "$${TOKEN_VARIABLE}" ;;\n  *) exit 0 ;;\nesac\n`,
    { mode: 0o755 },
  );
};
planted();

/** The place need the test place declares here: met, or missing, as `check` says. */
const identity = (check: string): Need => ({
  name: 'identity',
  message: 'an identity is set',
  check,
  fixes: [{ command: 'set-identity', message: 'set it' }],
});

/**
 * Facts of a machine whose environment is `env`, each command answering as `answers` says (by default exit 0, nothing printed), and a
 * harness's version command, run through `sh -c`, printing `version`.
 */
const facts = (env: Record<string, string>, answers: Record<string, CommandRead> = {}, version = CLAUDE_PIN): ReadinessFacts => ({
  env,
  user: 'someone',
  exists: () => true,
  run: (command, args) => {
    if (command === 'env' && args.at(-1)?.endsWith('--version')) return { code: 0, out: `${version} (the stand-in)\n` };
    const key = [command, ...args].join(' ');
    return Object.hasOwn(answers, key) ? answers[key] : { code: 0, out: '' };
  },
  running: { kind: 'checkout', root: ROOT },
});

/** The read, over `given` facts, the test place declaring `needs`. */
const read = (given: ReadinessFacts, ...needs: Need[]) =>
  Effect.runPromise(
    readinessOf(given).pipe(
      Effect.provide(PlaceService.layer({ ...testPlace().place, declared: { ...declared, needs } })),
      Effect.provideService(StoreRoot, ROOT),
    ),
  );

const SIGN_IN = signInNeedOf(DEFAULT_HARNESS);

test('the read says each area in order, each harness as two pieces, and a place need by its check', async () => {
  const PATH = `${toolsBinDir(ROOT)}:/usr/bin:/bin`;
  fs.writeFileSync(SIGNED_IN, '');
  const got = await read(facts({ PATH, NEMIA_BIND: '127.0.0.1' }), identity('exit 0'));
  const areas = [...new Set(got.pieces.map((p) => p.area))];
  assert.deepEqual(areas, ['harness', 'service', 'bind', 'machine', 'place', 'factory', 'release']);
  const harnesses = got.pieces.filter((p) => p.area === 'harness');
  assert.ok(harnesses.length >= 2 && harnesses.length % 2 === 0, 'each harness gives two pieces');
  for (const p of harnesses) assert.ok(p.harness !== undefined, `${p.name} names its harness`);
  assert.deepEqual(
    harnesses.filter((p) => p.harness?.name === DEFAULT_HARNESS).map((p) => [p.name, p.harness?.part, p.state]),
    [
      [DEFAULT_HARNESS, 'install', 'met'],
      [SIGN_IN, 'sign-in', 'met'],
    ],
  );
  assert.equal(got.pieces.find((p) => p.name === 'identity')?.state, 'met');
  assert.equal(got.pieces.find((p) => p.area === 'bind')?.addressKind, 'loopback');
});

test('a harness in place says whether its version is the pin and offers its removal; one signed out offers each typed fix, none startable', async () => {
  fs.rmSync(SIGNED_IN, { force: true });
  const untested = await read(facts({ PATH: '/usr/bin:/bin' }, {}, '0.0.1'), identity('exit 0'));
  const install = untested.pieces.find((p) => p.name === DEFAULT_HARNESS);
  assert.equal(install?.state, 'met');
  assert.match(install?.message ?? '', /\buntested\b/);
  assert.deepEqual(
    install?.fixes.map((f) => [f.kind, f.startable, f.index]),
    [['removes', true, 1]],
    'a piece in place offers only what takes it away',
  );
  const tested = (await read(facts({ PATH: '/usr/bin:/bin' }), identity('exit 0'))).pieces.find((p) => p.name === DEFAULT_HARNESS);
  assert.match(tested?.message ?? '', /\btested\b/);
  assert.doesNotMatch(tested?.message ?? '', /\buntested\b/);
  const signIn = untested.pieces.find((p) => p.name === SIGN_IN);
  assert.equal(signIn?.state, 'missing');
  assert.equal(untested.ready, false);
  assert.ok(signIn?.fixes.length, 'it offers a fix');
  for (const fix of signIn?.fixes ?? []) assert.deepEqual([fix.kind, fix.startable], ['typed', false]);
});

test('the kept token reaches the sign-in check, said as set and loading, never as good; a file others may read is missing, its chmod typed', async () => {
  fs.rmSync(SIGNED_IN, { force: true });
  writeClaudeToken(ROOT, 'a-token');
  try {
    const kept = (await read(facts({ PATH: '/usr/bin:/bin' }), identity('exit 0'))).pieces.find((p) => p.name === SIGN_IN);
    assert.equal(kept?.state, 'met');
    assert.doesNotMatch(kept?.message ?? '', /\bvalid\b|\bgood\b(?! shows)/);
    fs.chmodSync(claudeTokenFile(ROOT), 0o644);
    const open = (await read(facts({ PATH: '/usr/bin:/bin' }), identity('exit 0'))).pieces.find((p) => p.name === SIGN_IN);
    assert.equal(open?.state, 'missing');
    assert.deepEqual(
      open?.fixes.map((f) => [f.kind, f.startable, f.command.startsWith('chmod 600 ')]),
      [['typed', false, true]],
    );
  } finally {
    fs.rmSync(claudeTokenFile(ROOT), { force: true });
  }
});

test('a missing place need and a stopped service each read missing with their fixes, and the read is not ready', async () => {
  const stopped = { 'systemctl --user is-active nemia.service': { code: 3, out: 'inactive\n' } };
  const got = await read(facts({ PATH: '/usr/bin' }, stopped), identity('exit 1'));
  assert.equal(got.ready, false);
  const need = got.pieces.find((p) => p.name === 'identity');
  assert.equal(need?.state, 'missing');
  assert.ok(need?.fixes.some((f) => f.command.startsWith('nemia doctor fix identity')));
  assert.equal(got.pieces.find((p) => p.area === 'service')?.state, 'missing');
});

test("a need of a factory whose places are not trusted is unknown, its check never run, with the command that trusts them — a workflow's and a repository's alike", async () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'stray-'));
  const dir = path.join(repo, 'workflows', 'dev');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), '---\nneeds:\n  - name: stray-tool\n    message: the tool\n    check: touch ran\n---\n');
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  createFactoryAt(ROOT, { name: 'stray', repos: [repo], workflows: ['dev'], hires: {}, schedules: {} });
  const toolchain: Need = { name: 'toolchain', message: 'the toolchain', check: 'touch ran-here', scope: 'repository' };
  const got = await read(facts({ PATH: '/usr/bin' }), identity('exit 0'), toolchain);
  const need = got.pieces.find((p) => p.name === 'stray-tool');
  assert.equal(need?.state, 'unknown');
  assert.deepEqual(
    need?.fixes.map((f) => f.command),
    ['nemia factory trust stray'],
  );
  assert.equal(fs.existsSync(path.join(ROOT, 'ran')), false, 'its check never ran');
  const repository = got.pieces.find((p) => p.name === 'toolchain');
  assert.deepEqual(
    [repository?.area, repository?.state, repository?.factory, repository?.workflow],
    ['repository', 'unknown', 'stray', undefined],
  );
  assert.deepEqual(
    repository?.fixes.map((f) => f.command),
    ['nemia factory trust stray'],
  );
  assert.equal(got.pieces.filter((p) => p.name === 'toolchain' && p.area === 'place').length, 0, 'never read on the machine alone');
  assert.equal(fs.existsSync(path.join(repo, 'ran-here')), false, 'its check never ran in the repository');
});
