/**
 * The git place the package ships (`place/git/`), each verb asked of `gitPlace` against scratch repositories: its answer, a refusal and
 * an unread outcome, and a verb held past its deadline by a hook or a filter, which leaves neither running nor a lock behind. What it
 * declares denies a landing session the two commands that commit a staged merge. Git runs with no user or system configuration and a
 * fixed identity, so a machine's hooks, default branch or signing change nothing here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gitPlace } from '../place/git/place.ts';
import type { PlaceOutcome, PlaceVerb } from '../src/runner.ts';
import { SKILL_SECTIONS, unknownHoles } from '../src/place/place.ts';
import { STOP_GRACE_MS } from '../src/place/place.store.ts';
import { running } from './running.ts';
import { steppingClock } from './clock.ts';
import { scratch } from './scratch.ts';

/** The git place the package ships. */
const GIT_SKILL = path.join(import.meta.dirname, '..', 'place', 'git');

/** The environment git runs in: this process's, without its git variables, with no configuration read and one identity. */
const ENV: NodeJS.ProcessEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@local',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@local',
};

/** Git in `dir`, its stdout trimmed. */
const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Git in `dir` whose failure is expected, as a merge that conflicts: whether it exited 0. */
const gitOk = (dir: string, ...args: string[]): boolean => spawnSync('git', args, { cwd: dir, env: ENV, stdio: 'ignore' }).status === 0;

/** A new repository on `main` with one commit of `f` and `g`. */
function repository(): string {
  const dir = scratch('wf-git-skill-');
  git(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'f'), 'base\n');
  fs.writeFileSync(path.join(dir, 'g'), 'base\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return dir;
}

/** A branch `name` off main with `file` set to `text` in one commit, main checked out again; its tip. */
function branched(dir: string, name: string, file: string, text: string): string {
  git(dir, 'switch', '-q', '-c', name);
  fs.writeFileSync(path.join(dir, file), text);
  git(dir, 'commit', '-q', '-am', `${name} sets ${file}`);
  const tip = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'switch', '-q', 'main');
  return tip;
}

/** A repository with `wf/x/a` staged as a merge into main that conflicts on `f`; the branch's tip. */
function conflicted(dir: string): string {
  const tip = branched(dir, 'wf/x/a', 'f', 'theirs\n');
  fs.writeFileSync(path.join(dir, 'f'), 'ours\n');
  git(dir, 'commit', '-q', '-am', 'main sets f');
  assert.equal(gitOk(dir, 'merge', '--no-ff', '--no-commit', 'wf/x/a'), false, 'the merge conflicts');
  return tip;
}

/** A repository with `wf/x/a` staged as a clean merge into main, not committed; the branch's tip. */
function staged(dir: string): string {
  const tip = branched(dir, 'wf/x/a', 'g', 'theirs\n');
  git(dir, 'merge', '-q', '--no-ff', '--no-commit', 'wf/x/a');
  return tip;
}

/** Whether a merge is in progress in `dir`. */
const merging = (dir: string): boolean => gitOk(dir, 'rev-parse', '--verify', '--quiet', 'MERGE_HEAD');

/** `verb` of the git place, in `ENV`, its request as given: one the contract's type refuses is how a malformed request is sent. */
const run = <V extends PlaceVerb>(verb: V, request: object): PlaceOutcome<V> => gitPlace({ env: ENV }).askNow(verb, request as never);

/** The answer of an outcome, or a failure naming what it was instead. */
function answerOf<V extends PlaceVerb>(outcome: PlaceOutcome<V>): Extract<PlaceOutcome<V>, { answer: unknown }>['answer'] {
  assert.ok('answer' in outcome, `an answer expected, got ${JSON.stringify(outcome)}`);
  return outcome.answer;
}

/** The file `open` names for a merge staged in the checkout `root`, or a failure where it names none. */
function stagedOf(root: string): string {
  const { inProgressFile } = answerOf(run('open', { root, isolate: true }));
  assert.ok(inProgressFile !== undefined, `open named no file of a merge in progress for ${root}`);
  return inProgressFile;
}

/** The words of a refusal, or a failure naming what it was instead. */
function refusalOf(outcome: PlaceOutcome<PlaceVerb>): string {
  assert.ok('refused' in outcome, `a refusal expected, got ${JSON.stringify(outcome)}`);
  return outcome.refused;
}

/** The words of an unread outcome, or a failure naming what it was instead. */
function unreadOf(outcome: PlaceOutcome<PlaceVerb>): string {
  assert.ok('unread' in outcome, `unread expected, got ${JSON.stringify(outcome)}`);
  return outcome.unread.said;
}

test('the place declares what a landing is denied, the commands that commit its merge, and its skill folder holds no script', () => {
  assert.deepEqual(gitPlace().declared.denyWhileLanding, ['Bash(git commit:*)', 'Bash(git merge --continue:*)']);
  for (const gone of ['scripts', 'place.json']) assert.equal(fs.existsSync(path.join(GIT_SKILL, gone)), false, gone);
  assert.ok(fs.existsSync(path.join(GIT_SKILL, 'SKILL.md')), 'and it is still a skill');
});

/**
 * The sections of the skill a read-only step cannot act on, each of which opens by saying whose it is and naming the section such a step
 * works from instead: committing, merging the base and landing all write the repository.
 */
const WRITE_SECTIONS = ['Commit as you go', SKILL_SECTIONS.merge, 'Stage a landing'];

/** The read forms *Read what changed* names, each one a read-only step of any factory may type. */
const READ_FORMS = [
  'git diff',
  'git status',
  'git log',
  'git show',
  'git blame',
  'git grep',
  'git ls-files',
  'git merge-base --is-ancestor',
  'git worktree list',
];

/** The text of the section `name` of `skill`, up to the next heading of the same level. */
function sectionOf(skill: string, name: string): string {
  const start = skill.indexOf(`## ${name}\n`);
  assert.ok(start >= 0, `SKILL.md holds a section ${name}`);
  const rest = skill.slice(start);
  const end = rest.indexOf('\n## ', 1);
  return end < 0 ? rest : rest.slice(0, end);
}

/** The first line of the section `name` of `skill` after its heading. */
const openerOf = (skill: string, name: string): string => sectionOf(skill, name).split('\n').slice(1).find(Boolean) ?? '';

test("SKILL.md holds the sections a brief told no command sends a step to, every template names only holes the code fills, and the skill forbids nothing a team's fence holds", () => {
  const skill = fs.readFileSync(path.join(GIT_SKILL, 'SKILL.md'), 'utf8');
  for (const section of Object.values(SKILL_SECTIONS)) assert.match(skill, new RegExp(`^## ${section}$`, 'm'), section);
  assert.doesNotMatch(skill, /never push/i);
  assert.deepEqual(unknownHoles(gitPlace().declared.say), []);
});

test('each section of the skill that writes the repository opens by saying whose it is, and forbids the reader nothing', () => {
  const skill = fs.readFileSync(path.join(GIT_SKILL, 'SKILL.md'), 'utf8');
  for (const name of WRITE_SECTIONS) {
    const opener = openerOf(skill, name);
    assert.match(opener, /read-only step/, `${name} opens by saying whose section it is`);
    assert.ok(
      opener.includes(`*${SKILL_SECTIONS.read}*`),
      `${name} names the section a read-only step works from, never a direction: ${opener}`,
    );
    assert.doesNotMatch(opener, /\bnever\b/i, `${name} opens saying whose work it is, not what the reader may not do`);
  }
});

test('Read what changed names each read form a read-only step types, so the one section every such step is sent to is enough', () => {
  const section = sectionOf(fs.readFileSync(path.join(GIT_SKILL, 'SKILL.md'), 'utf8'), SKILL_SECTIONS.read);
  for (const form of READ_FORMS) assert.ok(section.includes(`\`${form}`), `${SKILL_SECTIONS.read} names ${form}: ${section}`);
});

test('REFUSED: an opener that points a direction rather than naming the section, one that is a prohibition, and a read form taken out', () => {
  const skill = fs.readFileSync(path.join(GIT_SKILL, 'SKILL.md'), 'utf8');
  const directed = skill.replaceAll(
    `a read-only step works from *${SKILL_SECTIONS.read}* instead.`,
    'a read-only step reads the sections below instead.',
  );
  assert.notEqual(directed, skill, 'each write section names the section a read-only step works from');
  for (const name of WRITE_SECTIONS)
    assert.ok(!openerOf(directed, name).includes(`*${SKILL_SECTIONS.read}*`), `${name}: a direction in place of the name`);
  const forbidding = skill.replace(/^## Stage a landing\n\n[^\n]+/m, '## Stage a landing\n\nA read-only step never commits here.');
  assert.notEqual(forbidding, skill, 'Stage a landing opens with one line');
  assert.match(openerOf(forbidding, 'Stage a landing'), /\bnever\b/i);
  const cut = skill.replace('`git blame', '`git praise');
  assert.notEqual(cut, skill, 'Read what changed names git blame');
  assert.ok(!sectionOf(cut, SKILL_SECTIONS.read).includes('`git blame'));
});

test("open names a linked worktree's own staged-merge file, under the git directory its .git file names, and no other's", () => {
  const dir = repository();
  branched(dir, 'wf/x/a', 'g', 'theirs\n');
  const tree = path.join(scratch('wf-git-skill-tree-'), 'w');
  git(dir, 'worktree', 'add', '-q', '-b', 'ship', tree, 'main');
  const staged = stagedOf(tree);
  assert.ok(!staged.startsWith(tree), `the file is not under the worktree's folder: ${staged}`);
  assert.notEqual(staged, stagedOf(dir));
  assert.equal(stagedOf(dir), path.join(dir, '.git', 'MERGE_HEAD'), "the checkout's own is its MERGE_HEAD");
  assert.equal(fs.existsSync(staged), false);
  git(tree, 'merge', '-q', '--no-ff', '--no-commit', 'wf/x/a');
  assert.equal(fs.existsSync(staged), true, 'there exactly while a merge is staged in that worktree');
  git(tree, 'merge', '--abort');
  assert.equal(fs.existsSync(staged), false);
});

test("the place's stage words, run as said with the checkout and the branches filled, stage a merge its status reads as ours", () => {
  const dir = repository();
  const a = branched(dir, 'wf/x/a', 'f', 'a\n');
  const b = branched(dir, 'wf/x/b', 'g', 'b\n');
  const said = gitPlace().declared.say.stage.replaceAll('{repo}', dir).replaceAll('{branches}', 'wf/x/a wf/x/b');
  const ran = spawnSync('sh', ['-c', said], { env: ENV, encoding: 'utf8' });
  assert.equal(ran.status, 0, ran.stderr);
  assert.deepEqual(answerOf(run('status', { repo: dir, tips: { 'wf/x/a': a, 'wf/x/b': b } })), {
    merging: 'ours',
    conflicted: false,
    missing: [],
    tip: git(dir, 'rev-parse', 'HEAD'),
  });
  assert.equal(fs.existsSync(stagedOf(dir)), true, "and open's file says it");
});

test('REFUSED: open on no directory, on a directory that is no repository, and on a repository with no commit', () => {
  const plain = scratch('wf-git-skill-plain-');
  const nowhere = refusalOf(run('open', { root: path.join(plain, 'nowhere'), isolate: true }));
  assert.ok(nowhere.startsWith(`${path.join(plain, 'nowhere')} is not a directory`), nowhere);
  assert.ok(nowhere.endsWith('name a git repository with --repo'), nowhere);
  assert.equal(
    refusalOf(run('open', { root: plain, isolate: true })),
    `${plain} is not a git repository: run git init there and commit once, or name a repository with --repo`,
  );
  const empty = scratch('wf-git-skill-empty-');
  git(empty, 'init', '-q', '-b', 'main');
  assert.equal(
    refusalOf(run('open', { root: empty, isolate: true })),
    `${empty} has no commit yet, so a run has nothing to start from: commit once there, then start again`,
  );
});

/** `.worktreeinclude` as a repository holds it, `null` for a folder of that name, and whether the run cuts worktrees; what open says. */
const INCLUDES: readonly { name: string; text: string | null; isolate: boolean; refused: readonly RegExp[] }[] = [
  { name: 'a line outside the repository is refused by name', text: '/.env.local\n../x\n', isolate: true, refused: [/"\.\.\/x"/] },
  { name: "a path under git's own folder is refused by name", text: '.git/config\n', isolate: true, refused: [/"\.git\/config"/] },
  { name: "git's own folder itself is refused by name", text: '.git\n', isolate: true, refused: [/"\.git"/] },
  {
    name: 'every refused line is named, in one refusal',
    text: '/.env.local\n../x\n.git/config\n',
    isolate: true,
    refused: [/"\.\.\/x"/, /"\.git\/config"/],
  },
  { name: 'a .worktreeinclude that is no file is refused', text: null, isolate: true, refused: [/\.worktreeinclude is not a file/] },
  { name: 'a run that cuts no worktree reads no file, and opens', text: '../x\n.git/config\n', isolate: false, refused: [] },
  {
    name: 'a file with a comment, an anchored path and node_modules has nothing to refuse, and opens',
    text: '# for claude --worktree\n/.env.local\nnode_modules\n',
    isolate: true,
    refused: [],
  },
];

test('REFUSED: open, for a run that cuts worktrees, refuses a .worktreeinclude line make would refuse as written, each by name, and one that is no file', async (t) => {
  for (const { name, text, isolate, refused } of INCLUDES)
    await t.test(name, () => {
      const dir = repository();
      const file = path.join(dir, '.worktreeinclude');
      if (text === null) fs.mkdirSync(file);
      else fs.writeFileSync(file, text);
      const outcome = run('open', { root: dir, isolate });
      if (!refused.length) return assert.equal(answerOf(outcome).repo, dir);
      const words = refusalOf(outcome);
      assert.ok(words.startsWith(file), words);
      for (const line of refused) assert.match(words, line);
    });
});

/** A request each verb cannot read, and the field its unread outcome names. */
const UNREAD: readonly { name: string; verb: PlaceVerb; request: object; field: string }[] = [
  { name: 'open with no root', verb: 'open', request: { isolate: true }, field: 'root' },
  { name: 'open with no isolate', verb: 'open', request: { root: '/' }, field: 'isolate' },
  { name: 'open whose isolate is no boolean', verb: 'open', request: { root: '/', isolate: 'yes' }, field: 'isolate' },
  {
    name: 'make whose also is missing',
    verb: 'make',
    request: { repo: '/', at: '/a', run: 'r-1', leaf: 'a', from: 'main' },
    field: 'also',
  },
  { name: 'handoff with no step', verb: 'handoff', request: { workspace: '/', why: '' }, field: 'step' },
  {
    name: 'report whose diffOf is no list',
    verb: 'report',
    request: { repo: '/', baseRef: 'main', onto: 'main', branches: [], diffOf: 'src/a.ts', present: [], atBase: [] },
    field: 'diffOf',
  },
  {
    name: 'standing whose branches is no list',
    verb: 'standing',
    request: { repo: '/', base: 'main', branches: 'wf/r/a' },
    field: 'branches',
  },
  { name: 'status whose tips are no object of strings', verb: 'status', request: { repo: '/', tips: ['wf/x/a'] }, field: 'tips' },
  { name: 'land with an act it does not know', verb: 'land', request: { repo: '/', act: 'push' }, field: 'act' },
  { name: 'land, a commit with no message', verb: 'land', request: { repo: '/', act: 'commit' }, field: 'message' },
  { name: 'trial with no repo', verb: 'trial', request: { trials: [] }, field: 'repo' },
  { name: 'trial whose pairs lack a branch', verb: 'trial', request: { repo: '/', trials: [{ onto: 'main' }] }, field: 'trials' },
  { name: 'inventory with no run', verb: 'inventory', request: { repo: '/', under: '/', base: 'main' }, field: 'run' },
  {
    name: 'remove whose workspaces is no list',
    verb: 'remove',
    request: { repo: '/', workspaces: '/w', branches: [] },
    field: 'workspaces',
  },
  { name: 'export with no tag', verb: 'export', request: { repo: '/', into: '/v1' }, field: 'tag' },
];

test('a request a verb cannot read is unread, never acted on, naming the field it could not read', async (t) => {
  for (const { name, verb, request, field } of UNREAD)
    await t.test(name, () => {
      const outcome = run(verb, request);
      assert.ok('unread' in outcome, `unread expected, got ${JSON.stringify(outcome)}`);
      assert.equal(outcome.unread.verb, verb);
      assert.ok(outcome.unread.said.includes(`\`${field}\``), outcome.unread.said);
    });
});

test('handoff of a clean tree commits nothing and answers a null commit', () => {
  const dir = repository();
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.deepEqual(answerOf(run('handoff', { workspace: dir, step: 'build', why: '' })), { commit: null });
  assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
});

test('REFUSED: handoff when a hook refuses the commit, in the hook words, and in a workspace that is not there', () => {
  const dir = repository();
  const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\necho "a secret is staged in f" >&2\nexit 1\n');
  fs.chmodSync(hook, 0o755);
  fs.writeFileSync(path.join(dir, 'f'), 'changed\n');
  assert.equal(refusalOf(run('handoff', { workspace: dir, step: 'build', why: '' })), 'a secret is staged in f');
  const gone = path.join(dir, 'gone');
  assert.equal(
    refusalOf(run('handoff', { workspace: gone, step: 'build', why: '' })),
    `${gone} is not a directory, so nothing of build is there to hand off`,
  );
});

test('status of a merge that conflicts: conflicted, read off the index even while a lock is held on it', () => {
  const dir = repository();
  const tip = conflicted(dir);
  const head = git(dir, 'rev-parse', 'HEAD');
  const want = { merging: 'ours', conflicted: true, missing: [], tip: head };
  assert.deepEqual(answerOf(run('status', { repo: dir, tips: { 'wf/x/a': tip } })), want);
  const lock = path.join(dir, '.git', 'index.lock');
  fs.writeFileSync(lock, '');
  assert.deepEqual(answerOf(run('status', { repo: dir, tips: { 'wf/x/a': tip } })), want);
  assert.ok(fs.existsSync(lock), 'the lock is still the one planted');
});

test('status writes nothing to the index of a checkout a person works in, where a diff would refresh it', () => {
  const dir = repository();
  const tip = conflicted(dir);
  const later = new Date(Date.now() + 60_000);
  fs.utimesSync(path.join(dir, 'g'), later, later);
  const index = path.join(dir, '.git', 'index');
  const before = fs.readFileSync(index);
  assert.equal(answerOf(run('status', { repo: dir, tips: { 'wf/x/a': tip } })).conflicted, true);
  assert.deepEqual(fs.readFileSync(index), before);
  git(dir, 'diff', '--quiet', 'HEAD', '--', 'g');
  assert.notDeepEqual(fs.readFileSync(index), before, 'a diff does refresh it, so the comparison above can fail');
});

test('status reads a worktree, whose MERGE_HEAD is not under its own folder', () => {
  const dir = repository();
  const tip = branched(dir, 'wf/x/a', 'g', 'theirs\n');
  const tree = path.join(scratch('wf-git-skill-tree-'), 'w');
  git(dir, 'worktree', 'add', '-q', '-b', 'ship', tree, 'main');
  git(tree, 'merge', '-q', '--no-ff', '--no-commit', 'wf/x/a');
  assert.equal(answerOf(run('status', { repo: tree, tips: { 'wf/x/a': tip } })).merging, 'ours');
  assert.equal(answerOf(run('status', { repo: dir, tips: { 'wf/x/a': tip } })).merging, 'none');
});

test('REFUSED: status of a checkout that is no repository', () => {
  const plain = scratch('wf-git-skill-plain-');
  assert.equal(refusalOf(run('status', { repo: plain, tips: {} })), `${plain} is not a git repository, so no merge can be staged there`);
});

/**
 * The grace the deadline tests below give a stopped group (`AskOptions.graceMs`), shorter than the shipped `STOP_GRACE_MS` and above
 * what the cleaning shell takes on SIGTERM; and their first deadline, which a try that missed git reaching its hook or filter doubles.
 */
const GRACE_MS = 400;
const FIRST_DEADLINE_MS = 300;
const HELD_TRIES = 6;

/**
 * Asks `ask` of a place made by `make` at a deadline doubling from `FIRST_DEADLINE_MS` until git was where `marker` says at it: the
 * outcome, the deadline it was asked at, and what `make` made. A try that missed is no failure, `HELD_TRIES` of them is.
 */
function heldAsked<M extends { readonly marker: string }>(
  make: () => M,
  ask: (made: M, deadlineMs: number) => PlaceOutcome<PlaceVerb>,
): { outcome: PlaceOutcome<PlaceVerb>; deadlineMs: number; made: M } {
  for (let tries = 1, deadlineMs = FIRST_DEADLINE_MS; ; tries++, deadlineMs *= 2) {
    const made = make();
    const outcome = ask(made, deadlineMs);
    if (fs.existsSync(made.marker)) return { outcome, deadlineMs, made };
    assert.ok(tries < HELD_TRIES, `git reached what holds it before the deadline, on one of ${HELD_TRIES} tries: ${unreadOf(outcome)}`);
  }
}

/** The deadline's words, the first of them. */
const stoppedAt = (deadlineMs: number) => `it gave no answer within ${deadlineMs / 1000} s, its deadline, and was stopped`;

test('a land held past its deadline by a hook leaves the hook running nowhere, the merge staged, and the abort answers', (t) => {
  const hooks: string[] = [];
  t.after(() => {
    for (const hook of hooks) for (const pid of running(hook)) process.kill(pid, 'SIGKILL');
  });
  const { outcome, deadlineMs, made } = heldAsked(
    () => {
      const dir = repository();
      staged(dir);
      const held = scratch('wf-git-held-');
      const marker = path.join(held, 'in-the-hook');
      const hook = path.join(held, 'hook.sh');
      hooks.push(hook);
      fs.writeFileSync(hook, `touch '${marker}'\nsleep 60\n`);
      fs.writeFileSync(path.join(dir, '.git', 'hooks', 'pre-commit'), `#!/bin/sh\nexec /bin/sh '${hook}'\n`, { mode: 0o755 });
      return { dir, marker, hook };
    },
    ({ dir }, deadlineMs) =>
      gitPlace({ env: ENV }).askNow('land', { repo: dir, act: 'commit', message: 'm' }, { deadlineMs, graceMs: GRACE_MS }),
  );
  assert.ok(unreadOf(outcome).startsWith(stoppedAt(deadlineMs)), unreadOf(outcome));
  assert.deepEqual(running(made.hook), [], 'the hook runs no more');
  assert.equal(merging(made.dir), true, 'the merge is still staged');
  assert.deepEqual(answerOf(run('land', { repo: made.dir, act: 'abort' })), { aborted: true });
});

test('a handoff held past its deadline by a clean filter leaves no index.lock, and the next verb answers', (t) => {
  const filters: string[] = [];
  t.after(() => {
    for (const filter of filters) for (const pid of running(filter)) process.kill(pid, 'SIGKILL');
  });
  const { outcome, deadlineMs, made } = heldAsked(
    () => {
      const dir = repository();
      const held = scratch('wf-git-held-');
      const marker = path.join(held, 'in-the-filter');
      const filter = path.join(held, 'filter.sh');
      filters.push(filter);
      fs.writeFileSync(filter, `touch '${marker}'\nsleep 60\n`);
      git(dir, 'config', 'filter.held.clean', `/bin/sh '${filter}'`);
      fs.writeFileSync(path.join(dir, '.gitattributes'), 'f filter=held\n');
      fs.writeFileSync(path.join(dir, 'f'), 'left by the step\n');
      return { dir, marker, filter };
    },
    ({ dir }, deadlineMs) =>
      gitPlace({ env: ENV }).askNow('handoff', { workspace: dir, step: 'build', why: '' }, { deadlineMs, graceMs: GRACE_MS }),
  );
  const { dir, filter } = made;
  assert.ok(unreadOf(outcome).startsWith(stoppedAt(deadlineMs)), unreadOf(outcome));
  assert.equal(fs.existsSync(path.join(dir, '.git', 'index.lock')), false, 'the lock is gone');
  assert.deepEqual(running(filter), [], 'the filter runs no more');
  git(dir, 'config', '--unset', 'filter.held.clean');
  assert.deepEqual(answerOf(run('status', { repo: dir, tips: {} })), {
    merging: 'none',
    conflicted: false,
    missing: [],
    tip: git(dir, 'rev-parse', 'HEAD'),
  });
});

/**
 * A repository whose `handoff` is held: a clean filter runs `/bin/sh` on a script of its own in git's process group — `trap` set as `on`
 * says, then a marker touched and a long sleep waited on — past any deadline. The repository, the shell's script and the marker.
 */
function heldPlace(on: string): { dir: string; shell: string; marker: string } {
  const dir = repository();
  const held = scratch('wf-place-held-');
  const marker = path.join(held, 'in-the-shell');
  const shell = path.join(held, 'held.sh');
  fs.writeFileSync(shell, `${on}\ntouch '${marker}'\nsleep 60 &\nwait\n`);
  git(dir, 'config', 'filter.held.clean', `/bin/sh '${shell}'`);
  fs.writeFileSync(path.join(dir, '.gitattributes'), 'f filter=held\n');
  fs.writeFileSync(path.join(dir, 'f'), 'left by the step\n');
  return { dir, shell, marker };
}

/** A held handoff of `heldPlace(on)`, its shells killed once the test `t` ends. */
const heldHandoff = (t: { after: (fn: () => void) => void }, on: string) => {
  const shells: string[] = [];
  t.after(() => {
    for (const shell of shells) for (const pid of running(shell)) process.kill(pid, 'SIGKILL');
  });
  return heldAsked(
    () => {
      const made = heldPlace(on);
      shells.push(made.shell);
      return made;
    },
    ({ dir }, deadlineMs) =>
      gitPlace({ env: ENV }).askNow('handoff', { workspace: dir, step: 'build', why: '' }, { deadlineMs, graceMs: GRACE_MS }),
  );
};

test('a group still cleaning up on SIGTERM is given its grace on a stepped wall clock', (t) => {
  steppingClock(t, 60_000);
  const { outcome, deadlineMs, made } = heldHandoff(t, `trap 'sleep 0.1; exit 0' TERM`);
  assert.equal(unreadOf(outcome), stoppedAt(deadlineMs));
  assert.deepEqual(running(made.shell), [], 'the shell ended on SIGTERM');
});

test('REFUSED: a group that ignores SIGTERM is killed once its grace is over, on a stepped wall clock', (t) => {
  steppingClock(t, 60_000);
  assert.ok(GRACE_MS < STOP_GRACE_MS, 'the tests give a shorter grace than shipped, never a longer one');
  const { outcome, deadlineMs, made } = heldHandoff(t, `trap '' TERM`);
  assert.equal(
    unreadOf(outcome),
    `${stoppedAt(deadlineMs)}, and a process it started outlived SIGTERM for ${GRACE_MS / 1000} s and was killed, ` +
      'so a lock it held may be left',
  );
  assert.deepEqual(running(made.shell), [], 'the shell is killed');
});

test('land aborts a merge that conflicts, and leaves the checkout at ours', () => {
  const dir = repository();
  conflicted(dir);
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.deepEqual(answerOf(run('land', { repo: dir, act: 'abort' })), { aborted: true });
  assert.equal(merging(dir), false);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
  assert.equal(fs.readFileSync(path.join(dir, 'f'), 'utf8'), 'ours\n');
  assert.equal(git(dir, 'status', '--porcelain'), '');
});

test('REFUSED: land with no merge in progress, either act, and a commit git will not make, in its words', () => {
  const dir = repository();
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.equal(
    refusalOf(run('land', { repo: dir, act: 'commit', message: 'm' })),
    `no merge is in progress in ${dir}, so there is none to commit`,
  );
  assert.equal(refusalOf(run('land', { repo: dir, act: 'abort' })), `no merge is in progress in ${dir}, so there is none to abort`);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
  conflicted(dir);
  assert.match(refusalOf(run('land', { repo: dir, act: 'commit', message: 'm' })), /unmerged/);
  assert.equal(merging(dir), true, 'the merge is left for the abort');
});

/** Every ref of `dir` with its commit, HEAD and what the checkout and index hold: what a trial merge must leave as it was. */
const untouched = (dir: string): string =>
  [git(dir, 'for-each-ref', '--format=%(refname) %(objectname)'), git(dir, 'rev-parse', 'HEAD'), git(dir, 'status', '--porcelain')].join(
    '\n',
  );

test('trial answers each pair in the order asked, clean, conflicted or not known, the bases now, and touches nothing', () => {
  const dir = repository();
  branched(dir, 'wf/x/a', 'f', 'a\n');
  branched(dir, 'wf/y/b', 'f', 'b\n');
  branched(dir, 'wf/z/c', 'g', 'c\n');
  const before = untouched(dir);
  const answer = answerOf(
    run('trial', {
      repo: dir,
      trials: [
        { onto: 'wf/x/a', branch: 'wf/y/b' },
        { onto: 'main', branch: 'wf/x/a' },
        { onto: 'wf/x/a', branch: 'wf/z/c' },
        { onto: 'main', branch: 'wf/no/such' },
        { onto: 'gone', branch: 'wf/x/a' },
      ],
    }),
  );
  assert.deepEqual(answer.at, { 'wf/x/a': git(dir, 'rev-parse', 'wf/x/a'), main: git(dir, 'rev-parse', 'main'), gone: null });
  assert.deepEqual(answer.trials.slice(0, 3), [{ clean: false, conflicts: ['f'] }, { clean: true }, { clean: true }]);
  const [lacked, noBase] = answer.trials.slice(3);
  assert.ok('unknown' in lacked && /wf\/no\/such/.test(lacked.unknown), JSON.stringify(lacked));
  assert.ok('unknown' in noBase && /gone/.test(noBase.unknown), JSON.stringify(noBase));
  assert.equal(untouched(dir), before, 'no ref, HEAD, index or checkout moved');
});

test("export writes the tag's tree, not the working tree, into an empty repository of its own, and answers the tag's commit", () => {
  const dir = repository();
  git(dir, 'tag', 'v1');
  const tagged = git(dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'f'), 'after the tag\n');
  fs.writeFileSync(path.join(dir, 'loose'), 'never committed\n');
  const into = path.join(scratch('wf-git-skill-export-'), 'v1');
  assert.deepEqual(answerOf(run('export', { repo: dir, tag: 'v1', into })), { commit: tagged });
  assert.deepEqual(fs.readdirSync(into).sort(), ['.git', 'f', 'g']);
  assert.equal(fs.readFileSync(path.join(into, 'f'), 'utf8'), 'base\n');
  assert.equal(gitOk(into, 'rev-parse', '--verify', '--quiet', 'HEAD'), false, 'its repository holds no commit');
  assert.deepEqual(git(into, 'ls-files', '-co', '--exclude-standard').split('\n').sort(), ['f', 'g']);
  assert.equal(fs.existsSync(`${into}.tar`), false, 'the archive is gone');
});

test('REFUSED: export of a tag the repository lacks, from no directory, and into a folder that holds anything', () => {
  const dir = repository();
  git(dir, 'tag', 'v1');
  const root = scratch('wf-git-skill-export-');
  const into = path.join(root, 'v2');
  assert.equal(
    refusalOf(run('export', { repo: dir, tag: 'v2', into })),
    `${dir} has no tag v2: tag the commit to release (git -C ${dir} tag v2 <commit>)`,
  );
  assert.equal(fs.existsSync(into), false, 'nothing written');
  const gone = path.join(root, 'gone');
  assert.equal(refusalOf(run('export', { repo: gone, tag: 'v1', into })), `${gone} is not a directory, so no tag in it can be exported`);
  fs.mkdirSync(into);
  fs.writeFileSync(path.join(into, 'kept'), "a person's\n");
  assert.equal(
    refusalOf(run('export', { repo: dir, tag: 'v1', into })),
    `${into} is not empty, and a tag is exported into an empty folder`,
  );
  assert.deepEqual(fs.readdirSync(into), ['kept']);
});

test('REFUSED: seal of a repository that holds a commit, which it leaves, and of a tree that is not there', () => {
  const dir = repository();
  assert.equal(
    refusalOf(run('seal', { tree: dir })),
    `${path.join(dir, '.git')} holds a commit, so it is not the empty repository an export gives a tree: it is left as it is`,
  );
  assert.equal(gitOk(dir, 'rev-parse', '--verify', '--quiet', 'HEAD'), true, 'the repository is still there');
  const gone = path.join(scratch('wf-git-skill-seal-'), 'gone');
  assert.equal(refusalOf(run('seal', { tree: gone })), `${gone} is not a directory, so there is no exported tree to seal`);
});
