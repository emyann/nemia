/**
 * The repository's test-cost recorder (`tools/test-costs/`): what a check's `node --test` leaves in its files directory, and the report
 * that reads it. The fold and the ranking are tested as data; the probe and the reporter on a fixture package (`fixtures/test-costs/`)
 * run in a nested `node --test` with the flags a package's `test` script gives it, without `NODE_TEST_CONTEXT`, under `timeout`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { foldCosts, ranked, type Fragment, type Seen, type TestCosts } from '../../../tools/test-costs/costs.ts';
import { report } from '../../../tools/test-costs/report.ts';

const TOOLS = path.join(import.meta.dirname, '..', '..', '..', 'tools', 'test-costs');
const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'test-costs');

/** A test as the runner reports it, in the fixture's folder. */
const seen = (file: string, name: string, durationMs: number, more: Partial<Seen> = {}): Seen => ({
  file: path.join('/pkg', file),
  line: 1,
  name,
  nesting: 0,
  suite: false,
  ok: true,
  durationMs,
  ...more,
});

/** A probe's fragment for a file of the fixture's folder. */
const fragment = (file: string, maxRssKb: number, wallMs = 100, runner = 42): Fragment => ({
  file: path.join('/pkg', file),
  runner,
  wallMs,
  maxRssKb,
  cpuMs: 10,
  probeMs: 1,
});

const RUNNER = {
  pid: 42,
  package: 'p',
  dir: '/pkg',
  node: 'v0',
  platform: 'linux',
  at: '2026-10-02T00:00:00.000Z',
  wallMs: 1000,
  overheadMs: 5,
};

test('a record keeps the fragments of the files the runner reported, and the package peaks at its largest file', () => {
  const costs = foldCosts(
    [seen('a.test.ts', 'a', 1), seen('b.test.ts', 'b', 2), seen('c.test.ts', 'c', 3)],
    [fragment('a.test.ts', 100), fragment('b.test.ts', 900), fragment('c.test.ts', 200), fragment('child.ts', 5000)],
    RUNNER,
  );
  assert.deepEqual(
    costs.files.map((file) => [file.file, file.peakRssKb]),
    [
      ['a.test.ts', 100],
      ['b.test.ts', 900],
      ['c.test.ts', 200],
    ],
    'a process that ran no reported file leaves no row',
  );
  assert.equal(costs.peakRssKb, 900, "the package's peak is its largest file's, wherever that file is");
  assert.equal(costs.overheadMs, 5 + 4, "the overhead is the reporter's and every probe's");
  assert.deepEqual(
    costs.tests.map((t) => t.file),
    ['a.test.ts', 'b.test.ts', 'c.test.ts'],
  );
});

test('a fragment another runner left, as a try killed before its reporter ended does, is not folded into this one', () => {
  const costs = foldCosts([seen('a.test.ts', 'a', 1)], [fragment('a.test.ts', 100, 50), fragment('a.test.ts', 9000, 900, 7)], RUNNER);
  assert.deepEqual(costs.files, [{ file: 'a.test.ts', wallMs: 50, peakRssKb: 100, cpuMs: 10 }]);
  assert.equal(costs.overheadMs, 5 + 1, "only this runner's probes count in its overhead");
});

test("a file whose process left no fragment has no figures, and adds nothing to the package's peak", () => {
  const costs = foldCosts([seen('a.test.ts', 'a', 1)], [], RUNNER);
  assert.deepEqual(costs.files, [{ file: 'a.test.ts', wallMs: null, peakRssKb: null, cpuMs: null }]);
  assert.equal(costs.peakRssKb, null);
});

/** A record of tests and files, for the rankings. */
const record = (pkg: string, tests: Seen[], fragments: Fragment[]): TestCosts => foldCosts(tests, fragments, { ...RUNNER, package: pkg });

test('the slowest tests come first, a suite is left out, and top cuts the list', () => {
  const costs = record(
    'p',
    [seen('a.test.ts', 'one', 1), seen('a.test.ts', 'two', 2), seen('a.test.ts', 'three', 3), seen('a.test.ts', 'all', 9, { suite: true })],
    [],
  );
  assert.deepEqual(
    ranked([costs], 10).tests.map((t) => t.name),
    ['three', 'two', 'one'],
  );
  assert.deepEqual(
    ranked([costs], 2).tests.map((t) => t.name),
    ['three', 'two'],
  );
});

test('over several records, a row keeps its largest figure and counts the records it appeared in', () => {
  const first = record('p', [seen('a.test.ts', 'one', 5), seen('b.test.ts', 'two', 1)], [fragment('a.test.ts', 300, 50)]);
  const second = record('p', [seen('a.test.ts', 'one', 2)], [fragment('a.test.ts', 700, 20)]);
  const { tests, slowFiles, heavyFiles } = ranked([first, second], 10);
  assert.deepEqual(
    tests.map((t) => [t.name, t.value, t.checks]),
    [
      ['one', 5, 2],
      ['two', 1, 1],
    ],
  );
  assert.deepEqual(
    slowFiles.map((f) => [f.file, f.value, f.checks]),
    [['a.test.ts', 50, 2]],
  );
  assert.deepEqual(
    heavyFiles.map((f) => [f.file, f.value, f.checks]),
    [['a.test.ts', 700, 2]],
  );
});

/** The flags a package's `test` script gives `node --test` to record, with the tools' paths made absolute. */
const RECORDING = [
  `--import=${path.join(TOOLS, 'probe.ts')}`,
  '--test',
  '--test-reporter=spec',
  '--test-reporter-destination=stdout',
  `--test-reporter=${path.join(TOOLS, 'reporter.ts')}`,
  '--test-reporter-destination=stderr',
];

/** The fixture's `files` run under `node --test` with `flags`, in its folder, bounded, with `WF_ARTIFACTS` set to `artifacts` or unset. */
function runFixture(files: string[], artifacts: string | null, flags = RECORDING) {
  const { NODE_TEST_CONTEXT: _context, WF_ARTIFACTS: _artifacts, ...env } = process.env;
  const ran = spawnSync('timeout', ['-k', '5', '120', process.execPath, ...flags, ...files], {
    cwd: FIXTURE,
    env: artifacts === null ? env : { ...env, WF_ARTIFACTS: artifacts },
    encoding: 'utf8',
  });
  return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr };
}

/** The records a run left in `artifacts`, by name. */
const recordsIn = (artifacts: string): string[] => fs.readdirSync(artifacts).filter((name) => name.startsWith('test-costs-'));

const ALL = ['light.test.ts', 'heavy.test.ts', 'failing.test.ts', 'spawner.test.ts'];

test("a check's node --test leaves one record of its tests and files, its exit code unchanged, and no fragment behind", () => {
  const artifacts = scratch('test-costs-');
  const ran = runFixture(ALL, artifacts);
  assert.equal(ran.status, 1, `the failing test fails the run, as without the recording: ${ran.stderr}`);
  const names = recordsIn(artifacts);
  assert.equal(names.length, 1, `one record: ${names.join(', ')}`);
  assert.match(names[0], /^test-costs-fixture-\d{4}-\d\d-\d\dT\d{6}\.\d{3}Z\.json$/);
  const costs = JSON.parse(fs.readFileSync(path.join(artifacts, names[0]), 'utf8')) as TestCosts;
  assert.equal(costs.package, 'fixture');
  assert.deepEqual(
    [...costs.tests]
      .sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0))
      .map((t) => [t.file, t.line, t.name, t.ok, t.suite]),
    [
      ['failing.test.ts', 4, 'fails on purpose', false, false],
      ['heavy.test.ts', 4, 'fills 64 MiB', true, false],
      ['light.test.ts', 3, 'a suite', true, true],
      ['light.test.ts', 4, 'nested and quick', true, false],
      ['light.test.ts', 7, 'quick', true, false],
      ['spawner.test.ts', 8, 'spawns a process that loads the probe and is no test file', true, false],
    ],
  );
  assert.deepEqual(costs.files.map((f) => f.file).sort(), [...ALL].sort(), 'the spawned child.ts, no test file, leaves no row');
  const heavy = costs.files.find((f) => f.file === 'heavy.test.ts');
  assert.ok((heavy?.peakRssKb ?? 0) >= 64 * 1024, `the file that fills 64 MiB peaks at ${heavy?.peakRssKb} KB`);
  assert.equal(costs.peakRssKb, Math.max(...costs.files.map((f) => f.peakRssKb ?? 0)));
  for (const file of costs.files) {
    assert.ok(
      file.wallMs !== null && file.wallMs <= costs.wallMs,
      `${file.file} (${file.wallMs} ms) lives within its runner (${costs.wallMs} ms)`,
    );
  }
  assert.equal(typeof costs.overheadMs, 'number');
  assert.ok(!fs.existsSync(path.join(artifacts, '.test-costs')), 'the fragments are removed once folded');
});

test("a killed try's fragment left in the files directory is not read into the next try's record, and is removed", () => {
  const artifacts = scratch('test-costs-');
  const left = path.join(artifacts, '.test-costs', 'fixture');
  fs.mkdirSync(left, { recursive: true });
  const stale: Fragment = { file: path.join(FIXTURE, 'light.test.ts'), runner: 1, wallMs: 9e9, maxRssKb: 9e9, cpuMs: 9e9, probeMs: 9e9 };
  fs.writeFileSync(path.join(left, '1.json'), JSON.stringify(stale));
  const ran = runFixture(['light.test.ts'], artifacts);
  assert.equal(ran.status, 0, ran.stderr);
  const [name] = recordsIn(artifacts);
  const costs = JSON.parse(fs.readFileSync(path.join(artifacts, name), 'utf8')) as TestCosts;
  const light = costs.files.find((f) => f.file === 'light.test.ts');
  assert.ok(light && light.peakRssKb !== null && light.peakRssKb < 9e9, `light.test.ts peaks at ${light?.peakRssKb} KB, its own process's`);
  assert.ok(light.wallMs !== null && light.wallMs < 9e9);
  assert.ok(costs.overheadMs < 9e9, "the dead try's probe is no overhead of this one");
  assert.ok(!fs.existsSync(path.join(artifacts, '.test-costs')), "the dead try's fragment is removed with this one's");
});

test("the spec reporter's lines stay on stdout, as with no recording", () => {
  const lines = (stdout: string) =>
    stdout
      .split('\n')
      .filter((line) => /^\s*[✔✖] .* \([\d.]+ms\)$/.test(line))
      .map((line) => line.replace(/\([\d.]+ms\)$/, ''));
  const recorded = runFixture(['light.test.ts', 'failing.test.ts'], scratch('test-costs-'));
  const plain = runFixture(['light.test.ts', 'failing.test.ts'], null, ['--test', '--test-reporter=spec']);
  assert.ok(lines(recorded.stdout).length >= 4, recorded.stdout);
  assert.deepEqual(lines(recorded.stdout), lines(plain.stdout));
});

test('without WF_ARTIFACTS, a run records nothing', () => {
  const before = fs.readdirSync(FIXTURE).sort();
  const ran = runFixture(['light.test.ts'], null);
  assert.equal(ran.status, 0, ran.stderr);
  assert.deepEqual(fs.readdirSync(FIXTURE).sort(), before, 'nothing is written beside the tests');
  assert.doesNotMatch(ran.stderr, /test costs/);
});

test('REFUSED: a recording that cannot be written fails no check, and says so on stderr', () => {
  const artifacts = path.join(scratch('test-costs-'), 'a-file');
  fs.writeFileSync(artifacts, '');
  const passing = runFixture(['light.test.ts'], artifacts);
  assert.equal(passing.status, 0, `a passing run still passes: ${passing.stderr}`);
  assert.match(passing.stderr, /test costs: not recorded for fixture: /);
  const failing = runFixture(['failing.test.ts'], artifacts);
  assert.equal(failing.status, 1, `a failing run still fails, and only by its test: ${failing.stderr}`);
});

/** A folder holding `records`, each written as a check's record. */
function folderOf(records: TestCosts[]): string {
  const dir = scratch('test-costs-report-');
  records.forEach((costs, i) => fs.writeFileSync(path.join(dir, `test-costs-${costs.package}-${i}.json`), JSON.stringify(costs)));
  return dir;
}

test('the report ranks the records of several folders, slowest first, and names a folder with none', () => {
  const one = folderOf([record('p', [seen('a.test.ts', 'slow', 30), seen('a.test.ts', 'quick', 1)], [fragment('a.test.ts', 2048)])]);
  const two = folderOf([record('q', [seen('b.test.ts', 'slower', 40)], [fragment('b.test.ts', 4096)])]);
  const empty = scratch('test-costs-report-');
  const { out, err, code } = report(['--top', '2', one, two, empty]);
  assert.equal(code, 0, err);
  const slowest = out.split('\n\n').find((part) => part.startsWith('slowest 2 tests')) ?? '';
  assert.deepEqual(
    slowest
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/).at(-1)),
    ['slower', 'slow'],
  );
  assert.match(out, /^\s+p\s+1\s/m);
  assert.match(out, /^\s+q\s+1\s/m);
  assert.equal(err, `test costs: no record in ${empty}\n`);
});

test('REFUSED: a report of folders with no record exits 2 and names the folder to pass', () => {
  const { out, err, code } = report([scratch('test-costs-report-')]);
  assert.equal(code, 2);
  assert.equal(out, '');
  assert.ok(err.includes("pass a check's files directory"), err);
  assert.ok(err.includes('~/.agent-workflows/runs/<run>/artifacts/<step>'), err);
  assert.equal(report(['--top', 'x', '.']).code, 2);
});
