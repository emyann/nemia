/**
 * CI's due decision, pure (`due.ts`): which changed paths one claim makes due (`dueOf`), which jobs a change reaches across every claim
 * (`jobDueOf`, `claimsOf`), the input shapes it refuses rather than guess at, and the written table held to what it is read off.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { ALONE, LEGS, ROOTS } from '../../contracts/legs.ts';
import {
  claimsOf,
  type Claims,
  dependencyFolders,
  dueOf,
  EVERYWHERE,
  jobDueOf,
  LINT_CONFIGS,
  LINT_READS,
  LINT_SKIPS,
  patternOf,
  TASK,
  WRITTEN,
} from '../due.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

const INPUTS = [
  '$TURBO_DEFAULT$',
  '$TURBO_ROOT$/workflows/**',
  '$TURBO_ROOT$/turbo.json',
  '$TURBO_ROOT$/apps/*/CLAUDE.md',
  '$TURBO_ROOT$/apps/*/src/**',
  '$TURBO_ROOT$/apps/*/*.ts',
  'fixtures/**',
  '!$TURBO_ROOT$/apps/web/src/**',
  '!$TURBO_ROOT$/workflows/scratch/**',
];

test('a path under each input shape is due', () => {
  for (const file of [
    'tools/guards/due.ts',
    'workflows/build/implement.md',
    'turbo.json',
    'apps/api/CLAUDE.md',
    'apps/api/src/main.ts',
    'apps/api/vite.config.ts',
    'tools/guards/fixtures/a/b.json',
  ])
    assert.equal(dueOf([file], INPUTS, []).due, true, file);
});

test('a path near an input but outside it is not due', () => {
  for (const file of ['turbo.jsonc', 'apps/api/docs/CLAUDE.md', 'apps/api/src', 'workflowsx/a.md', 'tools/guardsx/a.ts'])
    assert.equal(dueOf([file], INPUTS, []).due, false, file);
});

test('a path matched only by a negation is not due, though a positive input names it', () => {
  assert.equal(dueOf(['apps/web/src/x.tsx'], INPUTS, []).due, false);
  assert.equal(dueOf(['workflows/scratch/a.md'], INPUTS, []).due, false);
  assert.equal(dueOf(['workflows/scratch/a.md', 'workflows/build/a.md'], INPUTS, []).due, true);
});

test('a path under a dependency folder is due', () => {
  assert.equal(dueOf(['packages/agent-runtime/src/core/domain.ts'], INPUTS, ['packages/agent-runtime']).due, true);
  assert.equal(dueOf(['packages/agent-runtime/src/core/domain.ts'], INPUTS, []).due, false);
});

test("a web source is not due under inputs that don't cover it", () => {
  assert.equal(dueOf(['apps/web/src/x.tsx'], ['$TURBO_DEFAULT$', '$TURBO_ROOT$/workflows/**'], ['packages/agent-runtime']).due, false);
});

test('no changed path is not due', () => {
  assert.equal(dueOf([], INPUTS, ['packages/agent-runtime']).due, false);
});

test('an input of a shape it does not read is refused, whatever the paths', () => {
  for (const input of ['$TURBO_ROOT$/{a,b}/**', '$TURBO_ROOT$/a?.ts', '$TURBO_ROOT$/[ab].ts', '$TURBO_ROOT$/a**b', '$TURBO_ROOT$/a/**b/c'])
    assert.throws(() => dueOf([], [input], []), Error, input);
});

test('** is read as a whole segment anywhere: any folders, none included, before another segment, and anything below when last', () => {
  const rows: [string, string, boolean][] = [
    ['$TURBO_ROOT$/tools/**/*.ts', 'tools/a.ts', true],
    ['$TURBO_ROOT$/tools/**/*.ts', 'tools/a/b/c.ts', true],
    ['$TURBO_ROOT$/tools/**/*.ts', 'tools/a.tsx', false],
    ['$TURBO_ROOT$/tools/**/*.ts', 'toolsx/a.ts', false],
    ['$TURBO_ROOT$/a/**/b', 'a/b', true],
    ['$TURBO_ROOT$/a/**/b', 'a/x/y/b', true],
    ['$TURBO_ROOT$/a/**/b', 'a/x/bb', false],
    ['$TURBO_ROOT$/**', 'README.md', true],
    ['$TURBO_ROOT$/a/**', 'a', false],
  ];
  for (const [input, file, due] of rows) assert.equal(patternOf(input).matches(file), due, `${input} on ${file}`);
  const inputs = ['$TURBO_ROOT$/**', '!$TURBO_ROOT$/**/*.md'];
  for (const file of ['README.md', 'a/b/x.md']) assert.equal(dueOf([file], inputs, []).due, false, `${file} is taken out`);
  assert.equal(dueOf(['a/b/x.ts'], inputs, []).due, true);
});

const claim = (inputs: string[], folders: string[] = []) => ({ inputs, folder: '.', folders });

/** Two jobs, each claiming its own folder, and a third whose second claim names a file its first one takes out. */
const PLANTED: Claims = {
  a: [claim(['$TURBO_ROOT$/a/**'])],
  b: [claim(['$TURBO_ROOT$/b/**'], ['lib'])],
  lint: [claim(['$TURBO_ROOT$/**', '!$TURBO_ROOT$/**/*.json']), claim(['$TURBO_ROOT$/.oxlintrc.json'])],
};

test('a job is due when a path is everywhere, claimed by no job, or claimed by its own claims, and not otherwise', () => {
  const rows: [string, string[], boolean, string][] = [
    ['a', ['a/x.ts'], true, "a path of a's own"],
    ['b', ['a/x.ts'], false, "a path of a's alone"],
    ['b', ['lib/x.ts'], true, 'a path under a dependency of b'],
    ['a', ['turbo.json'], true, 'a path every job runs on'],
    ['b', ['nobody/x.json'], true, 'a path no job claims'],
    ['a', ['.oxlintrc.json'], false, "lint's second claim names it though its first takes json out"],
    ['lint', ['.oxlintrc.json'], true, "a negation scopes to its own claim, so lint's second claim names it"],
    ['lint', ['x/y.json'], true, 'claimed by no job, so every job'],
    ['a', [], false, 'no changed path'],
  ];
  for (const [job, changed, due, why] of rows) assert.equal(jobDueOf(job, changed, PLANTED, ['turbo.json']).due, due, `${job}: ${why}`);
});

test('a job no claim holds, and an input of a shape it does not read, are refused before any path is read', () => {
  assert.throws(() => jobDueOf('c', [], PLANTED), Error);
  assert.throws(() => jobDueOf('a', [], { ...PLANTED, b: [claim(['$TURBO_ROOT$/{x,y}/**'])] }), Error);
});

const ROOT_CLAIMS = claimsOf(ROOT);

/** The keys of the repository's own claims a change to `file` makes due. */
const reached = (file: string) => Object.keys(ROOT_CLAIMS).filter((key) => jobDueOf(key, [file], ROOT_CLAIMS).due);

test("on the repository's own claims, a change reaches the jobs that read it and no other, as turbo's inputs say what each reads", () => {
  const rows: { file: string; due: string[]; not: string[] }[] = [
    {
      file: 'apps/docs/src/content/docs/x.mdx',
      due: ['build', 'test docs', 'guards', 'lint', 'typecheck', 'test agent-runtime', 'test agent-orchestrator'],
      not: [
        'test api',
        'test cli',
        'test web',
        'test objects',
        'test templates',
        'e2e',
        'e2e-look',
        'e2e-stories',
        ...LEGS.map((leg) => `contracts ${leg}`),
      ],
    },
    { file: 'README.md', due: ['test docs'], not: ['contracts rest', 'e2e', 'lint', 'build', 'guards'] },
    {
      file: 'packages/agent-runtime/src/core/domain.ts',
      due: [
        'test agent-runtime',
        'test agent-orchestrator',
        'test api',
        'guards',
        'contracts observe',
        'contracts approval-refusal',
        'contracts rest',
        'e2e',
        'typecheck',
        'lint',
      ],
      not: ['e2e-look', 'e2e-stories', 'build', 'test objects'],
    },
    {
      file: 'apps/web/src/routes/x.tsx',
      due: ['e2e', 'e2e-look', 'e2e-stories', 'build', 'test web', 'contracts rest'],
      not: ['contracts observe', 'contracts approval-refusal', 'test api'],
    },
    { file: 'tools/release/release.ts', due: ['typecheck', 'guards', 'lint'], not: ['build', 'e2e', 'contracts rest'] },
    { file: 'tools/observe/render/seed.ts', due: ['typecheck', 'test agent-orchestrator'], not: ['build', 'e2e'] },
    { file: 'apps/web/tsconfig.json', due: ['lint', 'typecheck', 'test web'], not: ['contracts observe'] },
    { file: 'packages/objects/test/tsconfig.json', due: ['lint', 'typecheck'], not: ['contracts observe'] },
  ];
  for (const row of rows) {
    const due = reached(row.file);
    for (const key of row.due) assert.ok(due.includes(key), `${row.file} reaches ${key}`);
    for (const key of row.not) assert.ok(!due.includes(key), `${row.file} does not reach ${key}`);
  }
  for (const file of EVERYWHERE) assert.deepEqual(reached(file), Object.keys(ROOT_CLAIMS), `${file} reaches every job`);
});

test("the repository's claims hold a key for each workspace's suite, the guards, typecheck, build, lint, the e2e, the look, the stories and each contracts leg", () => {
  const suites = Object.keys(ROOT_CLAIMS).filter((key) => key.startsWith('test '));
  assert.ok(suites.includes('test agent-orchestrator') && suites.includes('test web'), 'a key per suite');
  assert.ok(!suites.includes('test guards'), 'the guards are their own job');
  for (const key of ['guards', 'typecheck', 'build', 'lint', 'e2e', 'e2e-look', 'e2e-stories']) assert.ok(key in ROOT_CLAIMS, key);
  assert.deepEqual(
    Object.keys(ROOT_CLAIMS)
      .filter((key) => key.startsWith('contracts '))
      .sort(),
    LEGS.map((leg) => `contracts ${leg}`).sort(),
  );
});

/** The folders of the workspaces `WRITTEN` gives `key`, from the root. */
const writtenFolders = (key: string) => (ROOT_CLAIMS[key] ?? []).map((each) => each.folder).filter((folder) => folder !== '.');

/** Whether `file` lies at or under one of `folders`. */
const under = (file: string, folders: readonly string[]) => folders.some((folder) => file === folder || file.startsWith(`${folder}/`));

test('each contracts leg claims the workspaces of the files tools/contracts/legs.ts gives it', () => {
  for (const [leg, alone] of Object.entries(ALONE))
    assert.ok(under(alone.file, writtenFolders(`contracts ${leg}`)), `contracts ${leg} claims the workspace of ${alone.file}`);
  for (const root of ROOTS) assert.ok(under(root, writtenFolders('contracts rest')), `contracts rest claims the workspace of ${root}`);
  assert.equal(under(ALONE.observe.file, ['apps/web']), false, 'a leg whose workspaces miss its file is refused');
  for (const key of Object.keys(WRITTEN)) assert.ok(writtenFolders(key).length > 0, `${key} names a workspace`);
});

test("each extension lint's claim takes out is one .oxfmtrc.json skips, and the lint configs are read whatever their extension", () => {
  const text = fs.readFileSync(path.join(ROOT, '.oxfmtrc.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const ignored = (JSON.parse(text) as { ignorePatterns: string[] }).ignorePatterns;
  for (const ext of LINT_SKIPS) assert.ok(ignored.includes(`**/*.${ext}`), `.oxfmtrc.json skips **/*.${ext}`);
  for (const file of LINT_CONFIGS) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is there`);
    assert.ok(reached(file).includes('lint'), `${file} makes lint due`);
  }
  const lint = ROOT_CLAIMS.lint ?? [];
  for (const input of LINT_READS)
    assert.ok(
      lint.some((each) => each.inputs.includes(input)),
      `lint reads ${input}`,
    );
  assert.ok(reached('tools/x/tsconfig.test.json').includes('lint'), 'a tsconfig the type-aware rules resolve through makes lint due');
});

test("due.ts imports Node's built-ins alone, so a job runs it before npm ci", () => {
  const source = fs.readFileSync(path.join(ROOT, 'tools', 'guards', 'due.ts'), 'utf8');
  const imports = ts.preProcessFile(source, true, true).importedFiles.map((each) => each.fileName);
  assert.ok(imports.length > 0, 'due.ts imports something today');
  for (const name of imports) assert.ok(name.startsWith('node:'), `${name} is a built-in`);
});

test("the repository's own guards#test inputs, which turbo caches by, are the ones the due decision reads", () => {
  const turbo = JSON.parse(fs.readFileSync(path.join(ROOT, 'turbo.json'), 'utf8')) as { tasks: Record<string, { inputs?: string[] }> };
  const inputs = turbo.tasks[TASK]?.inputs ?? [];
  assert.ok(inputs.length > 0, `turbo.json lists inputs for ${TASK}`);
  for (const input of inputs) assert.doesNotThrow(() => patternOf(input), input);
  const folders = dependencyFolders(ROOT);
  for (const file of ['.github/workflows/ci.yml', 'docs/x.md']) assert.equal(dueOf([file], inputs, folders).due, true, file);
  for (const file of ['tools/store-measure/report.ts', 'tools/store-measure/fence.ts'])
    assert.equal(dueOf([file], inputs, folders).due, true, `${file}: store-measure.test.ts reads it`);
  for (const file of [
    'apps/web/src/x.tsx',
    'apps/web/vite.config.ts',
    'apps/web/.storybook/preview.tsx',
    'apps/web/glossary.json',
    'apps/api/glossary.json',
    'packages/agent-runtime/glossary.json',
    'packages/agent-orchestrator/src/feed/glossary.json',
  ])
    assert.equal(dueOf([file], inputs, folders).due, true, `${file}: the glossary guard reads it`);
  assert.equal(dueOf(['apps/web/public/x.svg'], inputs, folders).due, false);
});
