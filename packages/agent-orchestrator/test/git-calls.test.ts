/**
 * No package and no app takes a dependency on git (the git-out design in docs/, *The rule*): a git call belongs to the place's code
 * (`place/git`), given as a service, never to a `src`. Over the `src` of each workspace the root package.json names, tests left out
 * (`sourcesOf`), four things are refused, each a matcher of `MATCHERS` over the file's syntax tree, so a call oxfmt splits over lines
 * is the same call:
 *
 * - **`spawn`**: `'git'` as the command handed to one of `SPAWNS`, written there or held by a `const` of the same file;
 * - **`wrapper`**: a call of a helper that wraps such a spawn (`WRAPPERS`);
 * - **`path`**: `'.git'` or `'MERGE_HEAD'` as a segment handed to a call of `node:path` or `node:fs`;
 * - **`script`**: `'scripts'` as a segment handed to one of `SPAWNS`, among its arguments or in a list of them, or to a call of
 *   `node:path` or `node:fs`: a place answers by a call, and no `src` starts a script to ask it, nor builds the path of one.
 *
 * A word that runs nothing passes: `'git'` in a list, a comparison or another function's argument, `MERGE_HEAD` in a sentence or a comment.
 *
 * A file that held such a call was a known exception, counted file by file (`GIT_SITES`), and the count only shrank. Each entry named the
 * cards that removed its calls (`CARDS`). `ratchetBreaks` refuses a file no entry holds, a count above the measure or below it, an entry
 * for a file gone or clean, and an entry with no card or an unknown card. The baseline is empty, and stays so.
 *
 * The test reads files outside this package: `turbo.json` makes the apps' sources and the runtime inputs of this package's tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { argumentsOf, calleeName, calleeRoot, factsOf, literalParts, runsGit, SPAWNS, type FileFacts } from './git-spawns.ts';
import { workspaces } from './workspaces.ts';
import { scratch } from './scratch.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** The helpers that wrap a git spawn: each call of one runs git. */
const WRAPPERS = ['git', 'gitSays'];

/** The path segments only git's own files have. */
const GIT_SEGMENTS = ['.git', 'MERGE_HEAD'];

/** The folder a place's scripts were run from, one process a question. */
const SCRIPT_SEGMENTS = ['scripts'];

/**
 * The cards of the git-out design's migration that remove a git call from a `src`, by the letter an entry names, each with its filed
 * run and its row.
 */
const CARDS: Readonly<Record<string, string>> = {
  F: "git-out-card-f-a-step-s-work-84on: `make` and `handoff`, `workspaceFor`'s git half, `handOff`, `includeFiles`'s check-ignore",
  H: 'git-out-card-h-what-a-result-wv83: `report`, what a result changed, its artifacts, and the base a merge is read against',
  I1: 'git-out-card-i1-where-a-resu-8xlp, row I, its first half: `standing`, whether a result is on its base and how far ahead',
  I2: 'workflow-build-repo-home-yrn-bvyk, row I, its second half: everyone else reads the snapshot: wf ls, the api, decide, …',
  J: 'git-out-card-j-the-code-says-vdub: the last callers go, and with them the `git` and `gitSays` helpers',
};

type Entry = { count: number; cards: readonly string[] };
type Baseline = Readonly<Record<string, Entry>>;

/** Each file that calls git, with its count and the cards that remove its calls: none. */
const GIT_SITES: Baseline = {};

type Matcher = { name: 'spawn' | 'wrapper' | 'path' | 'script'; matches: (call: ts.CallExpression, facts: FileFacts) => boolean };

/** Whether a string holds one of git's own files as a whole `/`-separated segment. */
const namesGitFile = (text: string): boolean => text.split('/').some((segment) => GIT_SEGMENTS.includes(segment));

/** Whether a string holds the folder of a place's scripts as a whole `/`-separated segment. */
const namesScript = (text: string): boolean => text.split('/').some((segment) => SCRIPT_SEGMENTS.includes(segment));

const MATCHERS: readonly Matcher[] = [
  {
    name: 'spawn',
    matches: runsGit,
  },
  { name: 'wrapper', matches: (call) => WRAPPERS.includes(calleeName(call) ?? '') },
  {
    name: 'path',
    matches: (call, facts) =>
      facts.pathNames.has(calleeRoot(call) ?? '') && call.arguments.some((arg) => literalParts(arg, facts).some(namesGitFile)),
  },
  {
    name: 'script',
    matches: (call, facts) =>
      (SPAWNS.includes(calleeName(call) ?? '') || facts.pathNames.has(calleeRoot(call) ?? '')) &&
      argumentsOf(call).some((arg) => literalParts(arg, facts).some(namesScript)),
  },
];

type Site = { line: number; matcher: Matcher['name'] };

/** Each call of `text` that runs git or reads git's files, by its line and the first of `matchers` that holds: a call counts once. */
function sitesIn(file: string, text: string, matchers: readonly Matcher[] = MATCHERS): Site[] {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const facts = factsOf(source);
  const sites: Site[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const matcher = matchers.find((m) => m.matches(node, facts));
      if (matcher) sites.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, matcher: matcher.name });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sites;
}

/** Whether a file of a `src` is left out: a test, beside its code or in a `test` folder. */
const isTest = (file: string): boolean => /\.test\.tsx?$/.test(file) || file.split('/').includes('test');

/**
 * Every `.ts` and `.tsx` under the `src` of each workspace the root package.json of `root` names, by its path from `root`, but the tests.
 * A workspace with no `src`, as `tools/guards` (a CI tool, which asks git as `workflows/build/landing.ts` does), has none.
 */
function sourcesOf(root: string): string[] {
  const srcs = workspaces(root).map((dir) => `${dir}/src`);
  return srcs
    .filter((src) => fs.existsSync(path.join(root, src)))
    .flatMap((src) =>
      fs.readdirSync(path.join(root, src), { recursive: true, encoding: 'utf8' }).map((f) => `${src}/${f.split(path.sep).join('/')}`),
    )
    .filter((f) => /\.tsx?$/.test(f) && !isTest(f))
    .sort();
}

/** Each file's count of sites, for the files that hold one at least. */
const measured = (texts: ReadonlyMap<string, string>, matchers: readonly Matcher[] = MATCHERS): Record<string, number> =>
  Object.fromEntries([...texts].map(([file, text]) => [file, sitesIn(file, text, matchers).length]).filter(([, count]) => count !== 0));

/** What an entry fails to name: one card at least, each one `CARDS` knows. */
function namingBreak(file: string, entry: Entry): string | undefined {
  if (!entry.cards.length) return `${file}'s entry for git calls names no card: name the cards that remove them`;
  const unknown = entry.cards.filter((card) => !(card in CARDS));
  if (unknown.length) return `${file}'s entry for git calls names ${unknown.join(', ')}, which CARDS does not know: name a filed card`;
  return undefined;
}

/** What an entry's count and its file's measure disagree on, as a sentence naming the fix. */
function countBreak(file: string, count: number, allowed: number, exists: (file: string) => boolean): string | undefined {
  if (!exists(file))
    return `${file} holds git calls in the baseline but is not on disk: where it moved, rename its entry; else take it off`;
  if (count === 0) return `${file} holds no git call left: take its entry off the baseline`;
  if (count > allowed) return `${file} holds ${count} git calls, more than the ${allowed} the baseline allows: never add them here`;
  if (count < allowed) return `${file} holds ${count} git calls, fewer than the baseline's ${allowed}: lower its count to ${count}`;
  return undefined;
}

/**
 * What a measure and its baseline disagree on, each a sentence naming the fix: a file no entry holds, a count above or below the
 * measure, an entry for a file gone or clean, and an entry that names no card it can be held to.
 */
function ratchetBreaks(counts: Record<string, number>, baseline: Baseline, exists: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const [file, count] of Object.entries(counts))
    if (!(file in baseline))
      out.push(`${file} holds ${count} git calls: a git call belongs to the place's code, asked as a service; never add them here`);
  for (const [file, entry] of Object.entries(baseline)) {
    const naming = namingBreak(file, entry);
    const counted = countBreak(file, counts[file] ?? 0, entry.count, exists);
    if (naming) out.push(naming);
    if (counted) out.push(counted);
  }
  return out;
}

const onDisk = (file: string): boolean => fs.existsSync(path.join(ROOT, file));

const repository = (): Map<string, string> => new Map(sourcesOf(ROOT).map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));

/** The plants each matcher must refuse, each one call over one or more lines. */
const PLANTS: Readonly<Record<Matcher['name'], readonly string[]>> = {
  spawn: [
    "import { execFileSync } from 'node:child_process';\nexecFileSync('git', ['status']);\n",
    "import { spawnSync } from 'node:child_process';\nconst cmd = 'git';\nspawnSync(cmd, ['status']);\n",
    "execCounted(\n  'git',\n  args,\n);\n",
    'cp.spawn(`git`, []);\n',
    'execFile("git", []);\n',
    "execSync('git status --porcelain');\n",
    'execSync(`git rev-parse ${ref}`);\n',
  ],
  wrapper: ["gitSays(repo, 'status');\n", "git(\n  repo,\n  'rev-parse',\n);\n"],
  path: [
    "import path from 'node:path';\npath.join(repo, '.git');\n",
    "import path from 'node:path';\npath.join(dotGit, 'MERGE_HEAD');\n",
    "import path from 'node:path';\npath.join(\n  repo,\n  '.git',\n  'MERGE_HEAD',\n);\n",
    "import fs from 'node:fs';\nfs.existsSync(`${repo}/.git`);\n",
    "import * as fsp from 'node:fs/promises';\nconst name = 'MERGE_HEAD';\nawait fsp.readFile(name);\n",
    "import { join } from 'node:path';\nimport { existsSync } from 'node:fs';\nexistsSync(join(repo, '.git'));\n",
  ],
  script: [
    "import path from 'node:path';\npath.join(dir, 'scripts', `${verb}.ts`);\n",
    "import { spawnSync } from 'node:child_process';\nspawnSync(process.execPath, [`${dir}/scripts/${verb}.ts`], { input });\n",
    "import { spawn } from 'node:child_process';\nspawn(\n  process.execPath,\n  ['place/git/scripts/make.ts'],\n  { detached: true },\n);\n",
    "const script = 'place/git/scripts/open.ts';\nexecFileSync(process.execPath, [script]);\n",
    "import fs from 'node:fs';\nfs.existsSync(`${dir}/scripts/${verb}.ts`);\n",
  ],
};

/** Words that name git and run nothing: each must measure no site. */
const WORDS = [
  "export const documented = ['cd', 'diff', 'git', 'pwd'];\n",
  "const line = `${run}'s ${step} has its merge staged in ${repo} (MERGE_HEAD)`;\n",
  '/** Runs `git diff` and reads `.git/MERGE_HEAD`. */\nexport const x = 1;\n',
  "if (kind === 'git') say('git');\n",
  "within('git', run);\n",
  "if (segments[0] === '.git') refuse();\n",
  'export const git = (repo: string, ...args: string[]) => run(repo, args);\n',
  "import path from 'node:path';\npath.join(repo, '.github', 'MERGE_HEAD.md', 'git');\n",
  "import { join } from './elsewhere.ts';\njoin(repo, '.git');\n",
  "execFileSync('npm', ['run', 'git']);\nexecSync('npx gitlab');\n",
  "const said = 'its scripts are gone: a place answers by a call';\nconst has = pkg.scripts.test;\n",
  "import path from 'node:path';\npath.join(root, 'transcripts', 'scripts.md');\nspawn(process.execPath, [entry, 'scripts.json']);\n",
];

test('a plant of each matcher is one site under it, and over several lines too', () => {
  for (const [matcher, plants] of Object.entries(PLANTS))
    for (const plant of plants)
      assert.deepEqual(
        sitesIn('plant.ts', plant).map((s) => s.matcher),
        [matcher],
        `${plant} is one ${matcher} site`,
      );
  assert.deepEqual(
    sitesIn('plant.ts', PLANTS.path[2]),
    [{ line: 2, matcher: 'path' }],
    'a call split over lines is counted once, at its start',
  );
  assert.deepEqual(sitesIn('plant.tsx', "const A = () => <b>{execFileSync('git', [])}</b>;\n"), [{ line: 1, matcher: 'spawn' }]);
});

test("words that name git and run nothing measure no site: a list, a sentence, a comment, a comparison, a helper's declaration", () => {
  for (const words of WORDS) assert.deepEqual(sitesIn('words.ts', words), [], words);
});

test('REFUSED: each matcher does work — its plants are refused with it, and pass with it taken out', () => {
  for (const matcher of MATCHERS) {
    const others = MATCHERS.filter((m) => m !== matcher);
    for (const plant of PLANTS[matcher.name]) {
      assert.equal(sitesIn('plant.ts', plant).length, 1, `${plant} is refused with every matcher on`);
      assert.deepEqual(sitesIn('plant.ts', plant, others), [], `${plant} passes without ${matcher.name}`);
    }
  }
});

test("the scan reads every workspace's src, and no test, script or file outside a src", () => {
  const root = scratch('git-calls-');
  const site = "execFileSync('git', ['status']);\n";
  const files = [
    'packages/p/src/a.ts',
    'packages/p/src/a.test.ts',
    'packages/p/src/test/b.ts',
    'packages/p/place/git/scripts/s.ts',
    'packages/p/test/t.ts',
    'apps/w/src/c.tsx',
    'apps/w/src/c.test.tsx',
    'apps/w/test/d.ts',
    'apps/w/src/notes.md',
    'tools/g/src/e.ts',
    'tools/other/src/f.ts',
  ];
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), site);
  }
  for (const dir of ['packages/p', 'apps/w']) fs.writeFileSync(path.join(root, dir, 'package.json'), '{}');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*', 'apps/*', 'tools/g'] }));
  assert.deepEqual(sourcesOf(root).sort(), ['apps/w/src/c.tsx', 'packages/p/src/a.ts', 'tools/g/src/e.ts']);
});

test('the git calls of every src are held to their baseline, each entry naming its cards', () => {
  const texts = repository();
  assert.ok(texts.size > 100, `the scan read ${texts.size} files, and a misrooted scan passes for nothing`);
  for (const layer of ['packages/agent-orchestrator/src/', 'packages/agent-runtime/src/', 'apps/api/src/', 'apps/web/src/'])
    assert.ok(
      [...texts.keys()].some((f) => f.startsWith(layer)),
      `the scan reads ${layer}`,
    );
  assert.deepEqual(ratchetBreaks(measured(texts), GIT_SITES, onDisk), []);
});

test('REFUSED: a new file with a git call, in each layer, and a count raised by one', () => {
  const texts = repository();
  const fix = "a git call belongs to the place's code, asked as a service; never add them here";
  const planted = (file: string, text: string): string[] => ratchetBreaks(measured(new Map([...texts, [file, text]])), GIT_SITES, onDisk);
  for (const [file, plant] of [
    ['packages/agent-orchestrator/src/x/x.store.ts', PLANTS.spawn[0]],
    ['packages/agent-runtime/src/x.ts', PLANTS.path[0]],
    ['apps/api/src/x/x.ts', PLANTS.wrapper[0]],
    ['apps/web/src/lib/x.ts', PLANTS.path[1]],
  ] as const)
    assert.deepEqual(planted(file, plant), [`${file} holds 1 git calls: ${fix}`]);
  const file = 'packages/agent-orchestrator/src/x/held.store.ts';
  const baseline: Baseline = { [file]: { count: 1, cards: ['J'] } };
  const held = new Map([...texts, [file, PLANTS.wrapper[0]]]);
  assert.deepEqual(
    ratchetBreaks(measured(held), baseline, () => true),
    [],
    'the count the fixture baseline holds is let through',
  );
  const raised = new Map([...texts, [file, `${PLANTS.wrapper[0]}\n${PLANTS.wrapper[0]}`]]);
  assert.deepEqual(
    ratchetBreaks(measured(raised), baseline, () => true),
    [`${file} holds 2 git calls, more than the 1 the baseline allows: never add them here`],
  );
});

test('REFUSED: a count above or below the baseline, an entry gone or clean, one with no card, an unknown card', () => {
  const exists = (file: string): boolean => file !== 'src/gone.ts';
  const breaks = (counts: Record<string, number>, entry: Entry): string[] => ratchetBreaks(counts, { 'src/a.ts': entry }, exists);
  const held: Entry = { count: 2, cards: ['F', 'J'] };
  assert.deepEqual(breaks({ 'src/a.ts': 2 }, held), [], 'the measure the baseline holds is let through');
  assert.deepEqual(breaks({ 'src/a.ts': 3 }, held), [
    'src/a.ts holds 3 git calls, more than the 2 the baseline allows: never add them here',
  ]);
  assert.deepEqual(breaks({ 'src/a.ts': 1 }, held), ["src/a.ts holds 1 git calls, fewer than the baseline's 2: lower its count to 1"]);
  assert.deepEqual(breaks({}, held), ['src/a.ts holds no git call left: take its entry off the baseline']);
  assert.deepEqual(ratchetBreaks({}, { 'src/gone.ts': held }, exists), [
    'src/gone.ts holds git calls in the baseline but is not on disk: where it moved, rename its entry; else take it off',
  ]);
  assert.deepEqual(breaks({ 'src/a.ts': 2 }, { count: 2, cards: [] }), [
    "src/a.ts's entry for git calls names no card: name the cards that remove them",
  ]);
  assert.deepEqual(breaks({ 'src/a.ts': 2 }, { count: 2, cards: ['F', 'Z9'] }), [
    "src/a.ts's entry for git calls names Z9, which CARDS does not know: name a filed card",
  ]);
});
