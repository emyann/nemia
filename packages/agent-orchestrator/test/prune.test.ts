/**
 * `nemia prune`: a run's worktrees removed, and its files with `--artifacts`, and nothing else of it — told as a person's stories on
 * `story(t)` and the stage (`staged`), the test place and the engine's stand-in: a run that shipped, pruned and then its files; what holds
 * a prune, each refused with the fix it names, then let through; and what a pruned run refuses after. What `nemia prune` refuses before
 * a run is read, and the lines it says, are a table. Kept focused: the mark of a run two prunes meet on, and the turns of a prune of many
 * runs, its bound on the place's verbs at once and its order, each on a place that holds a verb until the test lets it go.
 *
 * What git alone does — an ignore rule, a link not followed, a file hardlinked from the repository, a checkout on no branch and a lock —
 * is walked on git in `prune-git.boundary.test.ts`. A file of its own, since `WF_ROOT` is read once, as the package loads; each story
 * reads its own runs, though a prune of every run reads the store's.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { until, WAITED } from 'agent-runtime/testing';
import type { Engine } from '../src/runtime-client.ts';
import type { EnginePhase } from '../src/views/views-words.ts';
import type { Place } from '../src/place/place.store.ts';
import type { PlaceRequests, PlaceVerb } from '../src/place/place.ts';
import type { Turned } from '../src/runner.ts';
import { scratch } from './scratch.ts';
import { decideScreen } from './screens.ts';
import { staged, story } from './story.ts';
import { names } from './assessed.ts';
import { placeHeld, placeOver, unreadBy } from './place-over.ts';

const ROOT = scratch('wf-prune-');
process.env.WF_ROOT = ROOT;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  acceptRun,
  advanceRun,
  approveRun,
  decideRun,
  forgetRun,
  idRefusal,
  prune,
  pruneLines,
  retryRun,
  roundRun,
  sizeOf,
  startRun,
  runWith: runEngine,
} = await import('../src/runner.ts');
const { listRuns, readRun } = await import('../src/record/record.store.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { freeing, freeingMany, judging, judgingMany, PRUNE_A_TURN, sized } = await import('../src/prune/prune.verb.ts');
const { PlaceService } = await import('../src/place/place.store.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith: runEngine, main, engineOf });
const { runWith, runPlaced } = stage;
const world = () => stage.place().world;
/** The test place's own place, as a verb is answered over it. */
const placeNow = () => stage.place().place;
const under = (...parts: string[]) => fs.existsSync(path.join(ROOT, ...parts));
const hasBranch = (repo: string, branch: string) => world().tip(repo, branch) !== null;

/** A repository of the stage's place with one commit on main. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  world().repository(repo, { 'README.md': 'readme\n' });
  return repo;
};

/** A workflow of one step, `implement` — with a `budget:`, when given one. */
const oneStep = (budget?: number) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(
    path.join(dir, 'implement.md'),
    `---\nplace: git\n${budget === undefined ? '' : `budget: ${budget}\n`}---\nimplement it\n`,
  );
  return dir;
};

/**
 * The stage's engine, as this file reads it: its filings and its `forget` calls, and `settle` laying what the attempt cost, when it
 * says, over the attempt it ends.
 */
const board = () => {
  const b = stage.board();
  const settle = (id: string, phase: EnginePhase, closeout?: unknown, usage?: object) => {
    b.settle(id, phase, closeout);
    if (usage) Object.assign(b.tasks.get(id)!.attempt!, { usage });
  };
  return { e: b.e, filings: b.filings, forgets: b.forgets, settle };
};
type Board = ReturnType<typeof board>;

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/**
 * A run that is over: started, its one step filed in a worktree of its own, `work` committed on its branch, signed off, and handed off
 * by a pass, which leaves nothing uncommitted. Merged into `main` with `merged`; in the repository `repo`, when given one, else in one of
 * its own.
 */
const aFinished = async (
  b: Board,
  {
    merged = false,
    work = 'fix.ts',
    budget,
    costUsd,
    closeout = SIGNED,
    repo = aRepo(),
  }: {
    merged?: boolean;
    work?: string;
    budget?: number;
    costUsd?: number;
    closeout?: object | ((id: string) => object);
    repo?: string;
  } = {},
) => {
  const run = await runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: oneStep(budget) }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  fs.writeFileSync(path.join(wt, work), 'export const fixed = true;\n');
  world().commit(wt, `add ${work}`);
  const said = typeof closeout === 'function' ? closeout(run.id) : closeout;
  for (const named of (said as { artifacts?: string[] }).artifacts ?? []) if (path.isAbsolute(named)) aShot(run.id, path.basename(named));
  b.settle(`${run.id}-implement`, 'succeeded', said, costUsd === undefined ? undefined : { costUsd });
  await runWith(b.e, advanceRun(readRun(run.id)));
  const branch = readRun(run.id).steps.implement.branch!;
  if (merged) {
    world().stage(repo, branch);
    world().commit(repo, 'merge');
  }
  return { run, repo, wt, branch };
};

/** `nemia <verb>`, through the CLI, as a person types it: the lines it printed, and the error it ended with, if it did. */
const typed = async (t: TestContext, e: Engine, ...argv: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => void printed.push(a.join(' ')));
  try {
    await stage.main(argv, e);
    return { printed, error: undefined };
  } catch (err) {
    return { printed, error: err as Error & { exitCode?: number; _tag?: string } };
  } finally {
    log.mock.restore();
  }
};

/** The directories `repo` has a checkout in under the store's worktrees, as its place lists them. */
const worktreesOf = (repo: string): string[] => {
  const outcome = placeNow().askNow('inventory', { repo, under: path.join(ROOT, 'worktrees'), prefix: 'wf/', base: 'main' });
  assert.ok('answer' in outcome, `the inventory of ${repo}`);
  return outcome.answer.workspaces.map((w) => w.path);
};

/** A file in a run's files directory, as a step's check leaves one: its absolute path. */
const aShot = (id: string, name = 'shot.png', bytes = 32 * 1024): string => {
  const at = path.join(ROOT, 'runs', id, 'artifacts', 'implement', name);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, 'p'.repeat(bytes));
  return at;
};

/** Runs the prune a refusal offers, as a person would type it, with `--yes`: the command is read off the refusal, never written here. */
const followed = async (t: TestContext, e: Engine, refusal: string) => {
  const command = /(nemia prune \S+(?: --[a-z]+)*)\.$/.exec(refusal)?.[1];
  assert.ok(command, `a refusal that offers a prune: ${refusal}`);
  return { command, ...(await typed(t, e, ...command.split(' ').slice(1), '--yes')) };
};

/** A run of the gated folder: `implement` at its gate, signed off and handed off; `review` after it. */
const atItsGate = async (b: Board) => {
  const gated = fs.mkdtempSync(path.join(ROOT, 'gated-'));
  fs.writeFileSync(path.join(gated, 'implement.md'), '---\nplace: git\ngate: true\n---\nimplement it\n');
  fs.writeFileSync(path.join(gated, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  const run = await runPlaced(startRun({ brief: 'at its gate', repo: aRepo(), workflowDir: gated }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  return { run, wt };
};

/** A folder run whose one step signed off and was handed off. */
const aFolderRun = async (b: Board) => {
  const team = fs.mkdtempSync(path.join(ROOT, 'team-'));
  fs.writeFileSync(path.join(team, 'write.md'), '---\nworkspace: folder\npermissionMode: dontAsk\n---\nwrite the note\n');
  const run = await runPlaced(startRun({ brief: 'a note', repo: fs.mkdtempSync(path.join(ROOT, 'not-a-repo-')), workflowDir: team }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-write`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  return run;
};

/** A run that worked in its repository itself, signed off and handed off. */
const inPlaceRun = async (b: Board) => {
  const inPlace = await runPlaced(startRun({ brief: 'in place', repo: aRepo(), workflowDir: oneStep(), isolate: false }));
  await runWith(b.e, advanceRun(readRun(inPlace.id)));
  b.settle(`${inPlace.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(inPlace.id)));
  return inPlace;
};

test('`nemia prune` of a run that shipped: listed with its size until --yes, then its worktree removed and its files with --artifacts, its record, branch, asks and inputs kept, and a second prune with nothing to do', async (t) => {
  const s = story(t);
  const b = board();
  await s.test(
    'a dry prune lists its worktree with its size, and what `nemia rm` would forget of the engine, asked dry: nothing touched',
    async () => {
      const { run, wt } = await aFinished(b, { merged: true });
      const dry = await typed(t, b.e, 'prune', run.id);
      assert.equal(dry.error, undefined, 'a dry run with nobody at a terminal is no refusal');
      assert.match(dry.printed[0], new RegExp(`^${run.id}  would remove 1 worktree, \\d+\\.\\d KB$`));
      assert.ok(dry.printed[1].startsWith(`   ${wt}  `), dry.printed[1]);
      names(dry.printed[2], 'the engine keeps 1 task of it', `nemia rm ${run.id} forgets them`);
      assert.match(dry.printed[3], /^1 run to prune, \d+\.\d KB in all$/);
      names(dry.printed[4], 'nothing removed', `nemia prune ${run.id} --yes`);
      assert.ok(b.forgets.length && b.forgets.every((f) => !f.yes), 'the engine is asked dry: nemia prune forgets nothing of it');
      assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`), 'a dry run touches nothing');
      assert.ok((await runWith(b.e, prune(run.id))).worktrees[0].bytes > 0, 'what the worktree holds is counted');
    },
  );

  await s.test(
    'with --yes its worktree is removed, its record, closeout, branch, files and asks kept; `nemia ls` and `nemia decide` say it is pruned; a tick files nothing; a second prune has nothing to do; `nemia rm` still forgets it',
    async () => {
      const { run, repo, wt, branch } = await aFinished(b, { merged: true });
      fs.mkdirSync(path.join(ROOT, 'runs', run.id, 'artifacts', 'implement'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, 'runs', run.id, 'artifacts', 'implement', 'report.md'), 'report\n');
      fs.mkdirSync(path.join(ROOT, 'runs', `${run.id}.asks`, 'done'), { recursive: true });
      const done = await typed(t, b.e, 'prune', run.id, '--yes');
      assert.equal(done.error, undefined);
      assert.match(
        done.printed.at(-2)!,
        new RegExp(`^${run.id}  pruned: removed 1 worktree, \\d+\\.\\d KB freed; its record, branches and files are kept$`),
      );
      assert.ok(!fs.existsSync(wt) && !under('worktrees', run.id), "the worktree, and the run's directory of them, are gone");
      assert.ok(!worktreesOf(repo).includes(wt), 'its place lists it no more');
      assert.ok(hasBranch(repo, branch), 'the branch is kept');
      assert.ok(
        under('runs', `${run.id}.json`) &&
          under('runs', run.id, 'artifacts', 'implement', 'report.md') &&
          under('runs', `${run.id}.asks`, 'done'),
      );
      const pruned = readRun(run.id).pruned!;
      assert.deepEqual(
        pruned.worktrees.map((w) => w.path),
        [wt],
      );
      assert.ok(
        !('pruned' in JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8'))),
        'the record itself never holds it',
      );

      const ls = await typed(t, b.e, 'ls', run.id);
      assert.match(ls.printed[0], new RegExp(`^${run.id}  add a flag  \\(pruned\\)`), 'still on the board, with the word beside it');
      const d = await runWith(b.e, decideRun(run.id));
      assert.equal(d.decision.kind, 'shipped');
      assert.equal((d.closeouts.implement as { summary?: string }).summary, 'did it', "its closeout is the engine's, and still read");
      const screen = await typed(t, b.e, 'decide', run.id);
      names(screen.printed.join('\n').split('\n')[1], `pruned at ${pruned.at}`, 'nemia prune', 'its branches, record and files are kept');

      const filings = [...b.filings];
      await runWith(b.e, advanceRun(readRun(run.id)));
      assert.deepEqual(b.filings, filings, 'a tick after it files nothing');
      const again = await runWith(b.e, prune(run.id, { yes: true }));
      assert.equal(again.kind, 'nothing');
      names(again.nothing, pruned.at, 'nemia prune');
      assert.equal(readRun(run.id).pruned!.at, pruned.at, 'a prune with nothing to do leaves the marker as it was');
      assert.equal((await runWith(b.e, forgetRun(run.id))).kind, 'forgotten', '`nemia rm` still forgets it');
      assert.ok(!under('runs', `${run.id}.pruned`), 'and the marker goes with it');
    },
  );

  await s.test(
    '`--artifacts`: its worktree and its files listed with their sizes until --yes, then removed — a link among them as a link — what freed said; its record, asks, inputs and prompts kept; `nemia decide` says the files went',
    async () => {
      const shotOf = (id: string) => path.join(ROOT, 'runs', id, 'artifacts', 'implement', 'shot.png');
      const run0 = await aFinished(b, { merged: true, closeout: (id) => ({ ...SIGNED, artifacts: [shotOf(id)] }) });
      const id = run0.run.id;
      const shot = aShot(id);
      const outside = fs.mkdtempSync(path.join(ROOT, 'outside-'));
      fs.writeFileSync(path.join(outside, 'precious.png'), 'keep me\n');
      fs.symlinkSync(outside, path.join(ROOT, 'runs', id, 'artifacts', 'implement', 'linked'));
      for (const kept of ['inputs', 'agents']) {
        fs.mkdirSync(path.join(ROOT, 'runs', id, kept), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'runs', id, kept, 'kept.md'), 'kept\n');
      }
      fs.mkdirSync(path.join(ROOT, 'runs', `${id}.asks`, 'done'), { recursive: true });
      const files = path.join(ROOT, 'runs', id, 'artifacts');

      const dry = await typed(t, b.e, 'prune', id, '--artifacts');
      assert.equal(dry.error, undefined);
      assert.match(dry.printed[0], new RegExp(`^${id}  would remove 1 worktree and its files, \\d+\\.\\d KB$`));
      assert.ok(dry.printed[1].startsWith(`   ${run0.wt}  `) && dry.printed[2].startsWith(`   ${files}  `), dry.printed.join('\n'));
      names(dry.printed[3], 'the engine keeps 1 task of it', `nemia rm ${id} forgets them`);
      names(dry.printed[5], 'nothing removed', `nemia prune ${id} --artifacts --yes`);
      assert.ok(fs.existsSync(shot) && !under('runs', `${id}.pruned`), 'a dry run touches nothing');
      const measured = (await runWith(b.e, prune(id, { artifacts: true }))).artifacts!.bytes;
      assert.ok(measured >= 32 * 1024, `what the files hold is counted (${measured})`);
      assert.equal((await runWith(b.e, prune(id))).artifacts, undefined, 'without the flag, the files are not offered: the worktree alone');

      const done = await typed(t, b.e, 'prune', id, '--artifacts', '--yes');
      assert.equal(done.error, undefined);
      assert.match(
        done.printed.join('\n'),
        new RegExp(`^${id}  pruned: removed 1 worktree and its files, \\d+\\.\\d KB freed; its record and branches are kept$`, 'm'),
      );
      assert.ok(!fs.existsSync(files) && !fs.existsSync(run0.wt), 'the files and the worktree are gone');
      assert.equal(fs.readFileSync(path.join(outside, 'precious.png'), 'utf8'), 'keep me\n', 'a link among the files is not followed');
      for (const kept of ['inputs', 'agents']) assert.ok(under('runs', id, kept, 'kept.md'), `${kept} is kept`);
      assert.ok(under('runs', `${id}.json`) && under('runs', `${id}.asks`, 'done'), 'the record and the asks are kept');
      assert.ok(hasBranch(run0.repo, run0.branch), 'and the branch');
      const pruned = readRun(id).pruned!;
      assert.equal(pruned.worktrees.length, 1);
      assert.equal(pruned.artifacts?.bytes, measured, 'the marker says what the files freed');
      assert.ok(pruned.artifacts?.at);

      assert.equal((await runWith(b.e, decideRun(id))).decision.kind, 'shipped');
      const screen = await typed(t, b.e, 'decide', id);
      assert.equal(screen.error, undefined, 'nemia decide reads it');
      const text = screen.printed.join('\n');
      names(text.split('\n')[1], `pruned at ${pruned.at}`, `its files were removed at ${pruned.artifacts.at}`, 'nemia prune --artifacts');
      assert.doesNotMatch(text, /not kept|missing/, 'a shipped run is said shipped, as before');

      const open = await aFinished(b, { closeout: (id) => ({ ...SIGNED, artifacts: [shotOf(id)] }) });
      const openShot = aShot(open.run.id);
      assert.equal((await runWith(b.e, prune(open.run.id, { artifacts: true, unmerged: true, yes: true }))).kind, 'pruned');
      const openAt = readRun(open.run.id).pruned!.artifacts!.at;
      const read = await typed(t, b.e, 'decide', open.run.id);
      assert.equal(read.error, undefined, 'nemia decide reads it');
      const openText = read.printed.join('\n');
      const notKept = openText.split('\n').find((l) => l.includes('!! not kept'));
      names(notKept, openShot, openAt, 'nemia prune --artifacts');
      assert.doesNotMatch(openText, /!! missing|not there/, 'a file its step named reads as pruned, not as never made');

      const again = await runWith(b.e, prune(id, { artifacts: true, yes: true }));
      assert.equal(again.kind, 'nothing');
      names(again.nothing, pruned.at, pruned.artifacts.at, 'nemia prune --artifacts');
      assert.deepEqual(readRun(id).pruned, pruned, 'a prune with nothing to do leaves the marker as it was');
      await assert.rejects(runWith(b.e, retryRun(id, 'implement', { mode: 'nudge' })), (err: Error) => {
        names(err.message, `${id} was pruned at ${pruned.at}`, pruned.artifacts!.at, 'a retry');
        return true;
      });
    },
  );

  await s.test(
    "`--artifacts` of a run whose worktrees a plain prune removed takes its files alone, the worktrees' time kept; of a run that cut none, its files alone, which then reads pruned",
    async () => {
      const { run } = await aFinished(b, { merged: true });
      aShot(run.id);
      assert.equal((await runWith(b.e, prune(run.id, { yes: true }))).kind, 'pruned');
      const first = readRun(run.id).pruned!;
      assert.ok(under('runs', run.id, 'artifacts', 'implement', 'shot.png'), 'a plain prune keeps the files');
      const files = await runWith(b.e, prune(run.id, { artifacts: true, yes: true }));
      assert.deepEqual([files.kind, files.worktrees, files.left], ['pruned', [], []]);
      assert.ok(files.artifacts!.bytes >= 32 * 1024);
      assert.equal(
        pruneLines(files)[0],
        `${run.id}  pruned: removed its files, ${sizeOf(files.artifacts!.bytes)} freed; its record and branches are kept`,
      );
      const after = readRun(run.id).pruned!;
      assert.deepEqual([after.at, after.worktrees], [first.at, first.worktrees], 'when the worktrees went, and which, is as it was');
      assert.ok(after.artifacts && !under('runs', run.id, 'artifacts'));

      const inPlace = await inPlaceRun(b);
      aShot(inPlace.id);
      const nothing = await runWith(b.e, prune(inPlace.id));
      assert.equal(nothing.kind, 'nothing', 'without the flag, a run that worked in its repository itself has nothing to prune');
      names(nothing.nothing, inPlace.repo!);
      const refusal = (await runWith(b.e, prune(inPlace.id, { artifacts: true, yes: true }))).refusal;
      names(refusal, 'main', `nemia prune ${inPlace.id} --unmerged --artifacts`);
      assert.ok(
        under('runs', inPlace.id, 'artifacts', 'implement', 'shot.png') && !under('runs', `${inPlace.id}.pruned`),
        'refused: kept, unmarked',
      );
      const bare = await followed(t, b.e, refusal!);
      assert.equal(bare.error, undefined, `${bare.command}: the command it offers is the one that prunes them`);
      assert.ok(
        bare.printed.includes(`${inPlace.id}  pruned: removed its files, 44.0 KB freed; its record and branches are kept`),
        bare.printed.join('\n'),
      );
      assert.ok(!under('runs', inPlace.id, 'artifacts'), 'its files gone');
      const marked = readRun(inPlace.id).pruned!;
      assert.deepEqual(marked.worktrees, []);
      assert.equal(marked.at, marked.artifacts!.at, 'pruned once its files go');
      await assert.rejects(runWith(b.e, retryRun(inPlace.id, 'implement', { mode: 'nudge' })), (err: Error) => {
        names(err.message, `${inPlace.id} was pruned at ${marked.at}`, 'nemia prune --artifacts', 'a retry');
        return true;
      });
      const screen = await typed(t, b.e, 'decide', inPlace.id);
      assert.equal(screen.error, undefined);
      names(screen.printed.join('\n').split('\n')[1], `pruned at ${marked.at}`, 'nemia prune --artifacts');
      names((await runWith(b.e, prune(inPlace.id, { artifacts: true }))).nothing, inPlace.repo!, marked.at, 'nemia prune --artifacts');
    },
  );

  await s.test(
    '`--artifacts` marks the run before its files go, and a prune that removed nothing takes the mark back — gone on a run never pruned, as it was on one that was',
    async (tt) => {
      const { run } = await aFinished(b, { merged: true });
      aShot(run.id);
      const rm = fs.rmSync;
      let seen: unknown;
      const mocked = tt.mock.method(fs, 'rmSync', (at: fs.PathLike, opts?: fs.RmOptions) => {
        if (String(at).endsWith(path.join(run.id, 'artifacts')))
          seen = JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.pruned`), 'utf8'));
        return rm(at, opts);
      });
      assert.equal((await runWith(b.e, prune(run.id, { artifacts: true, yes: true }))).kind, 'pruned');
      mocked.mock.restore();
      assert.ok(
        (seen as { artifacts?: unknown } | undefined)?.artifacts,
        `marked before the removal, as seen from inside it: ${JSON.stringify(seen)}`,
      );

      if (process.getuid?.() === 0) return tt.skip('root removes what a mode forbids');
      const locked = (id: string) => {
        aShot(id);
        fs.chmodSync(path.join(ROOT, 'runs', id, 'artifacts', 'implement'), 0o555);
        tt.after(() => fs.chmodSync(path.join(ROOT, 'runs', id, 'artifacts', 'implement'), 0o755));
      };
      const inPlace = await inPlaceRun(b);
      locked(inPlace.id);
      const never = await runWith(b.e, prune(inPlace.id, { artifacts: true, yes: true, unmerged: true }));
      assert.deepEqual([never.kind, never.artifacts, never.left.length], ['pruned', undefined, 1], 'files nobody may remove will not go');
      names(
        pruneLines(never).at(-1),
        path.join(ROOT, 'runs', inPlace.id, 'artifacts'),
        'EACCES',
        `nemia prune ${inPlace.id} --unmerged --artifacts`,
      );
      assert.ok(!under('runs', `${inPlace.id}.pruned`), 'a run never pruned is not marked');
      const cli = await typed(t, b.e, 'prune', inPlace.id, '--artifacts', '--yes', '--unmerged');
      assert.equal(cli.error?.exitCode, 2, 'and the verb says it was not pruned');

      const shipped = await aFinished(b, { merged: true });
      assert.equal((await runWith(b.e, prune(shipped.run.id, { yes: true }))).kind, 'pruned');
      const marker = fs.readFileSync(path.join(ROOT, 'runs', `${shipped.run.id}.pruned`), 'utf8');
      locked(shipped.run.id);
      const again = await runWith(b.e, prune(shipped.run.id, { artifacts: true, yes: true }));
      assert.deepEqual([again.worktrees, again.artifacts, again.left.length], [[], undefined, 1]);
      assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${shipped.run.id}.pruned`), 'utf8')),
        JSON.parse(marker),
        'a run pruned before keeps the marker it had',
      );
    },
  );

  await s.test(
    '`nemia prune` with no run reads every run: one not over is summed up on a line, one with nothing to prune is not said, the rest listed with the total',
    async () => {
      const merged = await aFinished(b, { merged: true });
      const running = await runPlaced(startRun({ brief: 'running', repo: aRepo(), workflowDir: oneStep() }));
      await runWith(b.e, advanceRun(readRun(running.id)));
      const inPlace = await inPlaceRun(b);
      const { printed, error } = await typed(t, b.e, 'prune');
      assert.equal(error, undefined, 'a run refused is not an error when none was named');
      const text = printed.join('\n');
      assert.match(text, new RegExp(`^${merged.run.id}  would remove 1 worktree, `, 'm'));
      assert.match(text, new RegExp(`^\\d+ runs? not over, not pruned: .*${running.id}`, 'm'));
      assert.doesNotMatch(text, new RegExp(`^${inPlace.id} `, 'm'), 'a run that cut no worktree is not a line');
      names(printed.at(-1), 'nothing removed', 'nemia prune --yes');
      assert.ok(listRuns().some((r) => r.id === merged.run.id) && fs.existsSync(merged.wt));
      b.settle(`${running.id}-implement`, 'succeeded', SIGNED);
    },
  );
});

test('`nemia prune` refused, then let through: what holds it is named with the fix it names, nothing removed and no mark, and once that is dealt with, the run is pruned', async (t) => {
  const s = story(t);
  const b = board();
  await s.test('REFUSED: a run not over is told to cancel first, exit 2', async () => {
    const run = await runPlaced(startRun({ brief: 'still running', repo: aRepo(), workflowDir: oneStep() }));
    await runWith(b.e, advanceRun(readRun(run.id)));
    const wt = readRun(run.id).steps.implement.workspace!;
    const { printed, error } = await typed(t, b.e, 'prune', run.id, '--yes', '--unmerged');
    assert.equal(error?.exitCode, 2);
    names(printed[0], `${run.id}  not pruned`, `nemia decide ${run.id}`, `nemia cancel ${run.id}`, `nemia prune ${run.id} --unmerged`);
    assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`));
    b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  });

  await s.test('REFUSED: a finished run not merged, unless --unmerged; with it, pruned, and the branch with its work kept', async () => {
    const { run, repo, wt, branch } = await aFinished(b);
    const refused = await runWith(b.e, prune(run.id, { yes: true }));
    assert.equal(refused.kind, 'refused');
    names(refused.refusal, 'main', `nemia prune ${run.id} --unmerged`);
    assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`));
    const done = await runWith(b.e, prune(run.id, { yes: true, unmerged: true }));
    assert.deepEqual([done.kind, done.left], ['pruned', []]);
    assert.ok(!fs.existsSync(wt));
    assert.equal(world().changed(repo, branch).join('\n'), 'fix.ts', 'the work is on its branch');
  });

  await s.test(
    'REFUSED: a worktree with a change no commit has — untracked, or modified — named with its files, nothing removed',
    async () => {
      for (const change of ['untracked', 'modified'] as const) {
        const { run, wt } = await aFinished(b, { merged: true });
        if (change === 'untracked') fs.writeFileSync(path.join(wt, 'notes.md'), 'notes\n');
        else fs.appendFileSync(path.join(wt, 'README.md'), 'more\n');
        const refused = await runWith(b.e, prune(run.id, { yes: true }));
        assert.equal(refused.kind, 'refused', change);
        names(refused.refusal, wt, change === 'untracked' ? 'notes.md' : 'README.md', `nemia prune ${run.id}`);
        assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`), change);
      }
    },
  );

  await s.test(
    'REFUSED: a place whose inventory is not heard refuses as not read, never as nothing left — its worktree stays and the run is not marked',
    async () => {
      const { run, repo, wt } = await aFinished(b, { merged: true });
      const deaf = PlaceService.layer(placeOver(placeNow(), { inventory: () => unreadBy('inventory', 'the inventory broke') }));
      const refused = await runWith(b.e, prune(run.id, { yes: true }).pipe(Effect.provide(deaf)));
      assert.equal(refused.kind, 'refused');
      names(refused.refusal, repo, 'the inventory broke', `nemia prune ${run.id} again`);
      assert.ok(fs.existsSync(wt) && worktreesOf(repo).includes(wt) && !under('runs', `${run.id}.pruned`));
      assert.equal((await runWith(b.e, prune(run.id, { yes: true }))).kind, 'pruned', 'the place reads it');
    },
  );

  await s.test('REFUSED: a hand-off still owed — a step settled and no pass since — until a tick has handed it off', async () => {
    const run = await runPlaced(startRun({ brief: 'owed', repo: aRepo(), workflowDir: oneStep() }));
    await runWith(b.e, advanceRun(readRun(run.id)));
    const wt = readRun(run.id).steps.implement.workspace!;
    b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
    names(
      (await runWith(b.e, prune(run.id, { yes: true, unmerged: true }))).refusal,
      'implement',
      'nemia tick',
      `nemia prune ${run.id} --unmerged`,
    );
    assert.ok(fs.existsSync(wt));
    await runWith(b.e, advanceRun(readRun(run.id)));
    assert.equal((await runWith(b.e, prune(run.id, { yes: true, unmerged: true }))).kind, 'pruned');
  });

  await s.test('REFUSED: a folder run — its folders are its work, kept until `nemia rm`', async () => {
    const run = await aFolderRun(b);
    const refused = await runWith(b.e, prune(run.id, { yes: true, unmerged: true }));
    assert.equal(refused.kind, 'refused');
    names(refused.refusal, 'a folder run', `nemia rm ${run.id}`);
    assert.ok(!under('runs', `${run.id}.pruned`));
  });

  await s.test(
    'REFUSED: whatever holds `nemia rm` — a step at its gate, named with its approval, and an ask no pass has spent, with the file that takes it back — until each is answered',
    async (tt) => {
      const { run, wt } = await atItsGate(b);
      assert.equal((await runWith(b.e, decideRun(run.id))).decision.kind, 'awaiting', 'over, as `decide` reads it: not refused as running');
      const atGate = await runWith(b.e, prune(run.id, { yes: true, unmerged: true }));
      assert.equal(atGate.kind, 'refused', 'not running, not merged, --unmerged given: the gate alone holds it');
      names(
        atGate.refusal,
        'implement waits at its gate',
        `nemia approve ${run.id} implement`,
        `nemia cancel ${run.id}`,
        `nemia prune ${run.id} --unmerged.`,
      );
      const bare = await runWith(b.e, prune(run.id, { yes: true }));
      names(bare.refusal, `nemia approve ${run.id} implement`, `nemia prune ${run.id}.`);
      assert.doesNotMatch(bare.refusal!, /--unmerged/, '--unmerged gets past no gate, so it is not offered');
      assert.ok(fs.existsSync(wt) && !under('runs', `${run.id}.pruned`));

      const shipped = await aFinished(b, { merged: true });
      const asks = path.join(ROOT, 'runs', `${shipped.run.id}.asks`);
      fs.mkdirSync(asks, { recursive: true });
      fs.writeFileSync(path.join(asks, 'retry-implement-2'), JSON.stringify({ mode: 'nudge' }));
      assert.equal((await runWith(b.e, decideRun(shipped.run.id))).decision.kind, 'shipped');
      const asked = await runWith(b.e, prune(shipped.run.id, { yes: true }));
      assert.equal(asked.kind, 'refused', 'a retry asked of a step that shipped, which no pass files: the ask alone holds it');
      names(asked.refusal, 'try 2 of implement', `nemia prune ${shipped.run.id}`, `rm ${path.join(asks, 'retry-implement-2')}`);
      assert.ok(fs.existsSync(shipped.wt) && !under('runs', `${shipped.run.id}.pruned`));
      fs.rmSync(path.join(asks, 'retry-implement-2'));
      assert.equal((await runWith(b.e, prune(shipped.run.id, { yes: true }))).kind, 'pruned', 'until the ask is taken back');

      assert.equal((await typed(tt, b.e, 'cancel', run.id)).error, undefined);
      assert.equal(
        (await runWith(b.e, prune(run.id, { yes: true }))).kind,
        'pruned',
        'called off at its gate, it prunes with no word more',
      );
    },
  );

  await s.test(
    'REFUSED under --artifacts: a run not over, a finished run not merged, a folder run, one at its gate and a worktree holding a change — its files and worktree kept, no mark; the prune each offers takes them',
    async () => {
      const kept = (id: string, shot: string) => assert.ok(fs.existsSync(shot) && !under('runs', `${id}.pruned`), id);
      const running = await runPlaced(startRun({ brief: 'still running', repo: aRepo(), workflowDir: oneStep() }));
      await runWith(b.e, advanceRun(readRun(running.id)));
      const runningShot = aShot(running.id);
      const r = await typed(t, b.e, 'prune', running.id, '--artifacts', '--yes', '--unmerged');
      assert.equal(r.error?.exitCode, 2);
      names(r.printed[0], `${running.id}  not pruned`, `nemia cancel ${running.id}`);
      kept(running.id, runningShot);
      b.settle(`${running.id}-implement`, 'succeeded', SIGNED);
      await runWith(b.e, advanceRun(readRun(running.id)));

      const unmerged = await aFinished(b);
      const unmergedShot = aShot(unmerged.run.id);
      const u = await runWith(b.e, prune(unmerged.run.id, { artifacts: true, yes: true }));
      names(u.refusal, 'main', `nemia prune ${unmerged.run.id} --unmerged --artifacts.`);
      kept(unmerged.run.id, unmergedShot);
      assert.equal((await runWith(b.e, prune(unmerged.run.id, { yes: true, unmerged: true }))).kind, 'pruned');
      const mark = fs.readFileSync(path.join(ROOT, 'runs', `${unmerged.run.id}.pruned`), 'utf8');
      const after = await runWith(b.e, prune(unmerged.run.id, { artifacts: true, yes: true }));
      assert.equal(after.refusal, u.refusal, 'its files still refused as not merged, its worktree gone');
      assert.ok(fs.existsSync(unmergedShot), 'its files kept');
      assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${unmerged.run.id}.pruned`), 'utf8'), mark, 'and its mark as it was');
      const all = await typed(t, b.e, 'prune', '--artifacts', '--yes');
      assert.ok(
        all.printed.includes(`${unmerged.run.id}  not pruned: ${u.refusal}`),
        `with no run named, refused there too:\n${all.printed.join('\n')}`,
      );
      assert.ok(fs.existsSync(unmergedShot), 'its files kept by the prune of every run');
      assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${unmerged.run.id}.pruned`), 'utf8'), mark);
      const offered = await followed(t, b.e, after.refusal!);
      assert.equal(offered.error, undefined, `${offered.command}: the command it offers is the one that takes them`);
      assert.ok(
        offered.printed.includes(`${unmerged.run.id}  pruned: removed its files, 44.0 KB freed; its record and branches are kept`),
        offered.printed.join('\n'),
      );
      assert.ok(!fs.existsSync(unmergedShot) && !under('runs', unmerged.run.id, 'artifacts'), 'its files gone');

      const folder = await aFolderRun(b);
      const folderShot = aShot(folder.id);
      names((await runWith(b.e, prune(folder.id, { artifacts: true, yes: true, unmerged: true }))).refusal, 'a folder run');
      kept(folder.id, folderShot);

      const atGate = await atItsGate(b);
      const gateShot = aShot(atGate.run.id);
      names(
        (await runWith(b.e, prune(atGate.run.id, { artifacts: true, yes: true, unmerged: true }))).refusal,
        'implement waits at its gate',
      );
      kept(atGate.run.id, gateShot);

      const dirty = await aFinished(b, { merged: true });
      fs.writeFileSync(path.join(dirty.wt, 'notes.md'), 'notes\n');
      const dirtyShot = aShot(dirty.run.id);
      names((await runWith(b.e, prune(dirty.run.id, { artifacts: true, yes: true }))).refusal, dirty.wt, 'notes.md');
      kept(dirty.run.id, dirtyShot);
    },
  );
});

test('after a prune: a retry, a round, an approval and an acceptance are refused — each would file work into a worktree that is gone — a step over its budget is offered no raise, and a pass files nothing on an ask written by hand', async (t) => {
  const s = story(t);
  const b = board();
  await s.test(
    'REFUSED: the four verbs that would file work, each naming the prune; nothing offered; `nemia ls` waits on nobody; an ask written by hand files nothing',
    async () => {
      const { run } = await aFinished(b);
      b.settle(`${run.id}-implement`, 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'a word' });
      assert.ok((await runWith(b.e, decideRun(run.id))).answering.implement !== undefined, 'an answer is offered before the run is pruned');
      assert.match(
        (await typed(t, b.e, 'ls', run.id)).printed.join('\n'),
        /waiting on you: implement/,
        'and `nemia ls` says it waits on you',
      );
      assert.equal((await runWith(b.e, prune(run.id, { yes: true, unmerged: true }))).kind, 'pruned');
      const at = readRun(run.id).pruned!.at;
      const refusedNaming = (verb: string) => (err: Error) => {
        names(err.message, `${run.id} was pruned at ${at}`, 'nemia prune', verb);
        return true;
      };
      await assert.rejects(runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge' })), refusedNaming('a retry'));
      await assert.rejects(runWith(b.e, roundRun(run.id, 'implement')), refusedNaming('a round'));
      await assert.rejects(runWith(b.e, approveRun(run.id, 'implement')), refusedNaming('an approval'));
      await assert.rejects(runWith(b.e, acceptRun(run.id, 'implement', 'as it stands')), refusedNaming('an acceptance'));
      const d = await runWith(b.e, decideRun(run.id));
      assert.deepEqual([d.retrying, d.rounding, d.offers, d.answering], [[], [], [], {}], 'and nothing is offered');
      assert.doesNotMatch((await typed(t, b.e, 'ls', run.id)).printed.join('\n'), /waiting on you/, 'and `nemia ls` waits on nobody');

      const asks = path.join(ROOT, 'runs', `${run.id}.asks`);
      fs.mkdirSync(asks, { recursive: true });
      fs.writeFileSync(path.join(asks, 'retry-implement-2'), JSON.stringify({ mode: 'nudge' }));
      const filings = [...b.filings];
      await runWith(b.e, advanceRun(readRun(run.id)));
      assert.deepEqual(b.filings, filings, 'nothing filed of an ask written by hand: the pass is the guard that holds');
      assert.doesNotMatch((await typed(t, b.e, 'ls', run.id)).printed.join('\n'), /asked|due|files it/, 'no try is coming of it');
    },
  );

  await s.test(
    'REFUSED: a step over its budget is offered no raise once pruned — `decide` and `nemia decide` say the run was pruned where they said it waits on you, as `nemia ls` does — and the whole screen says so',
    async (tt) => {
      const { run, repo } = await aFinished(b, { budget: 3, costUsd: 3.4, closeout: { ...SIGNED, outcome: 'blocked', needs: 'a word' } });
      const before = await runWith(b.e, decideRun(run.id));
      names(before.overBudgetLine, 'OVER BUDGET, waiting on you: implement ($3.40 of $3)');
      assert.match(
        before.offers.join('\n'),
        new RegExp(`:  nemia retry ${run.id} implement --budget <amount>`),
        'its raise is offered before',
      );
      names(before.answering.implement, '$3.40', `nemia retry ${run.id} implement --budget <amount> --message "<answer>"`);
      assert.match((await typed(t, b.e, 'ls', run.id)).printed.join('\n'), /waiting on you: implement/);
      assert.equal(
        (await runWith(b.e, prune(run.id, { yes: true, unmerged: true }))).kind,
        'pruned',
        'nothing about a budget holds a prune under --unmerged',
      );
      const at = readRun(run.id).pruned!.at;

      const d = await runWith(b.e, decideRun(run.id));
      assert.equal(d.decision.kind, 'awaiting', 'still a run to decide: its branch holds its work');
      names(d.overBudgetLine, 'OVER BUDGET: implement ($3.40 of $3)', `pruned at ${at}`, 'nemia prune');
      assert.ok(!d.overBudgetLine!.includes('waiting on you'), d.overBudgetLine);
      assert.deepEqual([d.offers, d.answering, d.gates], [[], {}, {}]);
      await assert.rejects(
        runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge', budget: 5 })),
        /was pruned at/,
        'the raise is refused',
      );
      const screen = (await typed(t, b.e, 'decide', run.id)).printed.join('\n');
      assert.ok(screen.includes(`\n  ${d.overBudgetLine}\n`), screen);
      assert.doesNotMatch(screen, /waiting on you/, screen);
      assert.doesNotMatch(screen, /nemia (retry|round|accept|approve) /, 'no verb a pruned run refuses');
      assert.doesNotMatch((await typed(t, b.e, 'ls', run.id)).printed.join('\n'), /waiting on you/, 'and `nemia ls` agrees');

      const whole = await decideScreen(tt, b.e, [run.id], { '<id>': run.id, '<root>': ROOT, '<repo>': repo, '<at>': at }, placeNow());
      const timesCut = whole.map((l) => l.replace(/^( *timeline {2}(?:try 1 {2}filed|run {2}queued) ).*$/, '$1<times>'));
      assert.deepEqual(
        timesCut,
        [
          '<id>  add a flag',
          '  pruned at <at> — its worktrees were removed (nemia prune); its branches, record and files are kept',
          '',
          '  BLOCKED: implement',
          '  OVER BUDGET: implement ($3.40 of $3)  — nothing more is filed for it, raised or not, since the run was pruned at <at> — its worktrees were removed (nemia prune); nothing after it ran',
          '',
          '  touched  wf/<id>/run',
          '    (root)  1 file   +1 −0',
          '  lesson  nothing written where the next agent reads',
          '',
          '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
          '  none',
          '',
          '  implement  BLOCKED',
          '    used  responses not measured · tool calls not measured · tokens in not measured · tokens out not measured',
          '    cost  $3.40 · budget $3',
          '    timeline  try 1  filed <times>',
          '    did it',
          '    needs: a word',
          '',
          '  cost  run $3.40',
          '  timeline  run  queued <times>',
          '',
          '  wf/<id>/run  — 1 file: +1 −0',
          '',
          '  branch    wf/<id>/run is ahead of main by 1 commit',
          '',
          '  ship it   git -C <repo> merge --no-ff wf/<id>/run',
          '  drop it   git -C <repo> branch -D wf/<id>/run',
        ],
        'the whole screen, in order, each timeline cut where the times the stand-in stamps off the wall clock start',
      );
    },
  );
});

test('REFUSED before anything is read: what `nemia prune` does not take, and an id that is not a name — and the lines `pruneLines` and `sizeOf` say', async (t) => {
  const b = board();
  await t.test('REFUSED: a flag it does not take, and one near a flag it does, exit 2, naming the flag', async () => {
    const flag = await typed(t, b.e, 'prune', '--force');
    assert.equal(flag.error?.exitCode, 2);
    names(flag.error?.message, 'nemia prune does not take --force');
    const near = await typed(t, b.e, 'prune', '--artifact');
    assert.equal(near.error?.exitCode, 2, 'a flag near it is not taken for it');
    names(near.error?.message, '--artifact.', '--artifacts');
  });
  for (const id of ['../x', 'r-1.pruned'])
    await t.test(`REFUSED: ${id}, an id that is not a name, exit 2, naming nemia prune`, async () => {
      names(idRefusal(id, 'prune'), 'nemia prune');
      await assert.rejects(runWith(b.e, prune(id)), (err: Error & { exitCode?: number }) => {
        assert.equal(err.exitCode, 2);
        names(err.message, 'nemia prune');
        return true;
      });
    });
  await t.test('`sizeOf` says a size as a person reads it', () => {
    assert.equal(sizeOf(3 * 1024 ** 3), '3.00 GB');
    assert.equal(sizeOf(1536 * 1024), '1.5 MB');
  });
  await t.test('`pruneLines`: a run pruned, a worktree with its size, a worktree git would not remove with its fix', () => {
    const lines = pruneLines({
      id: 'r-1',
      kind: 'pruned',
      worktrees: [{ path: '/w/a', bytes: 2048 }],
      left: [{ path: '/w/b', git: 'fatal: nope', fix: 'git -C /w/b status' }],
    });
    assert.equal(lines.length, 3);
    names(lines[0], 'r-1  pruned', 'removed 1 worktree', '2.0 KB freed', 'its record, branches and files are kept');
    assert.equal(lines[1], '   /w/a  2.0 KB');
    names(lines[2], '   kept /w/b', 'fatal: nope', 'git -C /w/b status');
  });
  await t.test('`pruneLines`: files that would not go are offered the prune that removes them later, `--unmerged` given again', () => {
    const files = { path: '/s/runs/r-1/artifacts', files: 'EACCES' } as const;
    const unmerged = pruneLines({ id: 'r-1', kind: 'pruned', worktrees: [], left: [files], unmerged: true }).at(-1);
    names(unmerged, '/s/runs/r-1/artifacts', 'EACCES', 'nemia prune r-1 --unmerged --artifacts');
    const merged = pruneLines({ id: 'r-1', kind: 'pruned', worktrees: [], left: [files] }).at(-1);
    names(merged, 'nemia prune r-1 --artifacts');
    assert.ok(!merged!.includes('--unmerged'), merged);
  });
});

/** A finished merged run judged and sized now, as a prune that removes it later holds it. */
const readyNow = async (b: Board, id: string) => {
  const judged = await runWith(b.e, judging(id));
  assert.ok('ready' in judged, `${id} is ready to prune`);
  return runWith(b.e, sized(judged.ready));
};

test('the mark of a run another prune freed since it was judged: a removal on the older judgement leaves that mark, its worktree and its time', async () => {
  const b = board();
  const { run, wt } = await aFinished(b, { merged: true });
  const stale = await readyNow(b, run.id);
  assert.equal((await runWith(b.e, prune(run.id, { yes: true }))).kind, 'pruned');
  const first = readRun(run.id).pruned!;
  assert.deepEqual(
    first.worktrees.map((w) => w.path),
    [wt],
  );
  const [late] = await runWith(b.e, freeing([stale]));
  assert.deepEqual(late.worktrees, [], 'the later removal removed nothing');
  assert.equal(late.left.length, 1, 'and says the worktree it found gone');
  assert.deepEqual(readRun(run.id).pruned, first, "the mark is the first prune's, whole");
});

test('the mark of a run another prune frees while this one asks its removal: the mark that prune wrote stays, though this one removed nothing', async () => {
  const b = board();
  const { run, wt } = await aFinished(b, { merged: true });
  const other = { at: '2026-01-01T00:00:00.000Z', worktrees: [{ path: wt, bytes: 7 }] };
  const between = PlaceService.layer(
    placeOver(placeNow(), {
      remove: (request) => {
        const theirs = placeNow().askNow('remove', request);
        assert.ok('answer' in theirs && theirs.answer.removed.length === 1, 'the other prune removed the worktree');
        runStore.runs.prune(run.id, other);
        return {
          answer: { ...theirs.answer, removed: [], left: request.workspaces.map((at) => ({ path: at, said: 'is not a working tree' })) },
        };
      },
    }),
  );
  const done = await runWith(b.e, prune(run.id, { yes: true }).pipe(Effect.provide(between)));
  assert.deepEqual([done.worktrees, done.left.length], [[], 1]);
  assert.ok(!fs.existsSync(wt));
  assert.deepEqual(readRun(run.id).pruned, other, 'the run reads pruned, by the mark of the prune that removed its worktree');
});

test('the mark of a run whose removal was not heard and removed all the same: the run reads pruned, with the worktree that is gone, and its line says the removal unread', async () => {
  const b = board();
  const { run, wt } = await aFinished(b, { merged: true });
  const deaf = PlaceService.layer(
    placeOver(placeNow(), {
      remove: (request) => {
        placeNow().askNow('remove', request);
        return unreadBy('remove', 'the removal was not heard');
      },
    }),
  );
  const done = await runWith(b.e, prune(run.id, { yes: true }).pipe(Effect.provide(deaf)));
  assert.deepEqual(
    done.left.map((l) => [l.path, 'unread' in l ? l.unread : null]),
    [[wt, 'the removal was not heard']],
  );
  assert.ok(!fs.existsSync(wt), 'the worktree went');
  const mark = readRun(run.id).pruned;
  assert.deepEqual(
    mark?.worktrees.map((w) => w.path),
    [wt],
    `the mark stays and lists it: ${JSON.stringify(mark)}`,
  );
  assert.equal((await runWith(b.e, prune(run.id))).kind, 'nothing', 'and the next prune has nothing to do');
});

/** Finished merged runs, `count` of them, each in the repository `repos` names in its turn: their ids, and their worktrees by id. */
const finishedIn = async (b: Board, repos: readonly string[], count: number) => {
  const ids: string[] = [];
  const wts = new Map<string, string>();
  for (let k = 0; k < count; k++) {
    const { run, wt } = await aFinished(b, { merged: true, repo: repos[k % repos.length], work: `fix-${ids.length}-${k}.ts` });
    ids.push(run.id);
    wts.set(run.id, wt);
  }
  return { ids, wts };
};

/** What a place was asked, verb by verb, in order. */
type Asked = Array<{ verb: PlaceVerb; request: PlaceRequests[PlaceVerb] }>;

/** `place`, every question noted in `asked` before it is answered. */
const counting = (place: Place, asked: Asked): Place => ({
  declared: place.declared,
  ask: (verb, request, options) => {
    asked.push({ verb, request });
    return place.ask(verb, request, options);
  },
  askNow: (verb, request, options) => {
    asked.push({ verb, request });
    return place.askNow(verb, request, options);
  },
});

/** The run each `inventory` in `asked` was asked of, by the folder of worktrees it named. */
const inventoried = (asked: Asked): string[] =>
  asked.flatMap((a) => (a.verb === 'inventory' ? [path.basename((a.request as PlaceRequests['inventory']).under)] : []));

/** Each `remove` in `asked`, as it was asked. */
const removes = (asked: Asked): PlaceRequests['remove'][] =>
  asked.flatMap((a) => (a.verb === 'remove' ? [a.request as PlaceRequests['remove']] : []));

const kindsOf = (turned: readonly Turned[]) => turned.map((d) => ('failed' in d ? 'failed' : d.pruning.kind));

test(
  '`judgingMany` over more runs than its bound: no more than PRUNE_A_TURN inventories are asked at once, one a run, and the runs are answered in the order named whatever order they ended in',
  WAITED,
  async (t) => {
    const b = board();
    const { ids } = await finishedIn(b, [aRepo()], 2 * PRUNE_A_TURN + 1);
    const held = placeHeld(placeNow(), 'inventory');
    const judged = runEngine(b.e, judgingMany(ids).pipe(Effect.provide(PlaceService.layer(held.place))));
    for (let left = ids.length; left > 0; left--) {
      const due = Math.min(PRUNE_A_TURN, left);
      await until(
        t,
        () => held.waiting() >= due,
        () => `${due} inventories asked at once, ${left} runs left: ${held.waiting()} wait`,
        {
          bell: held.bell,
        },
      );
      held.letGo();
    }
    const listed = await judged;
    assert.equal(held.most(), PRUNE_A_TURN, 'the bound is met, and never passed');
    assert.deepEqual(
      held.requests.map((r) => path.basename(r.under)),
      ids,
      'each run is asked its inventory once, in the order named',
    );
    assert.deepEqual(
      listed.map((l) => l.id),
      ids,
      'the last asked was let go first each time, and the answers are in the order named all the same',
    );
    assert.ok(
      listed.every((l) => 'ready' in l && l.ready && l.pruning.kind === 'prunable'),
      'each ready, sized',
    );
  },
);

test('under --yes a run is judged once, and the ready runs of one repository go by one `remove` with every worktree; of two repositories in a turn, by two, and the turn is told in the order listed', async () => {
  const b = board();
  const one = await finishedIn(b, [aRepo()], 3);
  const asked: Asked = [];
  const place = PlaceService.layer(counting(placeNow(), asked));
  const listed = await runEngine(b.e, judgingMany(one.ids).pipe(Effect.provide(place)));
  const done = await runEngine(b.e, freeingMany(listed, { yes: true }).pipe(Effect.provide(place)));
  assert.deepEqual(kindsOf(done), ['pruned', 'pruned', 'pruned']);
  assert.deepEqual(inventoried(asked), one.ids, 'one inventory a run: the listing is the judgement the removal goes on');
  assert.equal(removes(asked).length, 1, 'one remove for the three runs');
  assert.deepEqual(
    [removes(asked)[0].workspaces, removes(asked)[0].branches],
    [one.ids.map((id) => one.wts.get(id)), []],
    'with the worktree of each, and no branch',
  );
  assert.ok(one.ids.every((id) => !fs.existsSync(one.wts.get(id)!) && readRun(id).pruned?.worktrees.length === 1));

  const repos = [aRepo(), aRepo()];
  const two = await finishedIn(b, repos, 3);
  asked.length = 0;
  const told: string[][] = [];
  const mixed = await runEngine(b.e, judgingMany(two.ids).pipe(Effect.provide(place)));
  const freed = await runEngine(
    b.e,
    freeingMany(mixed, { yes: true }, (turn) => void told.push(turn.map((d) => d.id))).pipe(Effect.provide(place)),
  );
  assert.deepEqual(
    removes(asked).map((r) => [r.repo, r.workspaces]),
    [
      [repos[0], [two.wts.get(two.ids[0]), two.wts.get(two.ids[2])]],
      [repos[1], [two.wts.get(two.ids[1])]],
    ],
    'a remove a repository, each with its own worktrees',
  );
  assert.deepEqual(told, [two.ids], 'one turn, told once, in the order listed and not by repository');
  assert.deepEqual(
    freed.map((d) => d.id),
    two.ids,
  );
  assert.deepEqual(kindsOf(freed), ['pruned', 'pruned', 'pruned']);
});

test('after a prompt each run is judged again before its removal: one whose worktree took a change since the listing is refused and kept, and the other is pruned', async () => {
  const b = board();
  const { ids, wts } = await finishedIn(b, [aRepo()], 2);
  const asked: Asked = [];
  const place = PlaceService.layer(counting(placeNow(), asked));
  const listed = await runEngine(b.e, judgingMany(ids).pipe(Effect.provide(place)));
  const wt = wts.get(ids[0])!;
  fs.writeFileSync(path.join(wt, 'lost.ts'), 'lost\n');
  const done = await runEngine(b.e, freeingMany(listed, { yes: false }).pipe(Effect.provide(place)));
  assert.deepEqual(kindsOf(done), ['refused', 'pruned']);
  names('pruning' in done[0] ? done[0].pruning.refusal : undefined, wt, 'lost.ts');
  assert.ok(fs.existsSync(wt) && !under('runs', `${ids[0]}.pruned`), 'the changed worktree stands, and its run is not marked');
  assert.ok(!fs.existsSync(wts.get(ids[1])!));
  assert.deepEqual(inventoried(asked).sort(), [...ids, ...ids].sort(), 'each run judged for the listing, and again for its removal');
  assert.equal(removes(asked).length, 1);
  assert.deepEqual(removes(asked)[0].workspaces, [wts.get(ids[1])], 'the run refused is in no remove');
});

test(
  'more ready runs of one repository than a turn carries: a `remove` of PRUNE_A_TURN runs, then one of the rest once the first has answered, never two at once',
  WAITED,
  async (t) => {
    const b = board();
    const { ids, wts } = await finishedIn(b, [aRepo()], PRUNE_A_TURN + 1);
    const held = placeHeld(placeNow(), 'remove');
    const listed = await runEngine(b.e, judgingMany(ids).pipe(Effect.provide(PlaceService.layer(held.place))));
    const told: string[][] = [];
    const freed = runEngine(
      b.e,
      freeingMany(listed, { yes: true }, (turn) => void told.push(turn.map((d) => d.id))).pipe(
        Effect.provide(PlaceService.layer(held.place)),
      ),
    );
    await until(t, () => held.waiting() >= 1, 'the first remove asked', { bell: held.bell });
    assert.deepEqual(
      held.requests.map((r) => r.workspaces),
      [ids.slice(0, PRUNE_A_TURN).map((id) => wts.get(id))],
      'the first turn alone is asked while it has not answered',
    );
    assert.deepEqual(told, [], 'and no turn is told before it ends');
    held.letGo();
    await until(t, () => held.waiting() >= 1, 'the second remove asked', { bell: held.bell });
    assert.deepEqual(told, [ids.slice(0, PRUNE_A_TURN)], 'the first turn is told as it ends, before the second is asked');
    held.letGo();
    assert.deepEqual(
      kindsOf(await freed),
      ids.map(() => 'pruned'),
    );
    assert.deepEqual(held.requests[1].workspaces, [wts.get(ids[PRUNE_A_TURN])]);
    assert.equal(held.most(), 1);
    assert.deepEqual(told, [ids.slice(0, PRUNE_A_TURN), ids.slice(PRUNE_A_TURN)]);
  },
);

test(
  'the mark of a never-pruned run two prunes overlap on, neither removing anything: no mark is left, whichever ends first',
  WAITED,
  async (t) => {
    const b = board();
    const { run, wt } = await aFinished(b, { merged: true });
    const refusing = placeOver(placeNow(), {
      remove: (request) => ({
        answer: {
          removed: [],
          left: request.workspaces.map((at) => ({ path: at, said: 'contains untracked files' })),
          deleted: [],
          kept: [],
        },
      }),
    });
    const held = placeHeld(refusing, 'remove');
    const judged = await runEngine(b.e, judging(run.id).pipe(Effect.provide(PlaceService.layer(held.place))));
    assert.ok('ready' in judged, 'ready to prune');
    const ready = await runWith(b.e, sized(judged.ready));
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    for (const ends of ['first', 'last'] as const) {
      const one = runWith(b.e, freeing([ready]));
      await until(t, () => held.waiting() >= 1, 'the first removal asked', { bell: held.bell });
      t.mock.timers.tick(1000);
      const other = runWith(b.e, freeing([ready]));
      await until(t, () => held.waiting() >= 2, 'the second removal asked', { bell: held.bell });
      assert.ok(under('runs', `${run.id}.pruned`), 'marked while its removals are asked');
      held.letGo(ends);
      await (ends === 'first' ? one : other);
      held.letGo();
      const done = [...(await one), ...(await other)];
      assert.deepEqual(
        done.map((d) => [d.worktrees.length, d.left.length]),
        [
          [0, 1],
          [0, 1],
        ],
        'neither removed anything',
      );
      assert.ok(fs.existsSync(wt), 'the worktree stands');
      assert.equal(readRun(run.id).pruned, undefined, `the ${ends} to ask ended first: the run is not marked`);
    }
  },
);

test('after a prompt, runs freed since the listing say nothing is left, and their place forgets them by the `remove` their turn asks of their repository, or by one of nothing where it asks none', async () => {
  const b = board();
  const asked: Asked = [];
  const place = PlaceService.layer(counting(placeNow(), asked));
  const beside = await finishedIn(b, [aRepo()], 3);
  const listed = await runWith(b.e, judgingMany(beside.ids));
  for (const id of beside.ids.slice(0, 2)) assert.equal((await runWith(b.e, prune(id, { yes: true }))).kind, 'pruned');
  const done = await runEngine(b.e, freeingMany(listed, { yes: false }).pipe(Effect.provide(place)));
  assert.deepEqual(kindsOf(done), ['nothing', 'nothing', 'pruned']);
  assert.deepEqual(
    removes(asked).map((r) => r.workspaces),
    [[beside.wts.get(beside.ids[2])]],
    "one remove in the repository, the ready run's: it prunes what the place lists of the two already gone",
  );

  const alone = await finishedIn(b, [aRepo()], 2);
  const gone = await runWith(b.e, judgingMany(alone.ids));
  for (const id of alone.ids) assert.equal((await runWith(b.e, prune(id, { yes: true }))).kind, 'pruned');
  asked.length = 0;
  const left = await runEngine(b.e, freeingMany(gone, { yes: false }).pipe(Effect.provide(place)));
  assert.deepEqual(kindsOf(left), ['nothing', 'nothing']);
  assert.deepEqual(
    removes(asked).map((r) => r.workspaces),
    [[]],
    'one remove of nothing for the two runs of the repository, never one a run',
  );
});
