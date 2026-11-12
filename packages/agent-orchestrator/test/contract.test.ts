/**
 * Between packages, only the public contract (`docs/architecture.md`, rule 1), for this package.
 *
 * The apps reach packages/agent-orchestrator through `agent-orchestrator`, `agent-orchestrator/run` and `agent-orchestrator/workflow`
 * alone. `./workflow` is the pure format, and what reads a folder from disk, the controllers and the refusals by kind are exported from
 * `agent-orchestrator`. Spawning `bin/wf.ts` is the package's CLI, not an import, and prose that names a file in src/ is not a route
 * to it. The client (`apps/cli`) spawns that CLI through two entries of its own, `agent-orchestrator/bin` and
 * `agent-orchestrator/bin/wf`, which are resolved, never imported, and by `apps/cli/src/local.ts` and the templates' test helper alone
 * (`binBreaches`, `SPAWNERS`).
 *
 * The scan reads every file git lists outside this package, tracked or not yet added. Turbo caches this package's pass by this package's
 * files alone: after a change elsewhere, `npx turbo run test --force`, or turbo replays a pass that read none of it. The scanner is a copy
 * of the one in packages/agent-runtime/test/contract.test.ts, not an import of it: a package's test reaches into no other package's
 * files, which is the rule it keeps.
 *
 * Every workspace package, this one included, declares in its package.json the workspace packages it imports: its source in
 * `dependencies`, its tests in `dependencies` or `devDependencies`. That scan reads every file git lists under each workspace the root
 * package.json names, `tools/guards` among them.
 *
 * The objects (`packages/objects`), which this package and the apps share, are reached through their one entry, `objects`, the same
 * way (`OBJECTS`): never by a subpath, a relative path or a path built into their src. Their own files are not read for it.
 *
 * No file of this package's `src`, `bin` or `place` imports the templates workspace (`packages/templates`), by its name or by a path:
 * the builtin templates are found by path (`BuiltinTemplates`, `src/template/door/templates.store.ts`), as its skills and servers are.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withoutComments, specifiersIn } from 'test-kit/imports';
import { workspaces } from 'test-kit/repo';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const PKG = path.join(import.meta.dirname, '..');

/** The package this test guards: its name, its folder from the root, and the specifiers another package may import it by. */
const GUARDED = {
  name: 'agent-orchestrator',
  dir: 'packages/agent-orchestrator',
  entries: ['agent-orchestrator', 'agent-orchestrator/run', 'agent-orchestrator/workflow', 'agent-orchestrator/testing'],
} as const;

const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

type Guarded = { name: string; dir: string; entries: readonly string[] };

/**
 * The objects' package: the apps and this package reach it through its one entry, as they reach this one through its entries. The plants
 * below spell a path of it through `OBJECTS.name`, since the scan they plant for reads this file.
 */
const OBJECTS = { name: 'objects', dir: 'packages/objects', entries: ['objects'] } as const;

/** The CLI's entries: resolved to the file the client spawns, never imported (`binBreaches`), and so no entry `breaches` reads. */
const SPAWNED = ['agent-orchestrator/bin', 'agent-orchestrator/bin/wf'];

/** The client's file that resolves `SPAWNED`: its one reach of the orchestrator, a process and no import. */
const SPAWNER = 'apps/cli/src/local.ts';

/**
 * Every file that may resolve `SPAWNED`: the client's, and the templates' tests' helper, which applies and renders a shipped template
 * through the CLI as a person does, the templates being reached by no import of the orchestrator's; and the api's test of a command line
 * forwarded to it (`NEMIA_SERVER`), which spawns the CLI against the api it serves, as the client does under a remote context.
 */
const SPAWNERS = [SPAWNER, 'packages/templates/test/template.ts', 'apps/api/test/forwarded.boundary.test.ts'];

/** What in `file` reaches `guarded` other than by its entries: each breach, worded with what to do instead. */
function breaches(file: string, text: string, guarded: Guarded): string[] {
  const code = withoutComments(text);
  const out: string[] = [];
  const instead = `reach it through ${guarded.entries.join(' or ')}`;
  for (const spec of specifiersIn(code)) {
    if (SPAWNED.includes(spec)) continue;
    if ((spec === guarded.name || spec.startsWith(`${guarded.name}/`)) && !guarded.entries.includes(spec)) {
      out.push(`${file} imports ${spec}, which is not an entry of ${guarded.name}: ${instead}`);
    }
    if (spec.startsWith('.') && `${path.posix.normalize(path.posix.join(path.posix.dirname(file), spec))}/`.startsWith(`${guarded.dir}/`)) {
      out.push(`${file} imports ${spec}, a path into ${guarded.dir}: ${instead}`);
    }
  }
  const resolver = new RegExp(`\\b(?:import\\.meta|require)\\.resolve\\s*\\(\\s*['"\`]${guarded.name}\\b(?!/bin(?:/wf)?['"\`])`);
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
  for (const dir of ['apps/api/src', 'apps/api/test', 'apps/web/src', 'apps/web/test', 'apps/cli/src', 'apps/cli/bin'])
    assert.ok(
      files.some((f) => f.startsWith(`${dir}/`)),
      `the scan reads ${dir}`,
    );
  const named = new Set(files.flatMap((f) => specifiersIn(fs.readFileSync(path.join(ROOT, f), 'utf8'))));
  for (const entry of GUARDED.entries) assert.ok(named.has(entry), `and some of it imports ${entry}`);
});

test('code outside packages/agent-orchestrator reaches it through agent-orchestrator, agent-orchestrator/run, agent-orchestrator/workflow and agent-orchestrator/testing alone', () => {
  const found = workspaceFiles(GUARDED).flatMap((f) => breaches(f, fs.readFileSync(path.join(ROOT, f), 'utf8'), GUARDED));
  assert.deepEqual(found, []);
});

test('REFUSED: a subpath not in its exports, a relative path, import.meta.resolve, and a path built into src — each route', () => {
  const at = 'apps/api/test/x.test.ts';
  const refused = (text: string) => breaches(at, text, GUARDED);
  const instead =
    'reach it through agent-orchestrator or agent-orchestrator/run or agent-orchestrator/workflow or agent-orchestrator/testing';
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

test('code outside packages/objects reaches it through objects alone, and the scan reads this package and the apps', () => {
  const files = workspaceFiles(OBJECTS);
  for (const dir of ['packages/agent-orchestrator/src', 'apps/api/src', 'apps/web/src', 'apps/cli/src'])
    assert.ok(
      files.some((f) => f.startsWith(`${dir}/`)),
      `the scan reads ${dir}`,
    );
  assert.deepEqual(
    files.flatMap((f) => breaches(f, fs.readFileSync(path.join(ROOT, f), 'utf8'), OBJECTS)),
    [],
  );
});

test('REFUSED: objects reached by a subpath, a relative path or a path built into its src; its entry let through', () => {
  const at = 'apps/web/src/lib/x.ts';
  const reached = (text: string) => breaches(at, text, OBJECTS).length;
  assert.equal(reached("import { Run } from 'objects/src/run.ts';"), 1, 'a subpath');
  assert.equal(reached("import type { Card } from 'objects/card';"), 1, 'a subpath not in its exports');
  assert.equal(reached("import { Run } from '../../../../packages/objects/src/run.ts';"), 1, 'a relative path');
  assert.equal(
    breaches('packages/agent-orchestrator/src/x.ts', "import { ObjectMeta } from '../../objects/src/meta.ts';", OBJECTS).length,
    1,
    'a relative path from this package',
  );
  assert.equal(reached(`const f = path.join(ROOT, 'packages', '${OBJECTS.name}', 'src', 'run.ts');`), 1, 'a path built into its src');
  assert.equal(reached("import { Run, type Card } from 'objects';"), 0, 'its entry');
  assert.equal(reached("import { x } from 'objects-ui';"), 0, 'another package whose name opens with it');
});

test("agent-orchestrator's exports are . (runner.ts), ./run, ./workflow, ./testing (the test place and the doors' stand-ins) and the CLI's two entries the client spawns, ./bin and ./bin/wf, and nothing else but its package.json", () => {
  const { exports } = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')) as { exports: Record<string, string> };
  assert.deepEqual(exports, {
    '.': './src/runner.ts',
    './run': './src/run.ts',
    './workflow': './src/workflow.ts',
    './testing': './testing.ts',
    './bin': './bin/nemia.ts',
    './bin/wf': './bin/wf.ts',
    './package.json': './package.json',
  });
});

/** Each string of `text`'s code that names an entry of `SPAWNED`, with its line, and whether it is a module an import loads. */
function spawnedNames(text: string): { line: number; spec: string; imported: boolean }[] {
  return withoutComments(text)
    .split('\n')
    .flatMap((row, i) =>
      [...row.matchAll(/['"`](agent-orchestrator\/bin(?:\/wf)?)['"`]/g)].map((m) => ({
        line: i + 1,
        spec: m[1],
        imported: new RegExp(`(?:\\bfrom\\s*|^\\s*import\\s*|(?<!\\.)\\b(?:import|require)\\s*\\(\\s*)['"\`]${m[1]}['"\`]`).test(row),
      })),
    );
}

/**
 * Where `file` names the CLI's entries other than as the client spawns them: an import of one, from any file, since the CLI is a process
 * and never a module; and a name of one outside `SPAWNER`, which alone resolves it.
 */
function binBreaches(file: string, text: string): string[] {
  return spawnedNames(text).flatMap(({ line, spec, imported }) => {
    if (imported) return [`${file}:${line} imports ${spec}, the orchestrator's CLI: spawn it from ${SPAWNER} (spawned), never import it`];
    if (!SPAWNERS.includes(file))
      return [`${file}:${line} names ${spec} outside ${SPAWNERS.join(' and ')}: run the old path through its spawned`];
    return [];
  });
}

test("the CLI entries are resolved by apps/cli/src/local.ts and the templates' test helper alone, and imported by no file", () => {
  const files = workspaceFiles(GUARDED);
  assert.ok(files.includes(SPAWNER), `the scan reads ${SPAWNER}`);
  const spawner = spawnedNames(fs.readFileSync(path.join(ROOT, SPAWNER), 'utf8'));
  assert.deepEqual([...new Set(spawner.map((n) => n.spec))].sort(), SPAWNED, `${SPAWNER} resolves both entries`);
  assert.deepEqual(
    files.flatMap((f) => binBreaches(f, fs.readFileSync(path.join(ROOT, f), 'utf8'))),
    [],
  );
});

test('REFUSED: a CLI entry resolved outside apps/cli/src/local.ts, and one imported, even there; the resolve there and prose let through', () => {
  const resolve = "const at = fileURLToPath(import.meta.resolve('agent-orchestrator/bin'));";
  assert.equal(binBreaches('apps/cli/src/reads/ls.ts', resolve).length, 1, 'resolved in another file of the client');
  assert.equal(binBreaches('apps/api/src/x.ts', "spawn(process.execPath, [require.resolve('agent-orchestrator/bin/wf')]);").length, 1);
  assert.equal(binBreaches('apps/cli/test/x.test.ts', "const entry = 'agent-orchestrator/bin';").length, 1, 'a test names it');
  for (const imported of [
    "import 'agent-orchestrator/bin';",
    "import { x } from 'agent-orchestrator/bin/wf';",
    "const m = await import('agent-orchestrator/bin');",
  ]) {
    assert.equal(binBreaches(SPAWNER, imported).length, 1, `imported in ${SPAWNER}: ${imported}`);
    assert.ok(binBreaches(SPAWNER, imported)[0].includes(' imports '), imported);
  }
  assert.deepEqual(binBreaches(SPAWNER, resolve), [], 'the resolve in the spawner');
  assert.deepEqual(binBreaches(SPAWNERS[1], resolve), [], "the resolve in the templates' helper");
  assert.equal(binBreaches('packages/templates/test/x.test.ts', resolve).length, 1, "a templates' test beside the helper");
  assert.deepEqual(
    binBreaches(SPAWNER, "import.meta.resolve(entry === 'wf' ? 'agent-orchestrator/bin/wf' : 'agent-orchestrator/bin')"),
    [],
    'the two in one resolve',
  );
  assert.deepEqual(
    binBreaches('apps/cli/src/main.ts', "/** spawns `agent-orchestrator/bin` from local.ts, 'agent-orchestrator/bin' */"),
    [],
    'prose',
  );
  assert.deepEqual(breaches(SPAWNER, resolve, GUARDED), [], 'no breach of the entries: it is no import, and binBreaches judges it');
  assert.equal(
    breaches(SPAWNER, "const f = import.meta.resolve('agent-orchestrator/package.json');", GUARDED).length,
    2,
    'another subpath resolved there is still refused',
  );
});

/** The entry a test alone imports: the test place, `testPlace` (`place/memory`), and the doors' stand-ins (`testing.ts`). */
const TESTING = 'agent-orchestrator/testing';

/** Where `file`, which is no test's, imports the testing entry: a program that runs is given the place its layer holds. */
function testingBreaches(file: string, text: string): string[] {
  if (isTestFile(file) || !specifiersIn(withoutComments(text)).includes(TESTING)) return [];
  return [
    `${file} imports ${TESTING}, which is for tests alone: a program that runs is given its place where it is composed ` +
      '(gitPlaceLayer), and only a test file (*.test.ts, or under a test/ folder) takes the test place',
  ];
}

test('REFUSED: a file of a src or a bin that imports the testing entry; a test file may', () => {
  const line = "import { testPlace } from 'agent-orchestrator/testing';";
  for (const file of ['apps/api/src/store.ts', 'packages/agent-orchestrator/src/runner.ts', 'packages/agent-orchestrator/bin/nemia.ts'])
    assert.equal(testingBreaches(file, line).length, 1, `refused: ${file}`);
  assert.equal(
    testingBreaches('apps/api/src/app.ts', "const t = await import('agent-orchestrator/testing');").length,
    1,
    'a dynamic import',
  );
  for (const file of ['apps/api/test/placed.ts', 'apps/api/src/asks/say.test.ts', 'packages/agent-orchestrator/test/x.test.ts'])
    assert.deepEqual(testingBreaches(file, line), [], `not refused: ${file}`);
  assert.deepEqual(testingBreaches('apps/api/src/store.ts', "import { engineOf } from 'agent-orchestrator';"), [], 'the root entry');
  assert.deepEqual(testingBreaches('apps/api/src/store.ts', ` * ${line}`), [], 'prose');
});

test('no file that is no test imports the testing entry, in this package or outside it, and some test does', () => {
  const listed = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  const files = listed
    .split('\n')
    .filter((f) => SOURCE.test(f) && fs.existsSync(path.join(ROOT, f)))
    .map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')] as const);
  assert.ok(
    files.some(([f, text]) => isTestFile(f) && specifiersIn(text).includes(TESTING)),
    'a test takes the test place by the entry, so the scan reads the specifier',
  );
  assert.deepEqual(
    files.flatMap(([f, text]) => testingBreaches(f, text)),
    [],
  );
});

/** The templates workspace: Nemia's builtin templates, which this package finds by path (`BuiltinTemplates`) and never imports. */
const TEMPLATES = { name: 'templates', dir: 'packages/templates' } as const;

/** Where `file`, of this package, imports the templates workspace, by its name or by a relative path into its folder. */
function templateBreaches(file: string, text: string): string[] {
  const instead = `find a builtin template by path, through BuiltinTemplates (src/template/door/templates.store.ts)`;
  return specifiersIn(withoutComments(text)).flatMap((spec) => {
    const named = spec === TEMPLATES.name || spec.startsWith(`${TEMPLATES.name}/`);
    const into =
      spec.startsWith('.') && `${path.posix.normalize(path.posix.join(path.posix.dirname(file), spec))}/`.startsWith(`${TEMPLATES.dir}/`);
    return named || into ? [`${file} imports ${spec}, the templates workspace: ${instead}`] : [];
  });
}

test('REFUSED: a file of this package that imports the templates workspace, by its name or by a path; its own templates folder is not it', () => {
  const file = 'packages/agent-orchestrator/src/factory/applied/x.ts';
  assert.equal(templateBreaches(file, "import x from 'templates/sdlc/nemia.ts';").length, 1, 'by its name');
  assert.equal(templateBreaches(file, "import y from '../../../../templates/sdlc/nemia.ts';").length, 1, 'by a path into its folder');
  assert.deepEqual(templateBreaches(file, "import { templatePlace } from '../../template/door/templates.store.ts';"), [], 'its own folder');
});

test("no file of this package's src, bin or place imports the templates workspace, and the scan reads src/template/door", () => {
  const listed = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'src', 'bin', 'place'], { cwd: PKG, encoding: 'utf8' });
  const files = listed.split('\n').filter((f) => SOURCE.test(f) && fs.existsSync(path.join(PKG, f)));
  assert.ok(files.includes('src/template/door/templates.store.ts'), 'the scan reads the store that finds the templates by path');
  assert.deepEqual(
    files.flatMap((f) => templateBreaches(`${GUARDED.dir}/${f}`, fs.readFileSync(path.join(PKG, f), 'utf8'))),
    [],
  );
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
  for (const dir of [
    'apps/api',
    'apps/cli',
    'apps/web',
    'packages/agent-orchestrator',
    'packages/agent-runtime',
    'packages/objects',
    'tools/guards',
  ])
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
