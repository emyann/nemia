/**
 * No package and no app takes a dependency on git (the git-out design in docs/, *The rule*): a git call belongs to the place skill, run
 * through `runPlaceVerb`, never to a `src`. Over `packages/*\/src` and `apps/*\/src`, tests left out (`sourcesOf`), three things are
 * refused, each a matcher of `MATCHERS` over the file's syntax tree, so a call oxfmt splits over lines is the same call:
 *
 * - **`spawn`**: `'git'` as the command handed to one of `SPAWNS`, written there or held by a `const` of the same file;
 * - **`wrapper`**: a call of a helper that wraps such a spawn (`WRAPPERS`);
 * - **`path`**: `'.git'` or `'MERGE_HEAD'` as a segment handed to a call of `node:path` or `node:fs`.
 *
 * A word that runs nothing passes: `'git'` in a list, a comparison or another function's argument, `MERGE_HEAD` in a sentence or a comment.
 *
 * Each file that holds such a call today is a known exception, counted file by file (`GIT_SITES`), and the count only shrinks. Each entry
 * names the cards that remove its calls (`CARDS`). `ratchetBreaks` refuses a file no entry holds, a count above the measure or below it,
 * an entry for a file gone or clean, and an entry with no card or an unknown card. A change that takes a call out of a file lowers its
 * count in the same commit; the baseline is empty once card J lands.
 *
 * The test reads files outside this package: `turbo.json` makes the apps' sources and the runtime inputs of this package's tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { scratch } from './scratch.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** The calls that start a process, by the name they are called by: their first argument is the command. */
const SPAWNS = ['execFileSync', 'execFile', 'spawn', 'spawnSync', 'execCounted'];

/** The calls that run a shell line: their first argument is the whole line, which runs git when its first word is git. */
const SHELLS = ['exec', 'execSync'];

/** The helpers that wrap a git spawn: each call of one runs git. */
const WRAPPERS = ['git', 'gitSays'];

/** The modules whose calls take a path. */
const PATH_MODULES = ['node:path', 'node:fs', 'node:fs/promises', 'path', 'fs', 'fs/promises'];

/** The path segments only git's own files have. */
const GIT_SEGMENTS = ['.git', 'MERGE_HEAD'];

/**
 * The cards of the git-out design's migration that remove a git call from a `src`, by the letter an entry names, each with its filed
 * run and its row.
 */
const CARDS: Readonly<Record<string, string>> = {
  E: 'git-out-card-e-nemia-rm-and-excf: `inventory` and `remove` for `nemia rm` and `nemia prune`',
  F: "git-out-card-f-a-step-s-work-84on: `make` and `handoff`, `workspaceFor`'s git half, `handOff`, `includeFiles`'s check-ignore",
  G: 'git-out-card-g-the-landing-r-5fbg: `status` and `land` for the landing, `mergeInProgress`, `mergeState`, `commitMerge`, `abortMerge`',
  H: 'git-out-card-h-what-a-result-wv83: `report`, what a result changed, its artifacts, and the base a merge is read against',
  I1: 'git-out-card-i1-where-a-resu-8xlp, row I, its first half: `standing`, whether a result is on its base and how far ahead',
  I2: 'workflow-build-repo-home-yrn-bvyk, row I, its second half: `standing` read by the tick, the heads and the tips',
  J: 'git-out-card-j-the-code-says-vdub: the last callers go, and with them the `git` and `gitSays` helpers',
};

type Entry = { count: number; cards: readonly string[] };
type Baseline = Readonly<Record<string, Entry>>;

/** Each file that calls git today, with its count and the cards that remove its calls. */
const GIT_SITES: Baseline = {
  'packages/agent-orchestrator/src/artifacts/artifacts.store.ts': { count: 1, cards: ['H'] },
  'packages/agent-orchestrator/src/branches/branches.store.ts': { count: 13, cards: ['H', 'I1', 'I2'] },
  'packages/agent-orchestrator/src/forget/forget.verb.ts': { count: 8, cards: ['E'] },
  'packages/agent-orchestrator/src/merge/merge.verb.ts': { count: 1, cards: ['H'] },
  'packages/agent-orchestrator/src/prune/prune.verb.ts': { count: 6, cards: ['E'] },
  'packages/agent-orchestrator/src/tick/file.verb.ts': { count: 1, cards: ['I1', 'I2'] },
  'packages/agent-orchestrator/src/workspace/worktree.store.ts': { count: 10, cards: ['F', 'J'] },
};

/** What a matcher reads of a file beside a call: the `const`s that hold a string, and the names bound to a path module. */
type FileFacts = { consts: ReadonlyMap<string, string>; pathNames: ReadonlySet<string> };

type Matcher = { name: 'spawn' | 'wrapper' | 'path'; matches: (call: ts.CallExpression, facts: FileFacts) => boolean };

/** `node` without the parentheses, `as`, `satisfies` and `!` around it. */
function unwrapped(node: ts.Expression): ts.Expression {
  let at = node;
  while (ts.isParenthesizedExpression(at) || ts.isAsExpression(at) || ts.isSatisfiesExpression(at) || ts.isNonNullExpression(at))
    at = at.expression;
  return at;
}

/** The string `node` is: a literal, a template with no substitution, or a `const` of the file that holds one; else `undefined`. */
function stringOf(node: ts.Expression | undefined, facts: FileFacts): string | undefined {
  if (!node) return undefined;
  const at = unwrapped(node);
  if (ts.isStringLiteral(at) || ts.isNoSubstitutionTemplateLiteral(at)) return at.text;
  if (ts.isIdentifier(at)) return facts.consts.get(at.text);
  return undefined;
}

/** The literal parts of `node`: its string, or a template's text around its substitutions. */
function literalParts(node: ts.Expression, facts: FileFacts): string[] {
  const at = unwrapped(node);
  if (ts.isTemplateExpression(at)) return [at.head.text, ...at.templateSpans.map((s) => s.literal.text)];
  const said = stringOf(at, facts);
  return said === undefined ? [] : [said];
}

/** The name a call is called by: an identifier's, or the last name of a property access. */
function calleeName(call: ts.CallExpression): string | undefined {
  const callee = unwrapped(call.expression);
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

/** The identifier a callee is rooted in: `fs` of `fs.promises.stat`, `join` of `join`. */
function calleeRoot(call: ts.CallExpression): string | undefined {
  let at = unwrapped(call.expression);
  while (ts.isPropertyAccessExpression(at)) at = unwrapped(at.expression);
  return ts.isIdentifier(at) ? at.text : undefined;
}

/** Whether a shell line runs git: its first word is git. */
const shellRunsGit = (parts: readonly string[]): boolean => /^\s*git(\s|$)/.test(parts[0] ?? '');

/** Whether a string holds one of git's own files as a whole `/`-separated segment. */
const namesGitFile = (text: string): boolean => text.split('/').some((segment) => GIT_SEGMENTS.includes(segment));

const MATCHERS: readonly Matcher[] = [
  {
    name: 'spawn',
    matches: (call, facts) => {
      const name = calleeName(call);
      const first = call.arguments[0];
      if (!name || !first) return false;
      if (SPAWNS.includes(name)) return stringOf(first, facts) === 'git';
      return SHELLS.includes(name) && shellRunsGit(literalParts(first, facts));
    },
  },
  { name: 'wrapper', matches: (call) => WRAPPERS.includes(calleeName(call) ?? '') },
  {
    name: 'path',
    matches: (call, facts) =>
      facts.pathNames.has(calleeRoot(call) ?? '') && call.arguments.some((arg) => literalParts(arg, facts).some(namesGitFile)),
  },
];

/** The facts of a file a matcher reads: each `const` that holds a string, and each name imported from a path module. */
function factsOf(source: ts.SourceFile): FileFacts {
  const consts = new Map<string, string>();
  const pathNames = new Set<string>();
  const facts = { consts, pathNames };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && PATH_MODULES.includes(node.moduleSpecifier.text)) {
      const clause = node.importClause;
      if (clause?.name) pathNames.add(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) pathNames.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) pathNames.add(element.name.text);
    }
    if (ts.isVariableDeclarationList(node) && node.flags & ts.NodeFlags.Const)
      for (const declaration of node.declarations) {
        const held = declaration.initializer && stringOf(declaration.initializer, facts);
        if (ts.isIdentifier(declaration.name) && held !== undefined) consts.set(declaration.name.text, held);
      }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return facts;
}

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

/** Every `.ts` and `.tsx` under the `src` of each package and app of `root`, by its path from `root`, but the tests. */
function sourcesOf(root: string): string[] {
  const srcs = ['packages', 'apps'].flatMap((layer) => {
    const at = path.join(root, layer);
    return fs.existsSync(at) ? fs.readdirSync(at).map((name) => `${layer}/${name}/src`) : [];
  });
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
      out.push(`${file} holds ${count} git calls: a git call belongs to the place skill, run through runPlaceVerb; never add them here`);
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

test("the scan reads every package's and app's src, and no test, script or file outside a src", () => {
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
  ];
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), site);
  }
  assert.deepEqual(sourcesOf(root), ['apps/w/src/c.tsx', 'packages/p/src/a.ts']);
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
  const fix = 'a git call belongs to the place skill, run through runPlaceVerb; never add them here';
  const planted = (file: string, text: string): string[] => ratchetBreaks(measured(new Map([...texts, [file, text]])), GIT_SITES, onDisk);
  for (const [file, plant] of [
    ['packages/agent-orchestrator/src/x/x.store.ts', PLANTS.spawn[0]],
    ['packages/agent-runtime/src/x.ts', PLANTS.path[0]],
    ['apps/api/src/x/x.ts', PLANTS.wrapper[0]],
    ['apps/web/src/lib/x.ts', PLANTS.path[1]],
  ] as const)
    assert.deepEqual(planted(file, plant), [`${file} holds 1 git calls: ${fix}`]);
  const [file] = Object.keys(GIT_SITES);
  const raised = new Map([...texts, [file, `${texts.get(file)}\n${PLANTS.wrapper[0]}`]]);
  assert.deepEqual(ratchetBreaks(measured(raised), GIT_SITES, onDisk), [
    `${file} holds ${GIT_SITES[file].count + 1} git calls, more than the ${GIT_SITES[file].count} the baseline allows: never add them here`,
  ]);
});

test('REFUSED: a count above or below the baseline, an entry gone or clean, one with no card, an unknown card', () => {
  const exists = (file: string): boolean => file !== 'src/gone.ts';
  const breaks = (counts: Record<string, number>, entry: Entry): string[] => ratchetBreaks(counts, { 'src/a.ts': entry }, exists);
  const held: Entry = { count: 2, cards: ['E', 'J'] };
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
  assert.deepEqual(breaks({ 'src/a.ts': 2 }, { count: 2, cards: ['E', 'Z9'] }), [
    "src/a.ts's entry for git calls names Z9, which CARDS does not know: name a filed card",
  ]);
});
