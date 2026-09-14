/**
 * The decider screen's pure part, at shipped defaults: what a branch touched, the files that decide a
 * check, the lesson line, and what a step consumed. Every guard here has a case that makes it refuse.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_FACING, CHECK_AFFECTING, LESSON, ROOT_GROUP, branchesToRead, count, groupOf, inFullLines, lessonGlobs, lessonLine, matches,
  parseGlobs, parseNumstat, radius, radiusLines, sensitiveHeading, sensitivePaths, sumUsage, touchedLines, usedLines,
} from '../src/radius.ts';

const WORKSPACES = ['packages/*', 'apps/*'];
const numstat = (...lines: string[]) => `${lines.join('\n')}\n`;

test('radius reads a rename at both ends, a binary file with no counts, and a file in no directory', () => {
  const r = radius(numstat(
    '12\t3\tpackages/agent-workflows/src/radius.ts',
    '0\t0\tpackages/agent-workflows/{test => spec}/old.test.ts',
    '5\t1\tapps/web/src/{a.ts => b.ts}',
    '1\t0\tapps/web/src/{ => nested}/x.ts',
    '-\t-\tapps/web/public/logo.png',
    '2\t0\tCLAUDE.md',
    '1\t1\tdocs/old.md => notes/new.md',
  ), WORKSPACES);

  assert.deepEqual(r.changes, [
    { path: 'packages/agent-workflows/src/radius.ts', added: 12, removed: 3 },
    { from: 'packages/agent-workflows/test/old.test.ts', path: 'packages/agent-workflows/spec/old.test.ts', added: 0, removed: 0 },
    { from: 'apps/web/src/a.ts', path: 'apps/web/src/b.ts', added: 5, removed: 1 },
    { from: 'apps/web/src/x.ts', path: 'apps/web/src/nested/x.ts', added: 1, removed: 0 },
    { path: 'apps/web/public/logo.png', added: null, removed: null },
    { path: 'CLAUDE.md', added: 2, removed: 0 },
    { from: 'docs/old.md', path: 'notes/new.md', added: 1, removed: 1 },
  ]);
  assert.deepEqual(r.groups, [
    { name: ROOT_GROUP, files: 1, added: 2, removed: 0, binary: 0 },
    { name: 'apps/web', files: 3, added: 6, removed: 1, binary: 1 },
    // A move between two parts of the repository touched both.
    { name: 'docs', files: 1, added: 1, removed: 1, binary: 0 },
    { name: 'notes', files: 1, added: 1, removed: 1, binary: 0 },
    { name: 'packages/agent-workflows', files: 2, added: 12, removed: 3, binary: 0 },
  ]);
  assert.deepEqual(r.agentFacing, ['CLAUDE.md']);
  // Moving a test out of `test/` changes what the check runs: the rename's old end counts.
  assert.deepEqual(r.checkAffecting, ['packages/agent-workflows/test/old.test.ts → packages/agent-workflows/spec/old.test.ts']);

  assert.deepEqual(radiusLines(r), [
    '(root)                    1 file   +2 −0',
    'apps/web                  3 files  +6 −1 · 1 binary',
    'docs                      1 file   +1 −1',
    'notes                     1 file   +1 −1',
    'packages/agent-workflows  2 files  +12 −3',
    'agent-facing     CLAUDE.md',
    'check-affecting  packages/agent-workflows/test/old.test.ts → packages/agent-workflows/spec/old.test.ts',
  ]);
});

test('a group of binary files says binary — never +0 −0, which would be a count nobody made', () => {
  const lines = radiusLines(radius(numstat('-\t-\tassets/a.png', '-\t-\tassets/b.png')));
  assert.deepEqual(lines, ['assets  2 files  binary']);
  assert.ok(!lines.some((l) => /\+0|−0/.test(l)));
});

test('without workspaces a change groups by its top-level directory, and a file in none by the root', () => {
  assert.equal(groupOf('packages/agent-workflows/src/cli.ts'), 'packages');
  assert.equal(groupOf('packages/agent-workflows/src/cli.ts', WORKSPACES), 'packages/agent-workflows');
  // A file directly in a workspace container is not in a package.
  assert.equal(groupOf('packages/README.md', WORKSPACES), 'packages');
  assert.equal(groupOf('package.json', WORKSPACES), ROOT_GROUP);
});

test('the agent-facing and check-affecting lines are absent when nothing qualifies', () => {
  const lines = radiusLines(radius(numstat('3\t1\tsrc/index.ts', '10\t0\tsrc/testing/latest.ts', '1\t1\tdocs/claude.md'), WORKSPACES));
  assert.deepEqual(lines, ['docs  1 file   +1 −1', 'src   2 files  +13 −1']);
  assert.ok(!lines.some((l) => l.startsWith('agent-facing') || l.startsWith('check-affecting')));
  // And present when something does — or the absence above would prove nothing.
  const both = radiusLines(radius(numstat('3\t1\tsrc/index.ts', '1\t0\t.mcp.json', '4\t0\tsrc/index.test.ts')));
  assert.deepEqual(both.slice(-2), ['agent-facing     .mcp.json', 'check-affecting  src/index.test.ts']);
});

test('a branch that changed nothing says so, rather than printing an empty radius', () => {
  assert.deepEqual(radiusLines(radius('')), ['nothing — the branch changed no file against the base']);
});

test('a numstat line the parser cannot read is refused, not skipped', () => {
  assert.throws(() => parseNumstat('12\t3\tsrc/a.ts\n 6 files changed, 2 insertions(+)\n'), (e: Error) => /^not a line of git diff --numstat: " 6 files changed/.test(e.message));
  assert.throws(() => parseNumstat('x\t3\tsrc/a.ts'), (e: Error) => /^not a line of git diff --numstat/.test(e.message));
});

test('a path git quoted is read as the name it is', () => {
  assert.deepEqual(parseNumstat(numstat('1\t0\t"src/a\\"b.ts"', '2\t0\t"docs/caf\\303\\251\\tx.md"')).map((c) => c.path), ['src/a"b.ts', 'docs/café\tx.md']);
});

test('the shipped lists name what the brief names, and refuse what they do not', () => {
  const inCheck = ['package.json', 'apps/web/package.json', 'package-lock.json', 'tsconfig.json', 'packages/x/tsconfig.build.json', 'turbo.json',
    'packages/x/src/a.test.ts', 'b.test.mjs', 'packages/x/test/helpers.ts', 'apps/web/test/e2e/run.ts', '.e2e/shot.png', 'apps/web/.e2e/a/b.png'];
  const notInCheck = ['src/index.ts', 'package.json.bak', 'mypackage.json', 'src/test.ts', 'src/testing/a.ts', 'latest/a.ts', 'docs/test.md', 'README.md'];
  for (const f of inCheck) assert.ok(matches(f, CHECK_AFFECTING), `check-affecting: ${f}`);
  for (const f of notInCheck) assert.ok(!matches(f, CHECK_AFFECTING), `not check-affecting: ${f}`);

  const inAgent = ['CLAUDE.md', 'packages/x/CLAUDE.md', 'AGENTS.md', '.claude/settings.json', '.codex/rules/git-commit.rules', '.mcp.json', 'packages/x/README.md', 'README.md'];
  const notInAgent = ['docs/claude.md', 'src/index.ts', 'CLAUDE.md.orig', 'my.claude/x', 'README.mdx', 'package.json'];
  for (const f of inAgent) assert.ok(matches(f, AGENT_FACING), `agent-facing: ${f}`);
  for (const f of notInAgent) assert.ok(!matches(f, AGENT_FACING), `not agent-facing: ${f}`);

  const lesson = lessonGlobs(WORKSPACES);
  for (const f of ['CLAUDE.md', 'AGENTS.md', 'apps/web/CLAUDE.md', 'docs/plan.md', 'packages/x/docs/features.md', 'apps/web/docs/a/b.md']) assert.ok(matches(f, lesson), `lesson: ${f}`);
  // A `docs/` that is not the root's or a workspace package's is product code, not where the next agent reads.
  for (const f of ['README.md', 'src/docs.ts', 'packages/x/documents/a.md', '.claude/settings.json', 'apps/web/src/routes/docs/index.tsx',
    'src/docs/strings.ts', 'packages/x/src/docs/a.md', 'packages/docs/a.md', 'vendor/lib/docs/a.md']) assert.ok(!matches(f, lesson), `not a lesson: ${f}`);
  // With no workspaces, only the root's docs/ is a package's.
  assert.ok(matches('docs/a.md', lessonGlobs([])) && !matches('packages/x/docs/features.md', lessonGlobs([])));
  assert.deepEqual(lessonGlobs(['packages/*/', 'apps/*']), [...LESSON, 'packages/*/docs/', 'apps/*/docs/']);
});

test('--sensitive with a glob that matches nothing names no path, and the heading says whose list it is', () => {
  const { changes } = radius(numstat('3\t1\tsrc/index.ts', '4\t0\tsrc/index.test.ts', '0\t0\t{test => spec}/a.ts'));
  assert.deepEqual(sensitivePaths(changes, parseGlobs('nothing/**, *.nope')), []);
  // The default takes both ends of a rename, so the diff git prints reads as one.
  assert.deepEqual(sensitivePaths(changes, CHECK_AFFECTING), ['src/index.test.ts', 'test/a.ts', 'spec/a.ts']);
  assert.match(sensitiveHeading(parseGlobs('nothing/**, *.nope')), /--sensitive names \(nothing\/\*\*, \*\.nope\)/);
  assert.match(sensitiveHeading(undefined), /check-affecting .* make its check pass/);
  assert.deepEqual(parseGlobs(' , ,'), []);
});

const on = (branch: string, ...lines: string[]) => ({ branch, radius: radius(numstat(...lines), WORKSPACES) });
const gone = (branch: string) => ({ branch, radius: { error: `git could not diff abc123...${branch}` } });

test("the lesson line: a branch that touched only a package's docs says so, and one that touched nothing agent-facing says nothing was written", () => {
  assert.equal(lessonLine([on('wf/a', '3\t1\tpackages/x/docs/features.md')]), 'lesson  packages/x/docs/features.md +3 −1');
  assert.equal(lessonLine([on('wf/a', '2\t0\tCLAUDE.md', '9\t9\tsrc/a.ts')]), 'lesson  CLAUDE.md +2 −0');
  // README.md is agent-facing, but it is not where a lesson goes.
  assert.equal(lessonLine([on('wf/a', '9\t9\tsrc/a.ts', '1\t0\tREADME.md', '1\t0\tsrc/a.test.ts')]), 'lesson  nothing written where the next agent reads');
  assert.equal(lessonLine([on('wf/a')]), 'lesson  nothing written where the next agent reads');
  // A docs page in an app, or a `docs/` in a package's source, is not a lesson.
  assert.equal(lessonLine([on('wf/a', '40\t0\tapps/web/src/routes/docs/index.tsx', '3\t0\tsrc/docs/strings.ts', '2\t0\tpackages/x/src/docs/a.md')]), 'lesson  nothing written where the next agent reads');
  assert.equal(lessonLine([on('wf/a', '40\t0\tapps/web/src/routes/docs/index.tsx', '1\t0\tapps/web/docs/notes.md')]), 'lesson  apps/web/docs/notes.md +1 −0');
  // A branch that could not be read is not a branch that wrote nothing.
  assert.equal(lessonLine([on('wf/a'), gone('wf/gone')]), 'lesson  not known — wf/gone could not be read');
  assert.equal(lessonLine([on('wf/a', '1\t0\tAGENTS.md'), on('wf/b', '2\t0\tdocs/x.md')]), 'lesson  AGENTS.md +1 −0 (wf/a) · docs/x.md +2 −0 (wf/b)');
});

test('what each branch touched is said under the branch, and a branch that could not be read says why', () => {
  assert.deepEqual(touchedLines([on('wf/a', '1\t0\tsrc/a.ts', '2\t2\tpackages/x/test/a.ts'), gone('wf/gone')]), [
    'touched  wf/a',
    '  packages/x  1 file   +2 −2',
    '  src         1 file   +1 −0',
    '  check-affecting  packages/x/test/a.ts',
    'touched  wf/gone  —  not read: git could not diff abc123...wf/gone',
  ]);
});

test('the files in full: the heading says why, then the diff — or none, said — or why it was not read', () => {
  const t = on('wf/a', '3\t1\tsrc/index.ts');
  const [heading, ...body] = inFullLines(t, parseGlobs('nothing/**'), '');
  assert.match(heading!, /^── in full: the files --sensitive names \(nothing\/\*\*\)/);
  assert.deepEqual(body, ['none']);
  assert.match(inFullLines(t, undefined, '')[0]!, /^── in full: the check-affecting files — what a change could edit to make its check pass ─+$/);
  assert.deepEqual(inFullLines(t, undefined, 'diff --git a/x.test.ts b/x.test.ts\n-assert.equal(1, 1);\n+assert.ok(true);\n\n').slice(1), ['diff --git a/x.test.ts b/x.test.ts', '-assert.equal(1, 1);', '+assert.ok(true);']);
  assert.deepEqual(inFullLines(t, undefined, undefined).slice(1), ['not read: git could not diff wf/a']);
  assert.deepEqual(inFullLines(gone('wf/gone'), undefined, undefined).slice(1), ['not read: git could not diff abc123...wf/gone']);
  assert.match(inFullLines(t, undefined, '', true)[0]!, /, on wf\/a /);
});

test('a step with no usage says used not measured, and cost never prints a number no runner measured', () => {
  assert.deepEqual(usedLines(undefined), ['used  not measured', 'cost  not measured']);
  assert.deepEqual(usedLines({ turns: 29, toolCalls: 93, inputTokens: 6_350_000, outputTokens: 112_000 }), [
    'used  29 turns · 93 tool calls · 6.35M in · 112k out',
    'cost  not measured',
  ]);
  // A measured zero is a zero; an unmeasured count is not one — codex's stream has no turns.
  assert.deepEqual(usedLines({ turns: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0 }), ['used  0 turns · 0 tool calls · 0 in · 0 out', 'cost  not measured']);
  assert.deepEqual(usedLines({ toolCalls: 4, inputTokens: 20_400 }), ['used  turns not measured · 4 tool calls · 20.4k in · tokens out not measured', 'cost  not measured']);
  for (const u of [undefined, {}, { turns: 1, toolCalls: 1, inputTokens: 1, outputTokens: 1 }]) {
    assert.doesNotMatch(usedLines(u)[1]!, /\d/, JSON.stringify(u));
  }
  // Only a runner told the cost has one, and only then is there a number to print.
  assert.equal(usedLines({ costUsd: 0.00412 })[1], 'cost  $0.00412');
});

test('attempts sum only what every one of them measured', () => {
  assert.deepEqual(sumUsage([{ turns: 3, inputTokens: 100, costUsd: 0.5 }, { turns: 4, inputTokens: 50 }]), { turns: 7, inputTokens: 150 });
  assert.equal(sumUsage([{ turns: 3, toolCalls: 2, inputTokens: 100, outputTokens: 9 }, null]), undefined, 'an attempt nobody measured leaves every count unmeasured');
  assert.equal(sumUsage([]), undefined);
  assert.equal(sumUsage([{}]), undefined);
});

test('a count reads to three figures', () => {
  assert.deepEqual([0, 999, 1_000, 1_234, 20_400, 112_000, 999_499, 999_999, 6_350_000, 2_500_000_000].map(count),
    ['0', '999', '1k', '1.23k', '20.4k', '112k', '999k', '1M', '6.35M', '2.5B']);
});

test('the screen reads the result branches, or — before a terminal step has one — every branch a step worked on', () => {
  assert.deepEqual(branchesToRead(['wf/r/review'], ['wf/r/implement', 'wf/r/review']), ['wf/r/review']);
  assert.deepEqual(branchesToRead([], ['wf/r/implement', undefined, 'wf/r/implement']), ['wf/r/implement']);
  assert.deepEqual(branchesToRead([], [undefined]), []);
});
