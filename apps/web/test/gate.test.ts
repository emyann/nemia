/**
 * What a gate asks of a person, in words, on the Factory's card, the gate's node and the step inspector (lib/gate.ts): off the api's
 * `toDecide` (with `back` and `onto`), a step's `approve`, the graph, the tries and the run's decision alone.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  decideLine,
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
import type { Collision, Collisions, Decidable } from '../src/lib/api/decision.ts';
import type { RunView } from '../src/lib/api/judged.ts';
import type { RunDetail } from '../src/lib/runView.ts';

type Step = RunDetail['steps'][number];

const step = (name: string, over: Partial<Step> = {}) =>
  ({
    name,
    status: 'succeeded',
    note: null,
    needs: null,
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

const GATE_DECIDE = {
  kind: 'approve',
  step: 'plan',
  back: ['plan'],
  onto: 'main',
  said: 'approve plan',
  command: 'wf approve r plan',
} as unknown as NonNullable<RunView['toDecide']>;

const summary = (over: Partial<RunView> = {}) =>
  ({ cancelledAt: null, waitingOnYou: [], steps: [], toDecide: null, ...over }) as Pick<
    RunView,
    'cancelledAt' | 'waitingOnYou' | 'steps' | 'toDecide'
  >;

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

const tried = (round: number, n = 1) => ({ try: n, round }) as Step['tries'][number];

/** A decision at an ending's gate that read `collisions`, with `more` over them. */
const colliding = (more: Partial<Collisions>) =>
  ({
    touched: [],
    standings: [],
    collisions: { onto: 'main', base: [], inFlight: [], colliding: [], said: 'no other run is in flight on main', ...more },
  }) as unknown as Decidable;

/** The facts under a gate past the round every one opens with, off `decision`. */
const pastRound = (decision: Decidable | null) => gateFacts(detail([]), decision).filter((f) => f.label !== 'round');

describe("gateOfSummary, readLink: the card's gate, what it approves and sends back, and none on a run held or called off", () => {
  test("the card's gate is the one the to-decide names: approving files what waits on it, and a send-back goes to the step itself", () => {
    const gate = gateOfSummary(summary({ toDecide: GATE_DECIDE, waitingOnYou: ['plan'] }))!;
    assert.deepEqual(gate, { step: 'plan', back: ['plan'], onto: 'main' });
    assert.equal(gateCardLine(gate), 'approve what plan handed on, or send it back');
    assert.equal(gateNodeLine(gate), "approve plan's hand-off");
    assert.equal(takenLine({ approved: true }, gate), 'approved — the next pass files what waits on plan');
    assert.equal(
      takenLine({ asked: { try: 2, stopFirst: false }, to: 'plan' }, gate),
      'sent back to plan — try 2 asked — the next tick files it',
    );
  });
  test("a step waiting at its gate on you is the card's gate when no to-decide names one; a run called off, or a gate not waiting on you, has none", () => {
    const steps = [step('plan', { approve: 'approve plan' }), step('implement')] as unknown as RunView['steps'];
    assert.deepEqual(gateOfSummary(summary({ steps, waitingOnYou: ['plan'] })), {
      step: 'plan',
      back: ['plan'],
      onto: null,
    });
    assert.equal(gateOfSummary(summary({ steps, waitingOnYou: [] })), null, 'approved already: not waiting on you');
    assert.equal(gateOfSummary(summary({ steps, waitingOnYou: ['plan'], cancelledAt: '2026-09-19T07:00:00.000Z' })), null);
    assert.equal(gateOfSummary(summary({ toDecide: GATE_DECIDE, cancelledAt: '2026-09-19T07:00:00.000Z' })), null);
    const asks = [step('implement', { needs: 'Which database?' })] as unknown as RunView['steps'];
    assert.equal(
      gateOfSummary(summary({ steps: asks, waitingOnYou: ['implement'] })),
      null,
      'a question is not a gate: it is answered on the run page',
    );
  });
  test('a gate that has nobody to send back says so rather than offering it', () => {
    const decide = { ...GATE_DECIDE, back: [] } as unknown as NonNullable<RunView['toDecide']>;
    const gate = gateOfSummary(summary({ toDecide: decide }))!;
    assert.equal(gateCardLine(gate), 'approve what plan handed on: it waits on no step to send back');
    assert.equal(gateBrief(gate, []).sendingBack, 'There is nothing to send back: plan waits on no step.');
  });
  test('REFUSED: a run a person holds has no gate on its card, whether a to-decide or a step waiting at its gate names it — the package refuses the approval', () => {
    const holding = {
      at: '2026-09-23T07:00:00.000Z',
      runs: [],
      word: 'held until a-1 succeeds',
      advice: 'wf hold r --off',
      waitingOnYou: false,
    };
    const steps = [step('plan', { approve: 'approve plan' })] as unknown as RunView['steps'];
    assert.notEqual(gateOfSummary(summary({ toDecide: GATE_DECIDE })), null);
    assert.equal(gateOfSummary({ ...summary({ toDecide: GATE_DECIDE }), holding }), null);
    assert.notEqual(gateOfSummary(summary({ steps, waitingOnYou: ['plan'] })), null);
    assert.equal(gateOfSummary({ ...summary({ steps, waitingOnYou: ['plan'] }), holding }), null);
    assert.notEqual(gateOfSummary({ ...summary({ steps, waitingOnYou: ['plan'] }), holding: null }), null, 'a run nobody holds');
  });
  test("the card's link to what a gate approves: the step's inspector, in one set of words whatever its name", () => {
    assert.deepEqual(readLink({ step: 'plan' }), { words: 'Read what it handed on', step: 'plan' });
    assert.deepEqual(readLink({ step: 'review' }), { words: 'Read what it handed on', step: 'review' });
  });
});

describe("gateOfStep, gateFacts, needWords: the inspector's gate, the facts under it, and what else a run waits on a person for", () => {
  test("the inspector's gate is read off the step: approving files what waits on it, and a send-back asks the step itself", () => {
    const plan = step('plan', { approve: 'approve plan', spec: {} as Step['spec'] });
    const run = detail([plan], { waitingOnYou: ['plan'] });
    const gate = gateOfStep(run, plan)!;
    assert.deepEqual(gate, { step: 'plan', back: ['plan'], onto: 'main' });
    const brief = gateBrief(gate, ['implement']);
    assert.equal(brief.waits, 'plan has signed off and waits at its gate: nothing after it is filed until you approve what it handed on.');
    assert.equal(brief.approving, "Approving files implement, handed plan's closeout and your words, if any.");
    assert.equal(brief.sendingBack, 'Sending back asks plan for a new try, told your words; it waits at its gate again once it signs off.');
    assert.equal(gateOfStep({ ...run, waitingOnYou: [] }, plan), null, 'not waiting on you');
    assert.equal(gateOfStep({ ...run, cancelledAt: '2026-09-19T07:00:00.000Z' }, plan), null, 'called off');
    assert.equal(gateOfStep(run, { ...plan, approve: null }), null, 'no words: no gate offered');
  });
  test("the facts under a gate: the round of its loop's cap and the cost, the review's word, each check's verdict, and — once the decision is read — what it touched and whether it merges", () => {
    const steps = [
      step('implement', { tries: [tried(1, 1), tried(2, 2)], check: { verdict: { result: 'passed', exit: 0 } } as Step['check'] }),
      step('review', {
        spec: { loop: 'implement', rounds: 3 } as Step['spec'],
        tries: [tried(1), tried(2, 2)],
        closeout: {
          outcome: 'succeeded',
          output: { again: false, concerns: [] },
          tallies: [{ tally: 'concerns', value: 0 }],
        } as unknown as Step['closeout'],
      }),
    ];
    const decision = {
      touched: [],
      standings: [{ merge: { clean: false, conflicts: ['src/a.ts'], said: 'conflicts with main in 1 file: src/a.ts' } }, { merge: null }],
    } as unknown as Decidable;
    assert.deepEqual(gateFacts(detail(steps), decision), [
      { label: 'round', said: 'round 2 of 3 · cost $1.20' },
      { label: 'loop', said: 'review asks no further round', state: 'good', step: 'review' },
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
        closeout: {
          outcome: 'succeeded',
          output: { again: true, concerns: [{}, {}] },
          tallies: [{ tally: 'concerns', value: 2 }],
        } as unknown as Step['closeout'],
      }),
    ];
    assert.deepEqual(gateFacts(detail(findings, { cost: null }), null), [
      { label: 'round', said: 'round 1 · cost not measured' },
      { label: 'loop', said: 'review left concerns: 2, and asks another round', state: undefined, step: 'review' },
    ]);
    const accepted = [
      {
        ...findings[0],
        gate: { awaiting: false, approval: { try: 1, at: '2026-09-20T00:00:00Z', message: 'fan-in teams are follow-up work' } },
      },
    ];
    assert.deepEqual(
      gateFacts(detail(accepted, { cost: null }), null)[1],
      {
        label: 'loop',
        said: 'review left concerns: 2; a person accepted the work as it stands: fan-in teams are follow-up work',
        state: undefined,
        step: 'review',
      },
      'a loop a person ended out of rounds (`nemia approve`) still has `again: true` in its closeout: the fact says whose word ended it, with their words, not "asks another round"',
    );
    const undeclared = [
      step('review', {
        spec: { loop: 'implement' } as Step['spec'],
        closeout: {
          outcome: 'succeeded',
          output: { again: true, findings: [{}, {}] },
          tallies: [],
        } as unknown as Step['closeout'],
      }),
    ];
    assert.equal(
      gateFacts(detail(undeclared, { cost: null }), null)[1]?.said,
      'review signed off succeeded',
      'a field named findings is counted by no one: nothing is counted where the step declares no tally',
    );
    const failed = [step('implement', { check: { verdict: { result: 'failed', exit: 1 } } as Step['check'] })];
    assert.equal(gateFacts(detail(failed), null)[1]?.state, 'bad');
  });
  test('the facts under a gate: the runs in flight on its base, each it collides with and in which files', () => {
    const conflict: Collision = {
      run: 'r-2',
      branch: 'wf/r-2/implement',
      ours: 'wf/r-1/implement',
      merge: { clean: false, conflicts: ['src/a.ts'] },
      said: "conflicts with r-2's wf/r-2/implement in 1 file: src/a.ts",
    };
    const unknown: Collision = {
      ...conflict,
      run: 'r-4',
      merge: { error: 'fatal' },
      said: "whether it merges onto r-4's x is not known",
    };
    const said = 'collides with 1 of the 2 runs in flight on main: r-2; whether it collides with r-4 is not known';
    assert.deepEqual(pastRound(colliding({ inFlight: ['r-2', 'r-4'], colliding: [conflict, unknown], said })), [
      { label: 'others', said, state: 'bad' },
      { label: 'collides', said: "wf/r-1/implement conflicts with r-2's wf/r-2/implement in 1 file: src/a.ts", state: 'bad' },
      { label: 'collides', said: "wf/r-1/implement whether it merges onto r-4's x is not known", state: undefined },
    ]);
    assert.deepEqual(pastRound(colliding({ inFlight: ['r-4'], colliding: [unknown], said: 'not known' }))[0], {
      label: 'others',
      said: 'not known',
      state: undefined,
    });
  });
  test('REFUSED: no fact of collisions under a gate whose decision read none, or is not read yet', () => {
    assert.deepEqual(pastRound({ touched: [], standings: [], collisions: null } as unknown as Decidable), []);
    assert.deepEqual(pastRound(null), []);
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
});
