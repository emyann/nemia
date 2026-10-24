/**
 * A step's state on the board (src/lib/status.ts): each reason the api carries read as the state a person acts on, which of them is
 * work done, which waits on a person and what a hold stops — and the colour each is drawn in, one meaning a colour, read from the look's
 * roles.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  brokenMeanings,
  classOf,
  isGate,
  satisfiesAfter,
  stateClass,
  stateDrawn,
  statePaint,
  STATE_OF,
  stepState,
  type Drawn,
  type StepState,
} from '../src/lib/status.ts';
import { STEP_REASONS, type StepPhase, type StepReason } from '../src/lib/api/reasons.ts';
import { container, meaningOf } from '../src/lib/meaning.ts';
import { isLive, movingInto } from '../src/lib/canvas.ts';

/** A step's codes, by the reason it stands in and the phase the orchestrator gives that reason (`PHASE_OF`). */
const PHASE: Record<StepReason, StepPhase> = {
  Pending: 'pending',
  Waiting: 'pending',
  WaitingForSlot: 'pending',
  WaitingForCheckout: 'pending',
  WaitingForPause: 'pending',
  Unknown: 'pending',
  Running: 'running',
  Checking: 'running',
  NeedsHuman: 'waiting',
  AwaitingApproval: 'waiting',
  Blocked: 'waiting',
  RoundsExhausted: 'waiting',
  OverBudget: 'waiting',
  BudgetExhausted: 'waiting',
  Unsigned: 'waiting',
  CheckDenied: 'waiting',
  Succeeded: 'succeeded',
  CheckPassed: 'succeeded',
  Failed: 'failed',
  CheckFailed: 'failed',
  UnreadableCloseout: 'failed',
  Stopped: 'stopped',
};

/** The state of a step standing in `reason`, at its phase, on a run called off or not and held or not. */
const stateAt = (reason: StepReason, runCancelled = false, runHeld = false): StepState =>
  stepState(PHASE[reason], reason, runCancelled, runHeld);

test('stepState: each reason the api carries, read as the state a person acts on', async (t) => {
  await t.test('every reason has its state (`STATE_OF`), and every state it names is drawn', () => {
    assert.deepEqual(Object.keys(STATE_OF).sort(), [...STEP_REASONS].sort());
    for (const reason of STEP_REASONS) assert.ok(stateDrawn[STATE_OF[reason]], reason);
  });
  await t.test(
    "each reason reads as the state a person acts on: the waits, the gates, the run's verdicts, and the engine's own word for the step's task",
    () => {
      const cases: Array<[StepReason, StepState]> = [
        ['Running', 'working'],
        ['NeedsHuman', 'needs-human'],
        ['Checking', 'checking'],
        ['CheckPassed', 'verified'],
        ['RoundsExhausted', 'exhausted'],
        ['AwaitingApproval', 'awaiting-approval'],
        ['OverBudget', 'over-budget'],
        ['BudgetExhausted', 'budget-exhausted'],
        ['Succeeded', 'unverified'],
        ['CheckFailed', 'failed-check'],
        ['Unsigned', 'unsigned'],
        ['CheckDenied', 'denied'],
        ['Blocked', 'blocked'],
        ['Failed', 'failed'],
        ['UnreadableCloseout', 'unreadable'],
        ['Stopped', 'cancelled'],
        ['Pending', 'waiting'],
        ['Waiting', 'waiting'],
        ['WaitingForCheckout', 'waiting'],
        ['WaitingForPause', 'waiting'],
        ['WaitingForSlot', 'waiting-for-slot'],
        ['Unknown', 'unknown'],
      ];
      for (const [reason, state] of cases) assert.equal(stateAt(reason), state, reason);
    },
  );
  await t.test('a step whose record the api could not judge is unreadable, apart from a task the engine has no record of', () => {
    assert.equal(stepState('failed', 'Unknown', false, false), 'unreadable');
    assert.equal(stepState('pending', 'Unknown', false, false), 'unknown');
  });
  await t.test("a session that ended is not work that was done: the engine's `Succeeded` alone is never verified", () => {
    assert.equal(stateAt('Succeeded'), 'unverified');
    assert.notEqual(stateAt('Succeeded'), stateAt('CheckPassed'));
  });
  await t.test('a step that signed off blocked is not shown as done, though its session succeeded', () => {
    assert.equal(stateAt('Blocked'), 'blocked');
    assert.equal(stateAt('Blocked', true), 'blocked');
  });
  await t.test('a step yet to start on a cancelled run reads cancelled, not waiting', () => {
    for (const reason of ['Pending', 'Waiting', 'WaitingForSlot', 'WaitingForCheckout', 'WaitingForPause'] as const)
      assert.equal(stateAt(reason, true), 'cancelled', reason);
    assert.equal(stateAt('Running', true), 'working', 'a step still running when the run was called off is running until the stop lands');
  });
  await t.test(
    'a root of a run waiting on runs (`Waiting`) and one waiting on the checkout are waiting, and cancelled on a run called off',
    () => {
      for (const reason of ['Waiting', 'WaitingForCheckout'] as const) {
        assert.equal(stateAt(reason), 'waiting', reason);
        assert.equal(stateAt(reason, true), 'cancelled', reason);
      }
    },
  );
  await t.test('a step signed off whose check the pause keeps from being filed (`WaitingForPause`) is waiting, never checking', () => {
    const state = stateAt('WaitingForPause');
    assert.equal(state, 'waiting');
    assert.notEqual(state, stateAt('Checking'), 'no check of it is filed');
    assert.equal(isLive(state), false, 'no session or check of it is at work');
  });
});

test('stepState, satisfiesAfter, isGate: what is work done, what waits on a person, and what a hold stops', async (t) => {
  await t.test('only verified and unverified are work done; a refused check, a failed session and an unsigned step are not', () => {
    const notDone: StepReason[] = [
      'CheckFailed',
      'Failed',
      'Unsigned',
      'CheckDenied',
      'Blocked',
      'RoundsExhausted',
      'Checking',
      'Running',
      'Waiting',
      'UnreadableCloseout',
      'Unknown',
    ];
    for (const reason of notDone) assert.equal(satisfiesAfter(stateAt(reason)), false, reason);
    assert.equal(satisfiesAfter(stepState('failed', 'Unknown', false, false)), false, 'unreadable');
    for (const reason of ['CheckPassed', 'Succeeded'] as const) assert.equal(satisfiesAfter(stateAt(reason)), true, reason);
    assert.notEqual(
      stateAt('CheckFailed'),
      stateAt('Failed'),
      "a refused check is its own state, not a session that failed: the colour says which to read, the check's output or the log",
    );
  });
  await t.test(
    'a loop out of rounds waits on a person, in the yellow of the look like a step that signed off blocked, and says so on hover',
    () => {
      assert.equal(stateAt('RoundsExhausted'), 'exhausted');
      assert.notEqual(
        stateAt('RoundsExhausted'),
        stateAt('Blocked'),
        'its own state, not `blocked`: nothing was left unfinished, the loop asked for more than its workflow allows',
      );
      assert.equal(stateClass.exhausted, stateClass.blocked);
      assert.match(stateClass.exhausted, /\bbg-yours\b/);
      assert.equal(
        stateAt('RoundsExhausted', true),
        'exhausted',
        'final, so a run somebody called off does not make it read as a step that never started',
      );
    },
  );
  await t.test(
    'a step past its budget waits on a person in the yellow of the look, as a loop out of rounds does, and says on hover what raises its cap',
    () => {
      for (const state of ['over-budget', 'budget-exhausted'] as const) {
        assert.equal(stateClass[state], stateClass.exhausted, state);
        assert.equal(satisfiesAfter(state), false, `${state} is not work done`);
      }
      assert.equal(
        stateAt('OverBudget', true),
        'over-budget',
        'final, so a run somebody called off does not make it read as a step that never started',
      );
    },
  );
  await t.test(
    'a human gate is a step a person decides: signed off blocked, a loop out of rounds, or a step past its budget — and on a cancelled run, none',
    () => {
      for (const reason of ['Blocked', 'RoundsExhausted', 'OverBudget', 'BudgetExhausted'] as const) {
        assert.equal(isGate(stateAt(reason), false), true, reason);
        assert.equal(isGate(stateAt(reason, true), true), false, `${reason}, on a cancelled run: nobody waits for the answer`);
      }
      const notGates: StepReason[] = [
        'CheckFailed',
        'Unsigned',
        'CheckDenied',
        'CheckPassed',
        'Succeeded',
        'Checking',
        'Running',
        'NeedsHuman',
        'Failed',
        'Stopped',
        'Waiting',
        'UnreadableCloseout',
        'Unknown',
      ];
      for (const reason of notGates)
        assert.equal(
          isGate(stateAt(reason), false),
          false,
          `${reason}: work to try again, not a decision, or a state that waits on nobody`,
        );
      assert.equal(isGate(stepState('failed', 'Unknown', false, false), false), false, 'unreadable');
    },
  );
  await t.test(
    'a step waiting at its gate waits on a person in the yellow of the look, as a step signed off blocked does — a human gate, not work done — and says on hover how to approve it or send it back',
    () => {
      assert.equal(stateAt('AwaitingApproval'), 'awaiting-approval');
      assert.equal(
        stateAt('AwaitingApproval', true),
        'awaiting-approval',
        'final, so a run somebody called off does not make it read as a step that never started',
      );
      assert.equal(
        satisfiesAfter('awaiting-approval'),
        false,
        'nothing after it may be filed on it until a person says so, as `satisfiesAfter` in the package says',
      );
      assert.equal(stateClass['awaiting-approval'], stateClass.blocked);
      assert.equal(isGate('awaiting-approval', false), true);
      assert.equal(isGate('awaiting-approval', true), false, 'nobody waits for an approval on a run called off');
    },
  );
  await t.test(
    'a root of a run the cap on runs in flight holds (`WaitingForSlot`) is a wait nobody is asked about — never working — and cancelled on a run called off',
    () => {
      const state = stateAt('WaitingForSlot');
      assert.equal(state, 'waiting-for-slot');
      assert.equal(isLive(state), false, 'no session of it is at work');
      assert.equal(movingInto(state), false, 'nothing moves into it');
      assert.equal(isGate(state, false), false, 'nobody is asked');
      assert.equal(satisfiesAfter(state), false, 'not work done');
      assert.equal(stateAt('WaitingForSlot', true), 'cancelled', 'on a run called off');
      assert.equal(stateAt('WaitingForSlot', false, true), 'held', 'on a run a person holds');
      assert.notEqual(stateClass['waiting-for-slot'], stateClass.working, 'drawn as the wait it is, not as a session at work');
    },
  );
  await t.test(
    'on a run a person holds (`wf hold`), a step not filed and a step at a human gate are `held`, in their own words — and nothing else moves',
    () => {
      const held: StepReason[] = [
        'Waiting',
        'Pending',
        'WaitingForCheckout',
        'WaitingForPause',
        'Blocked',
        'AwaitingApproval',
        'RoundsExhausted',
        'OverBudget',
        'BudgetExhausted',
      ];
      for (const reason of held) {
        assert.equal(stateAt(reason, false, true), 'held', reason);
        assert.equal(
          isGate(stateAt(reason, false, true), false),
          false,
          `${reason}: nobody is asked while the hold stands, and every verb that would answer the gate is refused`,
        );
      }
      const unmoved: Array<[StepReason, StepState]> = [
        ['Running', 'working'],
        ['NeedsHuman', 'needs-human'],
        ['Checking', 'checking'],
        ['CheckPassed', 'verified'],
        ['Succeeded', 'unverified'],
        ['CheckFailed', 'failed-check'],
        ['Unsigned', 'unsigned'],
        ['CheckDenied', 'denied'],
        ['Failed', 'failed'],
        ['Stopped', 'cancelled'],
        ['UnreadableCloseout', 'unreadable'],
        ['Unknown', 'unknown'],
      ];
      for (const [reason, state] of unmoved)
        assert.equal(
          stateAt(reason, false, true),
          state,
          `${reason}: the hold stops what is filed next and the answers to a gate, not what is in flight, a session asking through its harness, or a verdict`,
        );
      assert.equal(stepState('failed', 'Unknown', false, true), 'unreadable', 'an unreadable step, held or not');
      assert.equal(stateAt('Waiting', true, true), 'cancelled', 'a run called off is called off, held or not');
      assert.equal(stateAt('AwaitingApproval', true, true), 'awaiting-approval');
      assert.equal(satisfiesAfter('held'), false);
      assert.notEqual(stateClass.held, stateClass.waiting, 'a person stops it, not the order of the steps');
      assert.notEqual(stateClass.held, stateClass.blocked, 'it asks nobody, as a gate does');
    },
  );
});

const web = path.resolve(import.meta.dirname, '..');
const given = (state: StepState, drawn: Drawn): Record<StepState, Drawn> => ({ ...stateDrawn, [state]: drawn });

const ROLE_OF = { yours: 'primary', alive: 'secondary', money: 'tertiary', failure: 'error' } as const;

const readsRole = (css: string, meaning: keyof typeof ROLE_OF): boolean =>
  new RegExp(`--meaning-${meaning}:\\s*var\\(\\s*--md-sys-color-${ROLE_OF[meaning]}\\s*\\)\\s*;`).test(css);

const WRITTEN = { primary: '#f5e61a', secondary: '#eaf6f8', tertiary: '#e0a15e', error: '#ff7676' } as const;

/** The roles of `WRITTEN` a look's front matter does not write at their value, by name. */
const unwritten = (look: string): string[] => {
  const front = look.slice(0, look.indexOf('\n---', 4));
  return Object.entries(WRITTEN)
    .filter(([role, value]) => !front.includes(`\n  ${role}: "${value}"\n`))
    .map(([role]) => role);
};

const HUE = /\b(?:sky|blue|orange|amber|yellow|emerald|green|red|violet)-\d{2,3}\b/;

const STATE_DRAWERS = [
  'StepNode.tsx',
  'StepRail.tsx',
  'RunNode.tsx',
  'CanvasLegend.tsx',
  'MachineNode.tsx',
  'MachineEdge.tsx',
  'FactoryCanvas.tsx',
  'QueueLane.tsx',
  'look/RunSteps.tsx',
];

/** The text of `source` from the declaration `from` up to the declaration `to`, both of which must be there. */
function sliceOf(source: string, from: string, to: string): string {
  const [start, end] = [source.indexOf(from), source.indexOf(to)];
  assert.ok(start >= 0 && end > start, `${from} then ${to}`);
  return source.slice(start, end);
}

/** Whether a banner's source draws what waits on a person from the yours container: `onYou`, then the form, across line breaks. */
const onYouReadsYours = (banner: string): boolean => /\.onYou\s*\?\s*container\.yours\s*:/.test(banner);

test("the meanings of a state's colour: one thing each, read from the look's roles, never a hand-picked hue", async (t) => {
  await t.test(
    'a colour says one thing: a state that waits on a person is yours, a failure is failure and nothing else is, and no state is money',
    () => {
      assert.equal(brokenMeanings(stateDrawn).length, 0, brokenMeanings(stateDrawn).join('; '));
      const states = Object.keys(stateDrawn) as StepState[];
      for (const state of states.filter((s) => isGate(s, false))) assert.equal(meaningOf(stateDrawn[state].hue), 'yours', state);
      assert.deepEqual(
        states.filter((s) => meaningOf(stateDrawn[s].hue) === 'failure'),
        ['failed', 'failed-check', 'unreadable'],
      );
      assert.equal(meaningOf(stateDrawn.working.hue), 'alive');
      for (const state of states) assert.equal(stateClass[state], classOf(stateDrawn[state]), `${state}'s chip is drawn from the table`);

      assert.deepEqual(brokenMeanings(given('blocked', { hue: 'money', form: 'filled' })), [
        'blocked is money: amber is an amount, never a state',
      ]);
      assert.deepEqual(brokenMeanings(given('awaiting-approval', { hue: 'alive', form: 'filled' })), [
        'awaiting-approval waits on a person and is alive, not yours',
      ]);
      assert.deepEqual(brokenMeanings(given('waiting', { hue: 'failure', form: 'container' })), [
        'waiting is no failure and is drawn as one',
      ]);
      assert.deepEqual(brokenMeanings(given('failed', { hue: 'grey', form: 'container' })), ['failed is a failure and is rest']);
      assert.deepEqual(brokenMeanings(given('verified', { hue: 'yours', form: 'filled' })), ['verified waits on nobody and is yours']);
    },
  );
  await t.test(
    "the meanings are the look's: each reads its role of the theme once, and the look writes yellow, a pale ice, amber and red",
    () => {
      const css = fs.readFileSync(path.join(web, 'src', 'styles.css'), 'utf8');
      for (const meaning of Object.keys(ROLE_OF) as Array<keyof typeof ROLE_OF>) {
        assert.equal(readsRole(css, meaning), true, `--meaning-${meaning} reads --md-sys-color-${ROLE_OF[meaning]}`);
        assert.equal(css.split(`--meaning-${meaning}:`).length, 2, `--meaning-${meaning} has one writer`);
      }
      const swapped = '--meaning-yours: var(--md-sys-color-tertiary);\n--meaning-money:\n  var(--md-sys-color-tertiary);';
      assert.equal(readsRole(swapped, 'yours'), false, 'a wait read from the amber role is refused');
      assert.equal(readsRole(swapped, 'money'), true, 'across a line break too');

      const look = fs.readFileSync(path.join(web, 'DESIGN.md'), 'utf8');
      assert.equal(unwritten(look).length, 0, `the look writes ${unwritten(look).join(', ')} at another value`);
      const old = look
        .replace('  secondary: "#eaf6f8"\n', '  secondary: "#39ff5a"\n')
        .replace('  error: "#ff7676"\n', '  error: "#e8695b"\n');
      assert.deepEqual(unwritten(old), ['secondary', 'error'], 'the neon green and the terracotta put back are named');
      const below = look.replace('  error: "#ff7676"\n', '').replace('\n---\n\n', '\n---\n\n  error: "#ff7676"\n');
      assert.deepEqual(unwritten(below), ['error'], 'a value under the front matter is no written role');
    },
  );
  await t.test('no hand-picked hue says a state: the chips, the minimap and the canvases draw the meanings alone', () => {
    assert.match('border-2 border-amber-500', HUE, 'the pattern names a hand-picked hue');
    assert.match('var(--color-sky-500)', HUE);
    assert.doesNotMatch('border-2 border-yours bg-alive-container', HUE);
    for (const state of Object.keys(stateDrawn) as StepState[]) {
      assert.doesNotMatch(stateClass[state], HUE, state);
      assert.match(statePaint[state], /^var\(--meaning-(?:yours|alive|failure|rest|sage)\)$/, state);
    }
    for (const file of STATE_DRAWERS) {
      const lines = fs.readFileSync(path.join(web, 'src', 'components', file), 'utf8').split('\n');
      assert.ok(lines.length > 10, file);
      const found = lines.flatMap((line, at) => (HUE.test(line) ? [`${file}:${at + 1}`] : []));
      assert.equal(found.length, 0, found.join(', '));
    }
  });
  await t.test(
    "REFUSED: the run page's banners of a wait on a person — waiting on runs, held — drawn from another meaning than yours",
    () => {
      const page = fs.readFileSync(path.join(web, 'src', 'routes', 'runs.$runId.tsx'), 'utf8');
      for (const [from, to] of [
        ['function WaitingOnRuns(', 'function HeldUntil('],
        ['function HeldUntil(', 'function RunHeading('],
      ]) {
        const banner = sliceOf(page, from, to);
        assert.equal(onYouReadsYours(banner), true, `${from} draws a wait on a person from container.yours`);
        assert.doesNotMatch(banner, /container\.(?:money|failure|alive)/, `${from} draws no other meaning`);
      }
      assert.equal(onYouReadsYours('waiting.onYou\n  ? container.yours\n  : filled.grey'), true, 'across a line break');
      assert.equal(onYouReadsYours('waiting.onYou ? container.money : filled.grey'), false, "an amount's amber is refused");
      assert.equal(container.yours, 'bg-yours-container text-on-yours-container');
    },
  );
});
