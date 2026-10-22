/**
 * The work sent back from a run's ending, on disk, in the test place: a send-back at the ending's gate, an ending stopped on its base
 * branch that sends the work back through the loop, a loop out of rounds before its ending, and `nemia merge` of the base into the work —
 * where it conflicts as text, and where the ending's check refused the merged tree (the conflict is semantic). One run's ending is
 * `ship.test.ts`; what a gate means to `assess` is pure, in `assess-endings.test.ts`.
 *
 * `WF_ROOT` is set before the runner is imported: the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from './scratch.ts';
import { endings, ENOUGH, filedAs, MESSAGE, refusedAs, refusedNaming, SIGNED } from './endings.ts';

const ROOT = scratch('wf-ship-back-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.NEMIA_DAEMON_START = 'off';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  acceptRun,
  approveRun,
  decideRun,
  list,
  mergeRun,
  retryRun,
  roundRun,
  startRun,
  runWith: runEngine,
} = await import('../src/runner.ts');
const { main: cli } = await import('../src/cli/main.ts');
/** Imported once the environment is set: the stage's engine client loads a module that pins the store's root as it loads. */
const { staged, story } = await import('./story.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const stage = staged({ runWith: runEngine, main: cli, engineOf });
const at = await endings(stage, ROOT);
const { readRun } = await import('../src/record/record.store.ts');
const { roundOf } = await import('../src/run.ts');
const { runStore } = await import('../src/record/files.store.ts');

const world = () => stage.place().world;
const e = () => stage.board().e;
const listed = (id: string) => stage.runWith(e(), list(e(), readRun(id)));
const statusOf = async (id: string, step: string) => (await listed(id)).steps.find((s) => s.name === step)!.status;
const asks = (id: string) => at.asksOf(id).filter((f) => f.startsWith('merge-'));
/** A refusal of `nemia merge`: exit 2, naming `facts`, and no merge asked. For `assert.rejects`. */
const mergeRefused =
  (id: string, ...facts: string[]) =>
  (err: Error & { exitCode?: number }): true => {
    refusedNaming(...facts)(err);
    assert.deepEqual(asks(id), [], 'no merge is asked');
    return true;
  };

test("a send-back at the ending's gate goes to the work, merges nothing, and the gate holds again once the work signs off", async (t) => {
  const s = story(t);
  const { settle } = stage.board();
  let gate: Awaited<ReturnType<typeof at.atTheGate>>;

  await s.test(
    'REFUSED at shipped defaults: a try of the ending step itself, which has not run, names the approval that files it and the send-back to the work',
    async () => {
      gate = await at.atTheGate();
      const { id } = gate;
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'ship', { mode: 'nudge' })),
        refusedAs(
          'Conflict',
          'ship is at its gate',
          'nothing of it has run',
          'no try of it to replace',
          `nemia approve ${id} ship`,
          `nemia retry ${id} implement --message "<objection>".`,
        ),
      );
      assert.equal(readRun(id).steps.ship.taskId, null, 'and nothing was written');
    },
  );

  await s.test(
    "REFUSED at the ending's gate, at shipped defaults: a send-back with no words names the step at the gate — ship, not the work — and the send-back it names is honoured",
    async () => {
      const { id } = gate;
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'implement', { mode: 'nudge' })),
        refusedAs(
          'Conflict',
          'ship is at its gate, not implement',
          'goes to implement',
          'no words',
          `nemia retry ${id} implement --message "<objection>"`,
          `nemia approve ${id} ship.`,
        ),
      );
      const { ask } = await stage.runWith(e(), retryRun(id, 'implement', { mode: 'nudge', message: 'sub subtracts the wrong way round' }));
      assert.deepEqual([ask.step, ask.try], ['implement', 2]);
    },
  );

  await s.test(
    'a sent-back ending merges nothing: the work is filed again, the checkout is untouched, and the gate holds again once it signs off',
    async () => {
      const { repo, id, branch, base } = gate;
      const sent = await at.pass(id);
      assert.deepEqual([sent.tried, sent.filed], [['implement'], []], 'the work goes again, and the ending is not filed');
      assert.equal(readRun(id).steps.ship.taskId, null);
      assert.equal(world().head(repo), base, 'nothing is merged');
      assert.equal(at.uncommitted(repo), '');
      assert.equal((await listed(id)).toDecide, undefined, 'while the work runs there is nothing to decide');
      await assert.rejects(stage.runWith(e(), approveRun(id, 'ship')), refusedNaming('ship is not at its gate yet'));
      settle(`${id}-implement-try2`, 'succeeded', SIGNED);
      assert.deepEqual((await at.pass(id)).filed, [], 'and the gate holds the ending again');
      assert.deepEqual((await listed(id)).toDecide?.kind, 'approve');
      assert.equal(await at.isShipped(at.repositoryRun(readRun(id)), branch), false);
    },
  );

  await s.test(
    'the approval the send-back refusal names is honoured too, on a run of its own, since one takes the other back',
    async () => {
      const other = await at.atTheGate();
      assert.equal((await stage.runWith(e(), approveRun(other.id, 'ship'))).approval.step, 'ship');
    },
  );

  await s.test(
    "REFUSED at shipped defaults: `nemia round` at an ending's gate says the run is at that gate — not that what waits on the loop has been filed",
    async () => {
      const { id } = await at.workDone(at.loopingFolder());
      settle(`${id}-review`, 'succeeded', { ...SIGNED, again: false });
      const pass = await at.pass(id);
      assert.deepEqual([pass.looped, pass.filed], [[], []], 'the loop has handed on, and the ending waits at its gate');
      assert.equal(await statusOf(id, 'ship'), 'awaiting approval');
      await assert.rejects(
        stage.runWith(e(), roundRun(id, 'review')),
        refusedAs(
          'Conflict',
          'review signed off',
          '(`again: false`)',
          'nothing waiting on it has been filed',
          "the run is at ship's gate",
          `nemia approve ${id} ship`,
          `nemia retry ${id} review --message "<objection>".`,
        ),
      );
      assert.ok(!at.asksOf(id).includes('round-review-2'), 'and no ask was written');
    },
  );
});

test('an ending that stopped on the base branch sends the work back through the loop: review hears the objection and what ship needs, implement gets a round, and ship waits at its gate for a new approval', async (t) => {
  const s = story(t);
  const { tasks, filings, settle } = stage.board();
  let stopped: Awaited<ReturnType<typeof at.stoppedOnBase>>;

  await s.test('`nemia decide` offers both ways on from an ending stopped on its base branch, each with when to take it', async (st) => {
    stopped = await at.stoppedOnBase();
    const { id } = stopped;
    assert.equal(readRun(id).steps.ship.taskId, `${id}-ship`, 'ship ran on its approval');
    const printed = await at.printedBy(st, ['decide', id]);
    assert.ok(
      printed.some((l) =>
        l.includes(
          `ship: blocked. Ship again, when what stopped it was not the work — a dirty checkout, a flaky test. Continue its session, told what happened:  nemia retry ${id} ship  (--fresh, or --model <m>, for a new session)`,
        ),
      ),
      printed.join('\n'),
    );
    assert.ok(
      printed.some((l) =>
        l.includes(
          `review: ship stopped on the base branch. Send the work back, when it does not hold on the base branch — review is filed again with your objection and what ship said, may ask for a round, and ship waits at its gate for a new approval:  nemia retry ${id} review --message "<objection>"`,
        ),
      ),
      printed.join('\n'),
    );
  });

  await s.test(
    'REFUSED at shipped defaults: a merge of an ending stopped on a base that merges cleanly says to ship it again',
    async () => {
      const { id } = stopped;
      fs.mkdirSync(path.join(ROOT, 'runs', `${id}.asks`), { recursive: true });
      await assert.rejects(
        stage.runWith(e(), mergeRun(id)),
        mergeRefused(id, 'nothing to merge', `ship it again: nemia retry ${id} ship.`),
      );
    },
  );

  await s.test(
    '`nemia decide` offers no merge where the work merges cleanly onto the base: a base that merges cleanly is shipped again, never merged',
    async () => {
      assert.deepEqual(
        (await stage.runWith(e(), decideRun(stopped.id))).commands.filter((c) => c.label === 'merge'),
        [],
      );
    },
  );

  await s.test(
    'the send-back is filed: the reviewer again with the objection and what ship said, the ending not, and nothing merged',
    async () => {
      const { repo, id, base } = stopped;
      const { ask } = await stage.runWith(e(), retryRun(id, 'review', { mode: 'nudge', message: 'take main, and keep both subs working' }));
      assert.deepEqual([ask.step, ask.try], ['review', 2]);
      assert.equal(await statusOf(id, 'ship'), 'waiting', 'between the ask and the pass, the ending reads as waiting for the work');
      const sent = await at.pass(id);
      assert.deepEqual([sent.tried, sent.filed], [['review'], []], 'the reviewer is filed again, and the ending is not');
      assert.deepEqual(filedAs(readRun(id).steps.ship), {
        taskId: null,
        workspace: repo,
        branch: 'main',
        tries: [{ taskId: `${id}-ship`, then: 'back' }],
      });
      assert.equal(world().head(repo), base, 'nothing merged');
      const brief = tasks.get(`${id}-review-try2`)!.spec.brief;
      for (const said of [
        "the work went on to ship, which a person approved: it acts on main in the repository's own checkout, and it stopped there — `blocked` —",
        '## Your answer\n\n```text\ntake main, and keep both subs working\n```',
        '## What ship said\n\nIts summary:\n\n```text\nmain moved since the branch was cut',
        "What it needs:\n\n```text\nthe branch has to take main: add.ts conflicts with main's sub\n```",
        "sign off with `again: true` and say what — what ship needs among it: the work's next round is on the run's branch, where merging main into it is the work's to do.",
      ])
        assert.ok(brief.includes(said), brief);
      await assert.rejects(
        stage.runWith(e(), approveRun(id, 'ship')),
        refusedAs('Conflict', 'ship is not at its gate yet'),
        'try 1 does not carry over',
      );
    },
  );

  await s.test(
    'the reviewer asks for a round, implement goes on, and once the loop settles ship waits at its gate for a new approval of its try 2',
    async () => {
      const { repo, id } = stopped;
      settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: true });
      assert.deepEqual((await at.pass(id)).looped, ['review'], 'implement goes on, on its branch, and review reviews again');
      assert.ok(filings.includes(`${id}-implement-try2`), filings.join(', '));
      settle(`${id}-implement-try2`, 'succeeded', {
        ...SIGNED,
        replies: [{ finding: 'take main', answer: 'fixed', why: 'merged main into the branch, and both subs are one' }],
      });
      await at.pass(id);
      settle(`${id}-review-try3`, 'succeeded', { ...SIGNED, again: false });
      assert.deepEqual((await at.pass(id)).filed, [], 'the loop has settled, and the ending holds at its gate');
      const l = await listed(id);
      assert.deepEqual([l.steps.find((x) => x.name === 'ship')!.status, l.toDecide?.kind], ['awaiting approval', 'approve']);
      const { approval } = await stage.runWith(e(), approveRun(id, 'ship', 'Merge it, now it takes main.'));
      assert.deepEqual([approval.step, approval.try], ['ship', 2], 'a new approval, of the try the ending is now on');
      assert.deepEqual((await at.pass(id)).filed, ['ship']);
      assert.equal(tasks.get(`${id}-ship-try2`)!.spec.cwd, repo);
    },
  );

  await s.test(
    "REFUSED at shipped defaults: a send-back from a stopped ending with no words, to a step that is not the loop's, a round of the loop, or while the ending's own try is asked for — and the ending's try while a send-back is",
    async () => {
      stopped = await at.stoppedOnBase();
      const { id } = stopped;
      const back = `nemia retry ${id} review --message "<objection>"`;
      const again = `a dirty checkout, a flaky test: nemia retry ${id} ship.`;
      const halted = 'ship stopped on the base branch (blocked)';
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'review', { mode: 'nudge' })),
        refusedAs('Conflict', "review's work went on to ship", halted, 'a try of review sends the work back', 'no words', back, again),
      );
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'implement', { mode: 'nudge', message: 'take main' })),
        refusedAs('Conflict', halted, "through the folder's loop, not to implement", 'send it back to review', back, again),
      );
      await assert.rejects(
        stage.runWith(e(), roundRun(id, 'review')),
        refusedAs('Conflict', 'review signed off', '(`again: false`)', halted, 'its `again: true` is the round', back, again),
      );
      assert.ok(!at.asksOf(id).includes('round-review-2'), 'and no ask was written');
      const { ask } = await stage.runWith(e(), retryRun(id, 'ship', { mode: 'nudge', message: 'the checkout is clean now' }));
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'review', { mode: 'nudge', message: 'take main' })),
        refusedNaming(`try 2 of ship is asked for (--nudge, at ${ask.at})`, 'a send-back would take that try back'),
        'the two ways on take the same try of the ending: one asked refuses the other, each way round',
      );
      fs.rmSync(path.join(ROOT, 'runs', `${id}.asks`, 'retry-ship-2'));
      const sending = await stage.runWith(e(), retryRun(id, 'review', { mode: 'nudge', message: 'take main' }));
      const sentBack = `the work is being sent back from ship (nemia retry ${id} review, at ${sending.ask.at})`;
      const wait = `Wait for it: nemia ls ${id}.`;
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'ship', { mode: 'nudge' })),
        refusedAs('Conflict', sentBack, 'ship returns to its gate once it settles', wait),
      );
    },
  );

  await s.test(
    "REFUSED at shipped defaults: a step is handed off once — a person's edit in the reviewed worktree while the run waits at its ending's gate is not committed under review's name, pass after pass",
    async () => {
      const { id } = stopped;
      await at.pass(id);
      settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: false });
      const tipsBefore = readRun(id).tips;
      const handing = await at.pass(id);
      assert.deepEqual([handing.filed, handing.looped, handing.tried], [[], [], []], 'the ending waits at its gate');
      assert.deepEqual(readRun(id).tips, tipsBefore, 'and no tip moved: review handed on with no commit of its own');
      const review = readRun(id).steps.review;
      assert.equal(review.handedOff, `${id}-review-try2`, 'the mark is written on the record on disk, not only in the pass that set it');
      const tip = world().head(review.workspace!);
      fs.writeFileSync(path.join(review.workspace!, 'NOTES.md'), "a person's notes\n");
      await at.pass(id);
      await at.pass(id);
      assert.equal(world().head(review.workspace!), tip, "no commit under review's name");
      assert.match(at.uncommitted(review.workspace!), /NOTES\.md/, "the edit is still the person's, uncommitted");
    },
  );

  await s.test(
    "a send-back composes with `nemia round` in a loop out of rounds, as the incident's was: review's `again: true` reads exhausted, a round takes it once more, and ship waits at its gate for a new approval",
    async () => {
      const { id } = await at.stoppedOnBase(at.loopingFolder(1));
      await stage.runWith(e(), retryRun(id, 'review', { mode: 'nudge', message: 'take main' }));
      await at.pass(id);
      settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: true });
      const spent = await at.pass(id);
      assert.deepEqual([spent.looped, spent.filed], [[], []], "at rounds: 1 the loop's only round was spent before ship ran");
      assert.deepEqual([await statusOf(id, 'review'), await statusOf(id, 'ship')], ['rounds exhausted', 'waiting']);
      await assert.rejects(stage.runWith(e(), approveRun(id, 'ship')), refusedNaming(), 'and no approval is taken while the work is out');
      const { ask } = await stage.runWith(e(), roundRun(id, 'review'));
      assert.equal(ask.round, 2, 'a person takes the loop once more');
      assert.deepEqual((await at.pass(id)).looped, ['review'], 'the round goes to implement, and review hands on after it');
      assert.ok(filings.includes(`${id}-implement-try2`), filings.join(', '));
      settle(`${id}-implement-try2`, 'succeeded', {
        ...SIGNED,
        replies: [{ finding: 'take main', answer: 'fixed', why: 'merged main into the branch' }],
      });
      await at.pass(id);
      settle(`${id}-review-try3`, 'succeeded', { ...SIGNED, again: false });
      assert.deepEqual((await at.pass(id)).filed, [], 'the loop has settled, and nothing of ship runs');
      assert.equal(await statusOf(id, 'ship'), 'awaiting approval');
      const { approval } = await stage.runWith(e(), approveRun(id, 'ship', 'Merge it, now it takes main.'));
      assert.deepEqual([approval.step, approval.try], ['ship', 2], 'a new approval, of the try ship is now on');
      assert.deepEqual((await at.pass(id)).filed, ['ship']);
    },
  );

  await s.test(
    'REFUSED at shipped defaults: a folder with no loop before its ending has no way to send the work back from it, and says so — shipping again is still there',
    async () => {
      const { id } = await at.stoppedOnBase(at.folder());
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'implement', { mode: 'nudge', message: 'take main' })),
        refusedAs(
          'Conflict',
          'ship stopped on the base branch (blocked)',
          'this workflow has no loop before it',
          'implement does not loop',
          `nemia retry ${id} ship.`,
          `(nemia cancel ${id})`,
          '(nemia start)',
          'a `loop:` step',
        ),
      );
      assert.equal(readRun(id).steps.implement.tries, undefined, 'and nothing was asked');
      await stage.runWith(e(), retryRun(id, 'ship', { mode: 'nudge', message: 'the checkout is clean now' }));
      assert.deepEqual((await at.pass(id)).tried, ['ship'], 'shipping again is a try of the ending, filed without a new approval');
      assert.ok(tasks.get(`${id}-ship-try2`));
      const { repo, branch } = readRun(id) as unknown as { repo: string; branch: string };
      world().stage(repo, readRun(id).steps.implement.branch!);
      assert.equal(branch, 'main');
      settle(`${id}-ship-try2`, 'succeeded', { ...SIGNED, message: MESSAGE });
      assert.deepEqual((await at.pass(id)).checked, ['ship'], "the try's merge is checked as the first try's was");
      settle(`${id}-ship-try2-check`, 'succeeded', undefined, 0);
      assert.equal((await at.pass(id)).status, 'succeeded', 'once its merge lands the run is over');
      assert.notEqual(await statusOf(id, 'ship'), 'awaiting approval', 'not at its gate again');
    },
  );

  await s.test(
    '`nemia decide` offers the merge where the work conflicts with the base: the bare `nemia merge`, labelled merge — and not once it is asked',
    async () => {
      stopped = await at.stoppedOnBase();
      const { repo, id } = stopped;
      const merges = async () => (await stage.runWith(e(), decideRun(id))).commands.filter((c) => c.label === 'merge');
      assert.deepEqual(await merges(), [], 'a base that merges cleanly is shipped again, never merged');
      at.mainMoves(repo);
      const decided = await stage.runWith(e(), decideRun(id));
      assert.deepEqual(
        decided.commands.filter((c) => c.label === 'merge'),
        [
          {
            label: 'merge',
            command: `nemia merge ${id} review`,
            said: `review: implement's work conflicts with main. Merge main into it — implement continued, then a new review, on round 1, which the merge does not spend:  nemia merge ${id} review`,
            step: 'review',
          },
        ],
      );
      assert.ok(decided.offers.includes(decided.commands.find((c) => c.label === 'merge')!.said!), decided.offers.join('\n'));
      await stage.runWith(e(), mergeRun(id));
      assert.deepEqual(await merges(), [], 'nor once it is asked');
    },
  );

  await s.test(
    'a merge a pass filed and never wrote down is adopted as a merge: the round kept, the base moved to the commit merged, nothing filed twice',
    async () => {
      const { repo, id } = stopped;
      const sha = world().head(repo);
      await Effect.runPromise(e().file({ id: `${id}-implement-try2`, brief: '## Merge main', cwd: repo }));
      const before = filings.length;
      await at.pass(id);
      const r = readRun(id);
      assert.deepEqual(
        r.steps.implement.tries?.map((x) => x.then),
        ['merge'],
      );
      assert.equal(r.steps.implement.taskId, `${id}-implement-try2`);
      assert.equal(roundOf(r, 'review'), 1);
      assert.equal(r.baseRef, sha);
      assert.ok(!filings.slice(before).includes(`${id}-implement-try2`), filings.join(', '));
    },
  );
});

test('a loop out of rounds before its ending: accepted as it stands, sent back after its acceptance, or sent to merge the base without a round', async (t) => {
  const s = story(t);
  const { tasks, settle } = stage.board();

  await s.test(
    "the incident's other ending: at rounds exhausted a person accepts the work as it stands, and ship reaches its gate on their word — approved, filed, and told why the findings are still open",
    async () => {
      const { repo, id } = await at.atTheCap();
      assert.deepEqual(
        [await statusOf(id, 'review'), await statusOf(id, 'ship')],
        ['rounds exhausted', 'waiting'],
        'it never reaches its gate',
      );
      await assert.rejects(stage.runWith(e(), approveRun(id, 'ship')), refusedNaming('ship is not at its gate yet'));
      const { acceptance } = await stage.runWith(e(), acceptRun(id, 'review', ENOUGH));
      assert.deepEqual(
        (await at.pass(id)).filed,
        [],
        'accepted, the loop ends; the ending is approved before it is filed, so it goes to its gate',
      );
      const l = await listed(id);
      assert.deepEqual([l.steps.find((x) => x.name === 'ship')!.status, l.toDecide?.kind], ['awaiting approval', 'approve']);
      const { decision: d, offers, accepted } = await stage.runWith(e(), decideRun(id));
      assert.deepEqual(
        [d.kind === 'awaiting' && d.awaitingApproval, offers],
        [['ship'], []],
        'the gate is left to decide, and no round offered',
      );
      assert.deepEqual(accepted, { review: `accepted as it stands ${acceptance.at.slice(11, 16)}Z, its findings open — "${ENOUGH}"` });
      await stage.runWith(e(), approveRun(id, 'ship', 'Merge it; the findings are follow-up.'));
      assert.deepEqual((await at.pass(id)).filed, ['ship']);
      const brief = tasks.get(`${id}-ship`)!.spec.brief;
      assert.match(brief, /\n## Accepted\n/, 'approved, it is told why it is shipping work a reviewer had more to say about');
      assert.match(brief, /review judged this work and asked for another round after the 1 `rounds: 1` allows\./);
      assert.ok(brief.includes(ENOUGH), brief);
      assert.equal(tasks.get(`${id}-ship`)!.spec.cwd, repo, "and filed in the repository's own checkout as ever");
    },
  );

  await s.test(
    "a send-back at the ending's gate spends the acceptance: the loop is open again, its findings with it, and the work goes back to the reviewer",
    async () => {
      const { id } = await at.atTheCap();
      await stage.runWith(e(), acceptRun(id, 'review', ENOUGH));
      await at.pass(id);
      assert.equal(await statusOf(id, 'ship'), 'awaiting approval');
      const { ask } = await stage.runWith(
        e(),
        retryRun(id, 'review', { mode: 'nudge', message: "the second finding is this run's after all" }),
      );
      assert.deepEqual([ask.step, ask.try], ['review', 2]);
      const sent = await at.pass(id);
      assert.deepEqual([sent.tried, sent.filed], [['review'], []]);
      assert.equal(readRun(id).acceptances, undefined, 'spent by the try after it, as an approval is');
      assert.ok(fs.existsSync(path.join(ROOT, 'runs', `${id}.asks`, 'done', 'accept-review-1')), 'and moved whole');
      assert.doesNotMatch(tasks.get(`${id}-review-try2`)!.spec.brief, /## Accepted/, 'the reviewer is not told its own loop was ended');
      await assert.rejects(
        stage.runWith(e(), acceptRun(id, 'review', ENOUGH)),
        refusedNaming("round 1 of review's loop is still running"),
        'on the new try, the acceptance that ended the old one opens nothing',
      );
    },
  );

  await s.test(
    'a loop out of rounds is sent to merge without `nemia round`: the merge spends no round, a round or an acceptance is REFUSED while it is asked, and the reviewer after it hands on to the gate',
    async () => {
      const { repo, id } = await at.atTheCap();
      const sha = at.mainMoves(repo);
      const { ask } = await stage.runWith(e(), mergeRun(id, 'review'));
      assert.deepEqual([ask.round, ask.merge.sha], [1, sha]);
      const written = at.asksOf(id);
      const waits = (verb: string) => (err: Error & { exitCode?: number }) => {
        assert.equal(err.exitCode, 2);
        assert.match(err.message, /^a merge of main into implement's work is asked \(at \S+\)/);
        for (const fact of [
          'the next tick files it once, on round 1: ',
          " merge-implement-2, in the run's .asks directory",
          ` — then: ${verb}.`,
        ])
          assert.ok(err.message.includes(fact), `${err.message} names ${fact}`);
        assert.deepEqual(at.asksOf(id), written, 'nothing written');
        return true;
      };
      await assert.rejects(stage.runWith(e(), roundRun(id, 'review')), waits(`nemia round ${id} review`));
      await assert.rejects(stage.runWith(e(), acceptRun(id, 'review', ENOUGH)), waits(`nemia accept ${id} review --message "<why>"`));
      assert.deepEqual((await at.pass(id)).looped, ['review']);
      assert.deepEqual(
        readRun(id).steps.implement.tries?.map((x) => x.then),
        ['merge'],
        'the merge is filed, as asked',
      );
      assert.equal(roundOf(readRun(id), 'review'), 1);
      settle(`${id}-implement-try2`, 'succeeded', SIGNED);
      await at.pass(id);
      settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: false });
      await at.pass(id);
      assert.equal(await statusOf(id, 'ship'), 'awaiting approval');
      assert.equal(roundOf(readRun(id), 'review'), 1, 'still round 1 of 1');
    },
  );
});

test('`nemia merge` of the base into the work: refused where nothing conflicts as text, asked where it does, and asked where the landing check refused the merged tree — the conflict is semantic', async (t) => {
  const s = story(t);
  const { tasks, settle } = stage.board();

  await s.test(
    "REFUSED: a merge asked of quick's shape — a review that passed and an ungated landing not yet filed — which the run files on the next tick",
    async () => {
      for (const base of ['moved', 'clean'] as const) {
        const { repo, id } = await at.workDone(at.ungatedFolder());
        if (base === 'moved') at.mainMoves(repo);
        settle(`${id}-review`, 'succeeded', { ...SIGNED, again: false });
        assert.ok(!readRun(id).steps.ship?.taskId, 'the landing is not filed yet: the next pass files it');
        fs.mkdirSync(path.join(ROOT, 'runs', `${id}.asks`), { recursive: true });
        await assert.rejects(
          stage.runWith(e(), mergeRun(id)),
          mergeRefused(id, 'ship has no gate', 'the next tick', 'once review passes', `nemia merge ${id} review.`),
          `the base ${base}`,
        );
      }
    },
  );

  await s.test(
    'REFUSED at shipped defaults: a merge of work whose trial merge onto the base is clean — nothing to merge, and the refusal says to approve the landing',
    async () => {
      const { id, branch } = await at.workDone(at.loopingFolder());
      settle(`${id}-review`, 'succeeded', { ...SIGNED, again: false });
      await at.pass(id);
      fs.mkdirSync(path.join(ROOT, 'runs', `${id}.asks`), { recursive: true });
      await assert.rejects(
        stage.runWith(e(), mergeRun(id)),
        mergeRefused(id, `${branch} merges cleanly onto main`, 'nothing to merge', `approve the landing: nemia approve ${id} ship.`),
      );
    },
  );

  await s.test('REFUSED at shipped defaults: a merge of a run with no loop says to send its result step back', async () => {
    const repo = at.aRepo();
    const run = await stage.runPlaced(startRun({ brief: 'add sub', repo, workflowDir: at.folder() }));
    await at.pass(run.id);
    settle(`${run.id}-implement`, 'succeeded', SIGNED);
    await at.pass(run.id);
    at.mainMoves(repo);
    fs.mkdirSync(path.join(ROOT, 'runs', `${run.id}.asks`), { recursive: true });
    await assert.rejects(
      stage.runWith(e(), mergeRun(run.id)),
      mergeRefused(run.id, 'implement closes no loop', `nemia retry ${run.id} implement --message "merge main, keeping both meanings".`),
    );
  });

  await s.test(
    "a merge past round 1 owes no replies: the target's merge try is handed no findings, and its empty list signs it off, so review is filed after it",
    async () => {
      const { repo, id } = await at.workDone(at.loopingFolder(2));
      settle(`${id}-review`, 'succeeded', { ...SIGNED, again: true });
      await at.pass(id);
      const unsigned = 'A closeout without it, or with an empty list, is unsigned.';
      assert.ok(tasks.get(`${id}-implement-try2`)!.spec.brief.includes(unsigned), 'round 2 of a round owes its replies');
      settle(`${id}-implement-try2`, 'succeeded', { ...SIGNED, replies: [{ finding: 'sub', answer: 'fixed', why: 'kept it' }] });
      await at.pass(id);
      settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: true });
      assert.deepEqual((await at.pass(id)).filed, [], 'out of rounds at round 2 of 2');
      at.mainMoves(repo);
      await stage.runWith(e(), mergeRun(id, 'review'));
      assert.deepEqual((await at.pass(id)).looped, ['review']);
      assert.equal(roundOf(readRun(id), 'review'), 2);
      const brief = tasks.get(`${id}-implement-try3`)!.spec.brief;
      assert.ok(brief.includes('You were handed no findings this round.'), brief);
      assert.ok(!brief.includes(unsigned), brief);
      settle(`${id}-implement-try3`, 'succeeded', { ...SIGNED, replies: [] });
      await at.pass(id);
      assert.ok(tasks.has(`${id}-review-try3`), 'the merge try signed off with no replies, and review reads the merge');
    },
  );

  let refused: Awaited<ReturnType<typeof at.refusedOnBase>>;

  await s.test(
    'nemia decide reads the semantic conflict live at an ending whose landing check refused the merged tree: clean as text, refused on the base as it is',
    async () => {
      refused = await at.refusedOnBase();
      const { id, base, checkId } = refused;
      const { collisions, toDecide } = await stage.runWith(e(), decideRun(id));
      assert.equal(toDecide?.kind === 'approve', false, 'the ending waits at no gate: it was filed, and its landing aborted');
      assert.deepEqual(collisions?.semantic, {
        step: 'ship',
        check: checkId,
        sha: base,
        said: `merges cleanly onto main, and ship's landing check refused the merged tree at ${base.slice(0, 7)}: a conflict of meaning, not of text`,
      });
      assert.deepEqual(
        collisions?.base.map((b) => b.said),
        ['merges cleanly onto main'],
      );
    },
  );

  await s.test(
    'nemia decide offers the merge of work its landing check refused, saying the conflict is semantic, and `nemia merge` says what it asked',
    async (st) => {
      const { id, base } = refused;
      assert.deepEqual(
        (await stage.runWith(e(), decideRun(id))).commands.filter((c) => c.label === 'merge'),
        [
          {
            label: 'merge',
            command: `nemia merge ${id} review`,
            said: `review: implement's work merges cleanly onto main, but ship's check refused the merged tree at ${base.slice(0, 7)}: the conflict is semantic. Merge main into it and fix what broke — implement continued, then a new review, on round 1, which the merge does not spend:  nemia merge ${id} review`,
            step: 'review',
          },
        ],
      );
      const printed = await at.printedBy(st, ['merge', id]);
      assert.ok(
        printed[0]?.includes(
          `asked: merge main at ${base.slice(0, 7)} into implement's work, where ship's check refused the merged tree at ${base.slice(0, 7)}: the conflict is semantic — the next tick files it`,
        ),
        printed.join('\n'),
      );
    },
  );

  await s.test(
    'REFUSED at shipped defaults: a merge of work that merges cleanly onto a base moved since its landing check refused it is nothing to merge, in the words of any clean trial merge; a base that moves into a conflict is a merge as text',
    async () => {
      const { repo, id, branch } = await at.refusedOnBase();
      fs.writeFileSync(path.join(repo, 'mul.ts'), 'export const mul = (a, b) => a * b;\n');
      world().commit(repo, 'mul');
      await assert.rejects(
        stage.runWith(e(), mergeRun(id)),
        mergeRefused(id, `${branch} merges cleanly onto main`, 'nothing to merge', `ship it again: nemia retry ${id} ship.`),
      );
      const sha = at.mainMoves(repo);
      const { ask } = await stage.runWith(e(), mergeRun(id));
      const merge = { target: 'implement', try: 2, onto: 'main', sha };
      assert.deepEqual(ask.merge, merge, 'no landing: its check refused another commit of the base');
      assert.deepEqual(
        runStore.asks.read(id).rounds.map((a) => a.merge),
        [merge],
      );
    },
  );

  await s.test(
    'REFUSED at shipped defaults: a merge of work that merges cleanly whose landing check did not finish is nothing to merge',
    async () => {
      const { id, branch } = await at.refusedOnBase(false);
      const landed = readRun(id).steps.ship.landed;
      assert.ok(landed && 'aborted' in landed && !('refusedOn' in landed), JSON.stringify(landed));
      await assert.rejects(
        stage.runWith(e(), mergeRun(id)),
        mergeRefused(id, `${branch} merges cleanly onto main`, 'nothing to merge', `ship it again: nemia retry ${id} ship.`),
      );
    },
  );
});
