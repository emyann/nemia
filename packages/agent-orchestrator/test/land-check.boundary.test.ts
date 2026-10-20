/**
 * The build workflow's landing check (`workflows/build/land.md`) runs the tests and the typecheck forced, so a cached pass never lands a
 * broken main. The shipped check is run as the run runs it (the argv `checkArgv` gives it), on a scratch turbo monorepo whose cache is
 * warm from main, with a merge staged as the ending stages it: `MERGE_HEAD` set, no `WF_BASE_REF`. The merge changes only a doc, a file
 * turbo does not hash, and the doc breaks a test or a typecheck that reads it. The shipped check must refuse it; the same check with
 * `npm test && npm run typecheck` in place of the forced pair passes it, which proves the fixture really meets turbo's cache. A merge that
 * touches the web app runs the e2e, which builds the app itself, and no build before it: the fixture's `build` and `e2e` each leave a mark.
 * Implement's round check runs no suite and no e2e of its own — `ci` runs them on the commit it pushed (`pull-request.boundary.test.ts`) —
 * so what is held here is the landing's alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { checkArgv } from '../src/check/check.ts';
import { REPO, placesOf } from './team.ts';
import { scratch } from './scratch.ts';

const BUILD = path.join(REPO, 'workflows', 'build');

const FORCED = 'npx turbo run test --force --continue && npx turbo run typecheck --force && ';

const UNFORCED = 'npm test && npm run typecheck && ';

/** The shipped `step`'s check, read from the folder as `nemia start` reads it. */
const checkOf = (step: 'land' | 'implement'): string => {
  const check = loadWorkflows(BUILD, placesOf(BUILD)).find((s) => s.name === step)?.check;
  assert.equal(typeof check, 'string', `workflows/build has a ${step} step with a check`);
  return check as string;
};

/** The shipped landing step's check. */
const landCheck = (): string => checkOf('land');

/** The landing check with its tests and typecheck run through the root's scripts, which let turbo replay a cached pass. */
const unforced = (check: string): string => UNFORCED + check.slice(check.indexOf('npm run lint'));

/** Run git in `dir`, as nobody in particular. */
const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const DOC_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('the doc names the project', () => {
  assert.match(fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'docs', 'name.md'), 'utf8'), /Nemia/);
});
`;

const TYPES = `import fs from 'node:fs';

if (!/Nemia/.test(fs.readFileSync(new URL('../../docs/types.md', import.meta.url), 'utf8'))) {
  console.error('docs/types.md does not name the project');
  process.exit(1);
}
`;

/** The marks the fixture's `build` and `e2e` scripts leave at its root when they run. */
const BUILT = 'built.mark';
const E2E_RAN = 'e2e-ran.mark';

/** The fixture's files: one package whose test reads `docs/name.md` and whose typecheck reads `docs/types.md`, both naming Nemia. */
const files = (): Record<string, string> => {
  const root = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')) as { packageManager: string };
  return {
    'package.json': JSON.stringify({
      name: 'fixture',
      private: true,
      packageManager: root.packageManager,
      workspaces: ['packages/*'],
      scripts: {
        test: 'turbo run test --continue',
        typecheck: 'turbo run typecheck',
        lint: 'node -e 0',
        build: `node -e "require('fs').writeFileSync('${BUILT}', '')"`,
        e2e: `node -e "require('fs').writeFileSync('${E2E_RAN}', '')"`,
      },
    }),
    'turbo.json': JSON.stringify({ tasks: { test: {}, typecheck: {} } }),
    'packages/p/package.json': JSON.stringify({
      name: 'p',
      private: true,
      type: 'module',
      scripts: { test: "node --test 'test/*.test.ts'", typecheck: 'node types.mjs' },
    }),
    'packages/p/test/doc.test.ts': DOC_TEST,
    'packages/p/types.mjs': TYPES,
    'docs/name.md': 'Nemia\n',
    'docs/types.md': 'Nemia\n',
    '.gitignore': 'node_modules\n.turbo\nhome\n',
  };
};

/**
 * Run `check` as a check runs, its argv `checkArgv`'s, in `dir`, in an environment built here, never inherited: no turbo, npm or run
 * variable from outside, but `more`.
 */
const sh = (dir: string, check: string, more: Record<string, string> = {}): { status: number; out: string } => {
  const env = {
    PATH: process.env.PATH ?? '',
    HOME: path.join(dir, 'home'),
    TURBO_DAEMON: 'false',
    TURBO_TELEMETRY_DISABLED: '1',
    TURBO_NO_UPDATE_NOTIFIER: '1',
    ...more,
  };
  const [cmd, ...args] = checkArgv(check);
  const r = spawnSync(cmd, args, { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
  assert.equal(typeof r.status, 'number', `the command finished, not ended by ${r.signal ?? r.error?.message}:\n${r.stdout}${r.stderr}`);
  return { status: r.status as number, out: `${r.stdout}${r.stderr}` };
};

/**
 * A scratch monorepo on main, its turbo cache warm from a pass of its tests and typecheck, with the merge of a branch that only
 * writes `doc` staged, not committed, as the landing leaves it.
 */
const landing = (doc: string): string => {
  const dir = scratch('wf-land-check-');
  for (const [name, text] of Object.entries(files())) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  fs.mkdirSync(path.join(dir, 'home'));
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'fixture');
  const warm = sh(dir, 'npm test && npm run typecheck');
  assert.equal(warm.status, 0, `main passes before the merge:\n${warm.out}`);
  git(dir, 'checkout', '-q', '-b', 'rename');
  fs.mkdirSync(path.dirname(path.join(dir, doc)), { recursive: true });
  fs.writeFileSync(path.join(dir, doc), 'Formerly\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'rename');
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '--no-commit', 'rename');
  return dir;
};

/**
 * The staged merge in `dir` breaks something only a run of it sees: the unforced check replays main's pass, and the shipped one refuses.
 * Returns what the shipped check printed.
 */
const refused = (dir: string): string => {
  const check = landCheck();
  const control = sh(dir, unforced(check));
  assert.equal(
    control.status,
    0,
    `turbo replays main's pass after a change to a doc it does not hash; if it hashes the doc now, the fixture needs another file:\n${control.out}`,
  );
  const shipped = sh(dir, check);
  assert.notEqual(shipped.status, 0, `the landing check passed a merge that breaks main:\n${shipped.out}`);
  return shipped.out;
};

test('the landing check runs the tests and the typecheck forced, then the rest as before', () => {
  const check = landCheck();
  assert.ok(check.startsWith(FORCED), check);
  assert.ok(check.includes('npm run lint'), check);
});

test('a doc that breaks a test refuses the landing, though turbo holds a pass', () => {
  assert.match(refused(landing('docs/name.md')), /Failed:\s+p#test/);
});

test('a doc that breaks the typecheck refuses the landing, though turbo holds a pass', () => {
  assert.match(refused(landing('docs/types.md')), /docs\/types\.md does not name the project/);
});

test('a landing that touches the web app runs the e2e, which builds the app, and no build before it', () => {
  const dir = landing('apps/web/note.md');
  const shipped = sh(dir, landCheck());
  assert.equal(shipped.status, 0, shipped.out);
  assert.ok(fs.existsSync(path.join(dir, E2E_RAN)), `the e2e ran:\n${shipped.out}`);
  assert.ok(!fs.existsSync(path.join(dir, BUILT)), `the app was built a second time, before the e2e:\n${shipped.out}`);
});
