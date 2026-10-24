/**
 * The decider screen's pure part, at shipped defaults: what a branch touched, the files that decide a
 * check, the lesson line, and what a step consumed. Every guard here has a case that makes it refuse.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_FACING,
  CHECK_AFFECTING,
  LESSON,
  ROOT_GROUP,
  branchesToRead,
  deepWorkspaces,
  groupOf,
  inFullLines,
  isLesson,
  lessonGlobs,
  lessonLine,
  matches,
  countsLine,
  notKnown,
  parseGlobs,
  radius,
  radiusLines,
  sensitiveHeading,
  sensitivePaths,
  touchedLines,
  workspacesIn,
  type Change,
} from '../src/branches/branches.ts';
import { count, sumUsage, usedLines, budgetWord, dollars, peakMark, readWords, rebuiltCache } from '../src/status/status.ts';

const WORKSPACES = ['packages/*', 'apps/*'];
/**
 * The files a branch changed, as the place's `report` lists them, each written `added<TAB>removed<TAB>path`: `-` for a binary file's
 * count, and a rename's path `from => to`.
 */
const numstat = (...lines: string[]): Change[] =>
  lines.map((line) => {
    const [added, removed, named] = line.split('\t');
    const [from, to] = named.split(' => ');
    const count = (n: string) => (n === '-' ? null : Number(n));
    return { ...(to === undefined ? { path: from } : { from, path: to }), added: count(added), removed: count(removed) };
  });

test('radius reads a rename at both ends, a binary file with no counts, and a file in no directory', () => {
  const r = radius(
    numstat(
      '12\t3\tpackages/agent-orchestrator/src/radius.ts',
      '0\t0\tpackages/agent-orchestrator/test/old.test.ts => packages/agent-orchestrator/spec/old.test.ts',
      '5\t1\tapps/web/src/a.ts => apps/web/src/b.ts',
      '1\t0\tapps/web/src/x.ts => apps/web/src/nested/x.ts',
      '-\t-\tapps/web/public/logo.png',
      '2\t0\tCLAUDE.md',
      '1\t1\tdocs/old.md => notes/new.md',
    ),
    WORKSPACES,
  );

  assert.deepEqual(r.changes, [
    { path: 'packages/agent-orchestrator/src/radius.ts', added: 12, removed: 3 },
    { from: 'packages/agent-orchestrator/test/old.test.ts', path: 'packages/agent-orchestrator/spec/old.test.ts', added: 0, removed: 0 },
    { from: 'apps/web/src/a.ts', path: 'apps/web/src/b.ts', added: 5, removed: 1 },
    { from: 'apps/web/src/x.ts', path: 'apps/web/src/nested/x.ts', added: 1, removed: 0 },
    { path: 'apps/web/public/logo.png', added: null, removed: null },
    { path: 'CLAUDE.md', added: 2, removed: 0 },
    { from: 'docs/old.md', path: 'notes/new.md', added: 1, removed: 1 },
  ]);
  assert.deepEqual(
    r.groups,
    [
      { name: ROOT_GROUP, files: 1, added: 2, removed: 0, binary: 0 },
      { name: 'apps/web', files: 3, added: 6, removed: 1, binary: 1 },
      { name: 'docs', files: 1, added: 1, removed: 1, binary: 0 },
      { name: 'notes', files: 1, added: 1, removed: 1, binary: 0 },
      { name: 'packages/agent-orchestrator', files: 2, added: 12, removed: 3, binary: 0 },
    ],
    'a move between two parts of the repository, docs and notes, touched both',
  );
  assert.deepEqual(r.agentFacing, ['CLAUDE.md']);
  assert.deepEqual(
    r.checkAffecting,
    ['packages/agent-orchestrator/test/old.test.ts → packages/agent-orchestrator/spec/old.test.ts'],
    "moving a test out of test/ changes what the check runs: the rename's old end counts",
  );

  assert.deepEqual(radiusLines(r), [
    '(root)                       1 file   +2 −0',
    'apps/web                     3 files  +6 −1 · 1 binary',
    'docs                         1 file   +1 −1',
    'notes                        1 file   +1 −1',
    'packages/agent-orchestrator  2 files  +12 −3',
    'agent-facing     CLAUDE.md',
    'check-affecting  packages/agent-orchestrator/test/old.test.ts → packages/agent-orchestrator/spec/old.test.ts',
  ]);
});

test('a group of binary files says binary — never +0 −0, which would be a count nobody made', () => {
  const lines = radiusLines(radius(numstat('-\t-\tassets/a.png', '-\t-\tassets/b.png')));
  assert.deepEqual(lines, ['assets  2 files  binary']);
  assert.ok(!lines.some((l) => /\+0|−0/.test(l)));
});

test('without workspaces a change groups by its top-level directory, and a file in none by the root', () => {
  assert.equal(groupOf('packages/agent-orchestrator/src/cli.ts'), 'packages');
  assert.equal(groupOf('packages/agent-orchestrator/src/cli.ts', WORKSPACES), 'packages/agent-orchestrator');
  assert.equal(groupOf('packages/README.md', WORKSPACES), 'packages', 'a file directly in a workspace container is not in a package');
  assert.equal(groupOf('package.json', WORKSPACES), ROOT_GROUP);
});

test('the agent-facing and check-affecting lines are absent when nothing qualifies', () => {
  const lines = radiusLines(radius(numstat('3\t1\tsrc/index.ts', '10\t0\tsrc/testing/latest.ts', '1\t1\tdocs/claude.md'), WORKSPACES));
  assert.deepEqual(lines, ['docs  1 file   +1 −1', 'src   2 files  +13 −1']);
  assert.ok(!lines.some((l) => l.startsWith('agent-facing') || l.startsWith('check-affecting')));
  const both = radiusLines(radius(numstat('3\t1\tsrc/index.ts', '1\t0\t.mcp.json', '4\t0\tsrc/index.test.ts')));
  assert.deepEqual(
    both.slice(-2),
    ['agent-facing     .mcp.json', 'check-affecting  src/index.test.ts'],
    'and present when something does, or the absence above would prove nothing',
  );
});

test('a branch that changed nothing says so, rather than printing an empty radius', () => {
  assert.deepEqual(radiusLines(radius([])), ['nothing — the branch changed no file against the base']);
});

test("how much a branch changed is said in our words: files, lines, and the binary files beside them, never git's sentence", () => {
  assert.equal(countsLine(radius(numstat('12\t1\tsrc/a.ts', '2\t0\tdocs/b.md', '0\t0\tsrc/c.ts => src/d.ts'))), '3 files: +14 −1');
  assert.equal(countsLine(radius(numstat('1\t0\tsrc/a.ts', '-\t-\tshot.png'))), '2 files: +1 −0, 1 binary');
  assert.equal(countsLine(radius(numstat('-\t-\tshot.png'))), '1 file: 1 binary', 'no line was counted, so none is said');
  assert.equal(countsLine(radius([])), null, 'a branch that changed no file has no counts to say');
});

test("the base's workspaces are read from its package.json text: a list, or its packages, and none from no file or one that does not read", () => {
  assert.deepEqual(workspacesIn('{"workspaces":["packages/*","apps/*"]}'), ['packages/*', 'apps/*']);
  assert.deepEqual(workspacesIn('{"workspaces":{"packages":["./packages/*",3]}}'), ['./packages/*']);
  assert.deepEqual(workspacesIn('{"name":"x"}'), []);
  assert.deepEqual(workspacesIn(null), []);
  assert.deepEqual(workspacesIn('{not json'), []);
});

test('the shipped lists name what the brief names, and refuse what they do not', () => {
  const inCheck = [
    'package.json',
    'apps/web/package.json',
    'package-lock.json',
    'tsconfig.json',
    'packages/x/tsconfig.build.json',
    'turbo.json',
    'packages/x/src/a.test.ts',
    'b.test.mjs',
    'packages/x/test/helpers.ts',
    'apps/web/test/e2e/run.ts',
    '.e2e/shot.png',
    'apps/web/.e2e/a/b.png',
    '.oxlintrc.json',
    'packages/x/.oxfmtrc.json',
  ];
  const notInCheck = [
    'src/index.ts',
    'package.json.bak',
    'mypackage.json',
    'src/test.ts',
    'src/testing/a.ts',
    'latest/a.ts',
    'docs/test.md',
    'README.md',
    'oxlintrc.json',
  ];
  for (const f of inCheck) assert.ok(matches(f, CHECK_AFFECTING), `check-affecting: ${f}`);
  for (const f of notInCheck) assert.ok(!matches(f, CHECK_AFFECTING), `not check-affecting: ${f}`);

  const inAgent = [
    'CLAUDE.md',
    'packages/x/CLAUDE.md',
    'AGENTS.md',
    '.claude/settings.json',
    '.codex/rules/git-commit.rules',
    '.mcp.json',
    'packages/x/README.md',
    'README.md',
  ];
  const notInAgent = ['docs/claude.md', 'src/index.ts', 'CLAUDE.md.orig', 'my.claude/x', 'README.mdx', 'package.json'];
  for (const f of inAgent) assert.ok(matches(f, AGENT_FACING), `agent-facing: ${f}`);
  for (const f of notInAgent) assert.ok(!matches(f, AGENT_FACING), `not agent-facing: ${f}`);

  const lesson = lessonGlobs(WORKSPACES);
  for (const f of ['CLAUDE.md', 'AGENTS.md', 'apps/web/CLAUDE.md', 'docs/plan.md', 'packages/x/docs/features.md', 'apps/web/docs/a/b.md'])
    assert.ok(matches(f, lesson), `lesson: ${f}`);
  for (const f of [
    'README.md',
    'src/docs.ts',
    'packages/x/documents/a.md',
    '.claude/settings.json',
    'apps/web/src/routes/docs/index.tsx',
    'src/docs/strings.ts',
    'packages/x/src/docs/a.md',
    'packages/docs/a.md',
    'vendor/lib/docs/a.md',
  ])
    assert.ok(
      !matches(f, lesson),
      `not a lesson: ${f} — a docs/ that is not the root's or a workspace package's is product code, not where the next agent reads`,
    );
  assert.ok(
    matches('docs/a.md', lessonGlobs([])) && !matches('packages/x/docs/features.md', lessonGlobs([])),
    "with no workspaces, only the root's docs/ is a package's",
  );
  assert.deepEqual(lessonGlobs(['packages/*/', 'apps/*']), [...LESSON, 'packages/*/docs/', 'apps/*/docs/']);
});

test('--sensitive with a glob that matches nothing names no path, and the heading says whose list it is', () => {
  const { changes } = radius(numstat('3\t1\tsrc/index.ts', '4\t0\tsrc/index.test.ts', '0\t0\ttest/a.ts => spec/a.ts'));
  assert.deepEqual(sensitivePaths(changes, parseGlobs('nothing/**, *.nope')), []);
  assert.deepEqual(
    sensitivePaths(changes, CHECK_AFFECTING),
    ['src/index.test.ts', 'spec/a.ts'],
    'a rename the default names at either end is asked by its path, and the place diffs both ends as one',
  );
  assert.match(sensitiveHeading(parseGlobs('nothing/**, *.nope')), /--sensitive names \(nothing\/\*\*, \*\.nope\)/);
  assert.match(sensitiveHeading(undefined), /check-affecting .* make its check pass/);
  assert.deepEqual(parseGlobs(' , ,'), []);
});

const on = (branch: string, ...lines: string[]) => ({ branch, radius: radius(numstat(...lines), WORKSPACES) });
const gone = (branch: string) => ({ branch, radius: { error: notKnown(`the place has no branch ${branch} in /r`) } });

test("the lesson line: a branch that touched only a package's docs says so, and one that touched nothing agent-facing says nothing was written", () => {
  assert.equal(lessonLine([on('wf/a', '3\t1\tpackages/x/docs/features.md')]), 'lesson  packages/x/docs/features.md +3 −1');
  assert.equal(lessonLine([on('wf/a', '2\t0\tCLAUDE.md', '9\t9\tsrc/a.ts')]), 'lesson  CLAUDE.md +2 −0');
  assert.equal(
    lessonLine([on('wf/a', '9\t9\tsrc/a.ts', '1\t0\tREADME.md', '1\t0\tsrc/a.test.ts')]),
    'lesson  nothing written where the next agent reads',
    'README.md is agent-facing, but it is not where a lesson goes',
  );
  assert.equal(lessonLine([on('wf/a')]), 'lesson  nothing written where the next agent reads');
  assert.equal(
    lessonLine([on('wf/a', '40\t0\tapps/web/src/routes/docs/index.tsx', '3\t0\tsrc/docs/strings.ts', '2\t0\tpackages/x/src/docs/a.md')]),
    'lesson  nothing written where the next agent reads',
    "a docs page in an app, or a docs/ in a package's source, is not a lesson",
  );
  assert.equal(
    lessonLine([on('wf/a', '40\t0\tapps/web/src/routes/docs/index.tsx', '1\t0\tapps/web/docs/notes.md')]),
    'lesson  apps/web/docs/notes.md +1 −0',
  );
  assert.equal(
    lessonLine([on('wf/a'), gone('wf/gone')]),
    'lesson  not known — wf/gone could not be read',
    'a branch that could not be read is not a branch that wrote nothing',
  );
  assert.equal(
    lessonLine([on('wf/a', '1\t0\tAGENTS.md'), on('wf/b', '2\t0\tdocs/x.md')]),
    'lesson  AGENTS.md +1 −0 (wf/a) · docs/x.md +2 −0 (wf/b)',
  );
});

test('what each branch touched is said under the branch, and a branch that could not be read says why', () => {
  assert.deepEqual(touchedLines([on('wf/a', '1\t0\tsrc/a.ts', '2\t2\tpackages/x/test/a.ts'), gone('wf/gone')]), [
    'touched  wf/a',
    '  packages/x  1 file   +2 −2',
    '  src         1 file   +1 −0',
    '  check-affecting  packages/x/test/a.ts',
    'touched  wf/gone  —  what this run changed is not known: the place has no branch wf/gone in /r',
  ]);
});

test('the files in full: the heading says why, then the diff — or none, said — or why it was not read', () => {
  const t = on('wf/a', '3\t1\tsrc/index.ts');
  const [heading, ...body] = inFullLines(t, parseGlobs('nothing/**'), '');
  assert.match(heading, /^── in full: the files --sensitive names \(nothing\/\*\*\)/);
  assert.deepEqual(body, ['none']);
  assert.match(
    inFullLines(t, undefined, '')[0],
    /^── in full: the check-affecting files — what a change could edit to make its check pass ─+$/,
  );
  assert.deepEqual(inFullLines(t, undefined, 'diff --git a/x.test.ts b/x.test.ts\n-assert.equal(1, 1);\n+assert.ok(true);\n\n').slice(1), [
    'diff --git a/x.test.ts b/x.test.ts',
    '-assert.equal(1, 1);',
    '+assert.ok(true);',
  ]);
  const unread = { error: notKnown("the place's report was not heard: spawn git ENOENT") };
  assert.deepEqual(inFullLines(t, undefined, unread).slice(1), [
    "what this run changed is not known: the place's report was not heard: spawn git ENOENT",
  ]);
  assert.deepEqual(inFullLines(gone('wf/gone'), undefined, '').slice(1), [
    'what this run changed is not known: the place has no branch wf/gone in /r',
  ]);
  assert.match(inFullLines(t, undefined, '', true)[0], /, on wf\/a /);
});

test('a step with no usage says used not measured, and cost never prints a number no runner measured', () => {
  assert.deepEqual(usedLines(undefined), ['used  not measured', 'cost  not measured']);
  assert.deepEqual(usedLines({ responses: 29, toolCalls: 93, inputTokens: 6_350_000, outputTokens: 112_000 }), [
    'used  29 responses · 93 tool calls · 6.35M in · 112k out',
    'cost  not measured',
  ]);
  assert.deepEqual(
    usedLines({ responses: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0 }),
    ['used  0 responses · 0 tool calls · 0 in · 0 out', 'cost  not measured'],
    'a measured zero is a zero',
  );
  assert.deepEqual(
    usedLines({ toolCalls: 4, inputTokens: 20_400 }),
    ['used  responses not measured · 4 tool calls · 20.4k in · tokens out not measured', 'cost  not measured'],
    "an unmeasured count is not one: codex's stream has no responses",
  );
  for (const u of [undefined, {}, { responses: 1, toolCalls: 1, inputTokens: 1, outputTokens: 1 }]) {
    assert.doesNotMatch(usedLines(u)[1], /\d/, JSON.stringify(u));
  }
  assert.equal(
    usedLines({ costUsd: 0.00412 })[1],
    'cost  $0.00412',
    'only a runner told the cost has one, and only then is there a number to print',
  );
});

test('attempts sum only what every one of them measured', () => {
  assert.deepEqual(
    sumUsage([
      { responses: 3, inputTokens: 100, costUsd: 0.5 },
      { responses: 4, inputTokens: 50 },
    ]),
    { responses: 7, inputTokens: 150 },
  );
  assert.equal(
    sumUsage([{ responses: 3, toolCalls: 2, inputTokens: 100, outputTokens: 9 }, null]),
    undefined,
    'an attempt nobody measured leaves every count unmeasured',
  );
  assert.equal(sumUsage([]), undefined);
  assert.equal(sumUsage([{}]), undefined);
});

test('a count reads to three figures', () => {
  assert.deepEqual([0, 999, 1_000, 1_234, 20_400, 112_000, 999_499, 999_999, 6_350_000, 2_500_000_000].map(count), [
    '0',
    '999',
    '1k',
    '1.23k',
    '20.4k',
    '112k',
    '999k',
    '1M',
    '6.35M',
    '2.5B',
  ]);
});

test("REFUSED before, now read: `./packages/*` from the base's package.json groups by package and counts a package's docs as a lesson, as `packages/*` does", () => {
  const same = numstat(
    '3\t1\tpackages/x/src/a.ts',
    '2\t0\tpackages/x/docs/notes.md',
    '1\t0\tpackages/y/src/docs/b.md',
    '1\t0\tpackages/README.md',
  );
  const r = radius(same, ['./packages/*']);
  assert.deepEqual(
    r.groups.map((g) => [g.name, g.files]),
    [
      ['packages', 1],
      ['packages/x', 2],
      ['packages/y', 1],
    ],
  );
  assert.deepEqual(
    r.lessons.map((c) => c.path),
    ['packages/x/docs/notes.md'],
    "a package's own docs/, and no docs/ in its source",
  );
  assert.equal(lessonLine([{ branch: 'wf/a', radius: r }]), 'lesson  packages/x/docs/notes.md +2 −0');
  assert.equal(groupOf('packages/x/src/a.ts', ['./packages/*']), 'packages/x');
  for (const written of ['./packages/*', './packages/*/', './/packages/*', 'packages/*/'])
    assert.deepEqual(
      radius(same, [written]).groups,
      radius(same, ['packages/*']).groups,
      `${written}: taken as written, it matches no path git prints, every package in one packages group and nothing read as a lesson`,
    );
  assert.deepEqual(lessonGlobs(['./packages/*', './apps/*/']), [...LESSON, 'packages/*/docs/', 'apps/*/docs/']);
  assert.deepEqual(radius(same, ['./packages/*']).deepWorkspaces, [], 'no ** glob, so nothing to name');
  assert.ok(!radiusLines(r).some((l) => l.startsWith('workspaces')), 'and the screen names none');
});

test('a workspace glob with `**` is not refused but named on the screen — and each file counts once: in the outermost package on its way, and as a lesson only in its docs/', () => {
  const r = radius(
    numstat(
      '1\t0\tpackages/x/src/docs/a.md',
      '2\t0\tpackages/x/docs/notes.md',
      '1\t1\tpackages/x/y/z.ts',
      '4\t0\tpackages/docs/c.md',
      '5\t0\tsrc/index.ts',
    ),
    ['packages/**', 'apps/*'],
  );
  assert.deepEqual(r.groups, [
    { name: 'packages/docs', files: 1, added: 4, removed: 0, binary: 0 },
    { name: 'packages/x', files: 3, added: 4, removed: 1, binary: 0 },
    { name: 'src', files: 1, added: 5, removed: 0, binary: 0 },
  ]);
  assert.equal(
    r.groups.reduce((n, g) => n + g.files, 0),
    r.changes.length,
    'every file in one group',
  );
  assert.deepEqual(
    r.lessons.map((c) => c.path),
    ['packages/x/docs/notes.md'],
    "not packages/**/docs/, which takes the source's docs/ and a docs/ directly under packages/ as lessons too",
  );
  assert.ok(matches('packages/x/src/docs/a.md', ['packages/**/docs/']), 'the glob a ** workspace would have made');
  assert.equal(isLesson('packages/x/src/docs/a.md', ['packages/**']), false);
  assert.equal(isLesson('packages/x/docs/notes.md', ['./packages/**/']), true);
  assert.deepEqual(lessonGlobs(['packages/**', 'apps/*']), [...LESSON, 'apps/*/docs/']);
  assert.deepEqual(deepWorkspaces(['./packages/**', 'apps/*']), ['./packages/**'], 'named as written');
  assert.equal(
    radiusLines(r).at(-1),
    "workspaces       packages/** in the base's package.json crosses directories: a file counts once, in the outermost package on its way, and as a lesson only in that package's docs/",
  );
  assert.deepEqual(touchedLines([{ branch: 'wf/a', radius: r }]).filter((l) => l.includes('packages/**')).length, 1);
});

test('the screen reads the result branches, or — before a terminal step has one — every branch a step worked on, never the base branch of a run that cut worktrees', () => {
  assert.deepEqual(branchesToRead(['wf/r/review'], ['wf/r/implement', 'wf/r/review']), ['wf/r/review']);
  assert.deepEqual(branchesToRead([], ['wf/r/implement', undefined, 'wf/r/implement']), ['wf/r/implement']);
  assert.deepEqual(branchesToRead([], [undefined]), []);

  assert.deepEqual(
    branchesToRead([], ['main'], 'main'),
    [],
    "a workflow of one step that works in the checkout, where the run commits nothing: nothing of the run is on a branch, and what the base branch holds against the run's frozen base is every other run's merge since — dropped for a run with worktrees, and only there",
  );
  assert.deepEqual(branchesToRead([], ['wf/r/implement', 'main'], 'main'), ['wf/r/implement'], 'the work is read, the base is not');
  assert.deepEqual(
    branchesToRead([], ['main']),
    ['main'],
    'a run that worked on its base branch itself (--no-worktree): that branch is its work',
  );
  assert.deepEqual(branchesToRead(['main'], ['main'], 'main'), ['main'], 'a result branch is read whatever it is called');
});

test('what a session used, with the api and tool time its harness counted — beside the counts once either is measured — and its cost to the cent, three figures under one', () => {
  assert.deepEqual(
    usedLines({
      responses: 29,
      toolCalls: 93,
      inputTokens: 6_350_000,
      outputTokens: 112_000,
      costUsd: 3.012,
      apiMs: 486_000,
      toolMs: 2_400,
    }),
    ['used  29 responses · 93 tool calls · 6.35M in · 112k out · api 8m06s · tools 2s', 'cost  $3.01'],
  );
  assert.deepEqual(
    usedLines({ costUsd: 4.2, apiMs: 61_000 }),
    [
      'used  responses not measured · tool calls not measured · tokens in not measured · tokens out not measured · api 1m01s · tools not measured',
      'cost  $4.20',
    ],
    'a harness that counts api time and cost, and nothing else',
  );
  assert.equal(
    usedLines({ responses: 3, toolMs: 400 })[0],
    'used  3 responses · tool calls not measured · tokens in not measured · tokens out not measured · api not measured · tools <1s',
    'a measured moment is not 0s',
  );
  assert.equal(
    usedLines({ responses: 3 })[0],
    'used  3 responses · tool calls not measured · tokens in not measured · tokens out not measured',
    'nothing timed it: said as before',
  );
  assert.deepEqual(
    [dollars(3.012), dollars(4.2), dollars(0.004), dollars(0.00412), dollars(0)],
    ['$3.01', '$4.20', '$0.004', '$0.00412', '$0.00'],
  );
  assert.deepEqual([budgetWord(3), budgetWord(2.5), budgetWord(0.25)], ['$3', '$2.50', '$0.25']);
  assert.deepEqual(
    sumUsage([
      { apiMs: 1_000, toolMs: 5, costUsd: 1 },
      { apiMs: 2_000, costUsd: 0.5 },
    ]),
    { apiMs: 3_000, costUsd: 1.5 },
    'summed as every count is: only where every attempt measured it',
  );
});

test('what a session read, by price: its classes add up, its peak is the largest, and nothing is said where nobody counted', () => {
  const a = { cacheReadTokens: 20_000_000, cacheWriteTokens: 300_000, uncachedTokens: 12, peakContextTokens: 150_000 };
  const b = { cacheReadTokens: 1_400_000, cacheWriteTokens: 100_000, uncachedTokens: 3, peakContextTokens: 167_000 };
  assert.deepEqual(
    sumUsage([a, b]),
    { cacheReadTokens: 21_400_000, cacheWriteTokens: 400_000, uncachedTokens: 15, peakContextTokens: 167_000 },
    'a peak is not a sum',
  );
  assert.equal('peakContextTokens' in sumUsage([a, { cacheReadTokens: 1 }])!, false, 'an attempt with no peak may have been the largest');
  assert.equal(
    'firstContextTokens' in sumUsage([{ ...a, firstContextTokens: 9, firstCacheWriteTokens: 1 }])!,
    false,
    "one attempt's first response is not a sum's",
  );
  assert.equal(sumUsage([{ ...a, rebuiltCaches: 1 }, b, { ...b, rebuiltCaches: 1 }])!.rebuiltCaches, 2);

  assert.equal(readWords(sumUsage([a, b])), 'read 21.4M · wrote 400k · peak 167k');
  assert.equal(
    readWords({ responses: 3, inputTokens: 1_000, outputTokens: 20, costUsd: 1 }),
    '',
    'a journal from before the classes: nothing, not 0',
  );
  assert.equal(readWords(undefined), '');
  assert.equal(
    readWords({ cacheReadTokens: 900, cacheWriteTokens: 0, uncachedTokens: 5 }),
    'read 900 · wrote 0',
    'a harness that counts classes and no peak',
  );
  assert.deepEqual(usedLines({ costUsd: 4.87, ...a }), [
    'used  responses not measured · tool calls not measured · tokens in not measured · tokens out not measured',
    'cost  $4.87 · read 20M · wrote 300k · peak 150k',
  ]);
});

test("a peak is marked where it reached a step's context: cap, or passed 200k with none — and only there", () => {
  assert.equal(peakMark({ peakContextTokens: 200_000 }, 200_000), 'cap');
  assert.equal(peakMark({ peakContextTokens: 167_000 }, 200_000), null, 'the cap held: it never compacted');
  assert.equal(
    peakMark({ peakContextTokens: 173_584, compactions: 2 }, 200_000),
    'cap',
    "it compacted: it reached its cap, short of it in tokens — under --autocompact 200000 a session compacts near 173.5k, the boundary's context its peak",
  );
  assert.equal(peakMark({ compactions: 1 }, 200_000), 'cap', 'compacted, with no peak measured');
  assert.equal(
    peakMark({ peakContextTokens: 173_584, compactions: 2 }, undefined),
    null,
    "compacted on the harness's own window, not past 200k",
  );
  assert.equal(readWords({ peakContextTokens: 173_584, compactions: 2 }, 200_000), 'peak 174k, compacted twice at its 200k cap');
  assert.equal(readWords({ peakContextTokens: 204_000, compactions: 1 }, 200_000), 'peak 204k, compacted at its 200k cap');
  assert.equal(readWords({ peakContextTokens: 831_000, compactions: 3 }), 'peak 831k, compacted 3 times, past 200k with no cap');
  assert.equal(readWords({ peakContextTokens: 150_000, compactions: 1 }), 'peak 150k, compacted');
  assert.equal(readWords({ compactions: 1 }, 100_000), 'compacted at its 100k cap');
  assert.equal(sumUsage([{ compactions: 2 }, {}, { compactions: 1 }])!.compactions, 3, 'none seen is none: added where there were some');
  assert.equal('compactions' in sumUsage([{ responses: 1 }, { responses: 2 }])!, false);
  assert.equal(peakMark({ peakContextTokens: 440_000 }, 500_000), null, 'under a larger cap, past 200k is what was asked for');
  assert.equal(peakMark({ peakContextTokens: 200_001 }, undefined), 'large');
  assert.equal(peakMark({ peakContextTokens: 200_000 }, undefined), null);
  assert.equal(peakMark({ cacheReadTokens: 900_000 }, undefined), null, 'no peak measured, nothing marked');
  assert.equal(readWords({ peakContextTokens: 204_000 }, 200_000), 'peak 204k, at its 200k cap');
  assert.equal(readWords({ peakContextTokens: 831_000 }), 'peak 831k, past 200k with no cap');
});

test('a resumed attempt whose first response wrote its context to the cache again rebuilt its cache, and says so in words', () => {
  const rebuilt = {
    cacheReadTokens: 183_000,
    cacheWriteTokens: 184_500,
    peakContextTokens: 184_501,
    firstContextTokens: 183_006,
    firstCacheWriteTokens: 183_000,
  };
  assert.equal(rebuiltCache(rebuilt, true), true);
  assert.equal(rebuiltCache(rebuilt, false), false, 'a cold start writes its cache once: that is not a rebuild');
  assert.equal(rebuiltCache({ ...rebuilt, firstCacheWriteTokens: 91_503 }, true), false, 'half its first context is not more than half');
  assert.equal(rebuiltCache({ cacheWriteTokens: 184_500, peakContextTokens: 184_501 }, true), false, 'no first response seen, no reading');
  const grew = {
    cacheReadTokens: 4_200_000,
    cacheWriteTokens: 96_000,
    peakContextTokens: 150_000,
    firstContextTokens: 61_000,
    firstCacheWriteTokens: 1_200,
  };
  assert.equal(
    rebuiltCache(grew, true),
    false,
    "a warm continuation of a 60k session that works up to 150k read its parent's context, and its writes are its growth: they pass half its peak, and it rebuilt nothing",
  );
  assert.equal(
    readWords({ ...rebuilt, rebuiltCaches: 1 }),
    'read 183k · wrote 185k · peak 185k · a resumed session wrote its context to the cache again instead of reading it',
  );
  assert.match(
    readWords({ ...rebuilt, rebuiltCaches: 2 }),
    / · 2 resumed sessions wrote their context to the cache again instead of reading it$/,
  );
});
