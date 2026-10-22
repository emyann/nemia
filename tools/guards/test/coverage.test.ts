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
import { compared, recordOf, withCoverage, type CoverageRecord, type FileCoverage } from '../../coverage/coverage.ts';
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

/**
 * A file's coverage with `hitLines` hit of `found`, and `branchHit` branches of `branchFound`: the first `branchHit` of line 1's
 * block 0, as `section` takes them, unless `hitBranches` names others.
 */
const cover = (
  hitLines: number[],
  found: number,
  branchHit = 0,
  branchFound = 0,
  hitBranches = Array.from({ length: branchHit }, (_, i) => `1,0,${i}`),
): FileCoverage => ({
  lines: { found, hit: hitLines.length, hitLines },
  branches: { found: branchFound, hit: branchHit, hitBranches },
});

/** A record of package `p` holding `files`. */
const recordWith = (files: Record<string, FileCoverage>): CoverageRecord => ({ version: 1, package: 'p', files });

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
      const record = recordOf(row.lcov, PKG);
      assert.equal(record.version, 1);
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

test('a comparison finds the branches that fell where every line is still hit', () => {
  const falls = compared(recordWith({ 'src/a.ts': cover([1], 1, 2, 2) }), recordWith({ 'src/a.ts': cover([1], 1, 1, 2) }));
  assert.deepEqual(
    falls.map((fall) => [fall.file, fall.linesLost, fall.branchesLost, fall.branches]),
    [['src/a.ts', [], ['1,0,1'], { before: 2, after: 1 }]],
  );
});

test('a REFUSED comparison names a branch no longer taken where another took its place and the count held', () => {
  const before = recordWith({ 'src/a.ts': cover([1], 1, 1, 2, ['1,0,0']) });
  const after = recordWith({ 'src/a.ts': cover([1], 1, 1, 2, ['1,0,1']) });
  assert.deepEqual(
    compared(before, after).map((fall) => [fall.file, fall.branchesLost]),
    [['src/a.ts', ['1,0,0']]],
  );
});

test('the coverage flags go right after the script’s node, so its reporters keep their destinations', () => {
  const script = "node --test --test-reporter=spec --test-reporter-destination=stdout 'test/*.test.ts'";
  assert.equal(
    withCoverage(script, '/tmp/x y/lcov.info'),
    "node --experimental-test-coverage --test-reporter=lcov --test-reporter-destination='/tmp/x y/lcov.info' --test --test-reporter=spec --test-reporter-destination=stdout 'test/*.test.ts'",
  );
  assert.equal(withCoverage('tsx --test', '/tmp/l'), undefined, 'a script that does not start with node is refused');
});

test("compare's main answers 0 when nothing fell, 1 when a file's coverage fell, and 2 on arguments that are not two records", () => {
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
  assert.equal(
    main([before, path.join(dir, 'missing.json')], () => {}),
    2,
  );
});
