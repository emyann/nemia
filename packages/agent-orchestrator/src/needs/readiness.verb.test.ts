/**
 * The readiness read (`readinessOf`) over facts the test hands it (`ReadinessFacts`): every area it reads is there, in the read's order;
 * each declared harness gives two pieces, its install and its sign-in, each naming its harness and part, read by its check as every need
 * is — a stand-in program in the tools folder, which answers the version the test asks; the install says whether that version is the one
 * the release was tested with, and offers its removal once in place; a sign-in a person types is offered as typed, never started; the
 * default harness's kept token reaches its sign-in check, said as set and loading, never as good, and a token file others may read is
 * missing with the `chmod 600` that fixes it; a place's need is read by its check and carries the command that fixes it; a place's
 * repository need is read per factory; the service, linger, bind and machine pieces follow what their commands and the environment
 * answer; a harness nothing runs on and nobody activated is `inactive`, never counted against `ready`, until it is installed or a
 * factory's workflow names it, its checks run over a PATH of the test's own, with no stand-in of it (`test/ambient.ts` puts one of each
 * harness first); and the read is `ready` only where no piece is missing. The test's store is its own, at `ROOT`.
 */
import { createFactoryAt } from '../factory/factory.store.ts';
import path from 'node:path';
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { CLAUDE_PIN, DEFAULT_HARNESS, HARNESS_DECLARATIONS } from 'agent-runtime/vocabulary';
import type { Need } from 'objects';
import { testPlace } from '../../place/memory/index.ts';
import { declared } from '../../place/memory/place.ts';
import { PlaceService } from '../place/place.store.ts';
import { StoreRoot, toolsBinDir } from '../config/root.store.ts';
import { claudeTokenFile, TOKEN_MAKER, TOKEN_NAME, TOKEN_VARIABLE, writeClaudeToken } from '../sign-in/sign-in.store.ts';
import { signInNeedOf } from './harness.ts';
import { readinessOf, type CommandRead, type ReadinessFacts } from './readiness.verb.ts';
import { sweptFacts } from './sweep.verb.ts';
import { RunDoor, type RunDoorShape } from '../runs/runs.store.ts';
import type { Run } from '../record/record.ts';
import { aRun } from '../../test/run-walks.ts';
import { names } from '../../test/assessed.ts';

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
    const year = new Date(Date.now() - 340 * 86_400_000);
    fs.utimesSync(claudeTokenFile(ROOT), year, year);
    const old = (await read(facts({ PATH: '/usr/bin:/bin' }), identity('exit 0'))).pieces.find((p) => p.name === SIGN_IN);
    assert.equal(old?.state, 'met', 'a token about eleven months old still loads');
    assert.ok(
      old?.fixes.some((f) => f.command.startsWith(TOKEN_MAKER) && f.command.includes(`${TOKEN_NAME} set`)),
      'it offers the commands that make a new one',
    );
    assert.equal(old?.message.includes('a-token'), false, 'never the token');
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

test('a harness nobody activated and no workflow runs on is inactive, its install offered, and counts against nothing until it is installed or named', async (t) => {
  const [other, declaration] = Object.entries(HARNESS_DECLARATIONS).find(([name, d]) => name !== DEFAULT_HARNESS && d.needs) ?? [];
  assert.ok(other !== undefined && declaration?.needs !== undefined, 'the runtime declares a second harness with needs');
  const PATH = `${toolsBinDir(ROOT)}:/usr/bin:/bin`;
  const name = declaration.needs.program;
  const program = path.join(toolsBinDir(ROOT), name);
  const ambient = process.env.PATH;
  process.env.PATH = (ambient ?? '')
    .split(path.delimiter)
    .filter((dir) => !fs.existsSync(path.join(dir, name)))
    .join(path.delimiter);
  t.after(() => {
    process.env.PATH = ambient;
  });
  const states = (got: { pieces: readonly { harness?: { name: string }; state: string }[] }) =>
    got.pieces.filter((p) => p.harness?.name === other).map((p) => p.state);

  const idle = await read(facts({ PATH }), identity('exit 0'));
  assert.deepEqual(states(idle), ['inactive', 'inactive']);
  const install = idle.pieces.find((p) => p.name === other);
  assert.deepEqual(
    install?.fixes.map((f) => [f.kind, f.startable, f.index]),
    [[undefined, true, 0]],
    'it offers its install, which activates it',
  );
  assert.equal(idle.pieces.find((p) => p.name === signInNeedOf(other))?.fixes.length, 0, 'and no sign-in before it is installed');
  assert.equal(
    idle.ready,
    idle.pieces.every((p) => p.state !== 'missing'),
    'an inactive piece is not missing, and ready reads only missing ones',
  );

  fs.writeFileSync(program, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  try {
    assert.deepEqual(states(await read(facts({ PATH }), identity('exit 0'))), ['met', 'met'], 'installed, a person activated it');
  } finally {
    fs.rmSync(program);
  }

  const repo = fs.mkdtempSync(path.join(ROOT, 'named-'));
  const dir = path.join(repo, 'workflows', 'dev');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: folder\nharness: ${other}\n---\nimplement it\n`);
  createFactoryAt(ROOT, { name: 'named', repos: [repo], workflows: ['dev'], hires: {}, schedules: {} });
  const named = await read(facts({ PATH }), identity('exit 0'));
  assert.deepEqual(states(named), ['missing', 'missing'], "a factory's workflow runs on it, so it counts");
  assert.equal(named.ready, false);
});

/**
 * The second harness the runtime declares with needs, its program taken off this process's PATH for the test `t`, and a read of the store
 * `home` that answers that harness's two pieces' states and whether the read is ready.
 */
const secondHarness = (t: { after: (fn: () => void) => void }) => {
  const [other, declaration] = Object.entries(HARNESS_DECLARATIONS).find(([name, d]) => name !== DEFAULT_HARNESS && d.needs) ?? [];
  assert.ok(other !== undefined && declaration?.needs !== undefined, 'the runtime declares a second harness with needs');
  const program = declaration.needs.program;
  const ambient = process.env.PATH;
  process.env.PATH = (ambient ?? '')
    .split(path.delimiter)
    .filter((dir) => !fs.existsSync(path.join(dir, program)))
    .join(path.delimiter);
  t.after(() => {
    process.env.PATH = ambient;
  });
  const readAt = async (home: string) => {
    const got = await Effect.runPromise(
      readinessOf(facts({ PATH: '/usr/bin:/bin' })).pipe(
        Effect.provide(PlaceService.layer({ ...testPlace().place, declared: { ...declared, needs: [] } })),
        Effect.provideService(StoreRoot, home),
      ),
    );
    return { states: got.pieces.filter((p) => p.harness?.name === other).map((p) => p.state), ready: got.ready };
  };
  return { other, readAt };
};

test("a store agent hired into a factory's step names its harness to the read, as it holds a run on it", async (t) => {
  const { other, readAt } = secondHarness(t);
  const home = scratch('wf-readiness-hired-');
  const agents = path.join(home, 'workflows', 'agents');
  fs.mkdirSync(agents, { recursive: true });
  fs.writeFileSync(path.join(agents, 'coder.md'), `---\nrole: Coder\ndescription: Writes the code.\nharness: ${other}\n---\nwrite it\n`);
  const repo = fs.mkdtempSync(path.join(home, 'hired-'));
  const dir = path.join(repo, 'workflows', 'dev');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: folder\n---\nimplement it\n');

  createFactoryAt(home, { name: 'unhired', repos: [repo], workflows: ['dev'], hires: {}, schedules: {} });
  assert.deepEqual((await readAt(home)).states, ['inactive', 'inactive'], 'the store agent alone, hired nowhere, runs no step');

  createFactoryAt(home, { name: 'hired', repos: [repo], workflows: ['dev'], hires: { 'dev/implement': 'coder' }, schedules: {} });
  const hired = await readAt(home);
  assert.deepEqual(hired.states, ['missing', 'missing'], "hired into the factory's step, the store agent's harness counts");
  assert.equal(hired.ready, false);
});

test('a run of no factory that has filed nothing names the harness its frozen steps run on, and names it no more once a step is filed', async (t) => {
  const { other, readAt } = secondHarness(t);
  const home = scratch('wf-readiness-run-');
  const runs = <A, E>(program: (door: RunDoorShape) => Effect.Effect<A, E>) =>
    Effect.runPromise(Effect.provideService(Effect.flatMap(RunDoor, program), StoreRoot, home));
  assert.deepEqual((await readAt(home)).states, ['inactive', 'inactive'], 'no factory and no run: nothing runs on it');

  const run: Run = {
    ...aRun('r-folder'),
    workflowFiles: 'ab',
    workflow: [{ name: 'implement', after: [], body: 'do it', harness: other }],
    steps: { implement: { taskId: null } },
  };
  assert.equal(run.factory, undefined, 'the run is of no factory');
  await runs((door) => door.runs.create(run));
  const held = await readAt(home);
  assert.deepEqual(held.states, ['missing', 'missing'], 'its frozen step runs on it, so the run would be held on it');
  assert.equal(held.ready, false);

  await runs((door) => door.runs.rewrite({ ...run, steps: { implement: { taskId: 'r-folder-implement' } } }));
  assert.deepEqual((await readAt(home)).states, ['inactive', 'inactive'], 'a run that has filed a step is held on no need');
});

test('every piece declares what it costs while missing: linger and the bind keep the server up or open, a harness and a need a run waits on; and the read says whether a run was ever started', async () => {
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
  assert.equal(costOf(DEFAULT_HARNESS), 'run');
  assert.equal(costOf(SIGN_IN), 'run');
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

test('memory-fit: the sessions at once, each at its request else its limit, against the machine less its floor, naming how many fit and the setting to change', async () => {
  const GIB = 2 ** 30;
  const fitOf = async (env: Record<string, string>) =>
    (await read({ ...facts({ PATH: '/usr/bin', ...env }), memoryBytes: 16 * GIB }, identity('exit 0'))).pieces.find(
      (p) => p.name === 'memory-fit',
    );
  const over = await fitOf({ WF_MAX_CONCURRENT: '6', WF_MEMORY_LIMIT: '7782Mi' });
  assert.equal(over?.state, 'missing', 'six sessions at their 7.6 GiB limit do not fit 16 GiB less 2 GiB kept');
  assert.equal(over?.area, 'machine');
  assert.equal(over?.cost, 'server');
  names(over?.message, '1 session', 'WF_MAX_CONCURRENT=1', 'WF_MEMORY_REQUEST', '14336 MiB');
  assert.deepEqual(
    over?.fixes.map((f) => [f.command, f.kind]),
    [['nemia service install --size auto', 'typed']],
  );
  const fits = await fitOf({ WF_MAX_CONCURRENT: '5', WF_MEMORY_LIMIT: '7782Mi', WF_MEMORY_REQUEST: '2560Mi' });
  assert.equal(fits?.state, 'met', 'five sessions asking 2.5 GiB fit 14 GiB');
  assert.deepEqual(fits?.fixes, []);
  const floored = await fitOf({ WF_MAX_CONCURRENT: '5', WF_MEMORY_REQUEST: '2560Mi', WF_MEMORY_RESERVED: '8Gi' });
  assert.equal(floored?.state, 'missing', 'a floor set higher leaves less to allocate');
  names(floored?.message, 'WF_MEMORY_RESERVED', '3 sessions');
  const limitOver = await fitOf({ WF_MAX_CONCURRENT: '2', WF_MEMORY_LIMIT: '15Gi', WF_MEMORY_REQUEST: '2Gi' });
  assert.equal(limitOver?.state, 'missing', 'one session may grow past what the machine allocates');
  names(limitOver?.message, 'WF_MEMORY_LIMIT');
  const uncounted = await fitOf({ WF_MAX_CONCURRENT: '6' });
  assert.equal(uncounted?.state, 'unknown', 'no limit and no request: nothing is counted, which is no fault');
  names(uncounted?.message, 'WF_MEMORY_LIMIT', 'WF_MEMORY_REQUEST');
  const unread = await read(facts({ PATH: '/usr/bin', WF_MEMORY_REQUEST: '2560Mi' }), identity('exit 0'));
  assert.equal(unread.pieces.find((p) => p.name === 'memory-fit')?.state, 'unknown', "the machine's memory not read");
  const refused = await fitOf({ WF_MEMORY_LIMIT: '2Gi', WF_MEMORY_REQUEST: '4Gi' });
  assert.equal(refused?.state, 'missing', 'a request above the limit is a setting the daemon refuses');
  names(refused?.message, 'WF_MEMORY_REQUEST=4Gi');
});

test('sessions-slice: the slice the sessions run under, read fresh, has a ceiling at or under what the machine allocates, else the command that sets it', async (t) => {
  const GIB = 2 ** 30;
  const SHOW = (slice: string) => `systemctl --user show ${slice} -p MemoryMax --value`;
  const sliceOf = async (env: Record<string, string>, answers: Record<string, CommandRead> = {}, more: Partial<ReadinessFacts> = {}) =>
    (await read({ ...facts({ PATH: '/usr/bin', ...env }, answers), memoryBytes: 16 * GIB, ...more }, identity('exit 0'))).pieces.find(
      (p) => p.name === 'sessions-slice',
    );
  const fixesOf = (p: { fixes: readonly { command: string; kind?: string }[] } | undefined) => p?.fixes.map((f) => [f.command, f.kind]);
  const SIZED = [['nemia service install --size auto', 'typed']];
  const OURS = { WF_CGROUP_PARENT: 'nemia-sessions.slice' };

  await t.test('no slice set: the sessions are in the user manager’s own, which nothing caps', async () => {
    const p = await sliceOf({});
    assert.deepEqual([p?.state, p?.area, p?.cost], ['missing', 'machine', 'server']);
    assert.deepEqual(fixesOf(p), SIZED);
  });
  await t.test('Nemia’s slice with no ceiling: missing, sized again', async () => {
    const p = await sliceOf(OURS, { [SHOW('nemia-sessions.slice')]: { code: 0, out: 'infinity\n' } });
    assert.equal(p?.state, 'missing');
    assert.deepEqual(fixesOf(p), SIZED);
  });
  await t.test('a ceiling at what the machine allocates, 16 GiB less 2 GiB kept: met', async () => {
    const p = await sliceOf(OURS, { [SHOW('nemia-sessions.slice')]: { code: 0, out: '15032385536\n' } });
    assert.equal(p?.state, 'met');
    assert.deepEqual(p?.fixes, []);
  });
  await t.test('a ceiling above it: missing, naming both', async () => {
    const p = await sliceOf(OURS, { [SHOW('nemia-sessions.slice')]: { code: 0, out: '16106127360\n' } });
    assert.equal(p?.state, 'missing');
    names(p?.message, '15360 MiB', '14336 MiB');
    assert.deepEqual(fixesOf(p), SIZED);
  });
  await t.test('a slice the person named: the fix sets its ceiling with systemctl', async () => {
    const p = await sliceOf({ WF_CGROUP_PARENT: 'sessions.slice' }, { [SHOW('sessions.slice')]: { code: 0, out: 'infinity\n' } });
    assert.equal(p?.state, 'missing');
    assert.deepEqual(fixesOf(p), [['systemctl --user set-property sessions.slice MemoryMax=15032385536', 'typed']]);
  });
  await t.test('a higher floor leaves less allocated: 12 GiB is over 8 GiB', async () => {
    const p = await sliceOf({ ...OURS, WF_MEMORY_RESERVED: '8Gi' }, { [SHOW('nemia-sessions.slice')]: { code: 0, out: '12884901888\n' } });
    assert.equal(p?.state, 'missing');
    names(p?.message, '8192 MiB');
  });
  await t.test('not known: systemctl not run, failing or answering nothing, no cgroup v2, or the memory unread', async () => {
    for (const answer of [undefined, { code: 1, out: '' }, { code: 0, out: '' }, { code: 0, out: '12G\n' }] as CommandRead[])
      assert.equal((await sliceOf(OURS, { [SHOW('nemia-sessions.slice')]: answer }))?.state, 'unknown', JSON.stringify(answer));
    assert.equal((await sliceOf(OURS, {}, { exists: () => false }))?.state, 'unknown', 'no cgroup v2');
    assert.equal((await sliceOf(OURS, {}, { memoryBytes: undefined }))?.state, 'unknown', 'memory unread');
  });
  await t.test('a slice the daemon would refuse: missing, in its words', async () => {
    const p = await sliceOf({ WF_CGROUP_PARENT: 'bad' });
    assert.equal(p?.state, 'missing');
    names(p?.message, 'WF_CGROUP_PARENT=bad');
  });
});

test("an archive install's tools piece reads its nemia: missing with no link, naming nemia doctor fix tools; met once linked; a checkout reads none", async () => {
  const PATH = `${toolsBinDir(ROOT)}:/usr/bin:/bin`;
  const link = path.join(toolsBinDir(ROOT), 'nemia');
  fs.rmSync(link, { force: true });
  const installed: ReadinessFacts['running'] = {
    kind: 'install',
    root: path.join(ROOT, 'releases', 'v1.0.0'),
    tag: 'v1.0.0',
    commit: 'c0ffee100',
    source: 'ci',
    builtAt: '2026-11-01T00:00:00.000Z',
    from: 'archive',
  };
  const onDisk = (running: ReadinessFacts['running']): ReadinessFacts => ({
    ...facts({ PATH }),
    exists: (file) => fs.existsSync(file),
    running,
  });
  const tools = async (running: ReadinessFacts['running']) =>
    (await read(onDisk(running), identity('exit 0'))).pieces.find((p) => p.name === 'tools');

  const missing = await tools(installed);
  assert.equal(missing?.state, 'missing');
  assert.deepEqual(
    missing?.fixes.map((f) => [f.command, f.startable]),
    [['nemia doctor fix tools', true]],
    'the fix the server starts, and not the restart: the folder is made and on the PATH',
  );
  assert.equal((await tools({ kind: 'checkout', root: ROOT }))?.state, 'met', "a checkout's person has their own nemia");

  const launcher = path.join(scratch('wf-readiness-release-'), 'nemia');
  fs.writeFileSync(launcher, '#!/bin/sh\n', { mode: 0o755 });
  fs.symlinkSync(launcher, link);
  try {
    assert.equal((await tools(installed))?.state, 'met');
  } finally {
    fs.rmSync(link, { force: true });
  }
});

test("the daemon's sweep reads the machine's facts with no command run, so it never blocks the loop it shares with the passes", () => {
  const facts = sweptFacts();
  const marker = path.join(scratch('wf-swept-facts-'), 'ran');
  assert.equal(facts.run('sh', ['-c', `touch ${marker}`]), undefined, 'a command reads as not started');
  assert.equal(fs.existsSync(marker), false, 'and nothing ran');
  assert.equal(facts.env, process.env, "the rest are this process's own");
});
