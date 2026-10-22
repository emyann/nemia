/**
 * `tools/coverage/record.ts` run for real on a fixture package (`fixtures/coverage/`): Node's test runner runs each test file in a
 * child process, and the record must still hold the lines the fixture's test reached in its source, gathered across that process.
 *
 * The fixture is run from a copy whose path goes through a `test/` folder, as the repository's own fixture does on a CI runner:
 * Node's default coverage exclusion, its test-file globs, matches such a path whole and records nothing — which a checkout under a
 * dot-folder hides, since `**` does not cross one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import type { CoverageRecord } from '../../coverage/coverage.ts';

const RECORD = path.join(import.meta.dirname, '..', '..', 'coverage', 'record.ts');
const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'coverage');

test("a package's suite run with coverage records the lines its test reached in its source, not the branch it never took", () => {
  const root = scratch('coverage-');
  const fixture = path.join(root, 'test', 'fixture');
  fs.cpSync(FIXTURE, fixture, { recursive: true });
  const out = path.join(root, 'record.json');
  const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
  const ran = spawnSync('timeout', ['-k', '5', '120', process.execPath, RECORD, fixture, '--out', out], { env, encoding: 'utf8' });
  assert.equal(ran.status, 0, `the fixture's suite passes: ${ran.stdout}\n${ran.stderr}`);
  const record = JSON.parse(fs.readFileSync(out, 'utf8')) as CoverageRecord;
  assert.deepEqual(Object.keys(record.files), ['src/one.ts'], 'the source alone, and no test file');
  const one = record.files['src/one.ts'];
  for (const reached of [2, 3, 4]) assert.ok(one.lines.hitLines.includes(reached), `line ${reached} is reached: ${one.lines.hitLines}`);
  for (const missed of [6, 7]) assert.ok(!one.lines.hitLines.includes(missed), `line ${missed} is on the branch never taken`);
  assert.ok(one.branches.hit < one.branches.found, `a branch is left untaken: ${JSON.stringify(one.branches)}`);
});
