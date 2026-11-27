/**
 * `npm run touched [-- [--dry] [--base <ref>] [<test file>…]]`: runs the tests the branch's change touched, and nothing else.
 *
 * The change is every file that differs between the merge base of `<ref>` (default `main-worktree/HEAD`) and the working tree,
 * committed or not, and every file git does not track yet. For each workspace holding a changed file and a `vitest.config.ts`, one
 * at a time, it asks Vitest's Node API which of the workspace's test files import a changed file of it (a changed test file is its
 * own), prints them, then runs exactly those, `vitest related --run <the workspace's changed files>`, under `nice`, in the
 * workspace's folder and under its own config (its seats, `pool: 'forks'`, `maxWorkers: 2`); in `apps/web` the `node` project alone.
 * It never runs a bare `vitest run`, a workspace with no changed file, nor every test file of one: a change that reaches them all (its
 * config, a seat) is said and left to CI. Named test files run alone, each one of a workspace the change touched, or are refused.
 *
 * A session's measure, never the suite's or CI's. Exits 0 when what ran passed or nothing was due, 1 when a test file failed, 2 when
 * it was not asked what it runs.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');

const USAGE = 'usage: npm run touched -- [--dry] [--base <ref>] [<test file>…]';

const DEFAULT_BASE = 'main-worktree/HEAD';

/** The board's Vitest project that runs under Node: its others launch a browser. */
const PROJECTS: Record<string, string> = { 'apps/web': 'node' };

/** A workspace by its folder from the repository's root, and whether it has a `vitest.config.ts` of its own. */
export type Workspace = { dir: string; tested: boolean };

/** What Vitest says of a workspace asked with some files: the test files they reach, and every test file it has, each absolute. */
export type Listed = { due: string[]; total: string[] };

/** What a run of Vitest left: its exit code, and the test files it reported failed, each absolute. */
export type Ran = { code: number; failed: string[] };

/** The work of one workspace: its changed files, or the test files named in it, each from the repository's root. */
export type Share = { dir: string; files: string[]; named: boolean };

/** What the command does: run the shares, or refuse, saying why. */
export type Plan = { kind: 'run'; shares: Share[]; untested: string[]; outside: string[] } | { kind: 'refused'; message: string };

/** What `main` reaches outside itself, given by a test. */
export type Reach = {
  repo: string;
  env: NodeJS.ProcessEnv;
  list: (dir: string, files: string[]) => Promise<Listed>;
  run: (dir: string, argv: string[], env: NodeJS.ProcessEnv) => Ran;
};

const inside = (dir: string, file: string) => file.startsWith(`${dir}/`);

/**
 * The work a change asks: each changed file put in the workspace holding it, or the named test files in theirs.
 * @param changed the changed files that still exist, each from the repository's root
 * @param workspaces the repository's workspaces
 * @param named the test files the person named, each from the repository's root, or none
 */
export const planOf = (changed: string[], workspaces: Workspace[], named: string[]) => {
  const owner = (file: string) => workspaces.find((ws) => inside(ws.dir, file));
  const byDir = new Map<string, string[]>();
  const outside: string[] = [];
  for (const file of changed) {
    const ws = owner(file);
    if (!ws) outside.push(file);
    else byDir.set(ws.dir, [...(byDir.get(ws.dir) ?? []), file]);
  }
  const tested = (dir: string) => workspaces.some((ws) => ws.dir === dir && ws.tested);
  const untested = [...byDir.keys()].filter((dir) => !tested(dir));
  if (named.length === 0) {
    const shares = [...byDir].filter(([dir]) => tested(dir)).map(([dir, files]) => ({ dir, files, named: false }));
    return { kind: 'run', shares, untested, outside } satisfies Plan;
  }
  const namedBy = new Map<string, string[]>();
  for (const file of named) {
    const ws = owner(file);
    if (!ws)
      return {
        kind: 'refused',
        message: `${file} is in no workspace: name a test file of a workspace the change touched (${[...byDir.keys()].join(', ') || 'none'})`,
      } satisfies Plan;
    if (!byDir.has(ws.dir))
      return {
        kind: 'refused',
        message: `${file} is a test of ${ws.dir}, which the change did not touch: name a test of ${[...byDir.keys()].join(', ') || 'a workspace you changed'}`,
      } satisfies Plan;
    namedBy.set(ws.dir, [...(namedBy.get(ws.dir) ?? []), file]);
  }
  const shares = [...namedBy].map(([dir, files]) => ({ dir, files, named: true }));
  return { kind: 'run', shares, untested: [], outside: [] } satisfies Plan;
};

/**
 * The arguments Vitest is run with for one workspace: always `related --run` with the files named, never a bare `run`.
 * @param dir the workspace's folder from the repository's root
 * @param files the files Vitest is asked about, each absolute
 * @param report the file its JSON reporter writes, absolute
 */
export const argvOf = (dir: string, files: string[], report: string) => [
  'related',
  '--run',
  ...(PROJECTS[dir] ? [`--project=${PROJECTS[dir]}`] : []),
  '--reporter=default',
  '--reporter=json',
  `--outputFile.json=${report}`,
  ...files,
];

const git = (repo: string, args: string[]) => {
  const out = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  return out.status === 0 ? out.stdout : undefined;
};

/**
 * The files the change holds since the merge base of `base`, committed or not, and those git does not track, that still exist.
 * @param repo the repository's root
 * @param base the ref the change is measured from
 */
export const changedSince = (repo: string, base: string) => {
  const from = git(repo, ['merge-base', base, 'HEAD'])?.trim();
  if (!from) return undefined;
  const diffed = git(repo, ['diff', '--name-only', '--no-renames', from]) ?? '';
  const untracked = git(repo, ['ls-files', '--others', '--exclude-standard']) ?? '';
  const files = [...new Set([...diffed.split('\n'), ...untracked.split('\n')])].filter(Boolean).sort();
  return { from, files: files.filter((file) => fs.existsSync(path.join(repo, file))) };
};

/**
 * The repository's workspaces, read from its root `package.json`: a pattern ending in `/*` names each folder under it.
 * @param repo the repository's root
 */
export const workspacesIn = (repo: string) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')) as { workspaces?: string[] };
  const dirs = (pkg.workspaces ?? []).flatMap((pattern) => {
    if (!pattern.endsWith('/*')) return [pattern];
    const parent = pattern.slice(0, -2);
    if (!fs.existsSync(path.join(repo, parent))) return [];
    return fs
      .readdirSync(path.join(repo, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${parent}/${entry.name}`);
  });
  return dirs
    .filter((dir) => fs.existsSync(path.join(repo, dir, 'package.json')))
    .map((dir) => ({ dir, tested: fs.existsSync(path.join(repo, dir, 'vitest.config.ts')) }) satisfies Workspace);
};

const listed = async (root: string, files: string[]) => {
  const { createVitest } = await import('vitest/node');
  const dir = path.relative(REPO, root);
  const vitest = await createVitest('test', {
    root,
    related: files,
    watch: false,
    run: true,
    reporters: [],
    ...(PROJECTS[dir] ? { project: [PROJECTS[dir]] } : {}),
  });
  try {
    const total = (await vitest.globTestSpecifications()).map((spec) => spec.moduleId);
    const due = (await vitest.getRelevantTestSpecifications()).map((spec) => spec.moduleId);
    return { due: [...new Set(due)].sort(), total: [...new Set(total)].sort() } satisfies Listed;
  } finally {
    await vitest.close();
  }
};

const ran = (root: string, argv: string[], env: NodeJS.ProcessEnv) => {
  const report = argv.find((arg) => arg.startsWith('--outputFile.json='))?.slice('--outputFile.json='.length);
  const out = spawnSync('nice', ['-n', '10', 'vitest', ...argv], { cwd: root, env, stdio: 'inherit' });
  const code = out.status ?? 1;
  if (!report || !fs.existsSync(report)) return { code, failed: [] } satisfies Ran;
  const json = JSON.parse(fs.readFileSync(report, 'utf8')) as { testResults?: { name: string; status: string }[] };
  const failed = (json.testResults ?? []).filter((result) => result.status !== 'passed').map((result) => result.name);
  return { code, failed } satisfies Ran;
};

const REAL: Reach = { repo: REPO, env: process.env, list: listed, run: ran };

const argsOf = (argv: string[]) => {
  let base = DEFAULT_BASE;
  let dry = false;
  const named: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry') dry = true;
    else if (arg === '--base') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) return undefined;
      base = next;
      i++;
    } else if (arg.startsWith('--')) return undefined;
    else named.push(arg);
  }
  return { base, dry, named };
};

const runEnv = (repo: string, dir: string, env: NodeJS.ProcessEnv) => {
  const { WF_TEST_SHARD: _shard, VITEST: _vitest, NODE_ENV: _mode, ...rest } = env;
  const bins = [path.join(repo, dir, 'node_modules', '.bin'), path.join(repo, 'node_modules', '.bin'), rest.PATH ?? ''];
  return { ...rest, PATH: bins.join(path.delimiter) };
};

const refused = (message: string) => {
  console.error(`touched: ${message}`);
  return 2;
};

const plannedFor = (argv: string[], repo: string) => {
  const args = argsOf(argv);
  if (!args) return refused(USAGE);
  const change = changedSince(repo, args.base);
  if (!change) return refused(`git finds no merge base of ${args.base} and HEAD: give one with --base <ref>\n${USAGE}`);
  const named = args.named.map((file) => path.relative(repo, path.resolve(file)));
  const missing = named.find((file) => !fs.existsSync(path.join(repo, file)));
  if (missing) return refused(`${missing} does not exist: name a test file by its path`);
  const plan = planOf(change.files, workspacesIn(repo), named);
  if (plan.kind === 'refused') return refused(plan.message);
  return { args, change, plan };
};

/** A share and the test files it is due, each from its workspace's folder. */
type Due = { share: Share; tests: string[] };

const dueOf = async (shares: Share[], repo: string, list: Reach['list']) => {
  const due: Due[] = [];
  const wide: string[] = [];
  for (const share of shares) {
    const root = path.join(repo, share.dir);
    const files = share.files.map((file) => path.join(repo, file));
    const found = await list(root, files);
    const notTest = share.named ? files.find((file) => !found.total.includes(file)) : undefined;
    if (notTest) return refused(`${path.relative(repo, notTest)} is not a test file of ${share.dir}'s Vitest config: name one it runs`);
    const tests = found.due.map((file) => path.relative(root, file));
    if (!share.named && found.due.length > 0 && found.due.length === found.total.length) {
      console.log(
        `  ${share.dir}: not run, its change reaches all ${found.total.length} of its test files (a config or a seat): CI runs them`,
      );
      wide.push(share.dir);
      continue;
    }
    const why = share.named ? 'named' : `related to ${share.files.length} changed files`;
    console.log(`  ${share.dir}: ${tests.length} of ${found.total.length} test files, ${why}`);
    for (const test of tests) console.log(`    ${test}`);
    if (tests.length > 0) due.push({ share, tests });
  }
  return { due, wide };
};

const failedOf = (due: Due[], repo: string, reach: Reach) => {
  const failed: string[] = [];
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'touched-'));
  try {
    for (const { share } of due) {
      const report = path.join(work, `${share.dir.replaceAll('/', '-')}.json`);
      const files = share.files.map((file) => path.join(repo, file));
      const result = reach.run(path.join(repo, share.dir), argvOf(share.dir, files, report), runEnv(repo, share.dir, reach.env));
      if (result.code === 0) continue;
      if (result.failed.length === 0) failed.push(`${share.dir} (exit ${result.code})`);
      else failed.push(...result.failed.map((file) => path.relative(repo, file)));
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  return failed;
};

/**
 * Runs the command for `argv` and answers its exit code.
 * @param argv the command's arguments, after `--`
 * @param given what it reaches outside itself, where a test gives it: the repository, its environment, Vitest's listing and a run
 */
export const main = async (argv: string[], given: Partial<Reach> = {}) => {
  const reach = { ...REAL, ...given };
  const { repo } = reach;
  const planned = plannedFor(argv, repo);
  if (typeof planned === 'number') return planned;
  const { args, change, plan } = planned;
  console.log(`touched: ${change.files.length} files changed since ${args.base} (${change.from.slice(0, 9)})`);
  if (change.files.length === 0) {
    console.log('touched: no change, nothing to run');
    return 0;
  }
  for (const dir of plan.untested) console.log(`  ${dir}: no vitest.config.ts, no tests to run`);
  if (plan.outside.length > 0)
    console.log(`  outside every workspace, run by no import: ${plan.outside.join(', ')} (CI runs the tests that read them)`);
  const found = await dueOf(plan.shares, repo, reach.list);
  if (typeof found === 'number') return found;
  const { due, wide } = found;
  const count = due.reduce((sum, { tests }) => sum + tests.length, 0);
  const notRun = wide.length > 0 ? `; not run: ${wide.join(', ')}` : '';
  if (args.dry || count === 0) {
    const what = args.dry
      ? `dry, ${count} test files in ${due.length} workspaces would run, none ran`
      : 'no test file reaches the change, nothing to run';
    console.log(`touched: ${what}${notRun}`);
    return 0;
  }
  const failed = failedOf(due, repo, reach);
  if (failed.length > 0) {
    console.log(`touched: failed: ${failed.join(', ')}`);
    return 1;
  }
  console.log(`touched: passed, ${count} test files in ${due.length} workspaces${notRun}`);
  return 0;
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) process.exitCode = await main(process.argv.slice(2));
