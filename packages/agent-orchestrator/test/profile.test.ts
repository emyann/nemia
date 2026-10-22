/**
 * The profiler preload of the side Grafana (`tools/observe/profile/`): with no `PYROSCOPE_SERVER_ADDRESS` it loads nothing and opens no
 * connection; with one it starts the profiler once, under the daemon's service, and leaves its children no endpoint; and nothing the
 * repository ships names it.
 *
 * The preload and its decision are copied byte for byte into a scratch folder, beside a fake `@pyroscope/nodejs` that writes each import,
 * `init` and `start` to the file `PROFILE_RECORD` names. Each child is `node --import <copy>/preload.ts -e …`, bounded by `timeout`, with
 * the variables the test asserts on set by the test, never inherited.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { workspaces } from './workspaces.ts';
import { scratch } from './scratch.ts';
import { DEFAULT_SERVICE_NAME } from '../src/telemetry/telemetry.ts';
import { DEFAULT_SERVICE, ENDPOINT_KEY, FLUSH_MS, PROFILER, profilingOf } from '../../../tools/observe/profile/profiling.ts';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..');
const PROFILE = path.join(REPO_ROOT, 'tools', 'observe', 'profile');
const PRELOAD = fs.readFileSync(path.join(PROFILE, 'preload.ts'), 'utf8');
const ROOT = scratch('wf-profile-');

/** The fake profiler's entry: each import, `init` and `start` appended to `PROFILE_RECORD` as a line of JSON. */
const FAKE = [
  "import fs from 'node:fs';",
  'const note = (line) => fs.appendFileSync(process.env.PROFILE_RECORD, JSON.stringify(line) + "\\n");',
  "note({ call: 'import' });",
  "export default { init: (options) => note({ call: 'init', options }), start: () => note({ call: 'start' }) };",
  '',
].join('\n');

/** A scratch folder holding `preload` as `preload.ts`, the shipped `profiling.ts`, and the fake profiler where the preload imports it. */
function preloadFolder(preload: string): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'profile-'));
  fs.writeFileSync(path.join(dir, 'preload.ts'), preload);
  fs.copyFileSync(path.join(PROFILE, 'profiling.ts'), path.join(dir, 'profiling.ts'));
  const fake = path.join(dir, 'node_modules', ...PROFILER.split('/'));
  fs.mkdirSync(fake, { recursive: true });
  fs.writeFileSync(path.join(fake, 'package.json'), JSON.stringify({ name: PROFILER, type: 'module', exports: './index.js' }));
  fs.writeFileSync(path.join(fake, 'index.js'), FAKE);
  return dir;
}

/** What a child says: the endpoint left in its environment, and the resources it holds once its preload has run. */
type Said = { endpoint: string | null; resources: string[] };

/** What one child run with `preload` (or none) under `vars` said, and what the fake profiler recorded of it. */
type Seen = { said: Said; record: { call: string; options?: Record<string, unknown> }[] };

const CHILD =
  'console.log(JSON.stringify({ endpoint: process.env.PYROSCOPE_SERVER_ADDRESS ?? null, resources: process.getActiveResourcesInfo() }))';

/** Runs a child under `vars` alone of the profiler's variables, preloading `preload` written beside the fake, or nothing when null. */
function childSeen(preload: string | null, vars: Record<string, string>): Seen {
  const dir = preloadFolder(preload ?? PRELOAD);
  const record = path.join(dir, 'record.jsonl');
  const env: Record<string, string | undefined> = { ...process.env, ...vars, PROFILE_RECORD: record };
  for (const key of [ENDPOINT_KEY, 'OTEL_SERVICE_NAME', 'NODE_OPTIONS']) if (!(key in vars)) delete env[key];
  const imports = preload === null ? [] : ['--import', path.join(dir, 'preload.ts')];
  const ran = spawnSync('timeout', ['-k', '5', '60', process.execPath, ...imports, '-e', CHILD], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(ran.status, 0, ran.stderr);
  const lines = fs.existsSync(record) ? fs.readFileSync(record, 'utf8').trim().split('\n') : [];
  return { said: JSON.parse(ran.stdout) as Said, record: lines.map((l) => JSON.parse(l) as Seen['record'][number]) };
}

/** Why `seen` is not a child that loaded nothing and opened nothing, beside `bare`, the same child run with no preload: each a line. */
function startedWithout(seen: Seen, bare: Seen): string[] {
  const faults = seen.record.map((r) => `the profiler saw ${r.call}`);
  if (JSON.stringify(seen.said.resources) !== JSON.stringify(bare.said.resources))
    faults.push(`it holds ${seen.said.resources.join(', ')}, not ${bare.said.resources.join(', ')}`);
  return faults;
}

const BARE = childSeen(null, {});

test('with no endpoint the preload loads nothing and opens no connection', () => {
  assert.deepEqual(BARE.record, [], 'a child without the preload sees no profiler');
  const blank: Record<string, string>[] = [{}, { [ENDPOINT_KEY]: '' }, { [ENDPOINT_KEY]: '  ' }];
  for (const vars of blank) assert.deepEqual(startedWithout(childSeen(PRELOAD, vars), BARE), [], JSON.stringify(vars));
});

test('REFUSED: a preload that starts the profiler without an endpoint', () => {
  const guard = /if\s*\(\s*profiling\s*\)/;
  assert.match(PRELOAD.slice(PRELOAD.indexOf('profilingOf(process.env)')), guard, 'the preload asks whether to profile');
  const mutant = PRELOAD.replace(guard, 'if (true)');
  assert.deepEqual(startedWithout(childSeen(mutant, {}), BARE), [
    'the profiler saw import',
    'the profiler saw init',
    'the profiler saw start',
  ]);
});

test('with an endpoint it starts once, under the service, and hands its children no endpoint', () => {
  const seen = childSeen(PRELOAD, { [ENDPOINT_KEY]: 'http://127.0.0.1:9/' });
  assert.deepEqual(
    seen.record.map((r) => r.call),
    ['import', 'init', 'start'],
  );
  assert.equal(seen.record[1]?.options?.serverAddress, 'http://127.0.0.1:9');
  assert.equal(seen.record[1]?.options?.appName, DEFAULT_SERVICE_NAME);
  assert.equal(seen.said.endpoint, null, 'the endpoint is taken out of the environment its children inherit');
  const named = childSeen(PRELOAD, { [ENDPOINT_KEY]: 'http://127.0.0.1:9', OTEL_SERVICE_NAME: 'factory' });
  assert.equal(named.record[1]?.options?.appName, 'factory');
});

test('profilingOf answers nothing for no endpoint, and the options for one', () => {
  for (const endpoint of [undefined, '', '  ']) assert.equal(profilingOf({ [ENDPOINT_KEY]: endpoint }), undefined, String(endpoint));
  assert.deepEqual(profilingOf({ [ENDPOINT_KEY]: ' http://localhost:4040// ', OTEL_SERVICE_NAME: ' ' }), {
    serverAddress: 'http://localhost:4040',
    appName: DEFAULT_SERVICE_NAME,
    flushIntervalMs: FLUSH_MS,
    wall: { collectCpuTime: true },
  });
  assert.equal(DEFAULT_SERVICE, DEFAULT_SERVICE_NAME, "a profile is filed under the service the daemon's traces use");
});

/** Each of `files` that names the profiler or its folder: a file the repository ships must name neither. */
const naming = (files: { file: string; text: string }[]): string[] =>
  files.filter(({ text }) => text.includes(PROFILER) || text.includes('tools/observe/profile')).map(({ file }) => file);

/**
 * The files the repository ships: the `package.json` of every workspace the root's names, the root's and its lockfile, and every source
 * under a workspace's `src`. `tools/guards`, never shipped, is read with them: no guard of the repository's names the profiler either.
 */
function shippedFiles(): { file: string; text: string }[] {
  const folders = workspaces().map((dir) => path.join(REPO_ROOT, dir));
  const manifests = [REPO_ROOT, ...folders].map((dir) => path.join(dir, 'package.json')).filter((f) => fs.existsSync(f));
  const sources = folders
    .map((dir) => path.join(dir, 'src'))
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }).map((f) => path.join(dir, f)))
    .filter((f) => /\.tsx?$/.test(f));
  return [...manifests, path.join(REPO_ROOT, 'package-lock.json'), ...sources].map((file) => ({
    file: path.relative(REPO_ROOT, file),
    text: fs.readFileSync(file, 'utf8'),
  }));
}

test('nothing the repository ships names the profiler', () => {
  const shipped = shippedFiles();
  assert.ok(
    shipped.some(({ file }) => file === path.join('apps', 'api', 'src', 'main.ts')),
    'the api start is read',
  );
  assert.ok(
    shipped.some(({ file }) => file === path.join('tools', 'guards', 'package.json')),
    'every workspace is read',
  );
  assert.deepEqual(naming(shipped), []);
  assert.deepEqual(
    naming([
      { file: 'apps/api/package.json', text: JSON.stringify({ dependencies: { [PROFILER]: '0.6.4' } }) },
      { file: 'apps/api/src/main.ts', text: "import '../../../tools/observe/profile/preload.ts';" },
    ]),
    ['apps/api/package.json', 'apps/api/src/main.ts'],
  );
});
