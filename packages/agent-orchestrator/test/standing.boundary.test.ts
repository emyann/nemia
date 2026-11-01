/**
 * The git place's `standing` (`place/git/verbs/standing.ts`), asked of `gitPlace` against scratch repositories: every head of the
 * repository, and for each branch asked of whether it is on its base, whether it holds work past its run's base, how far ahead it is,
 * a gone branch judged by the tip its run recorded, and its refusals. Its two fallbacks are made to answer by a `git` planted on `PATH`:
 * one that refuses `%(ahead-behind:…)` as a git older than 2.41 does, and a `baseRef` git cannot read. Git runs with no user or system
 * configuration and a fixed identity.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gitPlace } from '../place/git/place.ts';
import type { PlaceOutcome } from '../src/runner.ts';
import { landedOver } from '../src/branches/branches.ts';
import { knownOf, toldOf } from '../src/standing/standing.verb.ts';
import { scratch } from './scratch.ts';
import { columnsListed, plantedGit } from './planted-git.ts';

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

/** A commit on the branch `dir` has checked out, of `file` written with `text`. */
function commit(dir: string, file: string, text: string): string {
  fs.writeFileSync(path.join(dir, file), text);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', file);
  return git(dir, 'rev-parse', 'HEAD');
}

/** A commit no repository has. */
const NOWHERE = 'f'.repeat(40);

/**
 * A repository on `main`, cut at `cut`: `wf/r/a` merged into it, `wf/r/b` not, `wf/r/e` cut after the merge with nothing of its own,
 * `wf/r/g` merged and deleted at `gone`.
 */
function repository() {
  const dir = scratch('wf-standing-');
  git(dir, 'init', '-q', '-b', 'main');
  const cut = commit(dir, 'base.txt', 'base\n');
  for (const [branch, file] of [
    ['wf/r/a', 'a.txt'],
    ['wf/r/b', 'b.txt'],
    ['wf/r/g', 'g.txt'],
  ]) {
    git(dir, 'switch', '-q', '-c', branch, cut);
    commit(dir, file, `${file}\n`);
  }
  const gone = git(dir, 'rev-parse', 'wf/r/g');
  git(dir, 'switch', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'land a', 'wf/r/a');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'land g', 'wf/r/g');
  git(dir, 'branch', '-q', '-D', 'wf/r/g');
  const landed = git(dir, 'rev-parse', 'main');
  git(dir, 'branch', 'wf/r/e', landed);
  return { dir, cut, gone, landed };
}

/** `standing` of the git place, in `env`, its request as given: one the contract's type refuses is how a malformed request is sent. */
const standing = (asked: object, env: NodeJS.ProcessEnv = ENV): PlaceOutcome<'standing'> =>
  gitPlace({ env }).askNow('standing', asked as never);

/** The answer of an outcome, or a failure naming what it was instead. */
function answerOf(outcome: PlaceOutcome<'standing'>) {
  assert.ok('answer' in outcome, `an answer expected, got ${JSON.stringify(outcome)}`);
  return outcome.answer;
}

/** The branches asked of `repository()`'s `dir`, each against the commit its run was cut at. */
function asked({ cut, gone, landed }: ReturnType<typeof repository>) {
  return [
    { branch: 'wf/r/a', baseRef: cut },
    { branch: 'wf/r/b', baseRef: cut },
    { branch: 'wf/r/e', baseRef: landed },
    { branch: 'wf/r/g', tip: gone, baseRef: cut },
    { branch: 'wf/r/never', baseRef: cut },
    { branch: 'wf/r/lost', tip: NOWHERE, baseRef: cut },
  ];
}

/** What `standing` answers of `asked(repo)`, whichever way git is asked. */
const STOOD = [
  { branch: 'wf/r/a', onBase: 'yes', pastBase: true, ahead: 0 },
  { branch: 'wf/r/b', onBase: 'no', pastBase: null, ahead: 1 },
  { branch: 'wf/r/e', onBase: 'yes', pastBase: false, ahead: 0 },
  { branch: 'wf/r/g', tip: null, onBase: 'yes', pastBase: true, ahead: null },
  { branch: 'wf/r/never', tip: null, onBase: 'unknown', pastBase: null, ahead: null },
  { branch: 'wf/r/lost', tip: null, onBase: 'unknown', pastBase: null, ahead: null },
];

/** `STOOD` with each branch's tip as `dir` has it. */
const stood = (dir: string) => STOOD.map((s) => ({ tip: 'tip' in s ? s.tip : git(dir, 'rev-parse', s.branch), ...s }));

test('standing answers every head, and where each branch stands: on its base or not, past its base, how far ahead', () => {
  const repo = repository();
  const answer = answerOf(standing({ repo: repo.dir, base: 'main', branches: asked(repo) }));
  assert.deepEqual(answer.branches, stood(repo.dir));
  assert.deepEqual(answer.tips, {
    main: repo.landed,
    'wf/r/a': git(repo.dir, 'rev-parse', 'wf/r/a'),
    'wf/r/b': git(repo.dir, 'rev-parse', 'wf/r/b'),
    'wf/r/e': repo.landed,
  });
});

test('standing reads every branch git has in one listing: no process per branch where git lists their distances', () => {
  const repo = repository();
  const planted = plantedGit(ENV, 'no-such-field');
  const asks = asked(repo).filter((a) => !a.tip && a.branch !== 'wf/r/never');
  assert.deepEqual(answerOf(standing({ repo: repo.dir, base: 'main', branches: asks }, planted.env)).branches.length, 3);
  assert.deepEqual(
    planted.said().map((line) => line.split(' ')[0]),
    ['for-each-ref'],
  );
});

test('standing on a git older than 2.41, which lists no distance, asks each branch one by one and answers the same', () => {
  const repo = repository();
  const planted = plantedGit(ENV, 'ahead-behind');
  const answer = answerOf(standing({ repo: repo.dir, base: 'main', branches: asked(repo) }, planted.env));
  assert.deepEqual(answer.branches, stood(repo.dir));
  assert.ok(
    planted.said().some((line) => line.startsWith('merge-base --is-ancestor')),
    planted.said().join('\n'),
  );
});

test('standing against a baseRef git cannot read lists the rest with their distances, and says pastBase null of that one', () => {
  const repo = repository();
  const planted = plantedGit(ENV, 'no-such-field');
  const asks = [
    { branch: 'wf/r/a', baseRef: NOWHERE },
    { branch: 'wf/r/b', baseRef: repo.cut },
    { branch: 'wf/r/e', baseRef: repo.landed },
  ];
  const answer = answerOf(standing({ repo: repo.dir, base: 'main', branches: asks }, planted.env));
  assert.deepEqual(
    answer.branches.map((b) => [b.branch, b.onBase, b.pastBase, b.ahead]),
    [
      ['wf/r/a', 'yes', null, 0],
      ['wf/r/b', 'no', null, 1],
      ['wf/r/e', 'yes', false, 0],
    ],
  );
  const listings = planted.said().filter((line) => line.startsWith('for-each-ref'));
  assert.equal(listings.length, 3, planted.said().join('\n'));
  assert.ok(listings[2].includes(`ahead-behind:${repo.landed}`) && !listings[2].includes(NOWHERE), listings[2]);
  assert.ok(!planted.said().some((line) => line.startsWith('rev-list --count')), planted.said().join('\n'));
});

test('standing asked of no branch answers the heads alone, whatever the base', () => {
  const repo = repository();
  const answer = answerOf(standing({ repo: repo.dir, base: 'no-such-base', branches: [] }));
  assert.deepEqual(answer.branches, []);
  assert.equal(answer.tips['wf/r/b'], git(repo.dir, 'rev-parse', 'wf/r/b'));
});

/** Whether `commit` is within `base` in `dir`, as git's `merge-base --is-ancestor` says: `yes`, `no` (its exit 1), or `unknown`. */
function within(dir: string, commit: string, base: string): 'yes' | 'no' | 'unknown' {
  try {
    git(dir, 'merge-base', '--is-ancestor', commit, base);
    return 'yes';
  } catch (err) {
    return (err as { status?: number }).status === 1 ? 'no' : 'unknown';
  }
}

/**
 * Whether `branch`, cut at `baseRef`, is landed on `main`, asked of git one question at a time: on `main` by its name, or gone and its
 * recorded `tip` on `main`; `true` with work past `baseRef`, `unchanged` with none.
 */
function shippedByGit(dir: string, { branch, tip, baseRef }: { branch: string; tip?: string; baseRef: string }) {
  const landed = (commit: string) => (within(dir, commit, baseRef) === 'no' ? true : 'unchanged');
  const onBase = within(dir, branch, 'main');
  if (onBase === 'yes') return landed(branch);
  if (onBase === 'no' || !tip) return false;
  return within(dir, tip, 'main') === 'yes' ? landed(tip) : false;
}

test('a branch is landed by its standing exactly when git asked one question at a time says so, a gone one never merged included', () => {
  const repo = repository();
  git(repo.dir, 'switch', '-q', '-c', 'wf/r/u', repo.cut);
  const unmerged = commit(repo.dir, 'u.txt', 'u\n');
  git(repo.dir, 'switch', '-q', 'main');
  git(repo.dir, 'branch', '-q', '-D', 'wf/r/u');
  const branches = [...asked(repo), { branch: 'wf/r/u', tip: unmerged, baseRef: repo.cut }];
  const answer = answerOf(standing({ repo: repo.dir, base: 'main', branches }));
  const said = branches.map((_, i) => landedOver(answer.branches[i]));
  assert.deepEqual(said, [true, false, 'unchanged', true, false, false, false]);
  assert.deepEqual(
    said,
    branches.map((a) => shippedByGit(repo.dir, a)),
  );
});

test('REFUSED: standing of no repository, and against a base git cannot read; unread for a request with no list of branches', () => {
  const repo = repository();
  const gone = path.join(repo.dir, 'gone');
  assert.deepEqual(standing({ repo: gone, base: 'main', branches: [] }), {
    refused: `git cannot list the branches of ${gone}: it is no git repository, or git cannot read it`,
  });
  assert.deepEqual(standing({ repo: repo.dir, base: 'no-such-base', branches: asked(repo) }), {
    refused: `git cannot read no-such-base in ${repo.dir}, the base the branches are asked of: is it a branch of that repository?`,
  });
  const unread = standing({ repo: repo.dir, base: 'main', branches: 'wf/r/a' });
  assert.ok('unread' in unread, JSON.stringify(unread));
  assert.equal(unread.unread.said, 'the request\'s `branches` is "wf/r/a", where a list of branches is asked');
});

/** How many distinct bases, and result branches cut at them, a repository shaped like the live store has. */
const BASES = 340;
const BRANCHES = 560;

/** What becomes of the result branch `i` of `manyBases()`: one in twenty each unmerged, gone and unchanged, the rest merged. */
const kindOf = (i: number) => (['unmerged', 'gone', 'unchanged'] as const)[i % 20] ?? 'merged';

/**
 * A repository shaped like the live store, written by one `git fast-import`: `main` a line of `BASES` commits, each the `baseRef` of the
 * runs cut there, and `BRANCHES` result branches cut at them in turn (`kindOf`), a merged one merged on `main`'s next commit and a gone one
 * merged and kept outside `refs/heads/`. `asked` is each branch as the pass asks it, a gone one with the tip its run recorded.
 */
function manyBases() {
  const dir = scratch('wf-standing-bases-');
  git(dir, 'init', '-q', '-b', 'main');
  const lines: string[] = [];
  const data = (text: string) => [`data ${Buffer.byteLength(text)}`, text];
  const header = (ref: string, mark: number) => [
    `commit ${ref}`,
    `mark :${mark}`,
    'committer Test <test@local> 1700000000 +0000',
    ...data('c'),
  ];
  const baseMark = (k: number) => k + 1;
  const branchMark = (i: number) => BASES + 2 + i;
  const cutAt = (k: number) => [k, k + BASES].filter((i) => i < BRANCHES);
  const landing = (k: number) => cutAt(k).filter((i) => ['merged', 'gone'].includes(kindOf(i)));
  for (let k = 0; k <= BASES; k++) {
    const merges = k ? landing(k - 1).map((i) => `merge :${branchMark(i)}`) : [];
    lines.push(...header('refs/heads/main', baseMark(k)), ...(k ? [`from :${baseMark(k - 1)}`] : []), ...merges);
    lines.push('M 644 inline main.txt', ...data(`${k}\n`));
    for (const i of k < BASES ? cutAt(k) : []) {
      if (kindOf(i) === 'unchanged') lines.push(`reset refs/heads/wf/r/${i}`, `from :${baseMark(k)}`);
      else {
        lines.push(...header(kindOf(i) === 'gone' ? `refs/gone/${i}` : `refs/heads/wf/r/${i}`, branchMark(i)), `from :${baseMark(k)}`);
        lines.push(`M 644 inline f${i}.txt`, ...data(`${i}\n`));
      }
    }
  }
  const marks = path.join(dir, '.git', 'marks');
  execFileSync('git', ['fast-import', '--quiet', `--export-marks=${marks}`], { cwd: dir, env: ENV, input: `${lines.join('\n')}\n` });
  const sha = new Map(
    fs
      .readFileSync(marks, 'utf8')
      .trim()
      .split('\n')
      .map((line) => line.slice(1).split(' ') as [string, string])
      .map(([mark, id]) => [Number(mark), id]),
  );
  const asked = Array.from({ length: BRANCHES }, (_, i) => ({
    branch: `wf/r/${i}`,
    baseRef: sha.get(baseMark(i % BASES))!,
    ...(kindOf(i) === 'gone' ? { tip: sha.get(branchMark(i))! } : {}),
  }));
  return { dir, asked };
}

/** `asked`, each branch handed what `answer` read of it: the commit judged and its `pastBase`. */
const knownFrom = (asked: readonly { tip?: string }[], answer: ReturnType<typeof answerOf>) =>
  asked.map((a, i) => ({ ...a, known: { tip: answer.branches[i].tip ?? a.tip ?? null, pastBase: answer.branches[i].pastBase } }));

test('standing asked again with what it last read lists the distance from base alone, over 340 bases and 560 branches', () => {
  const repo = manyBases();
  const cold = plantedGit(ENV);
  const first = answerOf(standing({ repo: repo.dir, base: 'main', branches: repo.asked }, cold.env));
  assert.deepEqual(columnsListed(cold.said()), [1 + BASES], 'the fixture carries the growth: a column for each base');
  const count = (pick: (b: (typeof first.branches)[number]) => boolean) => first.branches.filter(pick).length;
  assert.deepEqual(
    [count((b) => b.pastBase === true), count((b) => b.pastBase === false), count((b) => b.onBase === 'no')],
    [504, 28, 28],
    'merged and gone, unchanged, unmerged',
  );
  const steady = plantedGit(ENV);
  const again = answerOf(standing({ repo: repo.dir, base: 'main', branches: knownFrom(repo.asked, first) }, steady.env));
  assert.deepEqual(again, first);
  assert.deepEqual(columnsListed(steady.said()), [1], "base's column alone");
  assert.deepEqual(
    steady.said().filter((line) => line.startsWith('merge-base')),
    repo.asked.filter((a) => a.tip).map((a) => `merge-base --is-ancestor ${a.tip} main`),
    'a gone branch is asked whether it is on base, and of its baseRef nothing',
  );
});

test('a branch moved since standing last read it is asked of git again, by one merge-base and no column, and answers as a cold ask', () => {
  const repo = manyBases();
  const first = answerOf(standing({ repo: repo.dir, base: 'main', branches: repo.asked }));
  const moved = repo.asked[2];
  assert.equal(first.branches[2].pastBase, false, 'it had nothing of its own');
  const next = git(repo.dir, 'commit-tree', `${moved.branch}^{tree}`, '-p', moved.branch, '-m', 'more');
  git(repo.dir, 'update-ref', `refs/heads/${moved.branch}`, next);
  git(repo.dir, 'update-ref', 'refs/heads/main', git(repo.dir, 'commit-tree', 'main^{tree}', '-p', 'main', '-p', next, '-m', 'land it'));
  const planted = plantedGit(ENV);
  const again = answerOf(standing({ repo: repo.dir, base: 'main', branches: knownFrom(repo.asked, first) }, planted.env));
  assert.deepEqual(again, answerOf(standing({ repo: repo.dir, base: 'main', branches: repo.asked })));
  assert.equal(again.branches[2].pastBase, true);
  assert.deepEqual(columnsListed(planted.said()), [1]);
  assert.deepEqual(
    planted.said().filter((line) => line.startsWith('merge-base') && !line.endsWith(' main')),
    [`merge-base --is-ancestor ${next} ${moved.baseRef}`],
  );
});

test('standing never believes what it is told it last read past the commit it was read of', () => {
  const repo = repository();
  const known = (tip: string, pastBase: boolean) => ({ known: { tip, pastBase } });
  const hinted = asked(repo).map((a) =>
    a.branch === 'wf/r/a'
      ? { ...a, ...known(repo.cut, false) }
      : a.branch === 'wf/r/e'
        ? { ...a, ...known(repo.landed, false) }
        : a.branch === 'wf/r/g'
          ? { ...a, ...known(repo.gone, true) }
          : a,
  );
  const planted = plantedGit(ENV);
  assert.deepEqual(answerOf(standing({ repo: repo.dir, base: 'main', branches: hinted }, planted.env)).branches, stood(repo.dir));
  const said = planted.said();
  assert.ok(!said.some((line) => line.includes(`ahead-behind:${repo.landed}`)), said.join('\n'));
  assert.ok(!said.includes(`merge-base --is-ancestor ${repo.gone} ${repo.cut}`), said.join('\n'));
  assert.ok(said.includes(`merge-base --is-ancestor ${repo.gone} main`), said.join('\n'));
});

test('REFUSED: standing told what it last read of a branch in any shape but { tip, pastBase } reads unread, naming the branch', () => {
  const repo = repository();
  const told = { branch: 'wf/r/a', baseRef: repo.cut, known: { tip: 1 } };
  const unread = standing({ repo: repo.dir, base: 'main', branches: [told] });
  assert.ok('unread' in unread, JSON.stringify(unread));
  assert.equal(
    unread.unread.said,
    `the request's \`branches[0]\` is ${JSON.stringify(told)}, where { branch, tip?, baseRef, known?: { tip, pastBase } } is asked`,
  );
});

test('REFUSED: what standing read of a branch is kept only against a baseRef that is a commit id, and its pastBase only of one judged', () => {
  const at = { branch: 'wf/r/a', onBase: 'yes', ahead: 0 } as const;
  const id = 'a'.repeat(40);
  assert.deepEqual(knownOf({ branch: 'wf/r/a', baseRef: NOWHERE }, { ...at, tip: id, pastBase: true }), { tip: id, pastBase: true });
  assert.equal(knownOf({ branch: 'wf/r/a', baseRef: 'main' }, { ...at, tip: id, pastBase: true }), undefined, 'main moves');
  assert.equal(knownOf({ branch: 'wf/r/a', baseRef: NOWHERE }, undefined), undefined, 'nothing read of it');
  assert.deepEqual(
    knownOf({ branch: 'wf/r/g', tip: 'HEAD~1', baseRef: NOWHERE }, { ...at, tip: null, pastBase: true }),
    { tip: null, pastBase: null },
    'a recorded tip that is a name',
  );
  assert.deepEqual(knownOf({ branch: 'wf/r/g', tip: id, baseRef: NOWHERE }, { ...at, tip: null, pastBase: false }), {
    tip: id,
    pastBase: false,
  });
});

test('REFUSED: a branch is told what was last read of it only where it was read against the baseRef it is asked against now', () => {
  const known = { tip: 'a'.repeat(40), pastBase: true };
  const kept = new Map([['wf/r/a', { baseRef: NOWHERE, known }]]);
  assert.deepEqual(toldOf([{ branch: 'wf/r/a', baseRef: NOWHERE }], kept), [{ branch: 'wf/r/a', baseRef: NOWHERE, known }]);
  assert.deepEqual(toldOf([{ branch: 'wf/r/a', baseRef: 'e'.repeat(40) }], kept), [{ branch: 'wf/r/a', baseRef: 'e'.repeat(40) }]);
  assert.deepEqual(toldOf([{ branch: 'wf/r/b', baseRef: NOWHERE }], kept), [{ branch: 'wf/r/b', baseRef: NOWHERE }]);
  assert.deepEqual(toldOf([{ branch: 'wf/r/a', baseRef: NOWHERE }], undefined), [{ branch: 'wf/r/a', baseRef: NOWHERE }]);
});

test('a branch read off its base and landed since, its tip unchanged, is asked of git whether it holds work past its baseRef', () => {
  const repo = repository();
  const first = answerOf(standing({ repo: repo.dir, base: 'main', branches: asked(repo) }));
  const told = knownFrom(asked(repo), first);
  const tip = git(repo.dir, 'rev-parse', 'wf/r/b');
  assert.deepEqual(told[1], { branch: 'wf/r/b', baseRef: repo.cut, known: { tip, pastBase: null } }, 'read off its base');
  git(repo.dir, 'merge', '-q', '--no-ff', '-m', 'land b', 'wf/r/b');
  const planted = plantedGit(ENV);
  const again = answerOf(standing({ repo: repo.dir, base: 'main', branches: told }, planted.env));
  assert.deepEqual(again, answerOf(standing({ repo: repo.dir, base: 'main', branches: asked(repo) })));
  assert.deepEqual([again.branches[1].onBase, again.branches[1].pastBase, landedOver(again.branches[1])], ['yes', true, true]);
  assert.deepEqual(
    planted.said().filter((line) => line === `merge-base --is-ancestor ${tip} ${repo.cut}`),
    [`merge-base --is-ancestor ${tip} ${repo.cut}`],
  );
});
