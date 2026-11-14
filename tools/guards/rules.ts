/**
 * `npm run rules`: the repository-wide rules a change is held to, in seconds, before it is pushed.
 *
 * These are the tests that read files of every package — the guards, and the structure tests the packages keep (`RULES`) — so a change
 * breaks one without touching it, and the tests of what a session changed never run it: of the round checks that failed over two days
 * in November 2026, half the real failures were one of these, each found by a whole `ci` run. Each group runs as its package's `test`
 * script loads it, one group after another and three files at a time, which keeps the whole near the 2 GB a suite is held to (2.3 GB
 * at its peak, in 23 s, measured 2026-11-13), and only what failed is said. The guards' boundary tests are left to `ci`: they hold the
 * workflows' own programs, which a change elsewhere does not move.
 *
 * Exits 1 when a rule refuses, after what it said. A file named here that is gone is refused: the list is held to the tree.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');

/** A package's rule tests: its folder, what its `test` script loads first, and the files, from the folder. */
type Group = { dir: string; loads: readonly string[]; files: readonly string[] };

const guards = fs
  .readdirSync(path.join(import.meta.dirname, 'test'))
  .filter((file) => file.endsWith('.test.ts') && !file.endsWith('.boundary.test.ts'))
  .map((file) => path.join('test', file));

/** The rule tests, by package. */
export const RULES: readonly Group[] = [
  { dir: 'tools/guards', loads: [], files: guards },
  {
    dir: 'packages/agent-orchestrator',
    loads: ['--import', './test/ambient.ts'],
    files: ['test/stand-ins.test.ts', 'test/boundary.test.ts', 'test/words.test.ts', 'test/store-paths.test.ts'],
  },
  { dir: 'packages/agent-runtime', loads: [], files: ['test/contract.test.ts'] },
  { dir: 'apps/api', loads: ['--import', './test/harness.ts'], files: ['test/harness.test.ts'] },
  { dir: 'apps/web', loads: [], files: ['test/dead-exports.test.ts'] },
];

/** What `group`'s tests said, and whether they passed. */
function run(group: Group): Promise<{ group: Group; passed: boolean; said: string }> {
  const child = spawn(process.execPath, [...group.loads, '--test', '--test-concurrency=3', ...group.files], {
    cwd: path.join(REPO, group.dir),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let said = '';
  child.stdout.on('data', (chunk) => (said += chunk));
  child.stderr.on('data', (chunk) => (said += chunk));
  return new Promise((resolve) => child.on('close', (code) => resolve({ group, passed: code === 0, said })));
}

if (import.meta.main) {
  const gone = RULES.flatMap((group) => group.files.map((file) => path.join(group.dir, file))).filter(
    (file) => !fs.existsSync(path.join(REPO, file)),
  );
  if (gone.length) {
    console.error(`rules: ${gone.join(', ')} is named in tools/guards/rules.ts and is not there: name the file that holds its rule now`);
    process.exit(1);
  }
  const started = performance.now();
  const failed: Awaited<ReturnType<typeof run>>[] = [];
  for (const group of RULES) {
    const ran = await run(group);
    if (!ran.passed) failed.push(ran);
  }
  for (const { group, said } of failed) {
    const from = said.lastIndexOf('✖ failing tests:');
    console.error(`\nrules: ${group.dir} refuses:\n${from < 0 ? said : said.slice(from)}`);
  }
  const files = RULES.reduce((n, group) => n + group.files.length, 0);
  const took = `${files} files of rules in ${Math.round((performance.now() - started) / 1000)} s`;
  if (failed.length) {
    console.error(
      `rules: FAILED — ${failed.map((ran) => ran.group.dir).join(', ')} (${took}). Fix what each names above, then: npm run rules`,
    );
    process.exit(1);
  }
  console.log(`rules: passed, ${took}`);
}
