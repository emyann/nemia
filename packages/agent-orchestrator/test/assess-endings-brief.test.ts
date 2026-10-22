/**
 * What an ending is told, as tables: `workspace: main` is the repository's own checkout (`workspacePlan`), the run's result is the work
 * the ending acts on (`resultSteps`, `tipBranches`, `handOffDue`), and its brief (`composeBrief`) says where that work is, the check it
 * was judged by, the one place its files go, and the approval that filed it (`gateLines`). The gate is `assess-endings.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  artifactsContract,
  composeBrief,
  gateLines,
  handOffDue,
  resultSteps,
  tipBranches,
  workChecks,
  workspacePlan,
  type RepositoryRun,
  type RetryBriefing,
  type Run,
} from '../src/run.ts';
import type { Workflow } from '../src/workflow.ts';
import { phases, run, step } from './assessed.ts';

const DONE = phases({ t1: 'succeeded', t2: 'succeeded' });
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
/** Every task here was filed asking for a closeout — which is what the runner does. */
const asked = () => true;
const approval = (step: string, n: number, message?: string) => ({
  step,
  try: n,
  at: '2026-09-16T23:10:00.000Z',
  ...(message ? { message } : {}),
});
const FILES = '/wf/runs/r-1/artifacts/implement';

/**
 * The git place's words, as it declares them (`place/git/declared.ts`, whose `say` this is, copied: a test of the package's pure code
 * reaches no part of the real place).
 */
const SAY = {
  look: ['git diff {baseRef}', 'git status'],
  readResult: 'git -C {repo} diff {baseRef}...{branch}',
  ship: 'git -C {repo} merge --no-ff {branch}',
  drop: 'git -C {repo} branch -D {branches}',
  conflicts: '`git status` shows them.',
  unlock: 'git -C {repo} worktree unlock {path}',
  stage: 'git -C {repo} merge --no-ff --no-commit {branches}',
  attach: 'git -C {path} switch -c <branch>',
  commit: 'git -C {path} commit',
  inspect: 'git -C {path} status',
  orphans: 'git worktree list in their repository, and git worktree remove each',
  results: ['git log --oneline {base}..{branch}', 'git diff {base}...{branch}'],
  merge: 'git merge {sha}',
  mergeUncommitted: 'git merge --no-ff --no-commit {sha}',
  showMerge: 'git show --remerge-diff',
  lastMerge: 'git log --merges -1',
};
/** `s`'s brief in `r`, told the git place's words for reading the work. */
const placed = (s: Workflow, r: Run, steps: readonly Workflow[]): string =>
  composeBrief(
    s,
    r,
    steps,
    ...([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as const),
    { say: SAY },
  );

/** `implement → review → ship`, as the dev folders are: the ending step works in the repository's checkout, and is gated. */
const SHIP: Workflow = {
  name: 'ship',
  after: ['review'],
  workspace: 'main',
  gate: true,
  body: "Ship it: trial merge this run's result branch onto the base branch, run the check, and commit.\n\nAbort on any failure.",
};
const ENDS: Workflow[] = [step('implement'), step('review', ['implement']), SHIP];
/** implement and review done on the run's branch, ship never filed. */
const atEnd = (extra: Partial<RepositoryRun> = {}) =>
  run(
    {},
    {
      ...extra,
      steps: {
        implement: { taskId: 't1', workspace: '/wt', branch: 'wf/r-1/implement' },
        review: { taskId: 't2', workspace: '/wt', branch: 'wf/r-1/implement' },
        ship: { taskId: null },
        ...extra.steps,
      },
    },
  );

test("`workspacePlan` and the run's result: an ending works in the repository's own checkout, on the work of the steps before it", async (t) => {
  await t.test(
    "`workspace: main` is the repository's own checkout, and the run's result is the work the ending step acts on, not its branch",
    () => {
      const ending: Workflow = { name: 'ship', after: ['review'], body: 'ship it', workspace: 'main', gate: true };
      const dev = [step('implement'), step('review', ['implement']), ending];
      assert.deepEqual(workspacePlan(dev, ending), { kind: 'main' }, 'said by the step, not by the shape');
      assert.deepEqual(workspacePlan(dev, dev[1]), { kind: 'inherit', from: 'implement' }, 'and nothing else changes');
      assert.deepEqual(
        resultSteps(dev).map((s) => s.name),
        ['review'],
        "the result is what the ending step would merge: review's work, never main, of which every question about a result says yes",
      );
      assert.deepEqual(
        resultSteps([step('implement'), step('review', ['implement'])]).map((s) => s.name),
        ['review'],
        'a folder with no ending step is unchanged',
      );
      const fanIn: Workflow[] = [step('a'), step('b'), { name: 'ship', after: ['a', 'b'], body: 'ship it', workspace: 'main' }];
      assert.deepEqual(
        resultSteps(fanIn).map((s) => s.name),
        ['a', 'b'],
        'an ending step that waits on several: each of them',
      );

      const r = run(
        { implement: 't1', review: 't2', ship: 't3' },
        {
          steps: {
            implement: { taskId: 't1', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            review: { taskId: 't2', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            ship: { taskId: 't3', workspace: '/repo', branch: 'main' },
          },
        },
      );
      assert.deepEqual(
        tipBranches(r, dev, 'succeeded'),
        ['wf/r-1/implement'],
        "the work's branch, not the base branch the ending step is on",
      );
      assert.deepEqual(
        handOffDue(dev, r, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'succeeded' })),
        ['review'],
        'the run commits nothing in the checkout: what a person left lying there is theirs',
      );
    },
  );
});

test("`composeBrief` of a step in the repository's own checkout: where the work is, the check it was judged by, where its files go, and the approval that filed it", async (t) => {
  await t.test(
    "an ending step is told where the work is — the branches, not the workspace — since the repository's checkout is not where the run worked",
    () => {
      const ending: Workflow = { name: 'ship', after: ['review'], body: 'Ship it.', workspace: 'main', gate: true };
      const dev = [step('implement'), step('review', ['implement']), ending];
      const r = run(
        { implement: 't1', review: 't2', ship: null },
        {
          steps: {
            implement: { taskId: 't1', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            review: { taskId: 't2', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            ship: { taskId: null },
          },
        },
      );
      const brief = placed(ending, r, dev);
      assert.match(brief, /You are in \/repo, the repository's own checkout, on main — not in a worktree of this run's\./);
      assert.match(brief, /The work of review is not in this directory: it is on wf\/r-1\/implement, cut from `abc123`:/);
      assert.match(brief, /git log --oneline main\.\.wf\/r-1\/implement/);
      assert.match(brief, /git diff main\.\.\.wf\/r-1\/implement/);
      assert.match(brief, /the run commits nothing here for you/);
      assert.doesNotMatch(brief, /This workspace has already been worked in by/, 'the work is not here');
    },
  );

  await t.test(
    'an ending step is told the check the work was judged by, one line for each distinct check, and none when no step has one',
    () => {
      const ending: Workflow = { name: 'ship', after: ['review'], body: 'Ship it.', workspace: 'main', gate: true };
      const r = run(
        { implement: 't1', review: 't2', ship: null },
        {
          steps: {
            implement: { taskId: 't1', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            review: { taskId: 't2', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            ship: { taskId: null },
          },
        },
      );
      const checked = [
        { ...step('implement'), check: 'npm test && npm run build' },
        { ...step('review', ['implement']), check: 'npm test && npm run build' },
        ending,
      ];
      assert.deepEqual(workChecks(checked), ['npm test && npm run build'], 'the same check twice is one');
      const brief = composeBrief(ending, r, checked);
      assert.equal(brief.split("This workflow's check, which its work was judged by: `npm test && npm run build`").length, 2, brief);

      const two = [{ ...step('implement'), check: 'npm test' }, { ...step('review', ['implement']), check: 'npm run e2e' }, ending];
      assert.deepEqual(workChecks(two), ['npm test', 'npm run e2e'], 'in the order the steps run');
      const both = composeBrief(ending, r, two);
      assert.match(
        both,
        /This workflow's check, which its work was judged by: `npm test`\n\nThis workflow's check, which its work was judged by: `npm run e2e`/,
      );

      assert.deepEqual(workChecks([step('implement'), step('review', ['implement']), ending]), []);
      assert.doesNotMatch(
        composeBrief(ending, r, [step('implement'), step('review', ['implement']), ending]),
        /This workflow's check/,
        'no check, no line',
      );
      assert.doesNotMatch(
        composeBrief(step('review', ['implement']), r, checked),
        /This workflow's check/,
        'a step that is not an ending is not told it',
      );
    },
  );

  await t.test(
    'a step in the checkout whose run cut no branch — the whole workflow is that step — is told so, and is given no empty fence to read',
    () => {
      const watcher: Workflow = { name: 'supervise', after: [], body: 'Watch the runs.', workspace: 'main', slot: 'none' };
      const r = run({ supervise: 't1' }, { steps: { supervise: { taskId: 't1', workspace: '/repo', branch: 'main' } } });
      const brief = composeBrief(watcher, r, [watcher], () => undefined, FILES);
      assert.match(brief, /You are in \/repo, the repository's own checkout, on main — not in a worktree of this run's\./);
      assert.match(brief, /This run cut no branch of its own — it is this step, and nothing else — so there is no work of its to read/);
      assert.doesNotMatch(brief, /result branch/);
      assert.doesNotMatch(brief, /```\n```/, 'no fence with nothing in it');
      assert.match(brief, /the run commits nothing here for you/);
      assert.doesNotMatch(brief, /The checkout is at/, 'a sha frozen at `nemia start` is no claim about where the checkout stands now');
    },
  );

  await t.test(
    'a late try of a step in the checkout is told the base branch by name, never the sha the run froze: a step that does not end is composed again on every answer',
    () => {
      const watcher: Workflow = { name: 'supervise', after: [], body: 'Watch the runs.', workspace: 'main', slot: 'none' };
      const r = run(
        { supervise: 't1' },
        {
          steps: {
            supervise: {
              taskId: 't1',
              workspace: '/repo',
              branch: 'main',
              tries: [
                { taskId: 't0', then: 'nudge' },
                { taskId: 't0b', then: 'nudge' },
                { taskId: 't0c', then: 'nudge' },
              ],
            },
          },
        },
      );
      const briefing: RetryBriefing = { try: 4, by: 'ask', mode: 'nudge', resumed: false, status: 'blocked', message: 'Merge it.' };
      const brief = composeBrief(watcher, r, [watcher], () => undefined, FILES, undefined, briefing);
      assert.match(
        brief,
        /You are in \/repo, the repository's own checkout, on main — not in a worktree of this run's\./,
        'the base branch, by name, in the whole brief a new session on try 4 is composed',
      );
      assert.doesNotMatch(
        brief,
        /abc123/,
        "the run's frozen base is several merges behind by the fourth answer, and the brief claims nothing about it",
      );
      assert.doesNotMatch(brief, /The checkout is at/);
    },
  );

  await t.test(
    'a step in the checkout is told the one place its files go: the run hands nothing off there, so nothing it leaves is collected or committed',
    () => {
      const ending: Workflow = { name: 'ship', after: ['review'], body: 'Ship it.', workspace: 'main', gate: true };
      const dev = [step('implement'), step('review', ['implement']), ending];
      const r = run(
        { implement: 't1', review: 't2', ship: null },
        {
          steps: {
            implement: { taskId: 't1', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            review: { taskId: 't2', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            ship: { taskId: null },
          },
        },
      );
      const brief = composeBrief(ending, r, dev, () => undefined, FILES);
      assert.match(brief, /\n## Files for the person who decides\n/);
      assert.doesNotMatch(brief, /## Files for the steps after you/, 'nothing follows it, and this is not a workspace it hands off');
      assert.doesNotMatch(
        brief,
        /Or leave it in this workspace/,
        "the second way is false here: it would be left in a person's checkout for ever",
      );
      assert.doesNotMatch(brief, /WF_ARTIFACTS/, 'and `workspace: main` refuses a check, so there is none to be given it');
      assert.ok(brief.includes(FILES), 'the directory the run made, by absolute path');
      assert.match(artifactsContract(FILES, true), /a file you leave here is\nnot collected and not committed/);
      assert.match(artifactsContract(FILES, true), /`nemia decide` reads a path named from\nthe workspace root as `not collected`/);
      assert.match(
        composeBrief(dev[1], r, dev, () => undefined, FILES),
        /\n## Files for the steps after you\n/,
        'every other step is told both ways',
      );
      assert.match(artifactsContract(FILES), /Or leave it in this workspace/);
    },
  );

  await t.test(
    "an ending step's brief carries one way of handing a file over, not two: the run collects nothing from the repository's own checkout, and commits nothing there",
    () => {
      const ending = composeBrief(SHIP, atEnd(), ENDS, undefined, FILES);
      assert.ok(ending.includes('\n## Files for the person who decides\n'), ending);
      assert.ok(ending.includes(`reaches them one way: put it in \`${FILES}\`, and name it in \`artifacts\` by\nabsolute path.`), ending);
      assert.doesNotMatch(ending, /Or leave it in this workspace/, 'the run hands nothing off in that checkout (`handOffDue`)');
      assert.match(
        ending,
        /a file you leave here is\nnot collected and not committed — it stays in a person's checkout, and `nemia decide` reads a path named from\nthe workspace root as `not collected`\./,
        "a file left in the checkout is said to stay in a person's checkout",
      );
      assert.doesNotMatch(ending, /WF_ARTIFACTS/, "and it runs no check of the run's, so there is none to name");
      const work = composeBrief(ENDS[1], atEnd(), ENDS, undefined, FILES);
      assert.ok(work.includes('\n## Files for the steps after you\n'), work);
      assert.ok(
        work.includes('- Or leave it in this workspace, and name it in `artifacts` by its path from the workspace root'),
        `every other step is told both ways: its workspace is the run's, and what it leaves there is collected and committed:\n${work}`,
      );
      assert.doesNotMatch(work, /## Files for the person who decides/);
    },
  );

  await t.test(
    'an ending step is handed its own approval and the words given with it — `## Approved`, since that approval is what files it — and `gateLines` says its gate',
    () => {
      const r = atEnd({ approvals: [approval('ship', 1, 'Merge it, and do not touch the changelog.')] });
      const brief = composeBrief(SHIP, r, ENDS);
      assert.match(
        brief,
        /\n## Approved\n\nA person approved this step before it was filed: nothing of it has run, and their word is what files it\./,
      );
      assert.match(brief, /ship, try 1, approved at 2026-09-16T23:10:00\.000Z:/);
      assert.match(brief, /Merge it, and do not touch the changelog\./);
      assert.doesNotMatch(composeBrief(SHIP, atEnd(), ENDS), /## Approved/, 'nothing before a person says it');
      assert.deepEqual(gateLines(ENDS, atEnd(), DONE, signedDone, asked), {
        ship: 'awaiting approval:  nemia approve r-1 ship [--message "<words>"]  — or send it back:  nemia retry r-1 review --message "<objection>"',
      });
      assert.deepEqual(gateLines(ENDS, r, DONE, signedDone, asked), {
        ship: 'approved 23:10Z — "Merge it, and do not touch the changelog."',
      });
    },
  );
});
