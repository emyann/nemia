/**
 * Between packages, only the public contract (`docs/architecture.md`, rule 1), for this package.
 *
 * The apps reach packages/agent-orchestrator through `agent-orchestrator`, `agent-orchestrator/run` and `agent-orchestrator/workflow`
 * alone. `./workflow` is the pure format, and what reads a folder from disk, the controllers and the refusals by kind are exported from
 * `agent-orchestrator`. Spawning `bin/wf.ts` is the package's CLI, not an import, and prose that
 * names a file in src/ is not a route to it.
 *
 * The scan reads every file git lists outside this package, tracked or not yet added. Turbo caches this package's pass by this package's
 * files alone: after a change elsewhere, `npx turbo run test --force`, or turbo replays a pass that read none of it. The scanner is a copy
 * of the one in packages/agent-runtime/test/contract.test.ts, not an import of it: a package's test reaches into no other package's
 * files, which is the rule it keeps.
 *
 * Every workspace package, this one included, declares in its package.json the workspace packages it imports: its source in
 * `dependencies`, its tests in `dependencies` or `devDependencies`. That scan reads every file git lists under each workspace the root
 * package.json names, `tools/guards` among them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { workspaces } from './repo-files.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const PKG = path.join(import.meta.dirname, '..');

/** The package this test guards: its name, its folder from the root, and the specifiers another package may import it by. */
const GUARDED = {
  name: 'agent-orchestrator',
  dir: 'packages/agent-orchestrator',
  entries: ['agent-orchestrator', 'agent-orchestrator/run', 'agent-orchestrator/workflow'],
} as const;

const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

/** A line of prose — a `//` line, or a line of a block comment — read as nothing, with the line kept so numbers still count. */
const withoutComments = (text: string): string =>
  text
    .split('\n')
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line))
    .join('\n');

/** Every module a piece of source names: imports and re-exports, type-only included, `import()`, `require()` and the two resolvers. */
function specifiersIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of text.matchAll(/\b(?:import|require|import\.meta\.resolve|require\.resolve)\s*\(\s*['"`]([^'"`]+)['"`]/g)) found.add(m[1]);
  return [...found].sort();
}

type Guarded = { name: string; dir: string; entries: readonly string[] };

/** What in `file` reaches `guarded` other than by its entries: each breach, worded with what to do instead. */
function breaches(file: string, text: string, guarded: Guarded): string[] {
  const code = withoutComments(text);
  const out: string[] = [];
  const instead = `reach it through ${guarded.entries.join(' or ')}`;
  for (const spec of specifiersIn(code)) {
    if ((spec === guarded.name || spec.startsWith(`${guarded.name}/`)) && !guarded.entries.includes(spec)) {
      out.push(`${file} imports ${spec}, which is not an entry of ${guarded.name}: ${instead}`);
    }
    if (spec.startsWith('.') && `${path.posix.normalize(path.posix.join(path.posix.dirname(file), spec))}/`.startsWith(`${guarded.dir}/`)) {
      out.push(`${file} imports ${spec}, a path into ${guarded.dir}: ${instead}`);
    }
  }
  const resolver = new RegExp(`\\b(?:import\\.meta|require)\\.resolve\\s*\\(\\s*['"\`]${guarded.name}\\b`);
  const src = new RegExp(`${guarded.name}(?:['"\`]\\s*,\\s*['"\`]|/)src\\b`);
  code.split('\n').forEach((line, i) => {
    if (resolver.test(line)) out.push(`${file}:${i + 1} resolves ${guarded.name} to build a path beside its entry: ${instead}`);
    else if (/\b(?:join|resolve|URL)\s*\(|\b(?:import|require)\s*\(\s*[^'"\s]/.test(line) && src.test(line))
      out.push(`${file}:${i + 1} builds a path into ${guarded.dir}/src: ${instead}`);
  });
  return out;
}

/** Every source file git lists outside the guarded package, tracked or not yet added, that is on disk. */
function workspaceFiles(guarded: Guarded): string[] {
  const listed = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return listed.split('\n').filter((f) => SOURCE.test(f) && !f.startsWith(`${guarded.dir}/`) && fs.existsSync(path.join(ROOT, f)));
}

test('the scan reads the apps above this package — or it would pass by reading nothing', () => {
  const files = workspaceFiles(GUARDED);
  for (const dir of ['apps/api/src', 'apps/api/test', 'apps/web/src', 'apps/web/test'])
    assert.ok(
      files.some((f) => f.startsWith(`${dir}/`)),
      `the scan reads ${dir}`,
    );
  const named = new Set(files.flatMap((f) => specifiersIn(fs.readFileSync(path.join(ROOT, f), 'utf8'))));
  for (const entry of GUARDED.entries) assert.ok(named.has(entry), `and some of it imports ${entry}`);
});

test('code outside packages/agent-orchestrator reaches it through agent-orchestrator, agent-orchestrator/run and agent-orchestrator/workflow alone', () => {
  const found = workspaceFiles(GUARDED).flatMap((f) => breaches(f, fs.readFileSync(path.join(ROOT, f), 'utf8'), GUARDED));
  assert.deepEqual(found, []);
});

test('REFUSED: a subpath not in its exports, a relative path, import.meta.resolve, and a path built into src — each route', () => {
  const at = 'apps/api/test/x.test.ts';
  const refused = (text: string) => breaches(at, text, GUARDED);
  const instead = 'reach it through agent-orchestrator or agent-orchestrator/run or agent-orchestrator/workflow';
  const subpath = "const { foldFeed } = await import('agent-orchestrator/feed');";
  const effectFace =
    "import { Missing } from 'agent-orchestrator/effect';\nimport { Invalid } from 'agent-orchestrator/src/refusal/refusal.ts';";
  const typeOnly = "import type { Tally } from 'agent-orchestrator/src/meter/tally.store.ts';";
  const resolved = "const f = await import(new URL('./feed.ts', import.meta.resolve('agent-orchestrator')).href);";
  const joined = "const f = await import(path.join(ROOT, 'packages', 'agent-orchestrator', 'src', 'feed.ts'));";
  assert.deepEqual(refused("import { x } from 'agent-orchestrator/src/run.ts';"), [
    `${at} imports agent-orchestrator/src/run.ts, which is not an entry of agent-orchestrator: ${instead}`,
  ]);
  assert.deepEqual(refused(subpath), [`${at} imports agent-orchestrator/feed, which is not an entry of agent-orchestrator: ${instead}`]);
  assert.deepEqual(
    refused(effectFace),
    [
      `${at} imports agent-orchestrator/effect, which is not an entry of agent-orchestrator: ${instead}`,
      `${at} imports agent-orchestrator/src/refusal/refusal.ts, which is not an entry of agent-orchestrator: ${instead}`,
    ],
    'REFUSED: the retired Effect face, and refusal.ts',
  );
  assert.deepEqual(
    breaches('apps/web/test/x.test.ts', "import { foldFeed } from '../../../packages/agent-orchestrator/src/feed.ts';", GUARDED),
    [
      `apps/web/test/x.test.ts imports ../../../packages/agent-orchestrator/src/feed.ts, a path into packages/agent-orchestrator: ${instead}`,
    ],
  );
  assert.deepEqual(
    breaches('apps/api/src/x.ts', "import { feedWords } from '../../../packages/agent-orchestrator/src/feed/feed.ts';", GUARDED),
    [
      `apps/api/src/x.ts imports ../../../packages/agent-orchestrator/src/feed/feed.ts, a path into packages/agent-orchestrator: ${instead}`,
    ],
    'REFUSED: a path into a feature folder',
  );
  assert.deepEqual(refused(typeOnly), [
    `${at} imports agent-orchestrator/src/meter/tally.store.ts, which is not an entry of agent-orchestrator: ${instead}`,
  ]);
  assert.deepEqual(refused(resolved), [`${at}:1 resolves agent-orchestrator to build a path beside its entry: ${instead}`]);
  assert.deepEqual(refused(joined), [`${at}:1 builds a path into packages/agent-orchestrator/src: ${instead}`]);
});

test('and what is not a route is not refused: the three entries, the wf CLI spawned, and prose that names a file in src', () => {
  const text = [
    "import { loadWorkflows } from 'agent-orchestrator';",
    "import type { Run } from 'agent-orchestrator/run';",
    "const { messageRefusal } = await import('agent-orchestrator/run');",
    "import { parseFolder } from 'agent-orchestrator/workflow';",
    "import { isRefusal, type Refusal } from 'agent-orchestrator';",
    "const WF = path.join(ROOT, 'packages', 'agent-orchestrator', 'bin', 'wf.ts');",
    "commit(ENDING.branch, 'Cap the runs in flight', [['packages/agent-orchestrator/src/queue.ts', [",
    ' * `packages/agent-orchestrator/src/run.ts`, which briefs write constantly.',
  ].join('\n');
  assert.deepEqual(breaches('apps/web/test/e2e/x.ts', text, GUARDED), []);
});

test("agent-orchestrator's exports are . (runner.ts), ./run and ./workflow, and nothing else but its package.json", () => {
  const { exports } = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')) as { exports: Record<string, string> };
  assert.deepEqual(exports, {
    '.': './src/runner.ts',
    './run': './src/run.ts',
    './workflow': './src/workflow.ts',
    './package.json': './package.json',
  });
});

/** What reads a workflow folder from disk: exported from the root, beside the controller, and never from the pure format's entry. */
const READERS = [
  'agentsFor',
  'agentUsers',
  'agentVersion',
  'loadAgents',
  'loadWorkflows',
  'skillsFor',
  'workflowDescription',
  'workflowReadme',
  'workflowFolder',
  'workflowsIn',
];

function readerBreaches(root: readonly string[], format: readonly string[]): string[] {
  return READERS.flatMap((name) => [
    ...(format.includes(name)
      ? [
          `agent-orchestrator/workflow exports ${name}, which reads the disk: ./workflow is the pure format; export it from agent-orchestrator`,
        ]
      : []),
    ...(root.includes(name) ? [] : [`agent-orchestrator does not export ${name}: what reads a folder from disk is exported from the root`]),
  ]);
}

test('./workflow is the pure format, and what reads a folder from disk is exported from agent-orchestrator', async () => {
  const root = Object.keys(await import('agent-orchestrator'));
  const format = Object.keys(await import('agent-orchestrator/workflow'));
  assert.ok(format.includes('parseFolder'), 'the format entry is read, not empty');
  assert.deepEqual(readerBreaches(root, format), []);
  assert.deepEqual(
    readerBreaches(root, [...format, 'loadWorkflows']),
    [
      'agent-orchestrator/workflow exports loadWorkflows, which reads the disk: ./workflow is the pure format; export it from agent-orchestrator',
    ],
    'REFUSED: a reader back on ./workflow',
  );
  assert.deepEqual(
    readerBreaches(
      root.filter((n) => n !== 'workflowFolder'),
      format,
    ),
    ['agent-orchestrator does not export workflowFolder: what reads a folder from disk is exported from the root'],
    'REFUSED: a reader the root dropped',
  );
});

/** A workspace package as its package.json says: its folder from the root, its name, and the names it declares. */
type Manifest = { dir: string; name: string; dependencies: Record<string, string>; devDependencies: Record<string, string> };

/** Every workspace package: each workspace the root package.json names (`workspaces`), read from its package.json. */
function manifests(): Manifest[] {
  return workspaces()
    .sort()
    .map((dir) => {
      const json = JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'package.json'), 'utf8')) as Partial<Manifest>;
      return { dir, name: json.name ?? dir, dependencies: json.dependencies ?? {}, devDependencies: json.devDependencies ?? {} };
    });
}

/** Whether a file is a test's: under a `test/` folder, or named `*.test.ts` or `*.test.tsx`. */
const isTestFile = (file: string): boolean => file.split('/').includes('test') || /\.test\.tsx?$/.test(file);

/**
 * What in `file`, a file of the package `manifest` describes, imports a workspace package by a name in `names` that the package does not
 * declare: in `dependencies`, or for a test's file in `devDependencies` too. A package's own name is never refused.
 */
function undeclared(file: string, text: string, manifest: Manifest, names: readonly string[]): string[] {
  const test = isTestFile(file);
  const declared = (name: string) => name in manifest.dependencies || (test && name in manifest.devDependencies);
  const list = test ? 'devDependencies' : 'dependencies';
  return specifiersIn(withoutComments(text)).flatMap((spec) => {
    const name = names.find((n) => spec === n || spec.startsWith(`${n}/`));
    if (name === undefined || name === manifest.name || declared(name)) return [];
    return [`${file} imports ${spec}, but ${manifest.dir}/package.json does not declare ${name}: add it to its ${list}`];
  });
}

/** Every source file git lists under each workspace package, tracked or not yet added, that is on disk, with its package. */
function packageFiles(all: readonly Manifest[]): { file: string; manifest: Manifest }[] {
  const listed = execFileSync('git', ['ls-files', '-co', '--exclude-standard', ...all.map((m) => m.dir)], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return listed
    .split('\n')
    .filter((f) => SOURCE.test(f) && fs.existsSync(path.join(ROOT, f)))
    .flatMap((file) => all.filter((m) => file.startsWith(`${m.dir}/`)).map((manifest) => ({ file, manifest })));
}

test('the declared-imports scan reads every workspace package, and finds workspace imports — or it would pass by reading nothing', () => {
  const all = manifests();
  const names = all.map((m) => m.name);
  const files = packageFiles(all);
  for (const dir of ['apps/api', 'apps/web', 'packages/agent-orchestrator', 'packages/agent-runtime', 'tools/guards'])
    assert.ok(
      files.some(({ manifest }) => manifest.dir === dir),
      `the scan reads ${dir}`,
    );
  const named = files.flatMap(({ file }) => specifiersIn(fs.readFileSync(path.join(ROOT, file), 'utf8')));
  assert.ok(
    named.some((spec) => names.some((n) => spec === n || spec.startsWith(`${n}/`))),
    'and some of it imports a workspace package',
  );
});

test('every workspace package declares the workspace packages it imports', () => {
  const all = manifests();
  const names = all.map((m) => m.name);
  const found = packageFiles(all).flatMap(({ file, manifest }) =>
    undeclared(file, fs.readFileSync(path.join(ROOT, file), 'utf8'), manifest, names),
  );
  assert.deepEqual(found, []);
});

test('REFUSED: a workspace import its package does not declare, and a source import declared only for the tests', () => {
  const names = ['api', 'agent-runtime', 'agent-orchestrator'];
  const bare: Manifest = { dir: 'apps/api', name: 'api', dependencies: {}, devDependencies: {} };
  const dev: Manifest = { ...bare, devDependencies: { 'agent-runtime': '*' } };
  assert.deepEqual(undeclared('apps/api/test/x.test.ts', "import { Engine } from 'agent-runtime';", bare, names), [
    'apps/api/test/x.test.ts imports agent-runtime, but apps/api/package.json does not declare agent-runtime: add it to its devDependencies',
  ]);
  assert.deepEqual(undeclared('apps/api/test/x.test.ts', "import { Engine } from 'agent-runtime';", dev, names), []);
  assert.deepEqual(undeclared('apps/api/src/x.test.ts', "import { Engine } from 'agent-runtime';", dev, names), []);
  assert.deepEqual(
    undeclared('apps/api/src/x.ts', "import { claudeJob } from 'agent-runtime';", dev, names),
    ['apps/api/src/x.ts imports agent-runtime, but apps/api/package.json does not declare agent-runtime: add it to its dependencies'],
    'REFUSED: source declared only as a dev dependency',
  );
  assert.deepEqual(undeclared('apps/api/src/x.ts', "const run = await import('agent-orchestrator/run');", bare, names), [
    'apps/api/src/x.ts imports agent-orchestrator/run, but apps/api/package.json does not declare agent-orchestrator: add it to its dependencies',
  ]);
  const fine = [
    "import { app } from 'api/app';",
    "import { x } from './x.ts';",
    "import { Hono } from 'hono';",
    "import { y } from 'agent-runtimes';",
    ' * `agent-runtime/vocabulary` named in prose',
  ].join('\n');
  assert.deepEqual(undeclared('apps/api/src/x.ts', fine, bare, names), []);
});
