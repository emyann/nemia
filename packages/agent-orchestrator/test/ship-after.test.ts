/**
 * The ends of runs that share a repository, on disk, in the test place: a result a person merged by hand before its ending ran — the
 * run has shipped as git reads it, and a run `--after` it starts — and two runs of one repository at their endings, which never work in
 * its one checkout at once. One run's ending is `ship.test.ts`; what a gate means to `assess` is pure, in `assess-endings.test.ts`.
 *
 * `WF_ROOT` is set before the runner is imported: the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { decideScreen } from './screens.ts';
import { BLOCKED, endings, refusedNaming, SIGNED } from './endings.ts';

const ROOT = scratch('wf-ship-after-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.NEMIA_DAEMON_START = 'off';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  advanceRun,
  approveRun,
  cancelRun,
  decideRun,
  forgetRun,
  list,
  retryRun,
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

const world = () => stage.place().world;
const e = () => stage.board().e;
const listed = (id: string) => stage.runWith(e(), list(e(), readRun(id)));
const shipOf = async (id: string) => (await listed(id)).steps.find((s) => s.name === 'ship')!;
/** A screen with each time of day the engine's stand-in stamped put back as `<t>`: it files and settles on the wall clock. */
const timeless = (lines: string[]): string[] => lines.map((l) => l.replace(/\b\d\d:\d\d:\d\dZ\b/g, '<t>'));
/** What a person reads of the ending held behind `holder`'s, in `nemia decide`. */
const waitLine = (holder: string) =>
  `  ship: waiting on the checkout (${holder}'s ship has it) — it works in the repository's own checkout, ` +
  `and two endings never do at once; the next tick files ship once ${holder}'s ship has settled`;

test('a result a person merged by hand before its ending ran: the run has shipped as git reads it, a run `--after` it starts, and every screen agrees', async (t) => {
  const s = story(t);
  const { filings } = stage.board();
  let gate: Awaited<ReturnType<typeof at.atTheGate>>;
  let child = '';

  await s.test('at its gate, with the branch ahead, a decision to make, and a run --after it waits', async () => {
    gate = await at.atTheGate();
    assert.equal((await listed(gate.id)).toDecide?.kind, 'approve');
    const started = await stage.runPlaced(
      startRun({ brief: 'read the flag', repo: gate.repo, workflowDir: at.oneStep(), after: [gate.id] }),
    );
    child = started.id;
    assert.deepEqual((await at.pass(child)).filed, [], 'nothing of the child is filed while the result is off the base');
  });

  await s.test(
    "REFUSED at shipped defaults: merged by hand, nothing is to decide, nobody is waited on, and the ending's line in `nemia ls` says where the branch stands",
    async (st) => {
      const { repo, id, branch } = gate;
      at.mergedByHand(repo, branch);
      assert.equal(await at.isShipped(at.repositoryRun(readRun(id)), branch), true, 'a person merged the result, and nobody told the run');
      await at.aPass(e());
      const l = await listed(id);
      assert.equal(l.toDecide, undefined, 'nothing to decide: git already has the result');
      assert.deepEqual(l.waitingOnYou, [], 'and nobody is waited on for an approval that would be refused');
      const ship = l.steps.find((x) => x.name === 'ship')!;
      assert.deepEqual(
        [ship.status, ship.note],
        [
          'awaiting approval',
          `${branch} is on main — nothing is left for ship to merge: the run has shipped as git reads it, and nothing waits on you; close the record if you want it closed: nemia cancel ${id}`,
        ],
      );
      const printed = await at.printedBy(st, ['ls', id]);
      assert.ok(!printed.some((x) => x.includes('→ to decide') || x.includes('→ waiting on you')), printed.join('\n'));
      assert.ok(
        printed.some((x) => x.includes(`${branch} is on main — nothing is left for ship to merge`)),
        printed.join('\n'),
      );
    },
  );

  await s.test(
    '`nemia decide` says the same before anybody closes the record: shipped, and no AWAITING APPROVAL above a branch on main',
    async (st) => {
      const { id, branch } = gate;
      const { decision } = await stage.runWith(e(), decideRun(id));
      assert.deepEqual([decision.kind, decision.kind === 'shipped' ? decision.branches : []], ['shipped', [branch]]);
      const screen = await at.printedBy(st, ['decide', id]);
      assert.ok(
        screen.some((x) =>
          x.endsWith(
            `\n\n  shipped — ${branch} is already on main\n  ship never ran: nothing is left for it to merge, and nothing waits on you — close the record if you want it closed: nemia cancel ${id}`,
          ),
        ),
        screen.join('\n'),
      );
      assert.ok(!screen.some((x) => x.includes('AWAITING APPROVAL') || x.includes('nemia approve')), screen.join('\n'));
    },
  );

  await s.test('the whole screen of a run whose result a person merged by hand, its ending never run', async (st) => {
    const { repo, id } = gate;
    assert.deepEqual(timeless(await decideScreen(st, e(), [id], { '<id>': id, '<repo>': repo, '<root>': ROOT }, stage.place().place)), [
      '<id>  add sub',
      '',
      '  shipped — wf/<id>/run is already on main',
      '  ship never ran: nothing is left for it to merge, and nothing waits on you — close the record if you want it closed: nemia cancel <id>',
    ]);
  });

  await s.test('REFUSED at shipped defaults: `nemia approve` names `nemia cancel` instead, and writes nothing', async () => {
    const { id, branch } = gate;
    await assert.rejects(
      stage.runWith(e(), approveRun(id, 'ship', 'Merge it.')),
      refusedNaming(`${branch} is on main`, 'nothing left for ship to merge', `nemia decide ${id}`, `nemia cancel ${id}.`),
    );
    assert.deepEqual(readRun(id).approvals ?? [], [], 'nothing was written');
  });

  await s.test("ship is never filed, pass after pass, and the child starts on git's word: its parent has shipped", async () => {
    const { id } = gate;
    for (const pass of [1, 2]) assert.deepEqual((await at.pass(id)).filed, [], `pass ${pass}: ship is never filed`);
    assert.deepEqual(filings, [`${id}-implement`]);
    assert.equal(readRun(id).steps.ship.taskId, null);
    assert.deepEqual((await at.pass(child)).filed, ['implement']);
  });

  await s.test(
    'the command the refusal names is honoured once the child has started: the record is closed, with nothing to decide',
    async () => {
      await stage.runWith(e(), cancelRun(gate.id));
      assert.equal((await stage.runWith(e(), decideRun(gate.id))).decision.kind, 'cancelled');
    },
  );

  await s.test(
    '`nemia rm` of a run whose ending never ran and whose result a person merged by hand forgets it: the gate holds nothing, so the approval it named is not named',
    async () => {
      const { repo, id, branch } = await at.atTheGate();
      const held = await stage.runWith(e(), forgetRun(id));
      assert.equal(held.kind, 'refused', 'at its gate with the branch ahead, the run is held');
      assert.match(
        held.kind === 'refused' ? (held.refusal ?? '') : '',
        new RegExp(`ship waits at its gate for your approval, and it is filed once it is approved: nemia approve ${id} ship`),
      );
      at.mergedByHand(repo, branch);
      const forgot = await stage.runWith(e(), forgetRun(id));
      assert.equal(forgot.kind, 'forgotten', forgot.kind === 'refused' ? forgot.refusal : '');
      assert.equal(fs.existsSync(path.join(ROOT, 'runs', `${id}.json`)), false);
    },
  );

  await s.test(
    "an ending's gate is a decision again once the base branch no longer has the result: git is read each pass, and the approval is honoured",
    async () => {
      const { repo, id, branch, base } = await at.atTheGate();
      at.mergedByHand(repo, branch);
      await at.aPass(e());
      assert.equal((await listed(id)).toDecide, undefined);
      world().putBack(repo, base);
      await at.aPass(e());
      assert.equal((await listed(id)).toDecide?.kind, 'approve', 'the merge reset away before anybody pushed it: the gate is a word again');
      assert.match((await shipOf(id)).note ?? '', /^approve it: nemia approve /);
      assert.equal((await stage.runWith(e(), approveRun(id, 'ship'))).approval.step, 'ship');
      assert.deepEqual((await at.pass(id)).filed, ['ship']);
    },
  );
});

test('two runs of one repository at their endings: the oldest approval takes the checkout, the other waits for it — its first filing and its try — and every screen says which run has it', async (t) => {
  const s = story(t);
  const { settle } = stage.board();
  let two: Awaited<ReturnType<typeof at.twoApproved>>;

  await s.test(
    "two runs' ending steps never work in one checkout at once: the oldest approval takes it, and the other reads as waiting for it",
    async (st) => {
      two = await at.twoApproved();
      const { repo, first, second } = two;
      const one = await at.pass(first.id);
      const other = await at.pass(second.id);
      assert.deepEqual([one.filed, other.filed], [[], ['ship']], 'a pass over both, the first run first, files the older approval');
      assert.equal(one.inFlight, true, 'the run held back is in flight all the same: a directory is what it waits for');
      assert.equal(readRun(first.id).steps.ship.taskId, null);
      assert.equal(readRun(second.id).steps.ship.workspace, repo, "and the one filed is in the repository's own checkout");
      assert.deepEqual((await at.pass(first.id)).filed, [], 'pass after pass, while that step is in the checkout');
      assert.equal((await shipOf(first.id)).status, `waiting on the checkout (${second.id}'s ship has it)`);
      const { decision, checkout } = await stage.runWith(e(), decideRun(first.id));
      assert.deepEqual([decision.kind, decision.kind === 'running' ? decision.waiting : []], ['running', ['ship']]);
      assert.deepEqual(checkout, { run: second.id, step: 'ship' });
      const holder = await stage.runWith(e(), decideRun(second.id));
      assert.deepEqual(
        [holder.decision.kind, holder.decision.kind === 'running' ? holder.decision.waiting : [], holder.checkout],
        ['running', ['ship'], undefined],
        'the run in the checkout waits on its own ship, and on no other run',
      );
      const printed = await at.printedBy(st, ['decide', first.id]);
      assert.ok(printed.includes(waitLine(second.id)), printed.join('\n'));
    },
  );

  const ids = () => ({ '<first>': two.first.id, '<second>': two.second.id, '<repo>': two.repo, '<root>': ROOT });
  const screenOf = async (st: import('node:test').TestContext, id: string) =>
    timeless(await decideScreen(st, e(), [id], ids(), stage.place().place));

  await s.test('the whole screen of a run whose ending waits for the checkout, first filed', async (st) => {
    assert.deepEqual(await screenOf(st, two.first.id), [
      '<first>  add sub',
      '',
      '  still running: ship',
      "  ship: waiting on the checkout (<second>'s ship has it) — it works in the repository's own checkout, and two endings never do at once; the next tick files ship once <second>'s ship has settled",
      '  nothing to decide yet',
    ]);
  });

  await s.test(
    "the older approval's ship signs off blocked, its trial merge aborted: the checkout is free, and the other run takes it",
    async () => {
      settle(`${two.second.id}-ship`, 'succeeded', BLOCKED);
      assert.deepEqual((await at.pass(two.first.id)).filed, ['ship']);
    },
  );

  await s.test('the whole screen of the run whose ending ended blocked, before it is sent back', async (st) => {
    assert.deepEqual(await screenOf(st, two.second.id), [
      '<second>  add sub',
      '',
      '  UNVERIFIED: implement  — no check: declared; only its own word says it worked',
      '  BLOCKED, waiting on you: ship',
      '',
      '  once more, on the next tick:',
      '    ship: blocked. Ship again, when what stopped it was not the work — a dirty checkout, a flaky test. Continue its session, told what happened:  nemia retry <second> ship  (--fresh, or --model <m>, for a new session)',
      '',
      '  touched  wf/<second>/run',
      '    (root)  1 file   +1 −0',
      '  lesson  nothing written where the next agent reads',
      '',
      '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
      '  none',
      '',
      '  implement',
      '    used  not measured',
      '    cost  not measured',
      '    timeline  try 1  filed <t>  spawned <t>  ended <t>  queued 0s  ran 0s  used not measured',
      '    did the work',
      '',
      '  ship  BLOCKED',
      '    gate  approved 08:00Z',
      '    used  not measured',
      '    cost  not measured',
      '    timeline  try 1  filed <t>  spawned <t>  ended <t>  queued 0s  ran 0s  used not measured',
      '    the check refused',
      '    !! declared and not given: message',
      '    needs: read the suite',
      '    to answer it:  nemia retry <second> ship --message "<answer>"',
      '',
      '  cost  run not measured',
      '  timeline  run  queued 0s  ran 0s  wall 0s',
      '',
      '  wf/<second>/run  — 1 file: +1 −0',
      '',
      '  branch    wf/<second>/run is ahead of main by 1 commit',
    ]);
  });

  await s.test(
    "a try of an ending step waits for the checkout as its first filing does: a person's send-back of a ship that ended blocked files nothing while another run's ship is merging",
    async (st) => {
      const { first, second } = two;
      const { ask } = await stage.runWith(
        e(),
        retryRun(second.id, 'ship', { mode: 'nudge', message: 'the check was green here; run it again' }),
      );
      assert.deepEqual([ask.step, ask.try], ['ship', 2], 'allowed, for a settled step that signed off blocked, and held');
      for (const pass of [1, 2]) {
        const held = await at.pass(second.id);
        assert.deepEqual([held.tried, held.filed], [[], []], `pass ${pass}: the try waits for the checkout`);
      }
      assert.deepEqual(readRun(second.id).steps.ship.tries, undefined, 'and no try was taken');
      assert.equal(world().head(two.repo), first.base, 'nothing merged while two endings wanted the same directory');
      const l = await listed(second.id);
      assert.deepEqual(
        [l.steps[1].status, l.steps[1].note],
        ['succeeded · BLOCKED', `try 2 asked (--nudge) — waiting on the checkout (${first.id}'s ship has it)`],
      );
      const printed = await at.printedBy(st, ['decide', second.id]);
      assert.ok(
        printed.includes(waitLine(first.id)),
        `nemia decide says it on the screen of a run whose ending ended blocked\n${printed.join('\n')}`,
      );
      assert.ok(!printed.some((x) => x.includes('the next tick files it')), 'and not that the next tick files the try');
    },
  );

  await s.test(
    "a run whose ending's try the checkout holds is a run still running: `nemia ls`, `nemia decide` and the pass agree, and it still counts against the cap on runs in flight",
    async () => {
      const { first, second } = two;
      const pass = await at.pass(second.id);
      assert.deepEqual([pass.filed, pass.tried], [[], []], 'nothing of it is filed while the other run is in the checkout');
      assert.equal(pass.status, 'running', 'a try asked for and not yet filed is work in hand, not a run waiting on a person');
      assert.equal(pass.inFlight, true, 'so the cap on runs in flight still counts it');
      const l = await listed(second.id);
      assert.deepEqual(l.waitingOnYou, [], 'nobody is waited on — what holds it is a directory');
      assert.equal(l.toDecide, undefined, 'and there is nothing to decide');
      assert.deepEqual(
        [l.steps[1].status, l.steps[1].note],
        ['succeeded · BLOCKED', `try 2 asked (--nudge) — waiting on the checkout (${first.id}'s ship has it)`],
      );
      const { decision } = await stage.runWith(e(), decideRun(second.id));
      assert.deepEqual([decision.kind, decision.kind === 'running' ? decision.waiting : []], ['running', ['ship']]);
    },
  );

  await s.test('the whole screen of a run whose ending waits for the checkout, sent back', async (st) => {
    assert.deepEqual(await screenOf(st, two.second.id), [
      '<second>  add sub',
      '',
      '  still running: ship',
      "  ship: waiting on the checkout (<first>'s ship has it) — it works in the repository's own checkout, and two endings never do at once; the next tick files ship once <first>'s ship has settled",
      '  nothing to decide yet',
    ]);
  });

  await s.test(
    'once the step in the checkout settles, the try is filed there on the first pass after, as any try of it would be',
    async () => {
      settle(`${two.first.id}-ship`, 'succeeded', SIGNED);
      assert.deepEqual((await at.pass(two.second.id)).tried, ['ship']);
      assert.equal(readRun(two.second.id).steps.ship.workspace, two.repo);
    },
  );

  await s.test('a run whose ending waits for the checkout is filed once the step in it settles', async () => {
    const { repo, first, second } = await at.twoApproved();
    await at.pass(second.id);
    assert.deepEqual((await at.pass(first.id)).filed, [], 'held while the other run works in the checkout');
    settle(`${second.id}-ship`, 'succeeded', SIGNED);
    assert.deepEqual((await at.pass(first.id)).filed, ['ship'], 'and filed on the first pass after it settles');
    assert.equal(readRun(first.id).steps.ship.workspace, repo);
    assert.equal((await shipOf(first.id)).status, 'pending');
  });

  await s.test(
    "a cancelled run holds the checkout while its ending's session is still in it: `nemia cancel` asks the engine to stop it, and it is still merging until it has",
    async () => {
      const { repo, first, second } = await at.twoApproved();
      await at.pass(second.id);
      assert.equal(stage.board().tasks.get(`${second.id}-ship`)!.phase, 'pending', 'its session is in the checkout');
      const { plan } = await stage.runWith(e(), cancelRun(second.id));
      assert.deepEqual(plan.kind === 'cancel' ? plan.stop.map((x) => x.name) : [], ['ship'], 'called off: the engine is asked to stop it');
      assert.deepEqual(
        (await at.pass(first.id)).filed,
        [],
        'until it has settled that agent is still mid merge, so the other files nothing',
      );
      assert.equal((await shipOf(first.id)).status, `waiting on the checkout (${second.id}'s ship has it)`);
      settle(`${second.id}-ship`, 'stopped');
      assert.deepEqual((await at.pass(first.id)).filed, ['ship'], 'settled stopped: the checkout is free, and the next pass takes it');
      assert.equal(readRun(first.id).steps.ship.workspace, repo);
    },
  );

  await s.test(
    "a `workspace: main` task the engine has lost holds no checkout: a run nobody can stop does not hold every other run's ending for ever",
    async () => {
      const { first, second } = await at.twoApproved();
      await at.pass(second.id);
      assert.deepEqual((await at.pass(first.id)).filed, [], 'held while the engine has that step in flight');
      stage.board().tasks.delete(`${second.id}-ship`);
      assert.deepEqual((await at.pass(first.id)).filed, ['ship'], 'and filed once the engine no longer holds it');
    },
  );
});

test('a checkout held by a merge staged and not landed, and claimed by no run the pass will not file', async (t) => {
  const s = story(t);
  const { settle } = stage.board();

  await s.test(
    "REFUSED at shipped defaults: `nemia rm` of a run whose merge is staged and not landed, and another run's ending, wait until the run has landed it",
    async () => {
      const repo = at.aRepo();
      const { id, checkId } = await at.stagedAndSigned({ repo });
      const other = await at.atTheGate({ repo });
      await stage.runWith(e(), approveRun(other.id, 'ship'));
      assert.deepEqual((await at.pass(other.id)).filed, [], "while the check runs on the merge, the other run's ending is not filed");
      settle(checkId, 'succeeded', undefined, 0);
      assert.deepEqual(
        (await at.pass(other.id)).filed,
        [],
        'with the check settled and nothing landed yet, the merge still holds the checkout',
      );
      const refused = await stage.runWith(e(), forgetRun(id));
      assert.equal(refused.kind, 'refused', 'nor is the run forgotten before the pass that lands it');
      const refusal = refused.kind === 'refused' ? refused.refusal : undefined;
      for (const fact of ["ship's merge is staged", `(${repo})`, 'not yet committed or aborted', `nemia rm ${id} once nemia ls ${id}`])
        assert.ok(refusal?.includes(fact), `${refusal} names ${fact}`);
      assert.equal(at.mergeHead(repo), true, 'and nothing was touched');
      await at.pass(id);
      assert.equal(at.mergeHead(repo), false);
      assert.deepEqual((await at.pass(other.id)).filed, ['ship'], 'landed, the checkout is free');
      assert.notEqual((await stage.runWith(e(), forgetRun(id))).kind, 'refused');
    },
  );

  await s.test(
    'a run whose ending the pass will not file claims no checkout: one waiting on a run that has not shipped, and one the cap on runs in flight holds, each hold nobody — however old their word',
    async () => {
      const repo = at.aRepo();
      const waiting = await at.atTheGate({ repo });
      const child = await stage.runPlaced(startRun({ brief: 'ship the flag', repo, workflowDir: at.mergeOnly(), after: [waiting.id] }));
      fs.writeFileSync((await stage.runWith(e(), approveRun(child.id, 'ship'))).file, JSON.stringify({ at: '2026-09-17T07:00:00.000Z' }));
      assert.deepEqual((await at.pass(child.id)).filed, [], 'a merge-only run approved oldest waits on a run at its own gate');
      await stage.runWith(e(), approveRun(waiting.id, 'ship'));
      assert.deepEqual((await at.pass(waiting.id)).filed, ['ship'], 'so the checkout goes to the run that would use it');
      assert.equal((await shipOf(waiting.id)).status, 'pending');

      const other = at.aRepo();
      const inFlight = await at.atTheGate({ repo: other });
      await stage.runWith(e(), approveRun(inFlight.id, 'ship'));
      const queued = await stage.runPlaced(startRun({ brief: 'ship the flag', repo: other, workflowDir: at.mergeOnly() }));
      fs.writeFileSync((await stage.runWith(e(), approveRun(queued.id, 'ship'))).file, JSON.stringify({ at: '2026-09-17T05:00:00.000Z' }));
      process.env.WF_MAX_RUNS = '1';
      try {
        const capped = await stage.runWith(e(), advanceRun(readRun(queued.id), { inFlight: 1, cap: 1 }));
        assert.deepEqual(capped.filed, [], 'the cap on runs in flight holds its root while a run is in flight');
        assert.deepEqual((await at.pass(inFlight.id)).filed, ['ship'], "so its ending claims nothing, and holds no other run's");
      } finally {
        delete process.env.WF_MAX_RUNS;
      }
    },
  );

  await s.test(
    "a run with nothing filed is held by the checkout like any other: its ending is its root, and a root is not filed into a directory another run's ship is in",
    async () => {
      const repo = at.aRepo();
      const parent = await at.atTheGate({ repo });
      await stage.runWith(e(), approveRun(parent.id, 'ship'));
      await at.pass(parent.id);
      at.mergedByHand(repo, parent.branch);
      settle(`${parent.id}-ship`, 'succeeded', SIGNED);
      await at.pass(parent.id);
      assert.equal(
        await at.isShipped(at.repositoryRun(readRun(parent.id)), parent.branch),
        true,
        "the merge-only run's parent has shipped",
      );
      const other = await at.atTheGate({ repo });
      fs.writeFileSync((await stage.runWith(e(), approveRun(other.id, 'ship'))).file, JSON.stringify({ at: '2026-09-17T06:00:00.000Z' }));
      const child = await stage.runPlaced(startRun({ brief: 'ship the flag', repo, workflowDir: at.mergeOnly(), after: [parent.id] }));
      fs.writeFileSync((await stage.runWith(e(), approveRun(child.id, 'ship'))).file, JSON.stringify({ at: '2026-09-17T07:00:00.000Z' }));
      assert.deepEqual((await at.pass(other.id)).filed, ['ship'], 'the older word takes the checkout');
      assert.deepEqual((await at.pass(child.id)).filed, [], 'and the run with nothing filed waits for it');
      await at.aPass(e());
      assert.equal((await listed(child.id)).steps[0].status, `waiting on the checkout (${other.id}'s ship has it)`);
      settle(`${other.id}-ship`, 'succeeded', SIGNED);
      assert.deepEqual((await at.pass(child.id)).filed, ['ship'], 'and is filed once that step settles');
      assert.equal(readRun(child.id).steps.ship.workspace, repo);
    },
  );
});
