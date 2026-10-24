/**
 * Runs that wait on runs, told as a person's stories on the stage (`story.ts`): a diamond `nemia start <folder>` starts, whose children
 * file once their parents land, each root handed `## From run <parent>`; a parent that will not land — cancelled, failed with nothing
 * committed, its branch gone — and the parents that land all the same; and context without a wait (`--from`). Beside them, what `nemia
 * start --after` refuses of the store and git as they stand, what `nemia start <folder>` refuses before it starts anything, and a plan
 * stopped part-way by a start that dies, kept focused.
 *
 * What the waits mean is pure, in `src/wait/wait.test.ts` (readiness, the words, `afterRefusal`'s every reason); a card's format and
 * the plan's order in `src/plan/plan.test.ts`; the sections a root is handed in `src/brief/handed.test.ts`. A parent on another
 * repository whose branch git alone can say is gone is in `after-elsewhere.boundary.test.ts`, on real git.
 *
 * Every story starts its own runs and counts only its own: they share this file's `WF_ROOT`, which is set before the runner is imported,
 * as it is read as the module loads. `WF_VERIFY_REST=1` judges in full every run a pass answers from its memo of runs at rest.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { RepositoryRun, Run } from '../src/run.ts';
import type { BranchReader } from '../src/branches/branches.store.ts';
import { scratch } from './scratch.ts';
import { staged, story, type Board } from './story.ts';
import { names, namesFor } from './assessed.ts';

const ROOT = scratch('wf-waiting-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, cancelRun, decideRun, list, parentRead, standingLiveOf, startPlan, startRun, stepsOf, runWith } =
  await import('../src/runner.ts');
const { isRepositoryRun } = await import('../src/run.ts');
const { listRuns, markCancelled, readRun } = await import('../src/record/record.store.ts');
const { passStanding } = await import('../src/standing/standing.verb.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

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
const board = (): Board => stage.board();
/** One pass of the tick over the run `id`, on the stage's engine. */
const tick = (id: string) => stage.runWith(board().e, advanceRun(readRun(id)));
/** A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what `nemia ls` reads. */
const aPass = () => stage.runWith(board().e, passStanding(listRuns()));
/** A run as one waiting on it reads it, where its branches stand asked now, as a person's verb asks them (`standingLiveOf`). */
const parentNow = (id: string) => stage.runWith(board().e, standingLiveOf([id]).pipe(Effect.flatMap((git) => parentRead(id, git))));
const decided = async (id: string) => (await stage.runWith(board().e, decideRun(id))).decision;
const statuses = async (id: string) => (await stage.runWith(board().e, list(board().e, readRun(id)))).steps.map((s) => s.status);
/** The brief the engine was filed with for the task `id`. */
const briefOf = (id: string): string => board().tasks.get(id)!.spec.brief;
/** The runs in the store, by their files: a refused start writes none. */
const runsWritten = () => fs.readdirSync(path.join(ROOT, 'runs')).length;

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
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
const repositoryRunOf = (run: Run): RepositoryRun => {
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  return run;
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
  const wt = readRun(run.id).steps.implement.workspace!;
  if (work) {
    fs.writeFileSync(path.join(wt, work), `${work}\n`);
    world().commit(wt, `add ${work}`);
  }
  if (signed) board().settle(`${run.id}-implement`, 'succeeded', SIGNED);
  return { run, wt, branch: readRun(run.id).steps.implement.branch! };
};
/** `branch` merged into `repo`'s checkout and committed, as a person merges a result by hand. */
const mergedByHand = (repo: string, branch: string, message = `Merge ${branch}`): void => {
  world().stage(repo, branch);
  world().commit(repo, message);
};
/** The workspace `wt` and the branch `branch` of `repo` taken away, as a person removes a worktree and deletes its branch. */
const droppedByHand = (repo: string, wt: string, branch: string): void => {
  const outcome = stage.place().place.askNow('remove', { repo, workspaces: [wt], branches: [branch] });
  assert.deepEqual('answer' in outcome && [outcome.answer.removed, outcome.answer.deleted], [[wt], [branch]]);
};
/** Every commit `rev` follows in `root`, itself first. */
const commitsOf = (root: string, rev: string): string[] => {
  const seen: string[] = [];
  const next = [world().tip(root, rev) ?? rev];
  while (next.length) {
    const at = next.shift()!;
    if (seen.includes(at)) continue;
    seen.push(at);
    next.push(...world().read(root, at).parents);
  }
  return seen;
};
/** How many commits `tip` holds in `root` that `base` does not. */
const ahead = (root: string, base: string, tip: string): number => {
  const below = commitsOf(root, base);
  return commitsOf(root, tip).filter((id) => !below.includes(id)).length;
};
/** The JSON fenced under `heading` in a brief. */
const dataUnder = (brief: string, heading: string) =>
  JSON.parse(new RegExp(`${heading}\\n[\\s\\S]*?\\n\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``).exec(brief)![1]);
/** The `## From run <id>` section of a brief, to the next heading of its own level. */
const sectionOf = (brief: string, id: string): string => {
  const at = brief.indexOf(`\n## From run ${id}\n`);
  assert.ok(at >= 0, `the brief hands ${id}: ${brief}`);
  const next = brief.indexOf('\n## ', at + 1);
  return brief.slice(at, next < 0 ? undefined : next);
};
/** What `console.log` printed while `run` ran, a line each. */
const printedBy = async (t: TestContext, run: () => Promise<unknown>): Promise<string[]> => {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    out.push(args.map(String).join(' '));
  });
  try {
    await run();
  } finally {
    log.mock.restore();
  }
  return out.join('\n').split('\n');
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
const aPlan = (files: (dir: string) => Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'plan-'));
  for (const [file, text] of Object.entries(files(dir))) fs.writeFileSync(path.join(dir, file), text);
  return dir;
};

test('a diamond plan: a, then b and c after it, then d after both — each files once its parents land, handed what they concluded', async (t) => {
  const s = story(t);
  const repo = aRepo();
  const dev = folderOf(
    { implement: [], review: ['after: implement', 'output: review.schema.json'] },
    { 'review.schema.json': JSON.stringify(FINDINGS) },
    path.join(repo, 'workflows', 'dev'),
  );
  const other = oneStep();
  const ids: Record<string, string> = {};
  const lines: Record<string, { wt: string; branch: string }> = {};
  const line = (card: string) => {
    const r = readRun(ids[card]).steps.implement;
    lines[card] = { wt: r.workspace!, branch: r.branch! };
    return lines[card];
  };
  const record = (card: string) => readRun(ids[card]);
  const committed = (card: string, file: string) => {
    fs.writeFileSync(path.join(lines[card].wt, file), `${file}\n`);
    world().commit(lines[card].wt, `add ${file}`);
  };

  await s.test(
    '`nemia start <folder>` starts four runs, parents first, each `after` the runs of the cards it names, and prints a line per card',
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
      const printed = await printedBy(t, () => stage.main(['start', plan, '--repo', repo]));
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
      assert.deepEqual(printed.slice(4), ["run 'nemia tick' (or 'nemia up') to start them"]);
    },
  );
  await s.test('`nemia ls` says D waits on B and C, and the tick does the waiting: a is filed, and nothing of b, c or d', async () => {
    await aPass();
    assert.deepEqual(await statuses(ids.d), [`waiting on ${ids.b}, ${ids.c}`, 'waiting']);
    const ls = await printedBy(t, () => stage.main(['ls', ids.d]));
    assert.ok(
      ls.some((l) => /^ {3}implement +/.test(l) && l.trim().endsWith(`waiting on ${ids.b}, ${ids.c}`)),
      ls.join('\n'),
    );
    assert.deepEqual((await tick(ids.a)).filed, ['implement']);
    assert.doesNotMatch(briefOf(`${ids.a}-implement`), /## From run/, 'a run without `after` is handed none');
    for (const card of ['b', 'c', 'd']) assert.deepEqual((await tick(ids[card])).filed, [], `${card} waits`);
  });
  await s.test(
    'while a is not landed, b files nothing, pass after pass, and says `waiting on a` — and `nemia decide` offers nothing',
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
          `pass ${pass + 1}: on its branch, not landed`,
        );
      }
      assert.equal((await parentNow(ids.a)).landed, false);
      await aPass();
      assert.deepEqual(await statuses(ids.b), [`waiting on ${ids.a}`]);
      const d = await stage.runWith(board().e, decideRun(ids.b));
      assert.deepEqual([d.waiting, d.offers, d.retrying, d.rounding], [[{ run: ids.a }], [], [], []]);
    },
  );
  await s.test(
    'merged by a person while its review still runs, a is still running: its `nemia decide` says so, and so does the gate',
    async () => {
      mergedByHand(repo, lines.a.branch, 'Merge a');
      assert.equal((await decided(ids.a)).kind, 'running');
      assert.deepEqual((await tick(ids.b)).filed, []);
    },
  );
  await s.test(
    'a signs off: it has landed, and b and c file their roots from the base as it stands now, with what a committed',
    async () => {
      const startedOn = record('b').baseRef;
      const tip = world().head(repo);
      board().settle(`${ids.a}-review`, 'succeeded', { ...SIGNED, summary: 'A-SUMMARY: the flag is parsed first', findings: FOUND });
      assert.deepEqual(await decided(ids.a), { kind: 'landed', branches: [lines.a.branch] });
      for (const card of ['b', 'c']) {
        const r = await tick(ids[card]);
        assert.deepEqual([r.filed, r.waiting], [['implement'], []], card);
        const now = readRun(ids[card]);
        assert.notEqual(startedOn, tip);
        assert.equal(now.baseRef, tip, `${card}: the base as it stands now, and not as it stood at \`nemia start <folder>\``);
        line(card);
        assert.equal(fs.readFileSync(path.join(lines[card].wt, 'a.txt'), 'utf8'), 'a.txt\n', `${card}'s worktree has a's work`);
        assert.equal(world().head(lines[card].wt), tip);
      }
    },
  );
  await s.test(
    "each root is handed `## From run <a>`: the first line of a's brief, its terminal step's summary and declared fields, as data",
    async () => {
      for (const card of ['b', 'c']) {
        const brief = briefOf(`${ids[card]}-implement`);
        assert.ok(brief.includes(`## What was asked for\n\n${record(card).brief}\n\n## From run ${ids.a}\n`), brief);
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
  await s.test(
    'b finishes, is merged and its branch deleted while c still runs: b lands by the tip its own pass recorded, and d waits on c alone',
    async () => {
      committed('b', 'b.txt');
      board().settle(`${ids.b}-implement`, 'succeeded', SIGNED);
      assert.equal(record('b').tips, undefined, 'not recorded while it ran');
      await tick(ids.b);
      const tip = world().tip(repo, lines.b.branch);
      assert.deepEqual(record('b').tips, { [lines.b.branch]: tip }, 'its own pass, once it finished, records its result branch');
      mergedByHand(repo, lines.b.branch, 'Merge b');
      droppedByHand(repo, lines.b.wt, lines.b.branch);
      assert.deepEqual(await parentNow(ids.b), { record: record('b'), landed: true }, 'the merge stays, the branch goes');
      assert.deepEqual(await decided(ids.b), { kind: 'landed', branches: [lines.b.branch] }, 'and its own `nemia decide` says so');
      assert.equal((await tick(ids.b)).run.tips?.[lines.b.branch], tip, 'a branch git no longer has keeps the tip last seen');
      const filings = [...board().filings];
      for (let pass = 0; pass < 2; pass++) {
        const r = await tick(ids.d);
        assert.deepEqual([r.filed, board().filings, r.waiting], [[], filings, [{ run: ids.c }]], `pass ${pass + 1}`);
      }
      await aPass();
      assert.deepEqual(await statuses(ids.d), [`waiting on ${ids.c}`, 'waiting']);
    },
  );
  await s.test("a's branch deleted after its merge: c, which has started, is never gated again — its review is filed", async () => {
    droppedByHand(repo, lines.a.wt, lines.a.branch);
    committed('c', 'c.txt');
    board().settle(`${ids.c}-implement`, 'succeeded', SIGNED);
    const next = await tick(ids.c);
    assert.deepEqual([next.filed, next.waiting], [['review'], []]);
    assert.doesNotMatch(briefOf(`${ids.c}-review`), /## From run/, 'only its roots are handed their parents');
  });
  await s.test(
    'c lands: d files its roots on the next pass, from a base with all three, handed b, which declares nothing, and c',
    async () => {
      board().settle(`${ids.c}-review`, 'succeeded', { ...SIGNED, summary: 'C-SUMMARY', findings: [] });
      mergedByHand(repo, lines.c.branch, 'Merge c');
      const r = await tick(ids.d);
      assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
      const wt = readRun(ids.d).steps.implement.workspace!;
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
    },
  );
  await s.test("d's step after its root is handed no parent", async () => {
    board().settle(`${ids.d}-implement`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(ids.d)).filed, ['review']);
    assert.doesNotMatch(briefOf(`${ids.d}-review`), /## From run/);
  });
});

test('a parent that will not land — cancelled, failed with nothing committed, its frozen steps unread — and the parents that land all the same', async (t) => {
  const s = story(t);
  const repo = aRepo();
  await s.test(
    'a run whose parent was cancelled files nothing, merged or not: its `nemia decide` says cancelled, never landed',
    async () => {
      const p = await aParent(repo, { work: 'parent.txt' });
      const child = await started({ brief: 'the child of a cancelled run', repo, workflowDir: twoSteps(), after: [p.run.id] });
      const at = markCancelled(p.run.id);
      const filings = [...board().filings];
      for (let pass = 0; pass < 2; pass++) {
        const r = await tick(child.id);
        assert.deepEqual([r.filed, board().filings, r.waiting], [[], filings, [{ run: p.run.id, cancelledAt: at }]]);
      }
      mergedByHand(repo, p.branch, 'Merge the cancelled parent');
      assert.equal((await decided(p.run.id)).kind, 'cancelled');
      assert.deepEqual([(await tick(child.id)).filed, board().filings], [[], filings], 'and the gate says what it says');

      const ls = (await printedBy(t, () => stage.main(['ls', child.id]))).join('\n');
      assert.match(ls, new RegExp(`^ {3}implement +waiting on ${p.run.id} \\(cancelled\\) *$`, 'm'));
      assert.match(ls, /^ {3}review +waiting *$/m);
      const onYou = ls.split('\n').find((l) => l.includes('→ waiting on you: '));
      namesFor(
        '`nemia ls` says how to resolve it',
        onYou,
        `${p.run.id} was cancelled at ${at}`,
        `nemia cancel ${child.id}`,
        `--after ${p.run.id}`,
      );
      const screen = (await printedBy(t, () => stage.main(['decide', child.id]))).slice(1);
      assert.deepEqual(screen.slice(0, 2), ['', `  waiting on ${p.run.id} (cancelled)`]);
      namesFor(
        'and so does `nemia decide`',
        screen[2],
        `${p.run.id} was cancelled at ${at}`,
        `nemia cancel ${child.id}`,
        `--after ${p.run.id}`,
      );
      assert.equal(screen.length, 3);

      assert.equal((await stage.runWith(board().e, cancelRun(child.id))).plan.kind, 'cancel');
      assert.deepEqual(await statuses(child.id), ['waiting', 'waiting'], 'a person resolves it: the child called off waits on nothing');
      assert.deepEqual([(await tick(child.id)).filed, board().filings], [[], filings]);
    },
  );
  await s.test(
    'a one-step run whose step failed with nothing committed reads failed, not landed, and a run after it files nothing',
    async () => {
      const p = await aParent(repo);
      board().settle(`${p.run.id}-implement`, 'failed');
      await tick(p.run.id);
      assert.equal(ahead(repo, p.run.baseRef, p.branch), 0, 'its own pass had nothing to hand off: nothing past its base');
      assert.ok(commitsOf(repo, p.run.branch).includes(world().tip(repo, p.branch)!), 'and so on the base branch, as its place reads it');
      const d = await decided(p.run.id);
      assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.failed, d.branches], ['failed', ['implement'], [p.branch]]);
      assert.equal((await parentNow(p.run.id)).landed, false);
      const child = await started({ brief: 'the child of a failure', repo, workflowDir: twoSteps(), after: [p.run.id] });
      for (let pass = 0; pass < 3; pass++) {
        const r = await tick(child.id);
        assert.deepEqual([r.filed, r.waiting], [[], [{ run: p.run.id }]], `pass ${pass + 1}`);
      }
    },
  );
  await s.test(
    'a parent whose step signs off with nothing to commit has landed, as its own `nemia decide` says, and its child files',
    async () => {
      const p = await aParent(repo);
      const child = await started({ brief: 'the child of a change already made', repo, workflowDir: twoSteps(), after: [p.run.id] });
      assert.deepEqual((await tick(child.id)).filed, [], 'running, with nothing committed: on the base since it was cut, not landed');
      assert.equal((await decided(p.run.id)).kind, 'running');
      board().settle(`${p.run.id}-implement`, 'succeeded', SIGNED);
      assert.equal(ahead(repo, p.run.baseRef, p.branch), 0);
      assert.deepEqual(await decided(p.run.id), { kind: 'landed', branches: [p.branch] });
      assert.equal((await parentNow(p.run.id)).landed, true, 'the gate says what its `nemia decide` says');
      const r = await tick(child.id);
      assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
    },
  );
  await s.test(
    'failed parents whose work a person merged have landed, whatever the step said, and their child files — handed why their closeouts cannot be',
    async () => {
      const lost = await aParent(repo, { work: 'lost.txt', signed: false });
      board().settle(`${lost.run.id}-implement`, 'failed');
      const garbled = await aParent(repo, { work: 'garbled.txt', signed: false });
      board().settle(`${garbled.run.id}-implement`, 'failed', 'not json {');
      const before = await decided(lost.run.id);
      assert.equal(before.kind === 'awaiting' && before.outcome, 'failed', 'not merged yet: decided');
      for (const parent of [lost, garbled]) {
        mergedByHand(repo, parent.branch);
        assert.deepEqual(await decided(parent.run.id), { kind: 'landed', branches: [parent.branch] });
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
  await s.test(
    'a parent whose frozen steps cannot be read has not landed: its read answers so, and asks git nothing of its branches',
    async () => {
      const dir = oneStep();
      const p = await aParent(repo, { workflowDir: dir, signed: true });
      const readable = await stage.runWith(board().e, parentRead(p.run.id, await stage.runPlaced(standingLiveOf([p.run.id]))));
      assert.equal(readable.landed, true, 'signed off, with its steps readable, it has landed');
      const record = readRun(p.run.id);
      delete record.workflow;
      fs.writeFileSync(path.join(ROOT, 'runs', `${record.id}.json`), JSON.stringify(record, null, 2));
      fs.rmSync(dir, { recursive: true });
      assert.throws(() => stepsOf(readRun(p.run.id)), 'its steps do not read');
      const asked: string[] = [];
      const read = await stage.runPlaced(standingLiveOf([p.run.id]));
      const git: BranchReader = {
        ...read,
        landed: (run, branch) => {
          asked.push(branch);
          return read.landed(run, branch);
        },
      };
      assert.deepStrictEqual(await stage.runWith(board().e, parentRead(p.run.id, git)), { record: readRun(p.run.id), landed: false });
      assert.deepEqual(asked, [], 'no branch of it asked');
    },
  );
});

test('REFUSED by name at `nemia start --after`, as the store and git stand: a result branch gone, read from git — exit 2, nothing written; and what is let through', async (t) => {
  const repo = aRepo();
  const dropped = await aParent(repo, { work: 'dropped.txt' });
  await tick(dropped.run.id);
  const unseen = await aParent(repo, { work: 'unseen.txt' });
  const child = await started({
    brief: 'the child of work that is gone',
    repo,
    workflowDir: twoSteps(),
    after: [dropped.run.id, unseen.run.id],
  });
  mergedByHand(repo, unseen.branch);
  for (const p of [dropped, unseen]) droppedByHand(repo, p.wt, p.branch);
  assert.ok(readRun(dropped.run.id).tips?.[dropped.branch], 'the dropped parent had its tip recorded');

  await t.test('a run after them files nothing, and says `(<branch> gone)` of each', async () => {
    const filings = [...board().filings];
    const r = await tick(child.id);
    assert.deepEqual(
      [r.filed, board().filings, r.waiting],
      [
        [],
        filings,
        [
          { run: dropped.run.id, gone: [dropped.branch] },
          { run: unseen.run.id, gone: [unseen.branch] },
        ],
      ],
      'no pass over the unseen parent since it signed off: no tip was recorded, and git keeps no trace of what its branch named',
    );
    await aPass();
    assert.deepEqual(await statuses(child.id), [
      `waiting on ${dropped.run.id} (${dropped.branch} gone), ${unseen.run.id} (${unseen.branch} gone)`,
      'waiting',
    ]);
  });
  const refusals: Array<[string, string, string[]]> = [
    [
      'a parent dropped unmerged after its tip was recorded',
      dropped.run.id,
      [dropped.branch, 'is gone', 'on main', `without --after ${dropped.run.id}`],
    ],
    [
      'a parent merged and deleted before any pass saw it finish',
      unseen.run.id,
      [unseen.branch, 'is gone', 'on main', `without --after ${unseen.run.id}`],
    ],
    ['a run the store does not have', 'nobody-x9', ['no run nobody-x9', 'nemia ls']],
  ];
  for (const [what, id, facts] of refusals) {
    await t.test(`REFUSED: ${what}`, async () => {
      const before = runsWritten();
      await assert.rejects(
        stage.runPlaced(startRun({ brief: 'another child', repo, workflowDir: twoSteps(), after: [id] })),
        refusedNaming('Invalid', `--after ${id}:`, ...facts),
      );
      assert.equal(runsWritten(), before, 'nothing written');
    });
  }
  await t.test('allowed: a parent merged and then its branch deleted, by the tip its finished run recorded', async () => {
    const p = await aParent(repo, { work: 'kept.txt' });
    await tick(p.run.id);
    mergedByHand(repo, p.branch);
    droppedByHand(repo, p.wt, p.branch);
    assert.deepEqual((await started({ brief: 'the latest child', repo, workflowDir: twoSteps(), after: [p.run.id] })).after, [p.run.id]);
  });
  await t.test('allowed: a parent that signed off with nothing to commit', async () => {
    const p = await aParent(repo, { signed: true });
    assert.deepEqual((await started({ brief: 'another child', repo, workflowDir: twoSteps(), after: [p.run.id] })).after, [p.run.id]);
  });
});

test('context without a wait: a run handed another with `--from` files at once, told what it reads is not landed, and `nemia concluded` prints it', async (t) => {
  const s = story(t);
  const repo = aRepo();
  let source = { run: { id: '' } as RepositoryRun, wt: '', branch: '' };
  await s.test(
    'a run handed only a run still in flight files its roots on the first pass, the source handed as not landed, not judged',
    async () => {
      source = await aParent(repo, { work: 'source.txt', signed: false });
      const child = await started({ brief: 'Read what the source has', repo, workflowDir: twoSteps(), context: [source.run.id] });
      assert.deepEqual(readRun(child.id).context, [source.run.id], 'frozen on the record');
      const r = await tick(child.id);
      assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
      const section = sectionOf(briefOf(`${child.id}-implement`), source.run.id);
      assert.match(section, /as context \(`--from`\); it did not wait on it/);
      assert.match(section, new RegExp(`Not landed, not judged: ${source.run.id} was still in flight`));
    },
  );
  await s.test('`nemia concluded` prints the section the tick hands a run started with `--from` — the very one', async () => {
    const printed = await printedBy(t, () => stage.main(['concluded', source.run.id]));
    const child = await started({ brief: 'Read what the source has, again', repo, workflowDir: twoSteps(), context: [source.run.id] });
    await tick(child.id);
    const brief = briefOf(`${child.id}-implement`);
    const at = brief.indexOf(`\n## From run ${source.run.id}\n`);
    const section = brief.slice(at, brief.indexOf('\n## Files for the steps after you\n', at));
    assert.equal(printed.join('\n'), section.replace(/^\n+/, '').replace(/\n+$/, ''));
  });
  await s.test('REFUSED: `nemia concluded` of a run the store does not have', async () => {
    await assert.rejects(stage.main(['concluded', 'nobody-z9']), (err: Error & { exitCode?: number }) => {
      assert.equal(err.exitCode, 2, err.message);
      names(err.message, 'nemia concluded nobody-z9', 'no run nobody-z9');
      return true;
    });
  });
  await s.test(
    'a run after one run and handed another waits for the first alone, handed it in `--after` words before the other',
    async () => {
      const waited = await aParent(repo, { work: 'waited.txt' });
      const child = await started({ brief: 'the child', repo, workflowDir: twoSteps(), after: [waited.run.id], context: [source.run.id] });
      const before = await tick(child.id);
      assert.deepEqual(
        [before.filed, before.waiting],
        [[], [{ run: waited.run.id }]],
        'waiting on the run it waits on, never the one it reads',
      );
      mergedByHand(repo, waited.branch);
      const r = await tick(child.id);
      assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
      const brief = briefOf(`${child.id}-implement`);
      const waitedAt = brief.indexOf(`\n## From run ${waited.run.id}\n`);
      const readAt = brief.indexOf(`\n## From run ${source.run.id}\n`);
      assert.ok(waitedAt > 0 && readAt > waitedAt, brief);
      assert.match(brief.slice(waitedAt, readAt), /waited on .* \(`--after`\) and started once it landed/);
      assert.match(brief.slice(readAt), /as context \(`--from`\).*\n.*\nNot landed, not judged/);
    },
  );
});

test('REFUSED by name at shipped defaults: `nemia start <folder>` starts nothing on a folder it cannot start whole, nor with a flag the folder says instead', async (t) => {
  const repo = aRepo();
  const first = oneStep();
  const broken = folderOf({ implement: ['afer: plan'] });
  const plan = aPlan(() => ({ 'a.md': cardText(`workflow: ${first}`, 'the first card') }));
  const empty = aPlan(() => ({ 'README.md': '# Nothing yet\n' }));
  const planned = (...argv: string[]) => stage.main(['start', ...argv]);
  const cards = (files: Record<string, string>) => {
    for (const f of fs.readdirSync(plan)) if (f !== 'a.md') fs.rmSync(path.join(plan, f), { recursive: true });
    for (const [file, text] of Object.entries(files)) {
      if (file.endsWith('/')) fs.mkdirSync(path.join(plan, file));
      else fs.writeFileSync(path.join(plan, file), text);
    }
  };
  const rows: Array<[string, Record<string, string>, string[], string, string[]]> = [
    [
      "a second card's workflow that does not load: the workflow's own refusal, behind the card",
      { 'b.md': cardText(`workflow: ${broken}\nafter: a`, 'the second card') },
      [plan, '--repo', repo],
      'Invalid',
      ['b.md:', `workflow: ${broken}`, 'implement:', '`afer`'],
    ],
    [
      'a workflow that is not there, naming both places',
      { 'b.md': cardText('workflow: nope\nafter: a', 'the second card') },
      [plan, '--repo', repo],
      'Invalid',
      ['b.md:', 'workflow: nope', path.join(plan, 'nope'), path.join(repo, 'workflows')],
    ],
    [
      'a cycle',
      { 'b.md': cardText(`workflow: ${first}\nafter: c`, 'b'), 'c.md': cardText(`workflow: ${first}\nafter: b`, 'c') },
      [plan, '--repo', repo],
      'Invalid',
      ['b.md, c.md wait on each other', 'b after c, c after b', '`after:`'],
    ],
    ['a folder inside the plan', { 'drafts/': '' }, [plan, '--repo', repo], 'Invalid', ['drafts/', plan, 'not a card']],
    ['a folder with no card', {}, [empty, '--repo', repo], 'Invalid', [empty, 'no cards', 'README.md']],
    [
      '--after: the folder says it',
      {},
      [plan, '--repo', repo, '--after', 'r-xyz'],
      'Invalid',
      ['nemia start <folder> does not take --after', 'nemia start <card.md> --workflows <dir> --after <runId>'],
    ],
    ['--after=<run>', {}, [plan, '--after=r-xyz', '--repo', repo], 'Invalid', ['nemia start <folder> does not take --after']],
    [
      '--workflows',
      {},
      [plan, '--workflows', 'dev', '--repo', repo],
      'Invalid',
      ['nemia start <folder> does not take --workflows', 'in its workflow:'],
    ],
    ['--no-worktree', {}, [plan, '--no-worktree', '--repo', repo], 'Invalid', ['nemia start <folder> does not take --no-worktree']],
  ];
  for (const [what, files, argv, tag, facts] of rows) {
    await t.test(what, async () => {
      cards(files);
      const before = runsWritten();
      await assert.rejects(planned(...argv), refusedNaming(tag, ...facts));
      assert.equal(runsWritten(), before, 'not even the first card');
    });
  }
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
    stood.map((p) => readRun(p.runId).after),
    [undefined, [stood[0].runId]],
  );
  assert.equal(folderOfCard(stopped!.card), flow);
});
