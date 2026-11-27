/**
 * Runs that wait on runs, told as a person's stories on the stage (`story.ts`): a diamond `nemia start <folder>` starts, whose children
 * file once their parents succeed, each root handed `## From run <parent>`; a parent that will not succeed — cancelled, or failed —
 * until a person releases
 * its waiters, and the parents that release them all the same, merged or not; and context without a wait (`--from`). Beside them, what
 * `nemia
 * start --after` refuses of the store and git as they stand, what `nemia start <folder>` refuses before it starts anything, and a plan
 * stopped part-way by a start that dies, kept focused.
 *
 * What the waits mean is pure, in `src/wait/wait.test.ts` (readiness, the words, `afterRefusal`'s every reason); a card's format and
 * the plan's order in `src/plan/plan.test.ts`; the sections a root is handed in `src/brief/handed.test.ts`. A parent on another
 * repository is in `after-elsewhere.boundary.test.ts`, on real git.
 *
 * Every story starts its own runs and counts only its own: they share this file's store at `ROOT`, given as `ENV`.
 * `WF_VERIFY_REST=1` judges in full every run a pass answers from its memo of runs at rest.
 */
import { keysUnder, listRuns, plantRecord, runKey, runRecord, markCancelled } from '../testing.ts';
import { beforeAll, describe, test, vi, type TestContext } from 'vitest';
import { teardowns } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { RepositoryRun, Run } from '../src/run.ts';
import { scratch } from 'test-kit/scratch';
import { staged, story, type Board } from './story.ts';
import { decisionOn } from './screens.ts';
import { names, namesFor } from './assessed.ts';
import {
  advanceRun,
  cancelRun,
  decideRun,
  list,
  parentRead,
  PERSON,
  release,
  retryRun,
  sayRun,
  startPlan,
  planLines,
  startRun,
  runWith,
} from '../src/runner.ts';
import { stepsNow as stepsOf } from './steps-now.ts';
import { UnloadedFolder } from '../src/steps/steps.ts';
import { isRepositoryRun } from '../src/run.ts';

import { passStanding } from '../src/standing/standing.verb.ts';
import { engineOf } from '../src/runtime-client.ts';
import type { Env } from '../src/config/config.store.ts';
import { listedRow, stepRow, told } from './typed.ts';
import { shownNote, shownStatus, type Listing, type RunsListed } from '../src/list/list.ts';
import { waitAdvice } from '../src/wait/wait.ts';

const ROOT = scratch('wf-waiting-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
/** A command line as a person types it: a verb the client holds on its entry's handler, its lines said (`told`); else `main`. */
const stage = staged({ runWith, main: told, engineOf, env: ENV });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
/** `findings`, strict: what a declaring step's closeout carries. */
const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } },
        required: ['file', 'line', 'what'],
        additionalProperties: false,
      },
    },
  },
  required: ['findings'],
  additionalProperties: false,
};
const FOUND = [{ file: 'src/flag.ts', line: 12, what: 'the flag is read before it is parsed' }];

const world = () => stage.place().world;
const board = () => stage.board() satisfies Board;
/** One pass of the tick over the run `id`, on the stage's engine. */
const tick = (id: string) => stage.runWith(board().e, advanceRun(runRecord(ROOT, id)));
/** A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what `nemia ls` reads. */
const aPass = () => stage.runWith(board().e, passStanding(listRuns(ROOT)));
/** A run as one waiting on it reads it now: its record and where a wait on it stands. */
const parentNow = (id: string) => stage.runWith(board().e, parentRead(id));
/** Whether a wait on the run `id` is released now. */
const releasedNow = async (id: string) => (await parentNow(id)).standing.kind === 'released';
/** `nemia release <id>`, on the stage's engine. */
const releasing = (id: string) => stage.runWith(board().e, release(id));
const decided = async (id: string) => (await stage.runWith(board().e, decideRun(id))).decision;
const statuses = async (id: string) => (await stage.runWith(board().e, list(board().e, runRecord(ROOT, id)))).steps.map((s) => s.message);
/** The brief the engine was filed with for the task `id`. */
const briefOf = (id: string) => board().tasks.get(id)!.spec.brief;
/** The runs in the store, by their records (a run's own folder beside each): a refused start writes none. */
const runsWritten = () => keysUnder(ROOT, '/registry/runs/').length;

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  world().repository(repo, {});
  return repo;
};
/** A workflow folder: each step's frontmatter lines past `place: git`, and its files beside it. */
const folderOf = (steps: Record<string, string[]>, files: Record<string, string> = {}, dir = fs.mkdtempSync(path.join(ROOT, 'wf-'))) => {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, lines] of Object.entries(steps))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${['place: git', ...lines].join('\n')}\n---\n${name} it\n`);
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text);
  return dir;
};
/** A workflow of one step, `implement`: its branch is the run's result. */
const oneStep = () => folderOf({ implement: [] });
/** `implement`, then `review` after it. */
const twoSteps = () => folderOf({ implement: [], review: ['after: implement'] });
/** A run this file started on a repository: its repository and base branch are on its record. */
const repositoryRunOf = (run: Run) => {
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  return run satisfies RepositoryRun;
};
/** `nemia start`, as the runner starts it, over the stage's place. */
const started = async (opts: Parameters<typeof startRun>[0]) => repositoryRunOf(await stage.runPlaced(startRun(opts)));

/**
 * A run another will wait on, on the stage's board: started with worktrees, and its step filed. With `work`, a file committed on its
 * branch; with `signed` — by default, when there is work — its step signed off.
 */
const aParent = async (
  repo: string,
  {
    work,
    signed = Boolean(work),
    workflowDir,
    brief = 'the parent',
  }: { work?: string; signed?: boolean; workflowDir?: string; brief?: string } = {},
) => {
  const run = await started({ brief, repo, workflowDir: workflowDir ?? oneStep() });
  await tick(run.id);
  const wt = runRecord(ROOT, run.id).steps.implement.workspace!;
  if (work) {
    fs.writeFileSync(path.join(wt, work), `${work}\n`);
    world().commit(wt, `add ${work}`);
  }
  if (signed) board().settle(`${run.id}-implement`, 'succeeded', SIGNED);
  return { run, wt, branch: runRecord(ROOT, run.id).steps.implement.branch! };
};
/** `branch` merged into `repo`'s checkout and committed, as a person merges a result by hand. */
const mergedByHand = (repo: string, branch: string, message = `Merge ${branch}`) => {
  world().stage(repo, branch);
  world().commit(repo, message);
};
/** The workspace `wt` and the branch `branch` of `repo` taken away, as a person removes a worktree and deletes its branch. */
const droppedByHand = (repo: string, wt: string, branch: string) => {
  const outcome = stage.place().place.askNow('remove', { repo, workspaces: [wt], branches: [branch] });
  assert.deepEqual('answer' in outcome && [outcome.answer.removed, outcome.answer.deleted], [[wt], [branch]]);
};
/** Every commit `rev` follows in `root`, itself first. */
const commitsOf = (root: string, rev: string) => {
  const seen: string[] = [];
  const next = [world().tip(root, rev) ?? rev];
  while (next.length) {
    const at = next.shift()!;
    if (seen.includes(at)) continue;
    seen.push(at);
    next.push(...world().read(root, at).parents);
  }
  return seen satisfies string[];
};
/** How many commits `tip` holds in `root` that `base` does not. */
const ahead = (root: string, base: string, tip: string) => {
  const below = commitsOf(root, base);
  return commitsOf(root, tip).filter((id) => !below.includes(id)).length;
};
/** The JSON fenced under `heading` in a brief. */
const dataUnder = (brief: string, heading: string) =>
  JSON.parse(new RegExp(`${heading}\\n[\\s\\S]*?\\n\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``).exec(brief)![1]);
/** The `## From run <id>` section of a brief, to the next heading of its own level. */
const sectionOf = (brief: string, id: string) => {
  const at = brief.indexOf(`\n## From run ${id}\n`);
  assert.ok(at >= 0, `the brief hands ${id}: ${brief}`);
  const next = brief.indexOf('\n## ', at + 1);
  return brief.slice(at, next < 0 ? undefined : next);
};
/** What `console.log` printed while `run` ran, a line each. */
const printedBy = async (t: TestContext, run: () => Promise<unknown>) => {
  const out: string[] = [];
  const log = vi.spyOn(console, 'log');
  try {
    await run();
  } finally {
    out.push(...log.mock.calls.flatMap((args) => [args.map(String).join(' ')]));
    log.mockRestore();
  }
  return out.join('\n').split('\n');
};
/** `nemia ls <id>`: what it answers (`RunsListed`), run `id`'s row in it, and its listing (`listedRow`). */
const listedOf = async (id: string) => {
  const listed = (await stage.main(['ls', id])) as RunsListed;
  const listing = listedRow(listed, id);
  return { run: listed.runs.find((r) => r.run.id === id)!.run, listing } satisfies { run: Run; listing: Listing };
};
/** Step `name`'s row as `nemia ls` words it: its word, its cost, its branch and its note. */
const wordsOf = (listing: Listing, name: string) => {
  const row = stepRow(listing, name);
  return [shownStatus(row), row.cost, row.branch, shownNote(row)];
};
/** Refused by kind and exit 2, its message naming each of `facts`. */
const refusedNaming =
  (tag: string, ...facts: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) => {
    assert.equal(err._tag, tag, err.message);
    assert.equal(err.exitCode, 2, err.message);
    names(err.message, ...facts);
    return true;
  };

/** A card's text: its frontmatter keys, and its body. */
const cardText = (keys: string, body: string) => `---\n${keys}\n---\n${body}\n`;
/** A plan folder holding these files, by name — a function of the folder, so a card can name a workflow by a path from it. */
const aPlan = (files: (dir: string) => Record<string, string>) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'plan-'));
  for (const [file, text] of Object.entries(files(dir))) fs.writeFileSync(path.join(dir, file), text);
  return dir;
};

describe('a diamond plan: a, then b and c after it, then d after both — each files once its parents land, handed what they concluded', () => {
  let repo!: string;
  let dev!: string;
  let other!: string;
  beforeAll(() => {
    const t = teardowns();
    repo = aRepo();
    dev = folderOf(
      { implement: [], review: ['after: implement', 'output: review.schema.json'] },
      { 'review.schema.json': JSON.stringify(FINDINGS) },
      path.join(repo, 'workflows', 'dev'),
    );
    other = oneStep();
    return t.end;
  });
  const s = story(test);
  const ids: Record<string, string> = {};
  const lines: Record<string, { wt: string; branch: string }> = {};
  const line = (card: string) => {
    const r = runRecord(ROOT, ids[card]).steps.implement;
    lines[card] = { wt: r.workspace!, branch: r.branch! };
    return lines[card];
  };
  const record = (card: string) => runRecord(ROOT, ids[card]);
  const committed = (card: string, file: string) => {
    fs.writeFileSync(path.join(lines[card].wt, file), `${file}\n`);
    world().commit(lines[card].wt, `add ${file}`);
  };
  s.test(
    '`startPlan` of a folder starts four runs, parents first, each `after` the runs of the cards it names, and says a line per card',
    async () => {
      const plan = aPlan((dir) => ({
        'README.md': '# The flag\n\nParse it, then document and store it, then show it.\n',
        'd.md': cardText('workflow: dev\nafter: b, c', 'Show the flag on the settings page'),
        'c.md': cardText('workflow: dev\nafter: a', 'Store the flag'),
        'b.md': cardText(
          `# a workflow by a path from the plan folder\nworkflow: ${path.relative(dir, other)}\nafter: a`,
          'Document the flag',
        ),
        'a.md': cardText('workflow: dev', 'Parse the flag\n\nIn cli.ts, before anything reads it.'),
      }));
      const before = runsWritten();
      const printed = planLines((await stage.runPlaced(startPlan({ dir: plan, repo }))).started);
      assert.equal(runsWritten(), before + 4, 'four runs, and no file of the plan');
      Object.assign(ids, Object.fromEntries(printed.slice(0, 4).map((l) => l.split(/ +/).slice(0, 2))));
      assert.deepEqual(Object.keys(ids), ['a', 'b', 'c', 'd'], 'parents first');
      assert.deepEqual(
        ['a', 'b', 'c', 'd'].map((card) => record(card).after),
        [undefined, [ids.a], [ids.a], [ids.b, ids.c]],
        'the record `nemia start --after` writes, and nothing else',
      );
      assert.deepEqual(
        ['a', 'b', 'c', 'd'].map((card) => record(card).brief),
        [
          'Parse the flag\n\nIn cli.ts, before anything reads it.',
          'Document the flag',
          'Store the flag',
          'Show the flag on the settings page',
        ],
      );
      assert.deepEqual(
        ['a', 'b', 'c', 'd'].map((card) => record(card).workflowDir),
        [dev, other, dev, dev],
      );
      const [a, b, , d] = printed.map((l) => l.split(/ {2,}/));
      assert.deepEqual(a, ['a', ids.a, 'dev', 'waits on nothing']);
      assert.deepEqual(b, ['b', ids.b, path.relative(plan, other), `waits on a (${ids.a})`]);
      assert.deepEqual(d, ['d', ids.d, 'dev', `waits on b (${ids.b}), c (${ids.c})`]);
    },
  );
  s.test('`nemia ls` says D waits on B and C, and the tick does the waiting: a is filed, and nothing of b, c or d', async () => {
    await aPass();
    assert.deepEqual(await statuses(ids.d), [`waiting on ${ids.b}, ${ids.c}`, 'pending']);
    const { listing } = await listedOf(ids.d);
    assert.deepEqual(wordsOf(listing, 'implement'), [`waiting on ${ids.b}, ${ids.c}`, undefined, null, undefined]);
    assert.deepEqual((await tick(ids.a)).filed, ['implement']);
    assert.doesNotMatch(briefOf(`${ids.a}-implement`), /## From run/, 'a run without `after` is handed none');
    for (const card of ['b', 'c', 'd']) assert.deepEqual((await tick(ids[card])).filed, [], `${card} waits`);
  });
  s.test(
    'while a has not succeeded, b files nothing, pass after pass, and says `waiting on a` — and `nemia decide` offers nothing',
    async () => {
      line('a');
      committed('a', 'a.txt');
      board().settle(`${ids.a}-implement`, 'succeeded', SIGNED);
      assert.deepEqual((await tick(ids.a)).filed, ['review']);
      const filings = [...board().filings];
      for (let pass = 0; pass < 3; pass++) {
        const r = await tick(ids.b);
        assert.deepEqual(
          [r.filed, board().filings, r.waiting],
          [[], filings, [{ run: ids.a }]],
          `pass ${pass + 1}: on its branch, not succeeded`,
        );
      }
      assert.equal(await releasedNow(ids.a), false);
      await aPass();
      assert.deepEqual(await statuses(ids.b), [`waiting on ${ids.a}`]);
      const d = await stage.runWith(board().e, decideRun(ids.b));
      assert.deepEqual([d.waiting, d.offers, d.retrying, d.rounding], [[{ run: ids.a }], [], [], []]);
    },
  );
  s.test(
    'merged by a person while its review still runs, a is still running: its `nemia decide` says so, and so does the gate',
    async () => {
      mergedByHand(repo, lines.a.branch, 'Merge a');
      assert.equal((await decided(ids.a)).kind, 'running');
      assert.deepEqual((await tick(ids.b)).filed, []);
    },
  );
  s.test('a signs off: it has succeeded, and b and c file their roots from the base as it stands now, with what a committed', async () => {
    const startedOn = record('b').baseRef;
    const tip = world().head(repo);
    board().settle(`${ids.a}-review`, 'succeeded', { ...SIGNED, summary: 'A-SUMMARY: the flag is parsed first', findings: FOUND });
    await aPass();
    assert.deepEqual(await decided(ids.a), { kind: 'landed', branches: [lines.a.branch] });
    for (const card of ['b', 'c']) {
      const r = await tick(ids[card]);
      assert.deepEqual([r.filed, r.waiting], [['implement'], []], card);
      const now = runRecord(ROOT, ids[card]);
      assert.notEqual(startedOn, tip);
      assert.equal(now.baseRef, tip, `${card}: the base as it stands now, and not as it stood at \`nemia start <folder>\``);
      line(card);
      assert.equal(fs.readFileSync(path.join(lines[card].wt, 'a.txt'), 'utf8'), 'a.txt\n', `${card}'s worktree has a's work`);
      assert.equal(world().head(lines[card].wt), tip);
    }
  });
  s.test(
    "each root is handed `## From run <a>`: the first line of a's brief, its terminal step's summary and declared fields, as data",
    async () => {
      for (const card of ['b', 'c']) {
        const brief = briefOf(`${ids[card]}-implement`);
        const asked = brief.indexOf(`## What was asked for\n\n${record(card).brief}\n\n`);
        const from = brief.indexOf(`\n\n## From run ${ids.a}\n`);
        assert.ok(asked >= 0 && from > asked, brief);
        assert.equal(
          brief.slice(asked, from).includes('\n## '),
          false,
          'handed after what was asked for, and its folders, with no section between',
        );
        const fromA = sectionOf(brief, ids.a);
        assert.ok(fromA.includes('What it was asked, the first line:\n\n```text\nParse the flag\n```'), fromA);
        assert.ok(
          fromA.includes('What review said when it signed off, its `summary`:\n\n```text\nA-SUMMARY: the flag is parsed first\n```'),
          fromA,
        );
        assert.deepEqual(dataUnder(fromA, 'What review declared in its closeout — `findings`:'), { findings: FOUND });
      }
    },
  );
  s.test(
    'b finishes, is merged and its branch deleted while c still runs: b has succeeded whatever git holds, and d waits on c alone',
    async () => {
      committed('b', 'b.txt');
      board().settle(`${ids.b}-implement`, 'succeeded', SIGNED);
      assert.equal(record('b').tips, undefined, 'not recorded while it ran');
      await tick(ids.b);
      const tip = world().tip(repo, lines.b.branch);
      assert.deepEqual(record('b').tips, { [lines.b.branch]: tip }, 'its own pass, once it finished, records its result branch');
      mergedByHand(repo, lines.b.branch, 'Merge b');
      droppedByHand(repo, lines.b.wt, lines.b.branch);
      assert.deepEqual(await parentNow(ids.b), { record: record('b'), standing: { kind: 'released', by: 'succeeded' } }, 'git is not read');
      await aPass();
      assert.deepEqual(await decided(ids.b), { kind: 'landed', branches: [lines.b.branch] }, 'and its own `nemia decide` says so');
      assert.equal((await tick(ids.b)).run.tips?.[lines.b.branch], tip, 'a branch git no longer has keeps the tip last seen');
      const filings = [...board().filings];
      for (let pass = 0; pass < 2; pass++) {
        const r = await tick(ids.d);
        assert.deepEqual([r.filed, board().filings, r.waiting], [[], filings, [{ run: ids.c }]], `pass ${pass + 1}`);
      }
      await aPass();
      assert.deepEqual(await statuses(ids.d), [`waiting on ${ids.c}`, 'pending']);
    },
  );
  s.test("a's branch deleted after its merge: c, which has started, is never gated again — its review is filed", async () => {
    droppedByHand(repo, lines.a.wt, lines.a.branch);
    committed('c', 'c.txt');
    board().settle(`${ids.c}-implement`, 'succeeded', SIGNED);
    const next = await tick(ids.c);
    assert.deepEqual([next.filed, next.waiting], [['review'], []]);
    assert.doesNotMatch(briefOf(`${ids.c}-review`), /## From run/, 'only its roots are handed their parents');
  });
  s.test('c lands: d files its roots on the next pass, from a base with all three, handed b, which declares nothing, and c', async () => {
    board().settle(`${ids.c}-review`, 'succeeded', { ...SIGNED, summary: 'C-SUMMARY', findings: [] });
    mergedByHand(repo, lines.c.branch, 'Merge c');
    const r = await tick(ids.d);
    assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
    const wt = runRecord(ROOT, ids.d).steps.implement.workspace!;
    assert.deepEqual(
      ['a.txt', 'b.txt', 'c.txt'].map((f) => fs.existsSync(path.join(wt, f))),
      [true, true, true],
    );
    const brief = briefOf(`${ids.d}-implement`);
    const fromB = sectionOf(brief, ids.b);
    assert.ok(fromB.includes('What it was asked, the first line:\n\n```text\nDocument the flag\n```'), fromB);
    assert.ok(fromB.includes('What implement said when it signed off, its `summary`:\n\n```text\ndid it\n```'), fromB);
    assert.doesNotMatch(fromB, /declared in its closeout/, 'a step that declares nothing hands on its summary alone');
    assert.deepEqual(dataUnder(sectionOf(brief, ids.c), 'What review declared in its closeout — `findings`:'), { findings: [] });
    assert.ok(brief.indexOf(`## From run ${ids.b}\n`) < brief.indexOf(`## From run ${ids.c}\n`), 'in the order `after` names them');
  });
  s.test("d's step after its root is handed no parent", async () => {
    board().settle(`${ids.d}-implement`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(ids.d)).filed, ['review']);
    assert.doesNotMatch(briefOf(`${ids.d}-review`), /## From run/);
  });
});

describe('a parent that will not succeed — cancelled, failed, its frozen steps unread — waits on a person, and the parents that release their waiters all the same', () => {
  let repo!: string;
  beforeAll(() => {
    const t = teardowns();
    repo = aRepo();
    return t.end;
  });
  const s = story(test);
  s.test(
    'a run whose parent was cancelled files nothing, merged or not: its `nemia decide` says cancelled, and the wait is yours',
    async () => {
      const p = await aParent(repo, { work: 'parent.txt' });
      const child = await started({ brief: 'the child of a cancelled run', repo, workflowDir: twoSteps(), after: [p.run.id] });
      const at = markCancelled(ROOT, p.run.id);
      const filings = [...board().filings];
      for (let pass = 0; pass < 2; pass++) {
        const r = await tick(child.id);
        assert.deepEqual([r.filed, board().filings, r.waiting], [[], filings, [{ run: p.run.id, cancelledAt: at }]]);
      }
      mergedByHand(repo, p.branch, 'Merge the cancelled parent');
      assert.equal((await decided(p.run.id)).kind, 'cancelled');
      assert.deepEqual([(await tick(child.id)).filed, board().filings], [[], filings], 'and the gate says what it says');

      const ls = await listedOf(child.id);
      assert.deepEqual(wordsOf(ls.listing, 'implement'), [`waiting on ${p.run.id} (cancelled)`, undefined, null, undefined]);
      assert.deepEqual(wordsOf(ls.listing, 'review'), ['pending', undefined, null, undefined]);
      assert.deepEqual(ls.listing.waiting, [{ run: p.run.id, cancelledAt: at }], 'what waits on you: the parent cancelled');
      namesFor(
        '`nemia ls` says how to resolve it',
        waitAdvice(ls.run, ls.listing.waiting),
        `${p.run.id} was cancelled at ${at}`,
        `nemia cancel ${child.id}`,
        `nemia release ${p.run.id}`,
        `--after ${p.run.id}`,
      );
      const { decision } = await decisionOn(stage, child.id);
      assert.ok('waiting' in decision && !('holding' in decision), JSON.stringify(decision));
      assert.deepEqual([decision.waiting.word, decision.waiting.waitingOnYou], [`waiting on ${p.run.id} (cancelled)`, true]);
      namesFor(
        'and so does the decision',
        decision.waiting.advice,
        `${p.run.id} was cancelled at ${at}`,
        `nemia cancel ${child.id}`,
        `--after ${p.run.id}`,
      );

      assert.equal((await stage.runWith(board().e, cancelRun(child.id))).plan.kind, 'cancel');
      assert.deepEqual(await statuses(child.id), ['pending', 'pending'], 'a person resolves it: the child called off waits on nothing');
      assert.deepEqual([(await tick(child.id)).filed, board().filings], [[], filings]);
    },
  );
  s.test('a cancelled parent whose waiters a person released files its child on the next pass', async () => {
    const p = await aParent(repo, { work: 'released.txt' });
    const child = await started({ brief: 'the child of a released run', repo, workflowDir: twoSteps(), after: [p.run.id] });
    markCancelled(ROOT, p.run.id);
    assert.deepEqual((await tick(child.id)).filed, []);
    await releasing(p.run.id);
    const r = await tick(child.id);
    assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
  });
  s.test(
    'a one-step run whose step failed reads failed, and a run after it files nothing: the wait is yours, until it is retried or released',
    async () => {
      const p = await aParent(repo);
      board().settle(`${p.run.id}-implement`, 'failed');
      await tick(p.run.id);
      assert.equal(ahead(repo, p.run.baseRef, p.branch), 0, 'its own pass had nothing to hand off: nothing past its base');
      assert.ok(commitsOf(repo, p.run.branch).includes(world().tip(repo, p.branch)!), 'and so on the base branch, as its place reads it');
      const d = await decided(p.run.id);
      assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.failed, d.branches], ['failed', ['implement'], [p.branch]]);
      assert.deepEqual((await parentNow(p.run.id)).standing, { kind: 'yours', why: 'failed' });
      const child = await started({ brief: 'the child of a failure', repo, workflowDir: twoSteps(), after: [p.run.id] });
      for (let pass = 1; pass <= 3; pass++) {
        const r = await tick(child.id);
        assert.deepEqual([r.filed, r.waiting], [[], [{ run: p.run.id, failed: true }]], `pass ${pass}`);
      }
      await aPass();
      const { decision } = await decisionOn(stage, child.id);
      assert.ok('waiting' in decision, JSON.stringify(decision));
      assert.equal(decision.waiting.waitingOnYou, true);
      namesFor('the advice names the ways out', decision.waiting.advice, `nemia retry ${p.run.id}`, `nemia release ${p.run.id}`);
      mergedByHand(repo, p.branch, 'Merge the failed parent by hand');
      assert.deepEqual((await tick(child.id)).filed, [], 'a hand merge releases nothing: git is not read');
      await releasing(p.run.id);
      assert.deepEqual((await tick(child.id)).filed, ['implement'], 'once a person releases it');
    },
  );
  s.test('a parent whose step signs off with nothing to commit has succeeded, and its child files, merged or not', async () => {
    const p = await aParent(repo);
    const child = await started({ brief: 'the child of a change already made', repo, workflowDir: twoSteps(), after: [p.run.id] });
    assert.deepEqual((await tick(child.id)).filed, [], 'running, with nothing committed: not succeeded');
    assert.equal((await decided(p.run.id)).kind, 'running');
    board().settle(`${p.run.id}-implement`, 'succeeded', SIGNED);
    assert.equal(ahead(repo, p.run.baseRef, p.branch), 0);
    await aPass();
    assert.deepEqual(await decided(p.run.id), { kind: 'landed', branches: [p.branch] });
    assert.equal(await releasedNow(p.run.id), true, 'the wait is released by its success');
    const r = await tick(child.id);
    assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
  });
  s.test(
    'failed parents whose waiters a person released free their child, whatever the step said and merged or not — handed why their closeouts cannot be',
    async () => {
      const lost = await aParent(repo, { work: 'lost.txt', signed: false });
      board().settle(`${lost.run.id}-implement`, 'failed');
      const garbled = await aParent(repo, { work: 'garbled.txt', signed: false });
      board().settle(`${garbled.run.id}-implement`, 'failed', 'not json {');
      const before = await decided(lost.run.id);
      assert.equal(before.kind === 'awaiting' && before.outcome, 'failed', 'not merged yet: decided');
      for (const parent of [lost, garbled]) {
        mergedByHand(repo, parent.branch);
        await aPass();
        assert.deepEqual(await decided(parent.run.id), { kind: 'landed', branches: [parent.branch] });
        assert.equal(await releasedNow(parent.run.id), false, 'merged by hand, still failed: the wait is not released');
        await releasing(parent.run.id);
      }
      const child = await started({
        brief: 'the child of merged work',
        repo,
        workflowDir: twoSteps(),
        after: [lost.run.id, garbled.run.id],
      });
      const r = await tick(child.id);
      assert.deepEqual([r.filed, r.waiting], [['implement'], []], 'filed all the same');
      const brief = briefOf(`${child.id}-implement`);
      namesFor(
        'the lost closeout is said',
        sectionOf(brief, lost.run.id),
        'What implement said when it signed off cannot be given here',
        `the engine holds no closeout for its task ${lost.run.id}-implement, which is failed`,
      );
      namesFor(
        'and the one that does not parse',
        sectionOf(brief, garbled.run.id),
        'What implement said when it signed off cannot be given here',
        'its closeout cannot be read: unparseable',
      );
    },
  );
  s.test('a parent whose frozen steps cannot be read has not succeeded: its read answers so with why', async () => {
    const dir = oneStep();
    const p = await aParent(repo, { workflowDir: dir, signed: true });
    const readable = await parentNow(p.run.id);
    assert.equal(readable.standing.kind, 'released', 'signed off, with its steps readable, it has succeeded');
    const record = runRecord(ROOT, p.run.id);
    delete record.workflow;
    plantRecord(ROOT, runKey(record.id), JSON.stringify(record, null, 2));
    fs.rmSync(dir, { recursive: true });
    let why: string | undefined;
    assert.throws(
      () => stepsOf(runRecord(ROOT, p.run.id), ROOT),
      (err: unknown) => {
        why = err instanceof UnloadedFolder ? err.why : undefined;
        return err instanceof UnloadedFolder;
      },
      'its steps do not read',
    );
    assert.deepStrictEqual(await parentNow(p.run.id), {
      record: runRecord(ROOT, p.run.id),
      standing: { kind: 'waiting', on: 'unread' },
      unread: why,
    });
    assert.ok(why, 'the reason kept is the refusal’s own');
  });
});

describe('`nemia start --after` reads no branch: a parent whose branch is dropped, unmerged or never cut is waited on all the same, and a missing run is refused', () => {
  let repo!: string;
  beforeAll(() => {
    repo = aRepo();
  });
  test('REFUSED: a run the store does not have', async () => {
    const before = runsWritten();
    await assert.rejects(
      stage.runPlaced(startRun({ brief: 'another child', repo, workflowDir: twoSteps(), after: ['nobody-x9'] })),
      refusedNaming('Invalid', '--after nobody-x9:', 'no run nobody-x9', 'nemia ls'),
    );
    assert.equal(runsWritten(), before, 'nothing written');
  });
  test('REFUSED: `nemia release` of a run that is not there, of one that has succeeded, and a second release — nothing is written', async () => {
    await assert.rejects(releasing('nobody-x9'), refusedNaming('Missing', 'no such run: nobody-x9', 'nemia release <runId>'));
    const done = await aParent(repo, { work: 'done.txt' });
    await tick(done.run.id);
    await assert.rejects(releasing(done.run.id), refusedNaming('Conflict', `${done.run.id} has succeeded`));
    assert.equal(runRecord(ROOT, done.run.id).released, undefined);
    const failed = await aParent(repo, { signed: false });
    board().settle(`${failed.run.id}-implement`, 'failed');
    await tick(failed.run.id);
    await releasing(failed.run.id);
    await assert.rejects(releasing(failed.run.id), refusedNaming('Conflict', `${failed.run.id}'s waiters were released at`));
  });
  test('a parent that succeeded, its branch dropped unmerged, frees its child, which starts from the base as it is without the parent’s work', async () => {
    const p = await aParent(repo, { work: 'dropped.txt' });
    await tick(p.run.id);
    droppedByHand(repo, p.wt, p.branch);
    const child = await started({ brief: 'the child of dropped work', repo, workflowDir: twoSteps(), after: [p.run.id] });
    const r = await tick(child.id);
    assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
    assert.equal(
      fs.existsSync(path.join(runRecord(ROOT, child.id).steps.implement.workspace!, 'dropped.txt')),
      false,
      'the work was never merged',
    );
  });
  test('a parent that succeeded with its branch unmerged frees its child, which starts from the base branch as it is when its roots are filed', async () => {
    const p = await aParent(repo, { work: 'unmerged.txt' });
    const child = await started({ brief: 'the child of unmerged work', repo, workflowDir: twoSteps(), after: [p.run.id] });
    const tip = world().head(repo);
    const r = await tick(child.id);
    assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
    const wt = runRecord(ROOT, child.id).steps.implement.workspace!;
    assert.equal(world().head(wt), tip, 'cut at the base branch’s tip');
    assert.equal(fs.existsSync(path.join(wt, 'unmerged.txt')), false, 'without the parent’s commits');
  });
  test('a parent started with no worktree, so with no result branch, succeeds and frees its child all the same', async () => {
    const p = await started({ brief: 'the parent on the base itself', repo, workflowDir: oneStep(), isolate: false });
    await tick(p.id);
    assert.equal(
      runRecord(ROOT, p.id).steps.implement.branch,
      repositoryRunOf(runRecord(ROOT, p.id)).branch,
      'it works on the base itself: no branch of its own',
    );
    const child = await started({ brief: 'the child of a parent with no branch', repo, workflowDir: twoSteps(), after: [p.id] });
    assert.deepEqual((await tick(child.id)).filed, [], 'the parent has not succeeded');
    board().settle(`${p.id}-implement`, 'succeeded', SIGNED);
    await tick(p.id);
    assert.equal(await releasedNow(p.id), true);
    assert.deepEqual((await tick(child.id)).filed, ['implement'], 'it needs no branch to release its waiter');
  });
  test('a hold until a run that succeeds lifts, and a hold until a failed one waits on you until that run is released', async () => {
    const ok = await aParent(repo, { signed: false });
    const failed = await aParent(repo, { signed: false });
    board().settle(`${failed.run.id}-implement`, 'failed');
    await tick(failed.run.id);
    const held = await started({ brief: 'held on two', repo, workflowDir: oneStep() });
    await stage.main(['hold', held.id, '--until', ok.run.id, '--until', failed.run.id]);
    assert.deepEqual((await tick(held.id)).filed, [], 'neither has succeeded');
    board().settle(`${ok.run.id}-implement`, 'succeeded', SIGNED);
    await tick(ok.run.id);
    assert.deepEqual((await tick(held.id)).filed, [], 'one has succeeded, the other failed: still held');
    await releasing(failed.run.id);
    assert.deepEqual((await tick(held.id)).filed, ['implement'], 'both released: the hold lifts, and the run goes on');
  });
});

describe('context without a wait: a run handed another with `--from` files at once, told what it reads has not succeeded, and `nemia concluded` prints it', () => {
  let repo!: string;
  beforeAll(() => {
    const t = teardowns();
    repo = aRepo();
    return t.end;
  });
  const s = story(test);
  let source = { run: { id: '' } as RepositoryRun, wt: '', branch: '' };
  s.test(
    'a run handed only a run still in flight files its roots on the first pass, the source handed as not succeeded, not judged',
    async () => {
      source = await aParent(repo, { work: 'source.txt', signed: false });
      const child = await started({ brief: 'Read what the source has', repo, workflowDir: twoSteps(), context: [source.run.id] });
      assert.deepEqual(runRecord(ROOT, child.id).context, [source.run.id], 'frozen on the record');
      const r = await tick(child.id);
      assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
      const section = sectionOf(briefOf(`${child.id}-implement`), source.run.id);
      assert.match(section, /as context \(`--from`\); it did not wait on it/);
      assert.match(section, new RegExp(`Not succeeded, not judged: ${source.run.id} was still in flight`));
    },
  );
  s.test('`nemia concluded` prints the section the tick hands a run started with `--from` — the very one', async () => {
    const { section: concluded } = (await stage.main(['concluded', source.run.id])) as { section: string };
    const printed = [concluded.replace(/^\n+/, '').replace(/\n+$/, '')];
    const child = await started({ brief: 'Read what the source has, again', repo, workflowDir: twoSteps(), context: [source.run.id] });
    await tick(child.id);
    const brief = briefOf(`${child.id}-implement`);
    const at = brief.indexOf(`\n## From run ${source.run.id}\n`);
    const section = brief.slice(at, brief.indexOf('\n## Files for the steps after you\n', at));
    assert.equal(printed.join('\n'), section.replace(/^\n+/, '').replace(/\n+$/, ''));
  });
  s.test('REFUSED: `nemia concluded` of a run the store does not have', async () => {
    await assert.rejects(stage.main(['concluded', 'nobody-z9']), (err: Error & { exitCode?: number }) => {
      assert.equal(err.exitCode, 2, err.message);
      names(err.message, 'nemia concluded nobody-z9', 'no run nobody-z9');
      return true;
    });
  });
  s.test('a run after one run and handed another waits for the first alone, handed it in `--after` words before the other', async () => {
    const waited = await aParent(repo, { work: 'waited.txt', signed: false });
    const child = await started({ brief: 'the child', repo, workflowDir: twoSteps(), after: [waited.run.id], context: [source.run.id] });
    const before = await tick(child.id);
    assert.deepEqual(
      [before.filed, before.waiting],
      [[], [{ run: waited.run.id }]],
      'waiting on the run it waits on, never the one it reads',
    );
    board().settle(`${waited.run.id}-implement`, 'succeeded', SIGNED);
    const r = await tick(child.id);
    assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
    const brief = briefOf(`${child.id}-implement`);
    const waitedAt = brief.indexOf(`\n## From run ${waited.run.id}\n`);
    const readAt = brief.indexOf(`\n## From run ${source.run.id}\n`);
    assert.ok(waitedAt > 0 && readAt > waitedAt, brief);
    assert.match(brief.slice(waitedAt, readAt), /waited on .* \(`--after`\) and started once it succeeded/);
    assert.match(brief.slice(readAt), /as context \(`--from`\).*\n.*\nNot succeeded, not judged/);
  });
});

describe('words said to a step of a run waiting on another are kept, and its first try alone is handed them, with who said them and when', () => {
  let repo!: string;
  let parent!: Awaited<ReturnType<typeof aParent>>;
  let child!: Awaited<ReturnType<typeof started>>;
  let implement!: string;
  beforeAll(async () => {
    const t = teardowns();
    repo = aRepo();
    parent = await aParent(repo, { work: 'parent.txt', signed: false });
    child = await started({ brief: 'Page the reads', repo, workflowDir: twoSteps(), after: [parent.run.id] });
    implement = `${child.id}-implement`;
    return t.end;
  });
  const s = story(test);
  const person = 'We should use cursor pagination as much as we can.';
  const agent = 'Keep the old offset reads for a release.';
  const kept: string[] = [];
  s.test('the run waits on its parent: nothing of it is filed', async () => {
    const r = await tick(child.id);
    assert.deepEqual([r.filed, r.waiting], [[], [{ run: parent.run.id }]]);
  });
  s.test(
    "`nemia say` to its step keeps the words, a person's and an agent's under its name, and says they were kept, not delivered",
    async () => {
      const told = await stage.runWith(board().e, sayRun(child.id, 'implement', person, { caller: PERSON }));
      assert.ok('kept' in told, 'kept, not said to a session');
      assert.deepEqual([told.try, told.kept.text, told.from], [1, person, { kind: 'person' }]);
      kept.push(told.kept.at);
      const again = await stage.runWith(board().e, sayRun(child.id, 'implement', 'Mind the cursor format.', { caller: PERSON }));
      assert.ok('kept' in again, 'kept for its first try, not delivered');
      const byAgent = await stage.runWith(
        board().e,
        sayRun(child.id, 'implement', agent, { caller: { kind: 'agent', agent: 'operator', factory: null } }),
      );
      assert.ok('kept' in byAgent);
      assert.deepEqual(byAgent.from, { kind: 'agent', name: 'operator' });
      kept.push(byAgent.kept.at);
      assert.deepEqual(board().said, [], 'no session was told anything');
      assert.deepEqual(Object.keys(runRecord(ROOT, child.id).saidBefore ?? {}), ['implement'], 'composed onto the run read');
    },
  );
  s.test('`nemia ls` notes the step said to before it ran', async () => {
    const listed = await stage.runWith(board().e, list(board().e, runRecord(ROOT, child.id)));
    assert.match(listed.steps[0].note ?? '', /said to 3× before it ran/);
  });
  s.test(
    "once the parent succeeds the step is filed, and its first try's brief holds the words beside what was asked for, each with its time and who said it",
    async () => {
      board().settle(`${parent.run.id}-implement`, 'succeeded', SIGNED);
      const r = await tick(child.id);
      assert.deepEqual(r.filed, ['implement']);
      const brief = briefOf(implement);
      const asked = brief.indexOf('## What was asked for\n\nPage the reads');
      const at = brief.indexOf('\n## Said before you started\n');
      const from = brief.indexOf(`\n## From run ${parent.run.id}\n`);
      assert.ok(asked > 0 && at > asked && from > at, brief);
      const section = brief.slice(at, from);
      assert.ok(section.includes(`At ${kept[0]}:\n\n\`\`\`text\n${person}\n\`\`\``), section);
      assert.ok(section.includes('Mind the cursor format.'), section);
      assert.ok(section.includes(`At ${kept[1]}:\n\n\`\`\`text\nThe agent operator writes, not the person: ${agent}\n\`\`\``), section);
      assert.match(section, /words in no frame are a person's/);
    },
  );
  s.test('a later try that starts a new session is not handed them again', async () => {
    board().settle(implement, 'succeeded', { outcome: 'blocked', summary: 's', artifacts: [], needs: 'which?' });
    await tick(child.id);
    await stage.runWith(board().e, retryRun(child.id, 'implement', { mode: 'fresh' }));
    assert.deepEqual((await tick(child.id)).tried, ['implement']);
    const again = briefOf(`${implement}-try2`);
    assert.doesNotMatch(again, /Said before you started|cursor pagination|cursor format|offset reads/);
    const listed = await stage.runWith(board().e, list(board().e, runRecord(ROOT, child.id)));
    assert.doesNotMatch(listed.steps[0].note ?? '', /before it ran/);
  });
});

describe('REFUSED by name at shipped defaults: `startPlan` starts nothing on a folder it cannot start whole', () => {
  let repo!: string;
  beforeAll(() => {
    repo = aRepo();
  });
  const first = oneStep();
  const broken = folderOf({ implement: ['afer: plan'] });
  const plan = aPlan(() => ({ 'a.md': cardText(`workflow: ${first}`, 'the first card') }));
  const empty = aPlan(() => ({ 'README.md': '# Nothing yet\n' }));
  const planned = (dir: string, repoOf: string) => stage.runPlaced(startPlan({ dir, repo: repoOf }));
  const cards = (files: Record<string, string>) => {
    for (const f of fs.readdirSync(plan)) if (f !== 'a.md') fs.rmSync(path.join(plan, f), { recursive: true });
    for (const [file, text] of Object.entries(files)) {
      if (file.endsWith('/')) fs.mkdirSync(path.join(plan, file));
      else fs.writeFileSync(path.join(plan, file), text);
    }
  };
  const rows: Array<[string, () => [Record<string, string>, string[], string, string[]]]> = [
    [
      "a second card's workflow that does not load: the workflow's own refusal, behind the card",
      () => [
        { 'b.md': cardText(`workflow: ${broken}\nafter: a`, 'the second card') },
        [plan, '--repo', repo],
        'Invalid',
        ['b.md:', `workflow: ${broken}`, 'implement:', '`afer`'],
      ],
    ],
    [
      'a workflow that is not there, naming both places',
      () => [
        { 'b.md': cardText('workflow: nope\nafter: a', 'the second card') },
        [plan, '--repo', repo],
        'Invalid',
        ['b.md:', 'workflow: nope', path.join(plan, 'nope'), path.join(repo, 'workflows')],
      ],
    ],
    [
      'a cycle',
      () => [
        { 'b.md': cardText(`workflow: ${first}\nafter: c`, 'b'), 'c.md': cardText(`workflow: ${first}\nafter: b`, 'c') },
        [plan, '--repo', repo],
        'Invalid',
        ['b.md, c.md wait on each other', 'b after c, c after b', '`after:`'],
      ],
    ],
    ['a folder inside the plan', () => [{ 'drafts/': '' }, [plan, '--repo', repo], 'Invalid', ['drafts/', plan, 'not a card']]],
    ['a folder with no card', () => [{}, [empty, '--repo', repo], 'Invalid', [empty, 'no cards', 'README.md']]],
  ];
  for (const [what, later] of rows) {
    test(what, async () => {
      const [files, argv, tag, facts] = later();
      cards(files);
      const before = runsWritten();
      await assert.rejects(planned(argv[0] ?? '', argv[2] ?? ''), refusedNaming(tag, ...facts));
      assert.equal(runsWritten(), before, 'not even the first card');
    });
  }
});

describe('a brief of one word with a slash in it that reads as no path, a link or a branch, starts a run of its words', () => {
  let repo!: string;
  let flow!: string;
  beforeAll(() => {
    repo = aRepo();
    flow = oneStep();
  });
  for (const brief of ['https://github.com/o/r/issues/12', 'fix/login'])
    test(brief, async (t) => {
      const before = runsWritten();
      await printedBy(t, () => stage.main(['start', brief, '--workflows', flow, '--repo', repo]));
      assert.equal(runsWritten(), before + 1, 'one run started');
    });
});

test('a `start()` that refuses part-way stops the plan: the runs already started stand, with their edges, and it says which card refused and which are left', async () => {
  const repo = aRepo();
  const flow = oneStep();
  const plan = aPlan(() => ({
    'a.md': cardText(`workflow: ${flow}`, 'the root'),
    'b.md': cardText(`workflow: ${flow}\nafter: a`, 'the left'),
    'c.md': cardText(`workflow: ${flow}\nafter: a`, 'the right'),
    'd.md': cardText(`workflow: ${flow}\nafter: b, c`, 'the join'),
  }));
  const before = runsWritten();
  let calls = 0;
  const start: typeof startRun = (opts) => {
    if (++calls === 3) return Effect.die(Object.assign(new Error('the disk is full'), { exitCode: 1 }));
    return startRun(opts);
  };
  const { started: stood, stopped, folderOf: folderOfCard } = await stage.runPlaced(startPlan({ dir: plan, repo, start }));
  assert.deepEqual(
    [stood.map((p) => p.card.name), stopped?.card.name, stopped?.error.message, stopped?.rest.map((c) => c.name)],
    [['a', 'b'], 'c', 'the disk is full', ['d']],
  );
  assert.equal(runsWritten(), before + 2, 'the runs it started stand');
  assert.deepEqual(
    stood.map((p) => runRecord(ROOT, p.runId).after),
    [undefined, [stood[0].runId]],
  );
  assert.equal(folderOfCard(stopped!.card), flow);
});

test('a parent whose script condition answered a route no pass has copied yet has not succeeded: what waits on it still waits', async () => {
  const b = board();
  const dir = folderOf(
    {
      implement: [],
      pick: ['routes: [web, docs]', 'route: { script: pick.ts }'],
      web: ['after: pick', 'when: [web]'],
      docs: ['after: pick', 'when: [docs]'],
    },
    { 'pick.ts': "console.log('never run on the test engine');\n" },
  );
  const repo = aRepo();
  const { id } = await stage.runPlaced(startRun({ brief: 'route it', repo, workflowDir: dir }));
  await tick(id);
  const wt = runRecord(ROOT, id).steps.implement.workspace!;
  fs.writeFileSync(path.join(wt, 'page.ts'), 'export const page = true;\n');
  world().commit(wt, 'add a page');
  b.settle(`${id}-implement`, 'succeeded', SIGNED);
  await tick(id);
  world().stage(repo, runRecord(ROOT, id).steps.implement.branch!);
  world().commit(repo, 'merge');
  b.end(`${id}-pick`, 'succeeded', { exitCode: 0, terminationMessage: '{"route":"web"}' });
  assert.equal(runRecord(ROOT, id).steps.pick?.route, undefined, 'no pass has copied the route onto the record');
  assert.equal(await releasedNow(id), false);
});
