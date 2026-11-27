/**
 * `npm run rules`: the repository-wide rules a change is held to, in minutes, before it is pushed.
 *
 * These are the tests that read whole folders — the guards, and the structure and rule tests the packages keep (`RULES`) — so a change
 * breaks one without touching it, and the tests of what a session changed never run it: of the round checks that failed over two days in
 * November 2026, half the real failures were one of these, each found by a whole `ci` run. Each group runs through Vitest under its
 * package's own config (its setup files, the seat), one group after another and three files at a time, which keeps the whole near the 2 GB
 * a suite is held to, and only what failed is said. Its time is the slowest file of each group, summed: the guards, the api's `harness`
 * and the board's `structure` take most of it, and a cheap file added beside them costs next to nothing. The guards' boundary tests are
 * left to `ci`: they hold the workflows' own programs, which a change elsewhere does not move.
 *
 * Exits 1 when a rule refuses, after what it said. A file named here that is gone is refused: the list is held to the tree.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');

/** A package's rule tests: its folder, what its config is given besides (the board's project), and the files, from the folder. */
type Group = { dir: string; loads: readonly string[]; files: readonly string[] };

/** Vitest's own command, the one every workspace's `test` script runs. */
const VITEST = path.join(REPO, 'node_modules', 'vitest', 'vitest.mjs');

const guards = fs
  .readdirSync(path.join(import.meta.dirname, 'test'))
  .filter((file) => file.endsWith('.test.ts') && !file.endsWith('.boundary.test.ts'))
  .map((file) => path.join('test', file));

/**
 * The rule tests, by package: each reads a whole folder for a rule a file it never imports can break, so `vitest related` never picks it.
 * Left to `ci` for their cost, each its group's slowest file by far: the orchestrator's `contract` (31 s) and `layout` (12 s), the
 * client's `structure` (5 s) and the docs' `names` (6 s).
 */
export const RULES: readonly Group[] = [
  { dir: 'tools/guards', loads: [], files: guards },
  {
    dir: 'packages/agent-orchestrator',
    loads: [],
    files: [
      'test/stand-ins.test.ts',
      'test/boundary.test.ts',
      'test/words.test.ts',
      'test/store-paths.test.ts',
      'test/git-calls.test.ts',
      'test/spawned-tools.test.ts',
      'test/yaml-import.test.ts',
      'test/chat-writers.test.ts',
      'test/index-reads.test.ts',
      'test/harnesses-filed.test.ts',
      'test/root-given.test.ts',
      'test/waits.test.ts',
    ],
  },
  {
    dir: 'packages/agent-runtime',
    loads: [],
    files: [
      'test/contract.test.ts',
      'test/layout.test.ts',
      'test/core-reads.test.ts',
      'test/engine-root.test.ts',
      'test/effect-version.test.ts',
      'test/waits.test.ts',
    ],
  },
  { dir: 'packages/objects', loads: [], files: ['test/layout.test.ts'] },
  {
    dir: 'apps/api',
    loads: [],
    files: ['test/harness.test.ts', 'test/layout.test.ts', 'test/kinds.test.ts', 'test/source.test.ts', 'test/waits.test.ts'],
  },
  { dir: 'apps/cli', loads: [], files: ['test/layout.test.ts'] },
  { dir: 'apps/docs', loads: [], files: ['test/structure.test.ts', 'test/waits.test.ts'] },
  {
    dir: 'apps/web',
    loads: ['--project=node'],
    files: [
      'test/dead-exports.test.ts',
      'test/structure.test.ts',
      'test/runs-type.test.ts',
      'test/look.test.ts',
      'test/one-action.test.ts',
      'test/stories.test.ts',
      'test/type.test.ts',
      'test/approved.test.ts',
      'test/folders.test.ts',
      'test/rulebook.test.ts',
      'test/palette.test.ts',
      'test/shadcn-names.test.ts',
      'test/page-room.test.ts',
      'test/icon-button.test.ts',
      'test/source.test.ts',
      'test/time-of-day.test.ts',
      'test/api-files.test.ts',
      'test/run-status.test.ts',
      'test/run-writes.test.ts',
      'test/inbox-state.test.ts',
      'test/copy.test.ts',
      'test/factory-address.test.ts',
      'test/follow.test.ts',
      'test/conversation.test.ts',
      'test/footer.test.ts',
      'test/waits.test.ts',
    ],
  },
  { dir: 'tools/design-system', loads: [], files: ['test/stories.test.ts'] },
];

/** What `group`'s tests said, and whether they passed. */
function run(group: Group) {
  const child = spawn(process.execPath, [VITEST, 'run', '--maxWorkers=3', ...group.loads, ...group.files], {
    cwd: path.join(REPO, group.dir),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let said = '';
  child.stdout.on('data', (chunk) => (said += chunk));
  child.stderr.on('data', (chunk) => (said += chunk));
  return new Promise((resolve) => child.on('close', (code) => resolve({ group, passed: code === 0, said }))) satisfies Promise<{
    group: Group;
    passed: boolean;
    said: string;
  }>;
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
    const from = said.indexOf('Failed Tests');
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
