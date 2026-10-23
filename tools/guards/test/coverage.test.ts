/**
 * The repository's coverage tool (`tools/coverage/`), as data: the record reduced from planted lcov text, the comparison of two
 * records, the coverage flags put in a package's test script, and `compare.ts`'s exit codes through its `main`. Nothing here
 * spawns: `coverage.boundary.test.ts` runs `record.ts` on a fixture package.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import {
  compared,
  judged,
  recordOf,
  withCoverage,
  type CoverageRecord,
  type FileCoverage,
  type V8Script,
} from '../../coverage/coverage.ts';
import { main } from '../../coverage/compare.ts';

const PKG = '/repo/packages/p';

/** An lcov section for `file` with the lines it hit and missed, and its branches taken and not. */
const section = (file: string, hit: number[], missed: number[], branches: { taken: number; not: number } = { taken: 0, not: 0 }) =>
  [
    `SF:${file}`,
    ...hit.map((at) => `DA:${at},3`),
    ...missed.map((at) => `DA:${at},0`),
    `LF:${hit.length + missed.length}`,
    `LH:${hit.length}`,
    ...Array.from({ length: branches.taken }, (_, i) => `BRDA:1,0,${i},2`),
    ...Array.from({ length: branches.not }, (_, i) => `BRDA:1,0,${branches.taken + i},0`),
    `BRF:${branches.taken + branches.not}`,
    `BRH:${branches.taken}`,
    'end_of_record',
  ].join('\n');

/** A file's coverage with `hitLines` hit of `found`, and `branchHit` branches of `branchFound`: no arm, as lcov alone leaves it. */
const cover = (hitLines: number[], found: number, branchHit = 0, branchFound = 0): FileCoverage => ({
  lines: { found, hit: hitLines.length, hitLines },
  branches: { found: branchFound, hit: branchHit },
  arms: { taken: {}, untaken: {} },
});

/** A record of package `p` holding `files`. */
const recordWith = (files: Record<string, FileCoverage>): CoverageRecord => ({ version: 2, package: 'p', files });

/** A source with one branch: its `yes` arm opens on line 2, at its brace, its `no` arm on line 5. */
const PICK = "export const pick = (x: boolean): string => {\n  if (x) {\n    return 'yes';\n  }\n  return 'no';\n};\n";
const FN = { start: PICK.indexOf('(x'), end: PICK.indexOf('};') + 1 };
const YES = { start: PICK.indexOf('{\n    return'), end: PICK.indexOf('  }\n') + 3 };
const NO = { start: YES.end, end: FN.end - 1 };

/**
 * One process's coverage of `src/pick.ts`, as V8 writes it: `pick` called `calls` times, the arms by their counts, the script
 * `tail` characters past the source's end. V8 leaves out an arm's range where it ran as often as `pick`, so a process that took one
 * arm alone reports only the other.
 */
const ran = (calls: number, arms: { yes?: number; no?: number }, tail = 0): V8Script[] => {
  const range = (at: { start: number; end: number }, count = 1) => ({ startOffset: at.start, endOffset: at.end, count });
  const blocks = [...(arms.yes === undefined ? [] : [range(YES, arms.yes)]), ...(arms.no === undefined ? [] : [range(NO, arms.no)])];
  const functions = [{ ranges: [range({ start: 0, end: PICK.length + tail })] }, { ranges: [range(FN, calls), ...blocks] }];
  return [{ url: `file://${PKG}/src/pick.ts`, functions }];
};

/** The record of `src/pick.ts` from `processes`, its lines all hit in the lcov, as both arms of one file would leave them. */
const pickRecord = (...processes: V8Script[][]): CoverageRecord =>
  recordOf(
    section(`${PKG}/src/pick.ts`, [1, 2, 3, 4, 5, 6], [], { taken: 2, not: 0 }),
    PKG,
    () => processes,
    () => PICK,
  );

test('a record keeps the package’s own sources and drops its tests, its helpers, its fixtures and what lies outside it', async (t) => {
  const rows: { name: string; lcov: string; files: Record<string, FileCoverage> }[] = [
    {
      name: 'a source is kept, its lines and branches read from DA, LF, LH, BRDA, BRF and BRH',
      lcov: section(`${PKG}/src/run/run.ts`, [3, 1, 2], [4], { taken: 1, not: 2 }),
      files: { 'src/run/run.ts': cover([1, 2, 3], 4, 1, 3) },
    },
    { name: 'a test beside its code is dropped', lcov: section(`${PKG}/src/run/run.test.ts`, [1], []), files: {} },
    { name: 'a helper under test/ is dropped', lcov: section(`${PKG}/test/ambient.ts`, [1], []), files: {} },
    { name: 'a fixture is dropped', lcov: section(`${PKG}/src/fixtures/plant.ts`, [1], []), files: {} },
    { name: 'a file of another package is dropped', lcov: section('/repo/packages/agent-runtime/src/a.ts', [1], []), files: {} },
    { name: 'a dependency is dropped', lcov: section(`${PKG}/node_modules/effect/x.js`, [1], []), files: {} },
    {
      name: 'a path relative to the package is read from its folder',
      lcov: section('src/b.ts', [2], [1]),
      files: { 'src/b.ts': cover([2], 2) },
    },
  ];
  for (const row of rows) {
    await t.test(row.name, () => {
      const record = recordOf(row.lcov, PKG, () => []);
      assert.equal(record.version, 2);
      assert.equal(record.package, 'p');
      assert.deepEqual(record.files, row.files);
    });
  }
});

test('a REFUSED comparison names the file whose hit lines fell, with the line lost, and the file gone from after', () => {
  const before = recordWith({ 'src/a.ts': cover([1, 2, 3], 4, 2, 2), 'src/b.ts': cover([1], 1), 'src/c.ts': cover([5], 5) });
  const after = recordWith({ 'src/a.ts': cover([1, 3], 4, 2, 2), 'src/c.ts': cover([5], 5), 'src/new.ts': cover([], 3) });
  const falls = compared(before, after);
  assert.deepEqual(
    falls.map((fall) => [fall.file, fall.gone, fall.linesLost]),
    [
      ['src/a.ts', false, [2]],
      ['src/b.ts', true, [1]],
    ],
  );
  assert.deepEqual(falls[0].lines, { before: 3, after: 2 });
});

test('a comparison where every file hits what it did, or more, finds no fall', () => {
  const before = recordWith({ 'src/a.ts': cover([1, 2], 4, 1, 2) });
  assert.deepEqual(compared(before, recordWith({ 'src/a.ts': cover([1, 2, 3], 4, 2, 2) })), []);
});

test("a branch is judged by its arms, each taken when any test process took it, against a before whose checkout's longer path ran its script past the source", async (t) => {
  const bothInOne = pickRecord(ran(2, { yes: 1, no: 1 }, 40));
  const rows: [name: string, after: V8Script[][], lost: number[]][] = [
    ['two arms taken by two test files are nothing lost, each process leaving out its own', [ran(1, { no: 0 }), ran(1, { yes: 0 })], []],
    ['an arm no process reports is read as the range around it, here taken', [ran(1, {}), ran(1, { yes: 0 })], []],
    ['an arm no test takes any more is REFUSED, by its file and line', [ran(1, { no: 0 })], [5]],
  ];
  for (const [name, after, lost] of rows) {
    await t.test(name, () => {
      const falls = compared(bothInOne, pickRecord(...after));
      assert.deepEqual(
        falls.map((fall) => [fall.file, fall.armsLost]),
        lost.length > 0 ? [['src/pick.ts', lost]] : [],
      );
    });
  }
});

test('records on either side tell a line or an arm the records disagree on, which varies, from one no test takes any more', async (t) => {
  const two = recordWith({ 'src/a.ts': cover([1, 2], 2) });
  const one = recordWith({ 'src/a.ts': cover([1], 2) });
  const arm = (taken: boolean): CoverageRecord => ({
    ...two,
    files: { 'src/a.ts': { ...cover([1, 2], 2), arms: { taken: taken ? { '10-20': 2 } : {}, untaken: taken ? {} : { '10-20': 2 } } } },
  });
  const rows: [
    name: string,
    before: CoverageRecord[],
    after: CoverageRecord[],
    lost: [number[], number[]],
    varying: [number[], number[]],
  ][] = [
    ['a line one before-record hit and another did not varies, and is no fall', [two, one], [one], [[], []], [[2], []]],
    ['a line one after-record hits and another does not varies, and is no fall', [two], [two, one], [[], []], [[2], []]],
    [
      'two before-records each hitting a line the other did not, and an after-record hitting neither, vary: no fall, though fewer are hit',
      [recordWith({ 'src/a.ts': cover([1, 2, 3], 4) }), recordWith({ 'src/a.ts': cover([1, 2, 4], 4) })],
      [recordWith({ 'src/a.ts': cover([1, 2], 4) })],
      [[], []],
      [[3, 4], []],
    ],
    [
      'a line every before-record hit and no after-record hits is REFUSED, by its file and line',
      [two, two],
      [one, one],
      [[2], []],
      [[], []],
    ],
    [
      'an arm one after-record takes and another does not varies, and is no fall',
      [arm(true)],
      [arm(true), arm(false)],
      [[], []],
      [[], [2]],
    ],
    [
      'an arm every before-record took and no after-record takes is REFUSED, by its line',
      [arm(true), arm(true)],
      [arm(false)],
      [[], [2]],
      [[], []],
    ],
  ];
  for (const [name, before, after, lost, varying] of rows) {
    await t.test(name, () => {
      const found = judged(before, after);
      assert.deepEqual(
        found.falls.map((fall) => [fall.file, fall.linesLost, fall.armsLost]),
        lost.flat().length > 0 ? [['src/a.ts', ...lost]] : [],
      );
      assert.deepEqual(
        found.varying.map((v) => [v.file, v.lines, v.armLines]),
        varying.flat().length > 0 ? [['src/a.ts', ...varying]] : [],
      );
    });
  }
});

test('the coverage flags go right after the script’s node, so its reporters keep their destinations', () => {
  const script = "node --test --test-reporter=spec --test-reporter-destination=stdout 'test/*.test.ts'";
  assert.equal(
    withCoverage(script, '/tmp/x y/lcov.info'),
    "node --experimental-test-coverage --test-coverage-exclude='**/node_modules/**' --test-reporter=lcov --test-reporter-destination='/tmp/x y/lcov.info' --test --test-reporter=spec --test-reporter-destination=stdout 'test/*.test.ts'",
  );
  assert.equal(withCoverage('tsx --test', '/tmp/l'), undefined, 'a script that does not start with node is refused');
});

test("compare's main answers 0 when nothing fell, 1 when a file's coverage fell, and 2 on arguments that are not two sides of records", () => {
  const dir = scratch('coverage-');
  const write = (name: string, record: unknown) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify(record));
    return file;
  };
  const before = write('before.json', recordWith({ 'src/a.ts': cover([1, 2], 2) }));
  const same = write('same.json', recordWith({ 'src/a.ts': cover([1, 2], 2) }));
  const fell = write('fell.json', recordWith({ 'src/a.ts': cover([1], 2) }));
  const notRecord = write('other.json', { hello: 1 });
  const older = write('older.json', { ...recordWith({}), version: 1 });
  const lines: string[] = [];
  const said = (line: string) => lines.push(line);
  assert.equal(main([before, same], said), 0);
  assert.equal(lines.length, 1, 'one line of summary');
  lines.length = 0;
  assert.equal(main([before, fell], said), 1);
  assert.ok(
    lines.some((line) => line.includes('src/a.ts') && /\b2\b/.test(line.split('lost')[1] ?? '')),
    `the file and its lost line are named: ${lines.join('\n')}`,
  );
  assert.equal(
    main([before], () => {}),
    2,
  );
  assert.equal(
    main([before, notRecord], () => {}),
    2,
  );
  assert.equal(main([older, same], said), 2, 'a record written before the arms were kept is refused');
  assert.equal(
    main([before, path.join(dir, 'missing.json')], () => {}),
    2,
  );
  lines.length = 0;
  assert.equal(main([before, fell, '--', fell], said), 0, 'a line hit in one before-record of two varies: no fall');
  assert.ok(
    lines.some((line) => line.includes('src/a.ts') && /\b2\b/.test(line.split(':').slice(1).join(':'))),
    lines.join('\n'),
  );
  assert.equal(main([before, same, '--', fell, fell], said), 1, 'a line every before-record hit and no after-record hits fell');
  for (const sides of [
    [before, '--'],
    ['--', same],
    [before, '--', same, '--', fell],
  ]) {
    assert.equal(
      main(sides, () => {}),
      2,
      `two sides, each of one record or more: ${sides.join(' ')}`,
    );
  }
});
