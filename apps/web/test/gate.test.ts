/**
 * What a gate asks of a person, in words, on the Factory's card, the gate's node and the step inspector (lib/gate.ts): off the api's
 * `toDecide` (with `back` and `onto`), a step's `approve`, the graph, the tries and the run's decision alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideLine,
  firstLine,
  gateBrief,
  gateCardLine,
  gateFacts,
  gateNodeLine,
  gateOfStep,
  gateOfSummary,
  needWords,
  readLink,
  takenLine,
} from '../src/lib/gate.ts';
import type { Decidable, RunDetail, RunSummary } from '../src/lib/api.ts';

type Step = RunDetail['steps'][number];

const step = (name: string, over: Partial<Step> = {}): Step =>
  ({
    name,
    status: 'succeeded',
    note: null,
    needs: null,
    blockedByHarness: false,
    approve: null,
    lastLine: null,
    asked: null,
    check: null,
    taskId: `t-${name}`,
    spec: {},
    tries: [],
    closeout: null,
    ...over,
  }) as Step;

const ENDING_DECIDE = {
  kind: 'approve',
  step: 'ship',
  says: 'Merge this run onto the base branch, or abort on any failure.',
  back: ['review'],
  onto: 'main',
  said: 'Merge this run onto the base branch, or abort on any failure.',
  command: 'wf approve r ship',
} as unknown as NonNullable<RunSummary['toDecide']>;

const summary = (over: Partial<RunSummary> = {}) =>
  ({ cancelledAt: null, waitingOnYou: [], steps: [], toDecide: null, ...over }) as Pick<
    RunSummary,
    'cancelledAt' | 'waitingOnYou' | 'steps' | 'toDecide'
  >;

test("the card's gate is the ending the to-decide names, held before it is filed: approving runs it on the base, and a send-back goes to what it waits on", () => {
  const gate = gateOfSummary(summary({ toDecide: ENDING_DECIDE, waitingOnYou: ['ship'] }));
  assert.deepEqual(gate, { step: 'ship', ends: true, back: ['review'], onto: 'main' });
  assert.equal(gateCardLine(gate), 'approve to run ship on main, or send review back');
  assert.equal(gateNodeLine(gate), 'approve ship to run it');
  assert.equal(takenLine({ approved: true }, gate), 'approved — the next pass files ship');
  assert.equal(
    takenLine({ asked: { try: 2, stopFirst: false }, to: 'review' }, gate),
    'sent back to review — try 2 asked — the next tick files it',
  );
});

test('a to-decide gate whose send-back names the step itself is not an ending: it ran, and approving files what waits on it', () => {
  const decide = { ...ENDING_DECIDE, step: 'plan', back: ['plan'] } as NonNullable<RunSummary['toDecide']>;
  const gate = gateOfSummary(summary({ toDecide: decide }));
  assert.equal(gate?.ends, false, 'the step is where a send-back goes: it has a task, so it ran');
  assert.equal(gateCardLine(gate), 'approve what plan handed on, or send it back');
  assert.equal(gateNodeLine(gate), "approve plan's hand-off");
  assert.equal(takenLine({ approved: true }, gate), 'approved — the next pass files what waits on plan');
});

test("a step waiting at its gate on you is the card's gate when no to-decide names one; a run called off, or a gate not waiting on you, has none", () => {
  const steps = [step('plan', { approve: 'approve plan' }), step('implement')] as unknown as RunSummary['steps'];
  assert.deepEqual(gateOfSummary(summary({ steps, waitingOnYou: ['plan'] })), { step: 'plan', ends: false, back: ['plan'], onto: null });
  assert.equal(gateOfSummary(summary({ steps, waitingOnYou: [] })), null, 'approved already: not waiting on you');
  assert.equal(gateOfSummary(summary({ steps, waitingOnYou: ['plan'], cancelledAt: '2026-09-19T07:00:00.000Z' })), null);
  assert.equal(gateOfSummary(summary({ toDecide: ENDING_DECIDE, cancelledAt: '2026-09-19T07:00:00.000Z' })), null);
  const asks = [step('implement', { needs: 'Which database?' })] as unknown as RunSummary['steps'];
  assert.equal(
    gateOfSummary(summary({ steps: asks, waitingOnYou: ['implement'] })),
    null,
    'a question is not a gate: it is answered on the run page',
  );
});

test('an ending that waits on nothing has nobody to send back, and says so rather than offering it', () => {
  const decide = { ...ENDING_DECIDE, back: [] } as unknown as NonNullable<RunSummary['toDecide']>;
  const gate = gateOfSummary(summary({ toDecide: decide }))!;
  assert.equal(gate.ends, true);
  assert.equal(gateCardLine(gate), 'approve to run ship on main: it waits on no step to send back');
  assert.equal(gateBrief(gate, null, []).sendingBack, 'There is nothing to send back: ship waits on no step.');
});

const detail = (steps: Step[], over: Partial<RunDetail> = {}) =>
  ({
    cancelledAt: null,
    waitingOnYou: ['ship'],
    branch: 'main',
    cost: { said: '$1.20' },
    graph: {
      edges: [
        { from: 'implement', to: 'review', kind: 'after' },
        { from: 'review', to: 'implement', kind: 'loop' },
        { from: 'review', to: 'ship', kind: 'after' },
      ],
    },
    steps,
    ...over,
  }) as unknown as RunDetail;

test("the inspector's gate is read off the step: an ending with no task runs on approval and goes back along its `after` edges, never its loop's", () => {
  const ship = step('ship', { approve: 'approve ship', taskId: null, spec: { workspace: 'main' } as Step['spec'] });
  const run = detail([ship]);
  const gate = gateOfStep(run, ship);
  assert.deepEqual(gate, { step: 'ship', ends: true, back: ['review'], onto: 'main' });
  const brief = gateBrief(gate, firstLine('\nMerge this run onto the base branch.\n\nMore.'), []);
  assert.equal(brief.waits, 'ship waits at its gate: it has not run, and it runs only on your approval.');
  assert.equal(
    brief.approving,
    "Approving runs ship in the repository's own checkout, on main, handed your words, if any, as its terms. Its folder says what it does: “Merge this run onto the base branch.”",
  );
  assert.equal(
    brief.sendingBack,
    'Sending back asks review for a new try, told your words; ship waits at its gate again once it signs off.',
  );
  assert.equal(gateOfStep({ ...run, waitingOnYou: [] }, ship), null, 'not waiting on you');
  assert.equal(gateOfStep({ ...run, cancelledAt: '2026-09-19T07:00:00.000Z' }, ship), null, 'called off');
  assert.equal(gateOfStep(run, { ...ship, approve: null }), null, 'no words: no gate offered');
});

test("a gate on a step that ran is §6's: approving files what waits on it, and a send-back asks the step itself", () => {
  const plan = step('plan', { approve: 'approve plan', spec: {} as Step['spec'] });
  const gate = gateOfStep(detail([plan], { waitingOnYou: ['plan'] }), plan)!;
  assert.deepEqual(gate, { step: 'plan', ends: false, back: ['plan'], onto: 'main' });
  const brief = gateBrief(gate, null, ['implement']);
  assert.equal(brief.approving, "Approving files implement, handed plan's closeout and your words, if any.");
  assert.equal(brief.sendingBack, 'Sending back asks plan for a new try, told your words; it waits at its gate again once it signs off.');
  // An ending that has a task already — sent back and filed — holds after it ran, so a send-back asks it, not what it waits on.
  const ran = step('ship', { approve: 'approve ship', spec: { workspace: 'main' } as Step['spec'] });
  assert.deepEqual(gateOfStep(detail([ran]), ran), { step: 'ship', ends: false, back: ['ship'], onto: 'main' });
});

const tried = (round: number, n = 1) => ({ try: n, round }) as Step['tries'][number];

test("the facts under a gate: the round of its loop's cap and the cost, the review's word, each check's verdict, and — once the decision is read — what it touched and whether it merges", () => {
  const steps = [
    step('implement', { tries: [tried(1, 1), tried(2, 2)], check: { verdict: 'passed' } as Step['check'] }),
    step('review', {
      spec: { loop: 'implement', rounds: 3 } as Step['spec'],
      tries: [tried(1), tried(2, 2)],
      closeout: { outcome: 'succeeded', output: { again: false, findings: [] } } as unknown as Step['closeout'],
    }),
  ];
  const decision = {
    touched: [],
    standings: [{ merge: { clean: false, conflicts: ['src/a.ts'], said: 'conflicts with main in 1 file: src/a.ts' } }, { merge: null }],
  } as unknown as Decidable;
  assert.deepEqual(gateFacts(detail(steps), decision), [
    { label: 'round', said: 'round 2 of 3 · cost $1.20' },
    { label: 'last review', said: 'review asks no further round', state: 'good', step: 'review' },
    { label: 'check', said: 'implement: passed on try 2', state: 'good', step: 'implement' },
    { label: 'merges', said: 'conflicts with main in 1 file: src/a.ts', state: 'bad' },
  ]);
  assert.equal(
    gateFacts(detail(steps), null).some((f) => f.label === 'merges'),
    false,
    'not read yet: nothing said about the merge',
  );
  const findings = [
    step('review', {
      spec: { loop: 'implement' } as Step['spec'],
      closeout: { outcome: 'succeeded', output: { again: true, findings: [{}, {}] } } as unknown as Step['closeout'],
    }),
  ];
  assert.deepEqual(gateFacts(detail(findings, { cost: null }), null), [
    { label: 'round', said: 'round 1 · cost not measured' },
    { label: 'last review', said: 'review left 2 findings and asks another round', state: undefined, step: 'review' },
  ]);
  // Ended by a person out of rounds (`wf accept`): the closeout still says `again: true`, and the fact says whose word ended the loop, with
  // their words — not "asks another round", which would send whoever approves the ending looking for a round nobody will file.
  const accepted = [{ ...findings[0], accepted: { try: 1, at: '2026-09-20T00:00:00Z', message: 'fan-in teams are follow-up work' } }];
  assert.deepEqual(gateFacts(detail(accepted, { cost: null }), null)[1], {
    label: 'last review',
    said: 'review left 2 findings; a person accepted the work as it stands, with them open: fan-in teams are follow-up work',
    state: undefined,
    step: 'review',
  });
  const one = [
    { ...accepted[0], closeout: { outcome: 'succeeded', output: { again: true, findings: [{}] } } as unknown as Step['closeout'] },
  ];
  assert.match(
    gateFacts(detail(one, { cost: null }), null)[1].said,
    /^review left 1 finding; a person accepted the work as it stands, with it open: /,
  );
  const failed = [step('implement', { check: { verdict: 'failed' } as Step['check'] })];
  assert.equal(gateFacts(detail(failed), null)[1]?.state, 'bad');
});

test('what else a run waits on a person for, in full words for the inspector and a line that fits for the card', () => {
  assert.equal(needWords({ step: 'implement', kind: 'asks', needs: 'Which database?' }), 'implement asks: Which database?');
  const wait = { words: 'waiting for a permission prompt', advice: 'answer it in Claude Code: claude agents, session ae/t-held/1' };
  assert.equal(
    needWords({ step: 'held', kind: 'harness', waitingFor: wait, lastLine: 'Try again in a minute' }),
    `held is blocked by the harness; ${wait.words} — ${wait.advice}; its session said last: Try again in a minute`,
  );
  assert.equal(
    needWords({ step: 'held', kind: 'harness', waitingFor: null, lastLine: 'Try again in a minute' }),
    'held is blocked by the harness; its session said last: Try again in a minute',
    'a harness that said nothing about what for',
  );
  assert.equal(needWords({ step: 'held', kind: 'harness', waitingFor: null, lastLine: null }), 'held is blocked by the harness');
  assert.equal(decideLine(['wf/r/implement']), 'decide its result: a branch ahead of the base that nothing merges');
  assert.equal(decideLine(['a', 'b']), 'decide its result: 2 branches ahead of the base that nothing merges');
});

test('REFUSED: a run a person holds has no gate on its card, whether a to-decide or a step waiting at its gate names it — the package refuses the approval', () => {
  const holding = { at: '2026-09-23T07:00:00.000Z', runs: [], word: 'held until a-1 ships', advice: 'wf hold r --off', onYou: false };
  const steps = [step('plan', { approve: 'approve plan' })] as unknown as RunSummary['steps'];
  assert.notEqual(gateOfSummary(summary({ toDecide: ENDING_DECIDE })), null);
  assert.equal(gateOfSummary({ ...summary({ toDecide: ENDING_DECIDE }), holding }), null);
  assert.notEqual(gateOfSummary(summary({ steps, waitingOnYou: ['plan'] })), null);
  assert.equal(gateOfSummary({ ...summary({ steps, waitingOnYou: ['plan'] }), holding }), null);
  assert.notEqual(gateOfSummary({ ...summary({ steps, waitingOnYou: ['plan'] }), holding: null }), null, 'a run nobody holds');
});

test("the card's link to what a gate approves: a plan's inspector, any other step's, and an ending's section, which has handed nothing on", () => {
  assert.deepEqual(readLink({ step: 'plan', ends: false }), { words: 'Read the plan', step: 'plan' });
  assert.deepEqual(readLink({ step: 'review', ends: false }), { words: 'Read what it handed on', step: 'review' });
  assert.deepEqual(readLink({ step: 'ship', ends: true }), { words: 'Read what it acts on', hash: 'step-ship' });
  assert.deepEqual(
    readLink({ step: 'plan', ends: true }),
    { words: 'Read what it acts on', hash: 'step-plan' },
    'an ending named plan has no plan to read yet',
  );
});
