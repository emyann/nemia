/**
 * A step's git words come from its run's place: six briefs of a repository run of the tests' team, composed with the shipped place's
 * words, equal what they said before the words moved, line for line (`fixtures/briefs/`); a planted place's words replace every one; with
 * none the briefs send the step to its place's skill and print no command; and a folder run's briefs say no git at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { composeBrief, type RepositoryRun, type Run } from '../src/run.ts';
import type { Workflow } from '../src/workflow.ts';
import type { Closeout } from '../src/closeout/closeout.ts';
import type { BriefPlace } from '../src/brief/brief.ts';
import { SKILL_SECTIONS, type PlaceSay } from '../src/place/place.ts';
import type { Place } from '../src/place/place.store.ts';
import { builtinGitPlace } from '../src/place/builtin.store.ts';
import { placeTold } from '../src/tick/told.verb.ts';
import { TEAM_DEV } from './team.ts';

/** Where the pinned briefs are kept, one file each. */
const PINNED = path.join(import.meta.dirname, 'fixtures', 'briefs');

const STEPS = loadWorkflows(TEAM_DEV);

/** The step `name` of the tests' team. */
const stepNamed = (name: string): Workflow => {
  const found = STEPS.find((s) => s.name === name);
  if (!found) throw new Error(`the tests' team has no step ${name}`);
  return found;
};

/** A repository run of the tests' team, implement and review filed on one branch, with `steps` over its records. */
const runOf = (steps: Partial<RepositoryRun['steps']> = {}): RepositoryRun => ({
  id: 'r-1',
  repo: '/repo',
  workspace: '/wt/implement',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'add a flag',
  workflowDir: TEAM_DEV,
  createdAt: '2026-01-01T00:00:00Z',
  steps: {
    implement: { taskId: 't1', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
    review: { taskId: 't2', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
    ship: { taskId: null },
    ...steps,
  },
});

const REVIEWED: Closeout = { outcome: 'done', summary: 'fine', output: { again: false, findings: [] } } as unknown as Closeout;

/** Seven positional arguments of `composeBrief` left out, between `artifactsDir` and `costs`. */
const NONE = [undefined, undefined, undefined, undefined, undefined, undefined, undefined] as const;

/** What a run's place tells one of its steps' briefs. */
type Telling = (run: Run, step: Workflow) => BriefPlace;

/** What `placeTold` tells a step, by `place`, the package's git place when given none. */
const toldBy =
  (place: Place = builtinGitPlace): Telling =>
  (run, step) =>
    placeTold(run, step, place);

/** The six briefs of a repository run, by the name of their pinned file, each told what `told` says. */
function briefs(told: Telling): Record<string, string> {
  const implement = stepNamed('implement');
  const review = stepNamed('review');
  const ship = stepNamed('ship');
  const first = runOf({ implement: { taskId: null }, review: { taskId: null } });
  const run = runOf();
  const merge = { onto: 'main', sha: 'def4567890' };
  const round = (landing?: boolean) => ({
    loop: 'review',
    round: 2,
    rounds: 3,
    by: 'merge' as const,
    resumed: false,
    merge: landing
      ? {
          ...merge,
          landing: { step: 'ship', check: 't9', command: 'npm test', unreadable: 'its task is gone' },
        }
      : merge,
  });
  const ending = runOf({ review: { taskId: 't2', workspace: '/wt/review', branch: 'wf/r-1/review' } });
  const [, , ...afterRound] = NONE;
  const merging = (briefed: ReturnType<typeof round>) =>
    composeBrief(
      implement,
      run,
      STEPS,
      () => undefined,
      '/art/implement',
      undefined,
      undefined,
      briefed,
      ...afterRound,
      told(run, implement),
    );
  const mergedRun = runOf({
    review: { taskId: 't4', workspace: '/wt/implement', branch: 'wf/r-1/implement', tries: [{ taskId: 't2', cause: 'merge' }] },
  });
  return {
    'first.txt': composeBrief(implement, first, STEPS, () => undefined, '/art/implement', ...NONE, undefined, told(first, implement)),
    'later.txt': composeBrief(review, run, STEPS, () => undefined, '/art/review', ...NONE, undefined, told(run, review)),
    'ending.txt': composeBrief(ship, ending, STEPS, () => undefined, '/art/ship', ...NONE, undefined, told(ending, ship)),
    'merge-textual.txt': merging(round()),
    'merge-semantic.txt': merging(round(true)),
    'merge-review.txt': composeBrief(
      review,
      mergedRun,
      STEPS,
      (name) => (name === 'review' ? REVIEWED : undefined),
      '/art/review',
      ...NONE,
      undefined,
      told(mergedRun, review),
    ),
  };
}

/** The two sentences of the contracts that name git as prose, not as a command a step runs: they stay git's. */
const PROSE = /unless git ignores it|sandboxes keep git read-only/;

/** The lines of `brief` that name git, but the contracts' prose (`PROSE`). */
const gitLines = (brief: string): string[] => brief.split('\n').filter((line) => /\bgit\b/.test(line) && !PROSE.test(line));

/** The package's place, its words Mercurial's: what a place of another tool would say. */
function hgPlace(): Place {
  const declared = builtinGitPlace.declared;
  const hg = (line: string) => line.replaceAll('git', 'hg');
  const say = Object.fromEntries(
    Object.entries(declared.say).map(([key, said]: [string, string | readonly string[]]) => [
      key,
      typeof said === 'string' ? hg(said) : said.map(hg),
    ]),
  ) as unknown as PlaceSay;
  return {
    ...builtinGitPlace,
    declared: {
      denyWhileLanding: ['Bash(hg commit:*)'],
      say: {
        ...say,
        look: ['hg diff -r {baseRef}', 'hg status'],
        results: ['hg log -r {base}::{branch}', 'hg diff -r {base} -r {branch}'],
        merge: 'hg merge -r {sha}',
        mergeUncommitted: 'hg merge -r {sha} --tool :merge3',
        showMerge: 'hg diff -c .',
        lastMerge: "hg log -r 'last(merge())'",
        stage: 'hg -R {repo} merge {branches}',
      },
    },
  };
}

test("a repository run's briefs say what they said before the place gave their git words, line for line", () => {
  for (const [name, brief] of Object.entries(briefs(toldBy())))
    assert.deepEqual(`${brief}\n`.split('\n'), fs.readFileSync(path.join(PINNED, name), 'utf8').split('\n'), name);
});

test('a run is told the words of the place it is given, whatever place its record once named', () => {
  const run = runOf();
  const named: RepositoryRun = { ...run, placeSkill: { skill: 'git', version: 'a'.repeat(64) } };
  for (const each of [run, named])
    assert.deepEqual(toldBy()(each, stepNamed('review')), { words: undefined, say: builtinGitPlace.declared.say });
});

test("a planted place's words replace every git command of a repository run's briefs", () => {
  const composed = briefs(toldBy(hgPlace()));
  for (const [name, brief] of Object.entries(composed)) assert.deepEqual(gitLines(brief), [], name);
  assert.match(composed['later.txt'], /```\nhg diff -r abc123\nhg status\n```/);
  assert.match(composed['ending.txt'], /```\nhg log -r main::wf\/r-1\/review\nhg diff -r main -r wf\/r-1\/review\n```/);
  assert.match(composed['ending.txt'], /`hg -R \/repo merge <result branch>`/);
  assert.match(composed['merge-textual.txt'], /\n {4}hg merge -r def4567890\n/);
  assert.match(composed['merge-semantic.txt'], /\n {4}hg merge -r def4567890 --tool :merge3\n/);
  assert.match(composed['merge-semantic.txt'], /so `hg diff -c \.` shows the fix/);
  assert.match(composed['merge-review.txt'], /`hg diff -c \.` of the merge commit \(`hg log -r 'last\(merge\(\)\)'`\)/);
});

test("a repository run's briefs told no place's words send the step to its place's skill, and print no command", () => {
  const composed = briefs(() => ({}));
  for (const [name, brief] of Object.entries(composed)) {
    assert.deepEqual(gitLines(brief), [], name);
    assert.doesNotMatch(brief, /```\n```/, `${name}: no empty block where the commands were`);
  }
  const read = `as your place's skill says under *${SKILL_SECTIONS.read}*`;
  const merge = `as your place's skill says under *${SKILL_SECTIONS.merge}*`;
  assert.ok(composed['later.txt'].includes(`against \`abc123\` you can see exactly what changed, ${read}.`), composed['later.txt']);
  assert.ok(composed['ending.txt'].includes(`Read each against \`main\` ${read}.`), composed['ending.txt']);
  assert.ok(composed['merge-textual.txt'].includes(`at the commit their trial merge read, \`def4567890\`, ${merge}.`));
  assert.ok(composed['merge-semantic.txt'].includes(`Merge it in at that commit, without committing, ${merge}.`));
  assert.ok(composed['merge-review.txt'].includes(`- What the merge resolved, ${merge}, and what \`main\` changed`));
});

test('a folder run is told nothing by a place, and its briefs say no git', () => {
  const folderRun: Run = {
    id: 'f-1',
    place: { kind: 'folder' },
    workspace: '/f/implement',
    brief: 'write a page',
    workflowDir: TEAM_DEV,
    createdAt: '2026-01-01T00:00:00Z',
    steps: {
      implement: { taskId: 't1', workspace: '/f/implement' },
      review: { taskId: null },
      ship: { taskId: null },
    },
  };
  const review = stepNamed('review');
  const told = toldBy()(folderRun, review);
  assert.deepEqual(told, { words: undefined, say: undefined });
  const brief = composeBrief(review, folderRun, STEPS, () => undefined, '/art/review', ...NONE, undefined, told);
  assert.deepEqual(
    brief.split('\n').filter((line) => /\bgit\b/.test(line)),
    [],
  );
});
