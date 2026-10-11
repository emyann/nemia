/**
 * The render of a checkout's dashboards (`tools/observe/render/`): the container it starts is its own — the pinned image, read-only
 * binds of the checkout, no named volume, no fixed port, never the live stack's name — and is removed by that exact name after a
 * failed start; one render at a time through a lock, a dead holder's container removed first; a held stack is bounded, removed by its
 * reaper at its bound or by `--stop`, which refuses every name but a held render's; and a panel's text says a nameless bar, an empty
 * panel and an error.
 *
 * No container is ever started here: `docker` is a stub first on the `PATH`, which records each call it is given, and the lock is a
 * file of this test's own (`NEMIA_RENDER_LOCK`). The real stack, seed and browser are run by hand, as `tools/observe/README.md` says.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { scratch } from './scratch.ts';
import { until, WAITED } from './waits.ts';
import { boundOf, HOLD_DEFAULT, heldLines, heldName } from '../../../tools/observe/render/hold.ts';
import { locked, lockFile, release, take, type Lock } from '../../../tools/observe/render/lock.ts';
import { addressOf, heightOf, written, type Seen } from '../../../tools/observe/render/panels.ts';
import { dashboardsOf, planOf } from '../../../tools/observe/render/plan.ts';
import { NAME, nameOf, runArgv, type Compose } from '../../../tools/observe/render/stack.ts';

const REPO = path.join(import.meta.dirname, '..', '..', '..');
const OBSERVE = path.join(REPO, 'tools', 'observe');
const RENDER = path.join(OBSERVE, 'render');
const COMPOSE = yaml.load(fs.readFileSync(path.join(OBSERVE, 'compose.yaml'), 'utf8')) as Compose;

const ROOT = scratch('wf-observe-render-');
const BIN = path.join(ROOT, 'bin');
const CALLS = path.join(ROOT, 'docker.calls');
const GONE = path.join(ROOT, 'container.gone');

/**
 * The stub: records its arguments; `port` fails, as a container that never came up; `wait` returns once a removal was recorded, as
 * the real one does when its container ends; everything else succeeds.
 */
const STUB = `#!/bin/sh
echo "$*" >> "${CALLS}"
case "$1" in
  port) exit 1 ;;
  rm) touch "${GONE}" ;;
  wait) while [ ! -e "${GONE}" ]; do sleep 0.05; done ;;
esac
exit 0
`;

fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, 'docker'), STUB, { mode: 0o755 });
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH ?? ''}`;
process.env.NEMIA_RENDER_LOCK = path.join(ROOT, 'render.lock');

/** Every call the stub was given, a line each, and a fresh record for the next test. */
const calls = (): string[] => (fs.existsSync(CALLS) ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean) : []);
const fresh = (): void => {
  for (const file of [CALLS, GONE, lockFile()]) fs.rmSync(file, { force: true });
};

/** Run a file of the render with `args`, bounded, its environment this one's; its exit and what it said. */
function ran(file: string, args: string[]): { status: number | null; out: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.WF_ARTIFACTS;
  const r = spawnSync(process.execPath, [path.join(RENDER, file), ...args], { env, encoding: 'utf8', timeout: 100_000 });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** The pid of a process that has ended. */
const deadPid = (): number => spawnSync(process.execPath, ['-e', '0']).pid;

/** The message of the error `fn` throws. */
const refused = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail('nothing was refused');
};

test("the container is the checkout's own: the pinned image, its binds read-only, no named volume, no fixed port, never the live name", () => {
  const name = nameOf();
  assert.match(name, NAME);
  const argv = runArgv(COMPOSE, '/w/tools/observe', name);
  const service = Object.values(COMPOSE.services ?? {})[0];
  assert.equal(argv.at(-1), service.image);
  assert.deepEqual(argv.slice(0, 5), ['run', '-d', '--rm', '--name', name]);
  const after = (flag: string): string[] => argv.flatMap((word, i) => (argv[i - 1] === flag ? [word] : []));
  assert.deepEqual(after('-p'), ['127.0.0.1::3000', '127.0.0.1::4318'], 'loopback, the host port left to Docker');
  const binds = after('-v');
  assert.equal(binds.length, (service.volumes ?? []).filter((line) => line.startsWith('./')).length);
  assert.ok(binds.includes('/w/tools/observe/dashboards:/otel-lgtm/nemia/dashboards:ro'), binds.join('\n'));
  for (const bind of binds) assert.match(bind, /^\/w\/tools\/observe\/.+:\/.+:ro$/, bind);
  assert.ok(after('-e').includes('OTELCOL_EXTRA_ARGS=--config=/otel-lgtm/nemia/otelcol.yaml'));
  assert.ok(!argv.join(' ').includes('nemia-lgtm') && !argv.join(' ').includes('data:/data'), argv.join(' '));
  const other = runArgv({ services: { x: { image: 'i@sha256:1', volumes: ['./extra.yaml:/etc/extra.yaml', 'data:/data'] } } }, '/o', name);
  assert.deepEqual(other.slice(-3), ['-v', '/o/extra.yaml:/etc/extra.yaml:ro', 'i@sha256:1'], 'the binds are read from the file');
});

test('REFUSED: a container started under a name that is no render’s, the live stack’s among them', () => {
  for (const name of ['nemia-lgtm', 'nemia-render-*', 'nemia-render-12', 'x nemia-render-1-ab'])
    assert.ok(refused(() => runArgv(COMPOSE, OBSERVE, name)).includes("is no render's name"), name);
});

test('REFUSED: a flag or a dashboard the render does not know, before anything is started', () => {
  assert.ok(refused(() => planOf(['--photos'])).includes('--photos: not a flag of the render'));
  assert.ok(refused(() => planOf(['--out'])).includes('--out needs a value'));
  assert.ok(refused(() => planOf(['--wait', 'soon'])).includes('--wait soon: a whole number of seconds'));
  assert.ok(refused(() => dashboardsOf(OBSERVE, ['steps', 'nope'])).includes('no dashboard nope'));
  assert.deepEqual(
    dashboardsOf(OBSERVE, ['steps']).map((d) => [d.name, d.uid]),
    [['steps', 'nemia-steps']],
  );
  assert.equal(planOf(['--hold']).hold, HOLD_DEFAULT);
  assert.equal(planOf(['--hold', '--out', '/x'], { WF_ARTIFACTS: '/files' }).out, '/x');
  assert.equal(planOf([], { WF_ARTIFACTS: '/files' }).out, '/files');
  assert.equal(planOf([], {}).out, path.join(REPO, '.observe'));
});

test('a render whose container never comes up exits non-zero, and removes it by the exact name it started it under', () => {
  fresh();
  const r = ran('render.ts', ['--dashboards', 'steps', '--out', path.join(ROOT, 'out')]);
  assert.equal(r.status, 1, r.out);
  const said = calls();
  const name = /^run -d --rm --name (\S+) /.exec(said[0])?.[1] ?? '';
  assert.match(name, NAME, said.join('\n'));
  assert.equal(said.at(-1), `rm -f -v ${name}`, said.join('\n'));
  assert.ok(!said.some((line) => line.includes('nemia-lgtm') || line.includes('*')), said.join('\n'));
  assert.equal(locked(), undefined, 'the slot is let go');
});

test('one render at a time: a second is refused at its bound naming the holder, a dead holder’s container is removed first', async () => {
  fresh();
  await take('nemia-render-1-first0', 0);
  const second = await take('nemia-render-2-second', 0).then(
    () => 'taken',
    (err: Error & { exitCode?: number }) => `${err.exitCode}: ${err.message}`,
  );
  assert.match(second, /^2: this machine's one render slot is held by nemia-render-1-first0, a render in flight/);
  assert.ok(second.includes('--wait <seconds>'), second);
  release('nemia-render-2-second');
  assert.equal(locked()?.name, 'nemia-render-1-first0', 'a release by another name leaves the lock');
  release('nemia-render-1-first0');
  assert.equal(locked(), undefined);
  const dead: Lock = { pid: deadPid(), name: 'nemia-render-9-dead00', held: true, until: 'x' };
  fs.writeFileSync(lockFile(), JSON.stringify(dead));
  await take('nemia-render-3-third0', 0);
  assert.deepEqual(calls(), ['rm -f -v nemia-render-9-dead00']);
  assert.equal(locked()?.name, 'nemia-render-3-third0');
});

test('REFUSED: a hold of no seconds, of more than half an hour, of a fraction or of a word', () => {
  assert.equal(boundOf(undefined), 600);
  assert.equal(boundOf('1800'), 1800);
  for (const arg of ['0', '1801', '1.5', 'abc'])
    assert.ok(refused(() => boundOf(arg)).includes(`--hold ${arg}: a stack is held a whole number of seconds from 1 to 1800`), arg);
});

test('a hold says its container, how to stop it, where Grafana listens and each dashboard at the address its picture was taken at', () => {
  const picks = { from: 1000, to: 2000, run: 'r-1', session: 's-1' };
  const name = 'nemia-render-7-abc123';
  const lines = heldLines(name, new Date(0), 'http://127.0.0.1:5', [{ name: 'steps', uid: 'nemia-steps' }], picks);
  assert.deepEqual(lines, [
    `held: ${name}, until 1970-01-01T00:00:00.000Z`,
    `stop it with: node tools/observe/render/render.ts --stop ${name}`,
    'Grafana listens on http://127.0.0.1:5 (no login)',
    `steps  ${addressOf('http://127.0.0.1:5', 'nemia-steps', picks)}`,
  ]);
  const address = new URL(addressOf('http://127.0.0.1:5', 'nemia-steps', picks));
  assert.equal(address.pathname, '/d/nemia-steps');
  assert.deepEqual(
    ['from', 'to', 'var-run', 'var-session'].map((key) => address.searchParams.get(key)),
    ['1000', '2000', 'r-1', 's-1'],
  );
});

/** Start the reaper of the held stack `name` for `seconds`, the lock naming it; the child. */
function reaping(name: string, seconds: number): ReturnType<typeof spawn> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, [path.join(RENDER, 'reap.ts'), name, String(seconds)], { env, stdio: 'ignore' });
  fs.writeFileSync(lockFile(), JSON.stringify({ pid: child.pid ?? 0, name, held: true, until: 'soon' } satisfies Lock));
  return child;
}

test('a held stack is removed by its name when its bound ends, and the slot let go', WAITED, async () => {
  fresh();
  const name = 'nemia-render-5-bound0';
  const [code] = (await once(reaping(name, 0), 'exit')) as [number];
  assert.equal(code, 0);
  assert.deepEqual(calls(), [`wait ${name}`, `rm -f -v ${name}`]);
  assert.equal(locked(), undefined);
});

test('--stop removes a held stack by its name, once; its reaper ends and lets the slot go', WAITED, async (t) => {
  fresh();
  const name = 'nemia-render-6-stop00';
  const reaper = reaping(name, 1800);
  const ended = once(reaper, 'exit');
  await until(t, () => calls().includes(`wait ${name}`), 'the reaper waiting on its container', { everyMs: 50 });
  const stopped = ran('render.ts', ['--stop', name]);
  assert.equal(stopped.status, 0, stopped.out);
  await ended;
  assert.deepEqual(calls(), [`wait ${name}`, `rm -f -v ${name}`], 'one removal, the stop’s');
  assert.equal(locked(), undefined);
});

test('REFUSED: a stop of the live stack, of a pattern, of a render in flight and of a stack that has ended, with no docker call made', () => {
  fresh();
  const inFlight: Lock = { pid: process.pid, name: 'nemia-render-8-flight' };
  fs.writeFileSync(lockFile(), JSON.stringify(inFlight));
  for (const [name, why] of [
    ['nemia-lgtm', "not a render's container"],
    ['nemia-render-*', "not a render's container"],
    ['nemia-render-8-flight', 'no stack is held under that name'],
    ['nemia-render-8-ended0', 'no stack is held under that name'],
  ]) {
    const r = ran('render.ts', ['--stop', name]);
    assert.equal(r.status, 2, r.out);
    assert.ok(r.out.includes(`--stop ${name}: ${why}`), r.out);
  }
  assert.deepEqual(calls(), []);
  assert.equal(heldName('nemia-render-8-flight', { ...inFlight, held: true }), 'nemia-render-8-flight');
  assert.ok(refused(() => heldName('nemia-render-8-flight', undefined)).includes('no stack is held'));
});

/** A panel as the page shows it, drawing nothing. */
const panel = (title: string, type: string, more: Partial<Seen> = {}): Seen => ({
  id: '1',
  title,
  type,
  bars: [],
  series: [],
  header: [],
  rows: [],
  lines: [],
  body: '',
  ...more,
});

test("a panel's text: a bar with no name is written (no name), an empty panel no data, an error word for word", () => {
  const text = written(
    'Steps',
    'http://g/d/nemia-steps',
    [
      panel('Tool errors, across runs', 'bargauge', { bars: [{ name: '', value: '3' }] }),
      panel('Denied calls', 'bargauge', { bars: [{ name: 'Bash(git push)', value: '2' }] }),
      panel('Unmeasured', 'table', { body: 'No data' }),
      panel('Broken', 'timeseries', { error: 'parse error at line 1, col 7: syntax error', series: ['a'] }),
      panel('Tokens over time', 'timeseries', { series: ['implement in', 'review in'] }),
      panel('Each', 'table', { header: ['run', 'tool'], rows: [['r-1', 'Bash']] }),
      panel('CPU', 'flamegraph', { body: 'Top Table Flame Graph 0 ns | 0 samples (Time)' }),
    ],
    { CPU: 'no profile is sent' },
  );
  const block = (title: string): string => (text.split('\n\n').find((part) => part.startsWith(`## ${title} `)) ?? '').trimEnd();
  assert.equal(block('Tool errors, across runs'), '## Tool errors, across runs [bargauge]\n  bar: (no name) = 3');
  assert.equal(block('Denied calls'), '## Denied calls [bargauge]\n  bar: Bash(git push) = 2');
  assert.equal(block('Unmeasured'), '## Unmeasured [table]\n  no data');
  assert.equal(block('Broken'), '## Broken [timeseries]\n  error: parse error at line 1, col 7: syntax error');
  assert.equal(block('Tokens over time'), '## Tokens over time [timeseries]\n  series: implement in\n  series: review in');
  assert.equal(block('Each'), '## Each [table]\n  columns: run | tool\n  row: r-1 | Bash');
  assert.equal(block('CPU'), '## CPU [flamegraph]\n  no data\n  not seeded: no profile is sent');
  assert.ok(text.startsWith('# Steps\n\nhttp://g/d/nemia-steps\n'), text);
});

test('the window is as tall as the dashboard, so no panel waits below it for its data', () => {
  const row = { type: 'row', gridPos: { y: 0, h: 1 } };
  const low = { type: 'table', gridPos: { y: 90, h: 10 } };
  assert.ok(heightOf({ uid: 'u', title: 't', panels: [row, low] }) >= 100 * 38);
  assert.equal(heightOf({ uid: 'u', title: 't', panels: [] }), 900);
});
