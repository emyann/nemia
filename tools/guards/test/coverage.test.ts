/**
 * The repository's coverage tool (`tools/coverage/`), as data: the record reduced from planted lcov text, the comparison of two
 * records, the coverage options put in a package's test script, and `compare.ts`'s exit codes through its `main`. Nothing here
 * spawns: `coverage.boundary.test.ts` runs `record.ts` on a fixture package.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import {
  compared,
  judged,
  recordOf,
  withCoverage,
  type CoverageRecord,
  type FileCoverage,
  type Istanbul,
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
const cover = (hitLines: number[], found: number, branchHit = 0, branchFound = 0) =>
  ({
    lines: { found, hit: hitLines.length, hitLines },
    branches: { found: branchFound, hit: branchHit },
    arms: { taken: {}, untaken: {} },
  }) satisfies FileCoverage;

/** A record of package `p` holding `files`. */
const recordWith = (files: Record<string, FileCoverage>) => ({ version: 3, package: 'p', files }) satisfies CoverageRecord;

/**
 * Vitest's istanbul coverage of `src/pick.ts`, whose one `if` opens on line 2: its arm taken `yes` times and the `else` it leaves out,
 * which has no place of its own, `no` times, each count already the sum over every test process.
 */
const ran = (yes: number, no: number) =>
  ({
    [`${PKG}/src/pick.ts`]: {
      branchMap: { '0': { line: 2, loc: { start: { line: 2 } }, locations: [{ start: { line: 2 } }, { start: {} }] } },
      b: { '0': [yes, no] },
    },
  }) satisfies Istanbul;

/** The record of `src/pick.ts` from `istanbul`, its lines all hit in the lcov, as both arms of one file would leave them. */
const pickRecord = (istanbul: Istanbul) =>
  recordOf(section(`${PKG}/src/pick.ts`, [1, 2, 3, 4, 5, 6], [], { taken: 2, not: 0 }), PKG, istanbul) satisfies CoverageRecord;

describe('a record keeps the package’s own sources and drops its tests, its helpers, its fixtures and what lies outside it', () => {
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
    test(row.name, () => {
      const record = recordOf(row.lcov, PKG, {});
      assert.equal(record.version, 3);
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

describe('a branch is judged by its arms, each taken when any test took it, by the count istanbul keeps for it', () => {
  const both = pickRecord(ran(2, 1));
  test('the record keeps each arm by its branch and place, at the line it opens on: the else an if leaves out at the if', () => {
    assert.deepEqual(both.files['src/pick.ts']?.arms, { taken: { '0.0': 2, '0.1': 2 }, untaken: {} });
  });
  const rows: [name: string, after: Istanbul, lost: number[]][] = [
    ['two arms each taken, by whichever test files, are nothing lost', ran(1, 1), []],
    ['an arm no test takes any more is REFUSED, by its file and line', ran(1, 0), [2]],
  ];
  for (const [name, after, lost] of rows) {
    test(name, () => {
      const falls = compared(both, pickRecord(after));
      assert.deepEqual(
        falls.map((fall) => [fall.file, fall.armsLost]),
        lost.length > 0 ? [['src/pick.ts', lost]] : [],
      );
    });
  }
});

describe('records on either side tell a line or an arm the records disagree on, which varies, from one no test takes any more', () => {
  const two = recordWith({ 'src/a.ts': cover([1, 2], 2) });
  const one = recordWith({ 'src/a.ts': cover([1], 2) });
  const arm = (taken: boolean) => {
    const made: CoverageRecord = {
      ...two,
      files: { 'src/a.ts': { ...cover([1, 2], 2), arms: { taken: taken ? { '0.0': 2 } : {}, untaken: taken ? {} : { '0.0': 2 } } } },
    };
    return made;
  };
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
    test(name, () => {
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

test("the coverage options go right after the script's vitest run, so its own options and filters keep their place", () => {
  assert.equal(
    withCoverage('vitest run ${WF_TEST_SHARD:+--shard=$WF_TEST_SHARD}', '/tmp/x y'),
    "vitest run --coverage.enabled --coverage.provider=v8 --coverage.reporter=lcov --coverage.reporter=json --coverage.exclude='**/node_modules/**' --coverage.reportsDirectory='/tmp/x y' ${WF_TEST_SHARD:+--shard=$WF_TEST_SHARD}",
  );
  assert.equal(
    withCoverage('vitest run', '/tmp/l'),
    "vitest run --coverage.enabled --coverage.provider=v8 --coverage.reporter=lcov --coverage.reporter=json --coverage.exclude='**/node_modules/**' --coverage.reportsDirectory='/tmp/l'",
  );
  assert.equal(withCoverage("node --test 'test/*.test.ts'", '/tmp/l'), undefined, 'a script that is no vitest run is refused');
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
