/**
 * `nemia hold`: a person's word that a run files nothing more until other runs ship, told on the stage (`story.ts`) — the test place and
 * the engine's stand-in. The story: a run held until another ships, said by every screen with the person's why and who, nothing filed
 * nor asked of anyone while it stands, and lifted by the tick once the run it names ships — which is where it meets `--after`
 * (`waiting.test.ts`). Beside it, one table of what `nemia hold` refuses, how a hold's file written by hand reads, and the claims kept
 * focused: a circle, a hold read in the middle of a pass, a hold put again in a race, the typed failures and the defects. `--until=<run>`
 * is the same flag as `--until <run>`: nothing is refused of it but the run it names.
 *
 * Its words, pure, are in `src/wait/wait.test.ts`; a hold refused where git alone can say why — another base branch, a result branch
 * removed by hand — is in `hold-git.boundary.test.ts`, on real git. Two whole screens of a loop out of rounds live here too. A store of
 * its own, since `WF_ROOT` is read once, as the package loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Engine, EngineService } from '../src/runtime-client.ts';
import type { Refusal } from '../src/refusal/refusal.ts';
import type { Holding } from '../src/wait/wait.verb.ts';
import type { Effect as EffectOf } from 'effect/Effect';
import type { Run } from '../src/run.ts';
import type { PlaceService } from '../src/place/place.store.ts';
import { Effect } from 'effect';
import { scratch } from './scratch.ts';
import { decideScreen } from './screens.ts';
import { staged, story, type Board } from './story.ts';
import { names } from './assessed.ts';

const ROOT = scratch('wf-hold-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  acceptRun,
  advanceRun,
  BY_CAP,
  approveRun,
  decideRun,
  forgetRun,
  hold,
  holdRefusal,
  holdWord,
  prune,
  retryRun,
  roundRun,
  sayRun,
  startRun,
  unhold,
  WHY_CAP,
  runWith,
} = await import('../src/runner.ts');
const { listRuns, readRun } = await import('../src/record/record.store.ts');
const { passStanding } = await import('../src/standing/standing.verb.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const world = () => stage.place().world;
const holdFileOf = (id: string) => path.join(ROOT, 'runs', `${id}.hold`);
/** A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what `nemia ls` reads. */
const aPass = (e: Engine) => stage.runWith(e, passStanding(listRuns()));
/** One pass of the tick over `run`, as read now or as given. */
const tick = (b: Board, run: Run | string) => stage.runWith(b.e, advanceRun(typeof run === 'string' ? readRun(run) : run));

/**
 * The hold on `id` made one that code older than `nemia hold --by` wrote: its file without `by`, which every screen says as the plain
 * `held until <run> ships`.
 */
const asOlder = (id: string): void => {
  const { by, ...older } = JSON.parse(fs.readFileSync(holdFileOf(id), 'utf8')) as { by?: string };
  assert.equal(by, os.userInfo().username, `a hold put with no --by is put by the OS user`);
  fs.writeFileSync(holdFileOf(id), JSON.stringify(older, null, 2));
};

/** A repository with one commit. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  world().repository(repo, { 'README.md': 'readme\n' });
  return repo;
};
/** A workflow folder of these files, by name. */
const folderOf = (prefix: string, files: Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, prefix));
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text);
  return dir;
};
/** A workflow of one step, `implement`. */
const oneStep = () => folderOf('one-', { 'implement.md': '---\nplace: git\n---\nimplement it\n' });
/** Two steps, `implement` at its gate and `review` after it. */
const gated = () =>
  folderOf('gated-', {
    'implement.md': '---\nplace: git\ngate: true\n---\nimplement it\n',
    'review.md': '---\nafter: implement\nplace: git\n---\nreview it\n',
  });
/** Two steps, `implement` and `review` after it. */
const twoSteps = () =>
  folderOf('two-', {
    'implement.md': '---\nplace: git\n---\nimplement it\n',
    'review.md': '---\nafter: implement\nplace: git\n---\nreview it\n',
  });
/** Four steps: `a` and `b`, each with a check, `d` with none, and `c` after `d`. */
const twoChecks = () =>
  folderOf('checks-', {
    'a.md': '---\nplace: git\ncheck: npm test\n---\ndo a\n',
    'b.md': '---\nplace: git\ncheck: npm test\n---\ndo b\n',
    'd.md': '---\nplace: git\n---\ndo d\n',
    'c.md': '---\nafter: d\nplace: git\n---\ndo c\n',
  });
/** A loop: `implement`, then `review`, which may send it back once. */
const looping = () =>
  folderOf('loop-', {
    'implement.md': '---\nplace: git\n---\nimplement it\n',
    'review.md': '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\nrounds: 1\n---\nreview it\n',
    'review.schema.json': JSON.stringify({
      type: 'object',
      properties: { again: { type: 'boolean' } },
      required: ['again'],
      additionalProperties: false,
    }),
  });

/** `file` committed in the checkout `wt`, as a session commits its work. */
const committed = (wt: string, file: string) => {
  fs.writeFileSync(path.join(wt, file), 'export const done = true;\n');
  world().commit(wt, `add ${file}`);
};
/** `branch` merged into `repo`'s checkout and committed, as a person merges a result by hand. */
const mergedByHand = (repo: string, branch: string): void => {
  world().stage(repo, branch);
  world().commit(repo, 'merge');
};

/** A run of `oneStep` in `repo`, its step filed, a file committed on its branch and signed off: merged into main with `merged`. */
const aDone = async (b: Board, repo: string, { merged = false } = {}) => {
  const run = await stage.runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: oneStep() }));
  await tick(b, run.id);
  committed(readRun(run.id).steps.implement.workspace!, `fix-${run.id}.ts`);
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await tick(b, run.id);
  if (merged) mergedByHand(repo, readRun(run.id).steps.implement.branch!);
  return run;
};
/** A run of `oneStep` in `repo`, its step filed and still running. */
const aRunning = async (b: Board, repo: string) => {
  const run = await stage.runPlaced(startRun({ brief: 'still going', repo, workflowDir: oneStep() }));
  await tick(b, run.id);
  return run;
};
/** A run of `workflowDir` in `repo`, started and not yet ticked. */
const aStarted = (repo: string, brief: string, workflowDir = oneStep(), more: Partial<Parameters<typeof startRun>[0]> = {}) =>
  stage.runPlaced(startRun({ brief, repo, workflowDir, ...more }));

/** `nemia <verb>`, through the CLI, as a person types it: the lines it printed, and the error it ended with, if it did. */
const typed = async (t: TestContext, ...argv: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => {
    printed.push(a.join(' '));
  });
  try {
    await stage.main(argv);
    return { printed: printed.join('\n'), error: undefined };
  } catch (err) {
    return { printed: printed.join('\n'), error: err as Error & { exitCode?: number; _tag?: string } };
  } finally {
    log.mock.restore();
  }
};
/** `nemia <verb>` answered, printing what it printed. */
const said = async (t: TestContext, ...argv: string[]): Promise<string> => {
  const { printed, error } = await typed(t, ...argv);
  assert.equal(error, undefined, `nemia ${argv.join(' ')}: ${error?.message}`);
  return printed;
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

const VERBS = /nemia (approve|retry|round|accept) /;

/** `text` as a pattern that matches it and nothing else inside a line. */
const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A run at its gate on `b`: `implement` signed, `review` held back by the gate. */
const atItsGate = async (b: Board, repo: string, brief: string) => {
  const run = await aStarted(repo, brief, gated());
  await tick(b, run.id);
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await tick(b, run.id);
  return run;
};

test('a run held until another ships: said by every screen with why and who, nothing filed nor asked while it stands, and lifted by the tick when it ships', async (t) => {
  const s = story(t);
  const b = stage.board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const user = os.userInfo().username;
  const why = ['--why', 'merge conflicts in five files', '--by', 'operator'];
  const words = `held until ${target.id} ships (why: merge conflicts in five files; by operator)`;
  let run = { id: '' } as Run;

  await s.test('`nemia hold <run> --until <run>` says the hold back, put by the OS user, and writes no why', async (sub) => {
    run = await aStarted(repo, 'waits for the target');
    assert.equal(
      await said(sub, 'hold', run.id, '--until', target.id),
      `${run.id}  held until ${target.id} ships (by ${user}) — nothing more of it is filed, and nothing is asked of you, until then; the next tick lifts the hold`,
    );
    const file = JSON.parse(fs.readFileSync(holdFileOf(run.id), 'utf8')) as Record<string, unknown>;
    assert.deepEqual(Object.keys(file), ['at', 'until', 'by'], 'a hold put with no --why writes no why');
    assert.equal(file.by, user, 'nor --by: it is put by the OS user');
  });
  await s.test("`--why` and `--by` write the person's why, one line, and who they are into the file, and say them back", async (sub) => {
    const withWords = await aStarted(repo, 'held with words');
    const printed = await said(sub, 'hold', withWords.id, '--until', target.id, '--why', '  two\n words ', '--by', 'operator');
    assert.deepEqual(
      (({ why: w, by }) => ({ why: w, by }))(JSON.parse(fs.readFileSync(holdFileOf(withWords.id), 'utf8')) as Record<string, unknown>),
      {
        why: 'two words',
        by: 'operator',
      },
    );
    assert.equal(
      printed,
      `${withWords.id}  held until ${target.id} ships (why: two words; by operator) — nothing more of it is filed, and nothing is asked of you, until then; the next tick lifts the hold`,
    );
    const plain = await aStarted(repo, 'held with none');
    await said(sub, 'hold', plain.id, '--until=' + target.id, '--why=it waits');
    assert.equal(readRun(plain.id).hold?.why, 'it waits', '--why=<words> is --why <words>');
    await said(sub, 'hold', plain.id, '--off');
    await said(sub, 'hold', plain.id, '--until', target.id);
    assert.deepEqual(
      Object.keys(JSON.parse(fs.readFileSync(holdFileOf(plain.id), 'utf8')) as object),
      ['at', 'until', 'by'],
      'held again with no --why after a lift: no why of the lifted hold survives',
    );
    const nameless = await aStarted(repo, 'held by a user the system cannot name');
    sub.mock.method(os, 'userInfo', () => {
      throw new Error('ENOENT: no such file or directory, uv_os_get_passwd');
    });
    await said(sub, 'hold', nameless.id, '--until', target.id, '--why', 'w');
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(holdFileOf(nameless.id), 'utf8')) as object), ['at', 'until', 'why']);
  });
  await s.test(
    'a held run files nothing, and the feed says the hold — its words where it has them — and not that the run waits on you',
    async () => {
      asOlder(run.id);
      await tick(b, run.id);
      const quiet = await tick(b, run.id);
      assert.ok(!b.filings.includes(`${run.id}-implement`), 'nothing filed while held');
      assert.equal(quiet.feed.run.note, `held until ${target.id} ships`, 'a hold older code wrote: the plain line');
      const worded = await aStarted(repo, 'held before it files');
      assert.equal((await typed(t, 'hold', worded.id, '--until', target.id, ...why)).error, undefined);
      assert.equal((await tick(b, worded.id)).feed.run.note, words, "the feed's note says the words");
    },
  );
  await s.test('`nemia ls` and `nemia decide` say the hold and how to lift it', async (sub) => {
    await aPass(b.e);
    assert.match(await said(sub, 'ls', run.id), new RegExp(`→ held until ${target.id} ships  —  nemia hold ${run.id} --off lifts it`));
    assert.match(
      await said(sub, 'decide', run.id),
      new RegExp(
        `\n  held until ${target.id} ships\n  nothing of ${run.id} is filed, and nothing is asked of you, until nemia decide says ${target.id} has shipped`,
      ),
    );
  });
  await s.test('a hold written between the read and the filing holds: the pass checks the file at the filing', async () => {
    const other = await aStarted(repo, 'read before its hold');
    const stale = readRun(other.id);
    fs.writeFileSync(holdFileOf(other.id), JSON.stringify({ at: 'by hand', until: [target.id] }));
    await tick(b, stale);
    assert.ok(!b.filings.includes(`${other.id}-implement`), 'a run read before the hold was put is not filed on that read');
  });
  await s.test(
    'REFUSED while held: an approval and a retry — `nemia ls`, `nemia decide` and decide offer neither, but say the hold, with its words; the gate is asked again once it lifts',
    async (sub) => {
      const atGate = await atItsGate(b, repo, 'at its gate');
      assert.match(await said(sub, 'ls', atGate.id), /waiting on you: approve implement/, 'the gate is asked before');
      const olderGate = await atItsGate(b, repo, 'at its gate, held by older code');
      await said(sub, 'hold', atGate.id, '--until', target.id, ...why);
      await said(sub, 'hold', olderGate.id, '--until', target.id);
      asOlder(olderGate.id);
      const held = `${atGate.id} is held until ${target.id} ships`;
      await assert.rejects(
        stage.runWith(b.e, approveRun(atGate.id, 'implement')),
        refusedNaming('Conflict', held, 'an approval would release', `nemia hold ${atGate.id} --off`),
      );
      await assert.rejects(
        stage.runWith(b.e, retryRun(atGate.id, 'implement', { mode: 'nudge', message: 'change it' })),
        refusedNaming('Conflict', held, 'a retry would release'),
      );
      await aPass(b.e);
      const ls = await said(sub, 'ls', atGate.id);
      assert.doesNotMatch(ls, /waiting on you/, ls);
      assert.doesNotMatch(ls, VERBS, ls);
      assert.match(ls, new RegExp(`→ ${literal(words)}  —  nemia hold ${atGate.id} --off lifts it`), ls);
      assert.match(ls, new RegExp(`${literal(words)}; its approval is asked once the hold lifts`), ls);
      const olderLs = await said(sub, 'ls', olderGate.id);
      assert.match(olderLs, new RegExp(`→ held until ${target.id} ships  —  nemia hold ${olderGate.id} --off lifts it`), olderLs);
      assert.match(olderLs, new RegExp(`held until ${target.id} ships; its approval is asked once the hold lifts`), olderLs);
      const screen = await said(sub, 'decide', atGate.id);
      assert.doesNotMatch(screen, /waiting on you|AWAITING APPROVAL/, screen);
      assert.doesNotMatch(screen, VERBS, screen);
      assert.match(screen, new RegExp(`\n  ${literal(words)}\n`), screen);
      assert.match(await said(sub, 'decide', olderGate.id), new RegExp(`\n  held until ${target.id} ships\n`));
      const d = await stage.runWith(b.e, decideRun(atGate.id));
      assert.deepEqual([d.retrying, d.rounding, d.offers, d.answering], [[], [], [], {}]);
      assert.deepEqual(
        d.gates,
        { implement: `awaiting approval:  ${words}; its approval is asked once the hold lifts` },
        'the gate stays on the record, said with no verb',
      );
      assert.deepEqual(d.holding, [{ run: target.id }]);
      assert.deepEqual((await stage.runWith(b.e, decideRun(olderGate.id))).gates, {
        implement: `awaiting approval:  held until ${target.id} ships; its approval is asked once the hold lifts`,
      });
      const approvals = path.join(ROOT, 'runs', `${atGate.id}.approvals`);
      fs.mkdirSync(approvals, { recursive: true });
      fs.writeFileSync(path.join(approvals, 'implement'), JSON.stringify({ at: new Date().toISOString(), step: 'implement' }));
      await tick(b, atGate.id);
      assert.ok(!b.filings.includes(`${atGate.id}-review`), 'a pass files nothing on an approval written by hand beside the hold');
      fs.rmSync(approvals, { recursive: true });
      assert.equal(
        await said(sub, 'hold', atGate.id, '--off'),
        `${atGate.id}  hold lifted — the next tick goes on, and what its steps ask is asked`,
      );
      assert.match(await said(sub, 'ls', atGate.id), /waiting on you: approve implement/, 'lifted by hand, the gate is asked again');
      assert.match(await said(sub, 'decide', atGate.id), new RegExp(`nemia approve ${atGate.id} implement`));
    },
  );
  await s.test(
    'REFUSED while held: a loop out of rounds is offered neither once more nor enough, and both are refused; asked again on the lift',
    async (sub) => {
      const loop = await outOfRounds(b, repo);
      assert.match(await said(sub, 'decide', loop.id), /ROUNDS EXHAUSTED, waiting on you/);
      await said(sub, 'hold', loop.id, '--until', target.id);
      const held = `${loop.id} is held until ${target.id} ships`;
      await assert.rejects(stage.runWith(b.e, roundRun(loop.id, 'review')), refusedNaming('Conflict', held, 'a round would release'));
      await assert.rejects(
        stage.runWith(b.e, acceptRun(loop.id, 'review', 'as it stands')),
        refusedNaming('Conflict', held, 'an acceptance would release'),
      );
      const loopScreen = await said(sub, 'decide', loop.id);
      assert.doesNotMatch(loopScreen, /waiting on you|ROUNDS EXHAUSTED/, loopScreen);
      assert.doesNotMatch(loopScreen, VERBS, loopScreen);
      const loopLs = await said(sub, 'ls', loop.id);
      assert.doesNotMatch(loopLs, /waiting on you/, loopLs);
      assert.doesNotMatch(loopLs, VERBS, loopLs);
      assert.equal((await stage.runWith(b.e, unhold(loop.id))).run.id, loop.id);
      assert.match(await said(sub, 'decide', loop.id), /ROUNDS EXHAUSTED, waiting on you/);
    },
  );
  await s.test(
    "a blocked step's question stays on its record while the run is held, asked of nobody, and is asked again once the hold lifts",
    async (sub) => {
      const asking = await aStarted(repo, 'asks a question', twoSteps());
      await tick(b, asking.id);
      b.settle(`${asking.id}-implement`, 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'which colour?' });
      await tick(b, asking.id);
      assert.match(await said(sub, 'ls', asking.id), /waiting on you: implement/);
      await stage.runWith(b.e, hold(asking.id, [target.id]));
      const ls = await said(sub, 'ls', asking.id);
      assert.doesNotMatch(ls, /waiting on you/, ls);
      assert.doesNotMatch(ls, VERBS, ls);
      const screen = await said(sub, 'decide', asking.id);
      assert.doesNotMatch(screen, /waiting on you|BLOCKED/, screen);
      assert.doesNotMatch(screen, VERBS, screen);
      assert.equal((await stage.runWith(b.e, decideRun(asking.id))).decision.kind, 'running');
      assert.equal(readRun(asking.id).steps.implement.taskId, `${asking.id}-implement`, 'the step and its closeout are untouched');
      const asks = path.join(ROOT, 'runs', `${asking.id}.asks`);
      fs.mkdirSync(asks, { recursive: true });
      fs.writeFileSync(path.join(asks, 'retry-implement-2'), JSON.stringify({ mode: 'nudge' }));
      const filings = [...b.filings];
      const pass = await tick(b, asking.id);
      assert.deepEqual(
        [pass.blocked, pass.tried, b.filings],
        [['review'], [], filings],
        'a try written by hand beside the hold is no try due: nothing is filed, and what the blocked step stops is still read as stopped',
      );
      assert.doesNotMatch(await said(sub, 'ls', asking.id), /asked|files it/);
      fs.rmSync(asks, { recursive: true });
      await stage.runWith(b.e, unhold(asking.id));
      assert.match(await said(sub, 'ls', asking.id), /waiting on you: implement/);
      assert.match(await said(sub, 'decide', asking.id), /which colour\?/);
    },
  );
  await s.test(
    'REFUSED while held or pruned: nemia say to a step that has settled offers no nemia retry, which either refuses',
    async () => {
      const done = await aDone(b, repo);
      const blocked = await aRunning(b, repo);
      b.settle(`${blocked.id}-implement`, 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'a word' });
      await tick(b, blocked.id);
      await assert.rejects(
        stage.runWith(b.e, sayRun(blocked.id, 'implement', 'hello')),
        (err: Error) => /: nemia retry /.test(err.message),
        'offered before the hold on a step that signed off blocked: settled, and the run not finished, so it may be held',
      );
      await stage.runWith(b.e, hold(blocked.id, [target.id]));
      await assert.rejects(stage.runWith(b.e, sayRun(blocked.id, 'implement', 'hello')), (err: Error & { exitCode?: number }) => {
        assert.equal(err.exitCode, 2);
        names(err.message, `no try is filed while ${blocked.id} is held until ${target.id} ships`, `nemia hold ${blocked.id} --off`);
        assert.doesNotMatch(err.message, VERBS);
        return true;
      });
      await stage.runWith(b.e, unhold(blocked.id));
      assert.equal((await stage.runWith(b.e, prune(done.id, { yes: true, unmerged: true }))).kind, 'pruned');
      await assert.rejects(
        stage.runWith(b.e, sayRun(done.id, 'implement', 'hello')),
        (err: Error) => /Nor is it tried again: .* was pruned at /.test(err.message) && !VERBS.test(err.message),
      );
    },
  );
  await s.test(
    'the whole screen of a run held while its step runs, of one waiting --after another, alone and with a hold beside, and of one held until a run that was cancelled',
    async (sub) => {
      const parent = await aRunning(b, repo);
      const cancelled = await aRunning(b, repo);
      const ids = { '<parent>': parent.id, '<target>': cancelled.id, '<root>': ROOT };
      const place = stage.place().place;
      const going = await aRunning(b, repo);
      await stage.runWith(b.e, hold(going.id, [cancelled.id]));
      asOlder(going.id);
      assert.deepEqual(await decideScreen(sub, b.e, [going.id], { ...ids, '<id>': going.id }, place), [
        '<id>  still going',
        '',
        '  held until <target> ships',
        '  still running: implement',
        '  nothing of <id> is filed, and nothing is asked of you, until nemia decide says <target> has shipped; to go on before then: nemia hold <id> --off',
      ]);
      const child = await aStarted(repo, 'after the parent', oneStep(), { after: [parent.id] });
      assert.deepEqual(await decideScreen(sub, b.e, [child.id], { ...ids, '<id>': child.id }, place), [
        '<id>  after the parent',
        '',
        '  waiting on <parent>',
        '  nothing of <id> is filed until nemia decide says <parent> has shipped onto main; nothing to decide yet',
      ]);
      await stage.runWith(b.e, hold(child.id, [cancelled.id]));
      asOlder(child.id);
      assert.deepEqual(await decideScreen(sub, b.e, [child.id], { ...ids, '<id>': child.id }, place), [
        '<id>  after the parent',
        '',
        '  waiting on <parent>',
        '  nothing of <id> is filed until nemia decide says <parent> has shipped onto main; nothing to decide yet',
        '  held until <target> ships as well — nemia hold <id> --off lifts the hold, and not the wait above',
      ]);
      const worded = await aStarted(repo, 'after the parent, held with words', oneStep(), { after: [parent.id] });
      await said(sub, 'hold', worded.id, '--until', target.id, ...why);
      assert.match(
        await said(sub, 'decide', worded.id),
        new RegExp(`\n  ${literal(words)} as well — nemia hold ${worded.id} --off lifts the hold, and not the wait above$`),
      );
      await said(sub, 'cancel', cancelled.id);
      const at = readRun(cancelled.id).cancelledAt!;
      assert.deepEqual(await decideScreen(sub, b.e, [child.id], { ...ids, '<id>': child.id, '<at>': at }, place), [
        '<id>  after the parent',
        '',
        '  waiting on <parent>',
        '  nothing of <id> is filed until nemia decide says <parent> has shipped onto main; nothing to decide yet',
        '  held until <target> (cancelled) ships as well — <target> was cancelled at <at>, and a cancelled run never ships — yours to resolve: nemia hold <id> --off, or nemia cancel <id>',
      ]);
      assert.deepEqual(await decideScreen(sub, b.e, [cancelled.id], { ...ids, '<at>': at }, place), [
        '<target>  still going',
        '',
        '  cancelled at <at> — nothing to decide',
      ]);
    },
  );
  await s.test('the tick lifts the hold on the pass that reads the run it names shipped, and the run goes on on that pass', async () => {
    const wt = readRun(target.id).steps.implement.workspace!;
    committed(wt, 'target.ts');
    b.settle(`${target.id}-implement`, 'succeeded', SIGNED);
    await tick(b, target.id);
    await tick(b, run.id);
    assert.ok(fs.existsSync(holdFileOf(run.id)) && !b.filings.includes(`${run.id}-implement`), 'signed off and not merged has not shipped');
    mergedByHand(repo, readRun(target.id).steps.implement.branch!);
    const lifted = await tick(b, run.id);
    assert.ok(lifted.notes.includes(`the hold is lifted: ${target.id} has shipped`), lifted.notes.join('\n'));
    assert.ok(!fs.existsSync(holdFileOf(run.id)), 'the hold file is gone');
    assert.ok(b.filings.includes(`${run.id}-implement`), 'and the run went on on the same pass');
    assert.equal(readRun(run.id).hold, undefined);
  });
  await s.test(
    'REFUSED: nemia rm of a run another holds on names the hold to lift; nemia rm of a held run takes its hold with it',
    async (sub) => {
      const other = await aRunning(b, repo);
      const heldOn = await aStarted(repo, 'waits for the other');
      await stage.runWith(b.e, hold(heldOn.id, [other.id]));
      asOlder(heldOn.id);
      await said(sub, 'cancel', other.id);
      b.settle(`${other.id}-implement`, 'stopped');
      const refusedRm = await stage.runWith(b.e, forgetRun(other.id, {}));
      assert.equal(refusedRm.kind, 'refused');
      names(refusedRm.refusal, `${heldOn.id} is held until it ships`, `nemia hold ${heldOn.id} --off`);
      const advice = (await said(sub, 'ls', heldOn.id)).split('\n').find((l) => l.includes(`→ held until ${other.id} (cancelled) ships`));
      names(advice, `${other.id} was cancelled at`, `nemia hold ${heldOn.id} --off`, `nemia cancel ${heldOn.id}`);
      await said(sub, 'cancel', heldOn.id);
      assert.equal((await stage.runWith(b.e, forgetRun(heldOn.id, {}))).kind, 'forgotten');
      assert.ok(!fs.existsSync(holdFileOf(heldOn.id)), 'the hold went with the run');
      assert.equal((await stage.runWith(b.e, forgetRun(other.id, {}))).kind, 'forgotten');
    },
  );
});

test('REFUSED by name at shipped defaults: what `nemia hold` refuses — its arguments, the runs it names, the run it holds, its words — exit 2, and no hold written', async (t) => {
  const holdFiles = (): string[] =>
    fs.existsSync(path.join(ROOT, 'runs'))
      ? fs
          .readdirSync(path.join(ROOT, 'runs'))
          .filter((f) => f.includes('.hold'))
          .sort()
      : [];
  const heldBefore = holdFiles();
  const b = stage.board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const run = await aRunning(b, repo);
  const id = run.id;
  const other = await aRunning(b, repo);
  const shipped = await aDone(b, repo, { merged: true });
  const done = await aDone(b, repo);
  const called = await aRunning(b, repo);
  assert.equal((await typed(t, 'cancel', called.id)).error, undefined);
  const elsewhere = await aRunning(b, aRepo());
  const already = await aRunning(b, repo);
  assert.equal((await typed(t, 'hold', already.id, '--until', target.id)).error, undefined);
  const worded = await aRunning(b, repo);
  assert.equal((await typed(t, 'hold', worded.id, '--until', target.id, '--why', "it's blocked", '--by', 'operator')).error, undefined);
  const u = ['hold', id, '--until', target.id];
  const rows: Array<[string, string[], string, string[]]> = [
    ['neither --until nor --off', ['hold', 'r-x'], 'Invalid', ['nemia hold needs the runs to wait on, or --off']],
    ['both', ['hold', 'r-x', '--until', 'a', '--off'], 'Invalid', ['nemia hold takes --until or --off, not both']],
    ['a flag it does not take', ['hold', 'r-x', '--after', 'a'], 'Invalid', ['nemia hold does not take --after']],
    ['--until with no run', ['hold', 'r-x', '--until'], 'Invalid', ['--until takes the run to wait on']],
    ['--until followed by a flag', ['hold', 'r-x', '--until', '--off'], 'Invalid', ['--until takes the run to wait on']],
    ['no run first', ['hold', '--until', 'a'], 'Invalid', ['nemia hold takes the run first']],
    [
      'a run id that climbs out of the store',
      ['hold', '../x', '--until', 'a'],
      'Invalid',
      ['nemia hold writes its file under WF_ROOT by id'],
    ],
    [
      '--until an id that climbs out',
      ['hold', 'r-x', '--until', '../a'],
      'Invalid',
      ['--until "../a" is not a run\'s id', 'nemia hold r-x --until add-a-flag-x1y2'],
    ],
    [
      "--until a run's file",
      ['hold', 'r-x', '--until', 'a-1.json'],
      'Invalid',
      ['--until "a-1.json" is not a run\'s id', 'nemia ls', 'nemia hold r-x --until a-1'],
    ],
    [
      "a run's file held",
      ['hold', 'r-x.hold', '--until', 'a-1'],
      'Invalid',
      ['"r-x.hold" is not a run\'s id', 'nemia ls', 'nemia hold r-x'],
    ],
    ['no such run, held', ['hold', 'r-nope', '--until', 'a'], 'Missing', ['no such run: r-nope', 'nemia hold takes a run by its id']],
    ['no such run, lifted', ['hold', 'r-nope', '--off'], 'Missing', ['no such run: r-nope', 'nemia hold takes a run by its id']],
    ['no such run, --until=', ['hold', 'r-nope', '--until=a'], 'Missing', ['no such run: r-nope']],
    ['--until a run the store has not', ['hold', id, '--until', 'r-nope'], 'Conflict', ['--until r-nope:', 'the store has no run r-nope']],
    ['--until the run itself', ['hold', id, '--until', id], 'Conflict', [`--until ${id}:`, `that is ${id} itself`]],
    ['--until one named twice', ['hold', id, '--until', other.id, '--until', other.id], 'Conflict', [`--until ${other.id} is given twice`]],
    [
      '--until one already shipped',
      ['hold', id, '--until', shipped.id],
      'Conflict',
      [`--until ${shipped.id}:`, 'has already shipped onto main', 'nothing to wait for'],
    ],
    ['--until one cancelled', ['hold', id, '--until', called.id], 'Conflict', [`--until ${called.id}:`, `${called.id} was cancelled`]],
    [
      '--until one of another repository',
      ['hold', id, '--until', elsewhere.id],
      'Conflict',
      [`--until ${elsewhere.id}:`, 'another repository'],
    ],
    ['--off of a run nobody holds', ['hold', id, '--off'], 'Conflict', [`${id} is not held`, 'no hold to lift']],
    [
      'a run already held, with no words: the fix puts it back as it was',
      ['hold', already.id, '--until', target.id],
      'Conflict',
      ['A hold is put once, whole: lift it', `then nemia hold ${already.id} --until ${target.id}.`],
    ],
    ['a run cancelled', ['hold', called.id, '--until', target.id], 'Conflict', [`${called.id} was cancelled at`, 'nothing to hold']],
    [
      'a run shipped',
      ['hold', shipped.id, '--until', target.id],
      'Conflict',
      [`${shipped.id} has shipped`, 'nothing of it is left to file'],
    ],
    [
      'a run succeeded',
      ['hold', done.id, '--until', target.id],
      'Conflict',
      [`${done.id} has succeeded`, `merge its branch once ${target.id} has shipped`],
    ],
    [
      'a run held with words: the fix that puts them back, quoted for a shell',
      ['hold', worded.id, '--until', target.id],
      'Conflict',
      [`then nemia hold ${worded.id} --until ${target.id} --why 'it'\\''s blocked'.`],
    ],
    ['--why with no value', [...u, '--why'], 'Invalid', ['--why takes the words for why the run is held', 'nemia hold <runId>']],
    ['--why followed by a flag', [...u, '--why', '--by', 'x'], 'Invalid', ['--why takes the words for why the run is held']],
    ['--by with no value', [...u, '--by'], 'Invalid', ['--by takes who puts the hold, by a name', 'nemia hold <runId>']],
    ['--why twice', [...u, '--why', 'a', '--why', 'b'], 'Invalid', ['nemia hold takes --why once']],
    ['--by twice', [...u, '--by', 'a', '--by=b'], 'Invalid', ['nemia hold takes --by once']],
    ['--why with --off', ['hold', id, '--off', '--why', 'w'], 'Invalid', ['nemia hold --off lifts the hold whole', 'no --why or --by']],
    ['--by with --off', ['hold', id, '--by', 'x', '--off'], 'Invalid', ['nemia hold --off lifts the hold whole', 'no --why or --by']],
    ['--why blank', [...u, '--why', ' \n '], 'Invalid', ['--why takes the words', 'only blanks']],
    ['--by blank', [...u, '--by='], 'Invalid', ['--by takes who puts the hold', 'only blanks']],
    [
      '--why over its cap',
      [...u, '--why', 'w'.repeat(WHY_CAP + 1)],
      'Invalid',
      [`--why takes at most ${WHY_CAP} characters`, `given ${WHY_CAP + 1}`],
    ],
    [
      '--by over its cap',
      [...u, '--by', 'b'.repeat(BY_CAP + 1)],
      'Invalid',
      [`--by takes at most ${BY_CAP} characters`, `given ${BY_CAP + 1}`],
    ],
  ];
  const before = fs.readFileSync(holdFileOf(already.id), 'utf8');
  const held = [...heldBefore, `${already.id}.hold`, `${worded.id}.hold`].sort();
  assert.deepEqual(holdFiles(), held, 'the two runs held on purpose are the hold files this story adds');
  for (const [what, argv, tag, facts] of rows) {
    await t.test(what, async () => {
      const { error } = await typed(t, ...argv);
      assert.ok(error, `nemia ${argv.join(' ')} was not refused`);
      refusedNaming(tag, ...facts)(error);
    });
  }
  await t.test('nothing written: no hold on a run refused, and the first hold stands as it was', () => {
    assert.deepEqual(holdFiles(), held, 'no hold file under runs/ but those held on purpose');
    assert.equal(fs.readFileSync(holdFileOf(already.id), 'utf8'), before);
  });
  await t.test('allowed: what is left holds — the one run that may still ship, and words at their caps', async () => {
    assert.equal((await typed(t, 'hold', id, '--until', other.id)).error, undefined);
    assert.deepEqual(readRun(id).hold?.until, [other.id]);
    const capped = await aRunning(b, repo);
    const at = ['hold', capped.id, '--until', target.id, '--why', 'w'.repeat(WHY_CAP), '--by', 'b'.repeat(BY_CAP)];
    assert.equal((await typed(t, ...at)).error, undefined, 'at the caps, held');
  });
});

test('REFUSED at shipped defaults: a hold that closes a circle — on a run started --after this one, and on a run that already holds on it, however far round', async (t) => {
  const b = stage.board();
  const repo = aRepo();
  const a = await aRunning(b, repo);
  const child = await aStarted(repo, 'after a', oneStep(), { after: [a.id] });
  const refused = async (argv: string[], ...facts: string[]) => {
    const { error } = await typed(t, ...argv);
    assert.ok(error, `nemia ${argv.join(' ')} was not refused`);
    refusedNaming('Conflict', ...facts)(error);
  };
  await refused(
    ['hold', a.id, '--until', child.id],
    `--until ${child.id}:`,
    `${child.id} already waits on ${a.id} to ship (${child.id} --after ${a.id})`,
  );
  const c = await aRunning(b, repo);
  const d = await aRunning(b, repo);
  assert.equal((await typed(t, 'hold', c.id, '--until', d.id)).error, undefined);
  assert.equal((await typed(t, 'hold', d.id, '--until', a.id)).error, undefined);
  await refused(
    ['hold', a.id, '--until', c.id],
    `--until ${c.id}:`,
    `${c.id} already waits on ${a.id} to ship (${c.id} held until ${d.id}, ${d.id} held until ${a.id})`,
  );
  assert.ok(!fs.existsSync(holdFileOf(a.id)));
  const others = [readRun(d.id), readRun(c.id), readRun(child.id)];
  assert.match(
    holdRefusal(readRun(a.id), [c.id], () => ({ record: readRun(c.id), shipped: false }), others) ?? '',
    /each would wait on the other for ever/,
    'pure, with the store in the opposite order: the circle is found whichever run is read first',
  );
});

test('a hold a pass reads while it files its checks stops the rest of that pass, though it is lifted the instant after: the other check and the ready step are filed on the next pass', async (t: TestContext) => {
  const b = stage.board();
  const repo = aRepo();
  const other = await aRunning(b, repo);
  const run = await aStarted(repo, 'two checks and a step after', twoChecks());
  await tick(b, run.id);
  const id = run.id;
  assert.deepEqual(
    [`${id}-a`, `${id}-b`, `${id}-d`].filter((task) => b.filings.includes(task)),
    [`${id}-a`, `${id}-b`, `${id}-d`],
    `the first pass files the roots: ${b.filings.join(', ')}`,
  );
  assert.ok(!b.filings.includes(`${id}-c`), 'c waits on d');
  for (const step of ['a', 'b', 'd']) b.settle(`${id}-${step}`, 'succeeded', SIGNED);

  const holdFile = holdFileOf(id);
  const file = b.e.file.bind(b.e);
  let held = false;
  t.mock.method(b.e, 'file', (spec: Parameters<Engine['file']>[0]) => {
    if (!held && spec.id?.endsWith('-check')) {
      held = true;
      fs.writeFileSync(holdFile, JSON.stringify({ at: 'by hand', until: [other.id] }));
    }
    return file(spec);
  });
  const exists = fs.existsSync;
  let lifted = false;
  t.mock.method(fs, 'existsSync', (p: fs.PathLike) => {
    const there = exists(p);
    if (p === holdFile && there && !lifted) {
      lifted = true;
      fs.rmSync(holdFile);
    }
    return there;
  });
  await tick(b, id);
  t.mock.restoreAll();

  const checks = [`${id}-a-check`, `${id}-b-check`];
  assert.ok(held && lifted, 'the pass filed a check, then read the hold, which was lifted as it was read');
  assert.equal(checks.filter((task) => b.filings.includes(task)).length, 1, `one check filed, and not the other: ${b.filings.join(', ')}`);
  assert.ok(!fs.existsSync(holdFile) && readRun(id).hold === undefined, 'nothing holds the run once the pass has read the hold');
  assert.ok(
    !b.filings.includes(`${id}-c`),
    'the ready step c is not filed: the pass read the hold in its checks, and its refusal holds for every phase after, though the store reads clear',
  );
  await tick(b, id);
  assert.deepEqual(
    [...checks, `${id}-c`].filter((task) => b.filings.includes(task)),
    [...checks, `${id}-c`],
    'the next pass files the other check and c: the refusal lasted one pass',
  );
});

test('REFUSED at shipped defaults: a hold put again while the tick or --off lifts one is left standing, and a hold put first by another wins whole', async (t) => {
  const b = stage.board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const other = await aRunning(b, repo);

  const run = await aStarted(repo, 'held twice');
  await stage.runWith(b.e, hold(run.id, [target.id]));
  const stale = readRun(run.id);
  await stage.runWith(b.e, unhold(run.id));
  await stage.runWith(b.e, hold(run.id, [other.id]));
  const second = fs.readFileSync(holdFileOf(run.id), 'utf8');
  assert.notEqual(JSON.parse(second).at, stale.hold!.at, 'two holds, told apart by when they were put');
  committed(readRun(target.id).steps.implement.workspace!, 'target.ts');
  b.settle(`${target.id}-implement`, 'succeeded', SIGNED);
  await tick(b, target.id);
  mergedByHand(repo, readRun(target.id).steps.implement.branch!);
  const pass = await tick(b, stale);
  assert.ok(
    !pass.notes.some((n) => n.startsWith('the hold is lifted')),
    `the tick read hold A, and a person lifted it and put hold B before the tick's lift: B names what the tick never read\n${pass.notes.join('\n')}`,
  );
  assert.equal(fs.readFileSync(holdFileOf(run.id), 'utf8'), second, 'hold B stands as it was put');
  assert.ok(!b.filings.includes(`${run.id}-implement`), 'and nothing is filed under it');

  const put = { at: '2099-01-01T00:00:00.000Z', until: [other.id] };
  const read = fs.readFileSync;
  let reads = 0;
  t.mock.method(fs, 'readFileSync', function (this: unknown, ...args: Parameters<typeof fs.readFileSync>) {
    if (args[0] === holdFileOf(run.id) && ++reads === 2) fs.writeFileSync(holdFileOf(run.id), JSON.stringify(put));
    return read.apply(this, args);
  });
  await assert.rejects(
    stage.runWith(b.e, unhold(run.id)),
    refusedNaming('Conflict', `${run.id}'s hold changed as it was lifted`, `nemia ls ${run.id}`, `nemia hold ${run.id} --off`),
  );
  t.mock.restoreAll();
  assert.deepEqual(
    JSON.parse(fs.readFileSync(holdFileOf(run.id), 'utf8')),
    put,
    '--off read hold B, and another hold was put in the moment before the removal: --off is refused, and that hold stands',
  );

  const race = await aRunning(b, repo);
  const first = { at: '2099-01-02T00:00:00.000Z', until: [other.id] };
  const write = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', function (this: unknown, ...args: Parameters<typeof fs.writeFileSync>) {
    if (args[0] === holdFileOf(race.id) && !fs.existsSync(holdFileOf(race.id))) write.call(fs, holdFileOf(race.id), JSON.stringify(first));
    return write.apply(this, args);
  });
  await assert.rejects(
    stage.runWith(b.e, hold(race.id, [other.id])),
    refusedNaming('Conflict', `${race.id} is already held until ${other.id} ships`, first.at, 'A hold is put once, whole'),
  );
  t.mock.restoreAll();
  assert.deepEqual(
    JSON.parse(fs.readFileSync(holdFileOf(race.id), 'utf8')),
    first,
    "the first hold, whole: when two people hold one run at once, the second's exclusive write finds the first's file, is refused as " +
      'already held, and writes nothing',
  );
});

/**
 * A screen with the times its timeline lines read off the stand-in's clock put back as `<t>`, and their durations as `<d>`: when a
 * test ran is no fact of the screen.
 */
const untimed = (lines: string[]): string[] =>
  lines.map((l) => (/^ *timeline {2}/.test(l) ? l.replace(/\d\d:\d\d:\d\dZ/g, '<t>').replace(/\b\d+(m\d+)?s\b/g, '<d>') : l));
const TRIED = '    timeline  try 1  filed <t>  spawned <t>  ended <t>  queued <d>  ran <d>  used not measured';
const RAN = '  timeline  run  queued <d>  ran <d>  wall <d>';

/** A loop run on `b` whose review asked for another round on the last one its `rounds:` allows. */
async function outOfRounds(b: Board, repo = aRepo()) {
  const loop = await aStarted(repo, 'a loop', looping());
  await tick(b, loop.id);
  b.settle(`${loop.id}-implement`, 'succeeded', SIGNED);
  await tick(b, loop.id);
  b.settle(`${loop.id}-review`, 'succeeded', { ...SIGNED, again: true });
  await tick(b, loop.id);
  b.settle(readRun(loop.id).steps.implement.taskId!, 'succeeded', SIGNED);
  await tick(b, loop.id);
  b.settle(readRun(loop.id).steps.review.taskId!, 'succeeded', { ...SIGNED, again: true });
  await tick(b, loop.id);
  return loop;
}

test('the whole screen of a loop out of rounds, and of the round a person asks for', async (t) => {
  const b = stage.board();
  const loop = await outOfRounds(b);
  const place = stage.place().place;
  assert.deepEqual(
    untimed(await decideScreen(t, b.e, [loop.id], { '<id>': loop.id, '<repo>': readRun(loop.id).repo!, '<root>': ROOT }, place)),
    [
      '<id>  a loop',
      '',
      '  UNVERIFIED: implement  — no check: declared; only its own word says it worked',
      '  ROUNDS EXHAUSTED, waiting on you: review  — asked for another round on the last one rounds: allows; its findings are below',
      '',
      '  once more, on the next tick:',
      '    review: it asked for round 2, and `rounds: 1` are spent. Its findings are below. Once more — implement continued, then a new review:  nemia round <id> review',
      '    review: enough — go on with what is there; its findings stay on the record, and the run ends with them on the record:  nemia accept <id> review --message "<why>"',
      '',
      '  touched  wf/<id>/run',
      '    nothing — the branch changed no file against the base',
      '  lesson  nothing written where the next agent reads',
      '',
      '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
      '  none',
      '',
      '  implement',
      '    used  not measured',
      '    cost  not measured',
      TRIED,
      '    did it',
      '',
      '  review',
      '    used  not measured',
      '    cost  not measured',
      TRIED,
      '    did it',
      '    again: true',
      '',
      '  cost  run not measured',
      RAN,
      '',
      '  wf/<id>/run',
      '',
      '  branch    wf/<id>/run is on main',
      '',
      '  ship it   git -C <repo> merge --no-ff wf/<id>/run',
      '  drop it   git -C <repo> branch -D wf/<id>/run',
    ],
  );
  await stage.runWith(b.e, roundRun(loop.id, 'review'));
  assert.deepEqual(await decideScreen(t, b.e, [loop.id], { '<id>': loop.id, '<root>': ROOT }, place), [
    '<id>  a loop',
    '',
    '  still running: review',
    '  review: round 2 asked (nemia round) — the next tick files implement',
    '  nothing to decide yet',
  ]);
});

test('the whole screen of a loop a person accepted as it stands', async (t) => {
  const b = stage.board();
  const loop = await outOfRounds(b);
  committed(readRun(loop.id).steps.implement.workspace!, 'loop.ts');
  await stage.runWith(b.e, acceptRun(loop.id, 'review', 'as it stands'));
  const asks = path.join(ROOT, 'runs', `${loop.id}.asks`);
  const [accepted] = fs.readdirSync(asks).filter((f) => f.startsWith('accept-review-'));
  const file = path.join(asks, accepted);
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), at: '2026-09-17T08:00:00.000Z' }));
  await tick(b, loop.id);
  const place = stage.place().place;
  assert.deepEqual(
    untimed(await decideScreen(t, b.e, [loop.id], { '<id>': loop.id, '<repo>': readRun(loop.id).repo!, '<root>': ROOT }, place)),
    [
      '<id>  a loop',
      '',
      '  UNVERIFIED: implement, review  — no check: declared; only its own word says it worked',
      '',
      '  touched  wf/<id>/run',
      '    (root)  1 file   +1 −0',
      '  lesson  nothing written where the next agent reads',
      '',
      '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
      '  none',
      '',
      '  implement',
      '    used  not measured',
      '    cost  not measured',
      TRIED,
      '    did it',
      '',
      '  review',
      '    accepted  accepted as it stands 08:00Z, its findings open — "as it stands"',
      '    used  not measured',
      '    cost  not measured',
      TRIED,
      '    did it',
      '    again: true',
      '',
      '  cost  run not measured',
      RAN,
      '',
      '  wf/<id>/run  — 1 file: +1 −0',
      '',
      '  branch    wf/<id>/run is ahead of main by 1 commit',
      '',
      '  ship it   git -C <repo> merge --no-ff wf/<id>/run',
      '  drop it   git -C <repo> branch -D wf/<id>/run',
    ],
  );
});

test("a hold's file written by hand is read as it is: a why or a by that is no words is left out, and a long why is one line within its cap", async (t) => {
  const run = await aStarted(aRepo(), 'held by hand');
  for (const bad of [7, null, '', ' \n\t ', ['x'], { a: 1 }]) {
    await t.test(`why and by of ${JSON.stringify(bad)} read as none`, () => {
      fs.writeFileSync(holdFileOf(run.id), JSON.stringify({ at: 't', until: ['a-1'], why: bad, by: bad }));
      const read = readRun(run.id).hold!;
      assert.ok(!('why' in read) && !('by' in read), JSON.stringify(read));
      assert.equal(holdWord([{ run: 'a-1' }], read), 'held until a-1 ships');
    });
  }
  await t.test('a long why and by read as one line, each within its cap', () => {
    const long = `${'many words\n'.repeat(30)}end`;
    fs.writeFileSync(holdFileOf(run.id), JSON.stringify({ at: 't', until: ['a-1'], why: long, by: `  op\nerator ${'x'.repeat(100)}` }));
    const read = readRun(run.id).hold!;
    assert.ok(read.why!.length <= WHY_CAP && read.why!.endsWith('…') && !/\s\s|\n/.test(read.why!), read.why);
    assert.ok(read.by!.length <= BY_CAP && read.by!.startsWith('op erator x') && read.by!.endsWith('…'), read.by);
  });
  await t.test('a file with no why and no by, as older code wrote it', () => {
    fs.writeFileSync(holdFileOf(run.id), JSON.stringify({ at: 't', until: ['a-1'] }));
    assert.deepEqual(readRun(run.id).hold, { at: 't', until: ['a-1'] });
    fs.rmSync(holdFileOf(run.id));
  });
});

/**
 * `nemia hold`'s and `--off`'s programs say in their type what they need and what they refuse. Nothing calls this: the typecheck reads
 * its lines, and an `@ts-expect-error` over code that stops erring is the failure.
 */
function _holdProgramTypes() {
  void (hold('x', []) satisfies EffectOf<Holding, Refusal, EngineService | PlaceService>);
  // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
  void (hold('x', []) satisfies EffectOf<Holding, never, EngineService>);
  void (unhold('x') satisfies EffectOf<Holding, Refusal>);
  // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
  void (unhold('x') satisfies EffectOf<Holding>);
  // @ts-expect-error -- hold requires EngineService, and runPromise takes no requirement
  void Effect.runPromise(hold('x', []));
}

test("REFUSED as a typed failure: each refusal of `hold` and `unhold` is its program's failure, recovered by its tag in the words `runWith` rejects with", async (t) => {
  const b = stage.board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const called = await aRunning(b, repo);
  assert.equal((await typed(t, 'cancel', called.id)).error, undefined);
  const already = await aRunning(b, repo);
  await stage.runWith(b.e, hold(already.id, [target.id]));
  const free = await aRunning(b, repo);
  const recovered = (program: EffectOf<Holding, Refusal, EngineService | PlaceService>, tag: Refusal['_tag']) =>
    stage.runWith(
      b.e,
      program.pipe(
        Effect.map(() => 'answered'),
        Effect.catchTag(tag, (r) => Effect.succeed(r.message)),
      ),
    );
  const refusals: Array<[string, () => EffectOf<Holding, Refusal, EngineService | PlaceService>, Refusal['_tag']]> = [
    ['hold of no id', () => hold('Not An Id', [target.id]), 'Invalid'],
    ['hold --until no id', () => hold(free.id, ['Not An Id']), 'Invalid'],
    ['hold of a run not there', () => hold('r-nope', [target.id]), 'Missing'],
    ['hold of a cancelled run', () => hold(called.id, [target.id]), 'Conflict'],
    ['hold of a run already held', () => hold(already.id, [target.id]), 'Conflict'],
    ['--off of no id', () => unhold('Not An Id'), 'Invalid'],
    ['--off of a run not there', () => unhold('r-nope'), 'Missing'],
    ['--off of a run nobody holds', () => unhold(free.id), 'Conflict'],
  ];
  const before = fs.readFileSync(holdFileOf(already.id), 'utf8');
  for (const [what, program, tag] of refusals) {
    const err = await stage.runWith(b.e, program()).then(
      () => assert.fail(`${what}: refused`),
      (x: unknown) => x,
    );
    assert.ok(err instanceof Error && (err as Refusal)._tag === tag, `${what}: a ${tag}, not ${String(err)}`);
    assert.equal(await recovered(program(), tag), err.message, what);
  }
  for (const r of [called, free]) assert.ok(!fs.existsSync(holdFileOf(r.id)), `no hold written on ${r.id}`);
  assert.equal(fs.readFileSync(holdFileOf(already.id), 'utf8'), before, 'the first hold stands as it was');
});

test('a defect is no refusal: `hold` and `unhold` die of what the engine or the filesystem throws, which no `Effect.catch` recovers, and `runWith` rejects with it as it was thrown', async (t) => {
  const b = stage.board();
  const repo = aRepo();
  const target = await aRunning(b, repo);
  const run = await aRunning(b, repo);
  const caught = <A, R>(program: EffectOf<A, Refusal, R>) => program.pipe(Effect.catch(() => Effect.succeed('caught')));

  const boom = new Error('journal');
  const broken = { ...b.e, view: () => Effect.die(boom) };
  await assert.rejects(stage.runWith(broken, caught(hold(run.id, [target.id]))), (err) => err === boom);
  await assert.rejects(stage.runWith(broken, hold(run.id, [target.id])), (err) => err === boom);
  assert.ok(!fs.existsSync(holdFileOf(run.id)), 'no hold written');

  await stage.runWith(b.e, hold(run.id, [target.id]));
  const denied = Object.assign(new Error(`EACCES: permission denied, unlink '${holdFileOf(run.id)}'`), { code: 'EACCES' });
  const rm = fs.rmSync;
  t.mock.method(fs, 'rmSync', function (this: unknown, ...args: Parameters<typeof fs.rmSync>) {
    if (args[0] === holdFileOf(run.id)) throw denied;
    return rm.apply(this, args);
  });
  await assert.rejects(Effect.runPromise(caught(unhold(run.id))), (err) => err === denied);
  await assert.rejects(stage.runWith(b.e, unhold(run.id)), (err) => err === denied);
  t.mock.restoreAll();
  assert.ok(fs.existsSync(holdFileOf(run.id)), 'the hold stands');
});
