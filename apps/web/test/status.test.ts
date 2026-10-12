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
  stateMeaning,
  statePaint,
  stepState,
  type Drawn,
  type StepState,
} from '../src/lib/status.ts';
import { container, meaningOf } from '../src/lib/meaning.ts';
import { isLive, movingInto } from '../src/lib/canvas.ts';

test("each word wf ls prints reads as the state a person acts on: waiting, rounds exhausted, the run's verdicts, and the engine's own word for the step's task with how it signed off beside it", () => {
  const cases: Array<[string, StepState]> = [
    ['running (working)', 'working'],
    ['working (quiescent)', 'working'],
    ['starting', 'working'],
    ['between attempts', 'working'],
    ['needs-human', 'needs-human'],
    ['checking', 'checking'],
    ['verified ✓', 'verified'],
    ['rounds exhausted', 'exhausted'],
    ['awaiting approval', 'awaiting-approval'],
    ['over budget $4.20 of $3', 'over-budget'],
    ['over budget ≥$4.20 of $3', 'over-budget'],
    ['over budget — implement $4.25 of $3', 'over-budget'],
    ['budget exhausted $3.02 of $3', 'budget-exhausted'],
    ['budget exhausted at $3', 'budget-exhausted'],
    ['budget exhausted', 'budget-exhausted'],
    ['unverified · done', 'unverified'],
    ['unverified · closeout unreadable', 'unverified'],
    ['unverified', 'unverified'],
    ['failed ✗ check (exit 1)', 'failed-check'],
    ['failed ✗ check (unfinished)', 'failed-check'],
    ['unsigned', 'unsigned'],
    ['denied', 'denied'],
    ['unsigned · done', 'unsigned'],
    ['denied', 'denied'],
    ['succeeded · BLOCKED', 'blocked'],
    ['stopped · BLOCKED', 'blocked'],
    ['input-required · BLOCKED', 'blocked'],
    ['input-required', 'unverified'],
    ['failed', 'failed'],
    ['failed · done', 'failed'],
    ['failed · closeout unreadable', 'failed'],
    ['stopped', 'cancelled'],
    ['stopped · done', 'cancelled'],
    ['waiting', 'waiting'],
    ['pending', 'waiting'],
    ['unreadable', 'unreadable'],
    ['unknown', 'unknown'],
  ];
  for (const [status, state] of cases) assert.equal(stepState(status, false, false), state, status);
});

test("a session that ended is not work that was done: the engine's `succeeded` alone is never verified", () => {
  assert.equal(stepState('succeeded', false, false), 'unverified');
  assert.equal(stepState('succeeded · done', false, false), 'unverified');
});

test('only verified and unverified are work done; a refused check, a failed session and an unsigned step are not', () => {
  const notDone = [
    'failed ✗ check (exit 1)',
    'failed · done',
    'unsigned',
    'denied',
    'succeeded · BLOCKED',
    'rounds exhausted',
    'checking',
    'running (working)',
    'waiting',
    'unreadable',
    'unknown',
  ];
  for (const status of notDone) assert.equal(satisfiesAfter(stepState(status, false, false)), false, status);
  for (const status of ['verified ✓', 'unverified · done']) assert.equal(satisfiesAfter(stepState(status, false, false)), true, status);
  assert.notEqual(
    stepState('failed ✗ check (exit 1)', false, false),
    stepState('failed', false, false),
    "a refused check is its own state, not a session that failed: the colour says which to read, the check's output or the log",
  );
});

test('a step that signed off blocked is not shown as done, though its session succeeded', () => {
  assert.equal(stepState('succeeded · BLOCKED', false, false), 'blocked');
  assert.equal(stepState('succeeded · BLOCKED', true, false), 'blocked');
  assert.equal(
    stepState('input-required · BLOCKED', false, false),
    'blocked',
    "held open, the engine's word for the same session is `input-required`: waiting for the word, with nothing running",
  );
  assert.notEqual(stepState('input-required', false, false), 'working', 'a session that signed and waits is not drawn as still going');
});

test('a step yet to start on a cancelled run reads cancelled, not waiting', () => {
  assert.equal(stepState('waiting', true, false), 'cancelled');
  assert.equal(stepState('pending', true, false), 'cancelled');
  assert.equal(
    stepState('running (working)', true, false),
    'working',
    'a step still running when the run was called off is running until the stop lands',
  );
});

test('a loop out of rounds waits on a person, in the yellow of the look like a step that signed off blocked, and says so on hover', () => {
  assert.equal(stepState('rounds exhausted', false, false), 'exhausted');
  assert.notEqual(
    stepState('rounds exhausted', false, false),
    stepState('succeeded · BLOCKED', false, false),
    'its own state, not `blocked`: nothing was left unfinished, the loop asked for more than its workflow allows',
  );
  assert.equal(stateClass.exhausted, stateClass.blocked);
  assert.match(stateClass.exhausted, /\bbg-yours\b/);
  assert.equal(
    stateMeaning.exhausted,
    'rounds exhausted: the reviewer asked for another round on the last one rounds: allows; a person decides — another round, or accepting what is there to go on with it',
  );
  assert.equal(
    stepState('rounds exhausted', true, false),
    'exhausted',
    'final, so a run somebody called off does not make it read as a step that never started',
  );
});

test('a word the board does not know reads as working, on purpose: never as done, and never as waiting on you', () => {
  for (const status of [
    'a word wf ls has gained since',
    'rounds exhausted, and more',
    'exhausted',
    'over budgetary',
    'budget',
    'budget exhaustedness',
    'over budget',
  ]) {
    assert.equal(
      stepState(status, false, false),
      'working',
      `${status}: a word the board has not been taught is still going, rather than a verdict the run never gave`,
    );
    assert.equal(satisfiesAfter(stepState(status, false, false)), false, status);
  }
});

test('a step past its budget waits on a person in the yellow of the look, as a loop out of rounds does, and says on hover what raises its cap', () => {
  for (const state of ['over-budget', 'budget-exhausted'] as const) {
    assert.equal(stateClass[state], stateClass.exhausted, state);
    assert.equal(satisfiesAfter(state), false, `${state} is not work done`);
    assert.match(stateMeaning[state], /until a person raises the cap on a try/);
  }
  assert.match(stateMeaning['over-budget'], /^over budget: its tries have cost its budget: or more/);
  assert.match(stateMeaning['budget-exhausted'], /^budget exhausted: its harness ended its session at its budget:/);
  assert.equal(
    stepState('over budget $4.20 of $3', true, false),
    'over-budget',
    'final, so a run somebody called off does not make it read as a step that never started',
  );
});

test('a human gate is a step a person decides: signed off blocked, a loop out of rounds, or a step past its budget — and on a cancelled run, none', () => {
  for (const status of [
    'succeeded · BLOCKED',
    'rounds exhausted',
    'over budget $4.20 of $3',
    'over budget — implement $4.25 of $3',
    'budget exhausted $3.02 of $3',
  ]) {
    assert.equal(isGate(stepState(status, false, false), false), true, status);
    assert.equal(isGate(stepState(status, true, false), true), false, `${status}, on a cancelled run: nobody waits for the answer`);
  }
  const notGates = [
    'failed ✗ check (exit 1)',
    'failed ✗ check (unfinished)',
    'unsigned',
    'denied',
    'verified ✓',
    'unverified · done',
    'checking',
    'running (working)',
    'needs-human',
    'failed',
    'stopped',
    'waiting',
    'unreadable',
    'unknown',
  ];
  for (const status of notGates)
    assert.equal(
      isGate(stepState(status, false, false), false),
      false,
      `${status}: work to try again, not a decision, or a state that waits on nobody`,
    );
});

test('a step waiting at its gate waits on a person in the yellow of the look, as a step signed off blocked does — a human gate, not work done — and says on hover how to approve it or send it back', () => {
  assert.equal(stepState('awaiting approval', false, false), 'awaiting-approval');
  assert.equal(
    stepState('awaiting approval', true, false),
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
  assert.match(
    stateMeaning['awaiting-approval'],
    /^awaiting approval: it signed off at its gate, and nothing after it is filed until a person approves it, or sends it back with words for its next try$/,
  );
  assert.equal(stepState('awaiting approvals', false, false), 'working', 'not a word that merely starts like it');
});

test('a root of a run waiting on runs reads `waiting on <run>`, which is waiting — whatever runs it names, and why — and cancelled on a run called off', () => {
  for (const word of [
    'waiting on a-1x2y',
    'waiting on a-1x2y (cancelled), b-3z4w',
    'waiting on a-1x2y (no such run)',
    'waiting on a-1x2y (wf/a-1x2y/implement gone)',
  ]) {
    assert.equal(stepState(word, false, false), 'waiting', word);
    assert.equal(stepState(word, true, false), 'cancelled', word);
  }
  assert.equal(stepState('waitingroom', false, false), 'working', 'not a word that merely starts like one');
});

test('a step signed off whose check the pause keeps from being filed reads `waiting on the pause`: waiting, never checking', () => {
  const state = stepState('waiting on the pause', false, false);
  assert.equal(state, 'waiting');
  assert.notEqual(state, stepState('checking', false, false), 'no check of it is filed');
  assert.equal(isLive(state), false, 'no session or check of it is at work');
});

test('a root of a run the cap on runs in flight holds reads `waiting for a run slot`, a wait nobody is asked about — never working — and cancelled on a run called off', () => {
  for (const word of ['waiting for a run slot (2 of 2 in flight)', 'waiting for a run slot']) {
    const state = stepState(word, false, false);
    assert.equal(state, 'waiting-for-slot', word);
    assert.equal(isLive(state), false, `${word}: no session of it is at work`);
    assert.equal(movingInto(state), false, `${word}: nothing moves into it`);
    assert.equal(isGate(state, false), false, `${word}: nobody is asked`);
    assert.equal(satisfiesAfter(state), false, `${word}: not work done`);
    assert.equal(stepState(word, true, false), 'cancelled', `${word}, on a run called off`);
    assert.equal(stepState(word, false, true), 'held', `${word}, on a run a person holds`);
  }
  assert.match(stateMeaning['waiting-for-slot'], /^waiting for a run slot: not filed yet — the cap on runs in flight \(WF_MAX_RUNS\)/);
  assert.notEqual(stateClass['waiting-for-slot'], stateClass.working, 'drawn as the wait it is, not as a session at work');
  assert.equal(stepState('waiting for a run slotted', false, false), 'working', 'not a word that merely starts like it');
});

test('on a run a person holds (`wf hold`), a step not filed and a step at a human gate are `held`, in their own words — and nothing else moves', () => {
  const held = [
    'waiting',
    'pending',
    'waiting on a-1x2y',
    'succeeded · BLOCKED',
    'input-required · BLOCKED',
    'awaiting approval',
    'rounds exhausted',
    'over budget $4.20 of $3',
    'budget exhausted $3.02 of $3',
  ];
  for (const status of held) {
    assert.equal(stepState(status, false, true), 'held', status);
    assert.equal(
      isGate(stepState(status, false, true), false),
      false,
      `${status}: nobody is asked while the hold stands, and every verb that would answer the gate is refused`,
    );
  }
  const unmoved: Array<[string, StepState]> = [
    ['running (working)', 'working'],
    ['needs-human', 'needs-human'],
    ['checking', 'checking'],
    ['verified ✓', 'verified'],
    ['unverified · done', 'unverified'],
    ['failed ✗ check (exit 1)', 'failed-check'],
    ['unsigned', 'unsigned'],
    ['denied', 'denied'],
    ['failed', 'failed'],
    ['stopped', 'cancelled'],
    ['unreadable', 'unreadable'],
    ['unknown', 'unknown'],
  ];
  for (const [status, state] of unmoved)
    assert.equal(
      stepState(status, false, true),
      state,
      `${status}: the hold stops what is filed next and the answers to a gate, not what is in flight, a session asking through its harness, or a verdict`,
    );
  assert.equal(stepState('waiting', true, true), 'cancelled', 'a run called off is called off, held or not');
  assert.equal(stepState('awaiting approval', true, true), 'awaiting-approval');
  assert.equal(satisfiesAfter('held'), false);
  assert.match(stateMeaning.held, /^held: a person holds the run until other runs ship/);
  assert.notEqual(stateClass.held, stateClass.waiting, 'a person stops it, not the order of the steps');
  assert.notEqual(stateClass.held, stateClass.blocked, 'it asks nobody, as a gate does');
});

const web = path.resolve(import.meta.dirname, '..');
const given = (state: StepState, drawn: Drawn): Record<StepState, Drawn> => ({ ...stateDrawn, [state]: drawn });

test('a colour says one thing: a state that waits on a person is yours, a failure is failure and nothing else is, and no state is money', () => {
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
  assert.deepEqual(brokenMeanings(given('waiting', { hue: 'failure', form: 'container' })), ['waiting is no failure and is drawn as one']);
  assert.deepEqual(brokenMeanings(given('failed', { hue: 'grey', form: 'container' })), ['failed is a failure and is rest']);
  assert.deepEqual(brokenMeanings(given('verified', { hue: 'yours', form: 'filled' })), ['verified waits on nobody and is yours']);
});

const ROLE_OF = { yours: 'primary', alive: 'secondary', money: 'tertiary', failure: 'error' } as const;
const readsRole = (css: string, meaning: keyof typeof ROLE_OF): boolean =>
  new RegExp(`--meaning-${meaning}:\\s*var\\(\\s*--md-sys-color-${ROLE_OF[meaning]}\\s*\\)\\s*;`).test(css);

test("the meanings are the look's: each reads its role of the theme once, and the look writes yellow, amber and terracotta", () => {
  const css = fs.readFileSync(path.join(web, 'src', 'styles.css'), 'utf8');
  for (const meaning of Object.keys(ROLE_OF) as Array<keyof typeof ROLE_OF>) {
    assert.equal(readsRole(css, meaning), true, `--meaning-${meaning} reads --md-sys-color-${ROLE_OF[meaning]}`);
    assert.equal(css.split(`--meaning-${meaning}:`).length, 2, `--meaning-${meaning} has one writer`);
  }
  const swapped = '--meaning-yours: var(--md-sys-color-tertiary);\n--meaning-money:\n  var(--md-sys-color-tertiary);';
  assert.equal(readsRole(swapped, 'yours'), false, 'a wait read from the amber role is refused');
  assert.equal(readsRole(swapped, 'money'), true, 'across a line break too');

  const look = fs.readFileSync(path.join(web, 'DESIGN.md'), 'utf8');
  const front = look.slice(0, look.indexOf('\n---', 4));
  for (const written of ['primary: "#f5e61a"', 'tertiary: "#e0a15e"', 'error: "#e8695b"', 'secondary: "#39ff5a"'])
    assert.ok(front.includes(`\n  ${written}\n`), written);
});

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
  'RunSteps.tsx',
];

test('no hand-picked hue says a state: the chips, the minimap and the canvases draw the meanings alone', () => {
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

/** The text of `source` from the declaration `from` up to the declaration `to`, both of which must be there. */
function sliceOf(source: string, from: string, to: string): string {
  const [start, end] = [source.indexOf(from), source.indexOf(to)];
  assert.ok(start >= 0 && end > start, `${from} then ${to}`);
  return source.slice(start, end);
}

/** Whether a banner's source draws what waits on a person from the yours container: `onYou`, then the form, across line breaks. */
const onYouReadsYours = (banner: string): boolean => /\.onYou\s*\?\s*container\.yours\s*:/.test(banner);

test("REFUSED: the run page's banners of a wait on a person — waiting on runs, held — drawn from another meaning than yours", () => {
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
});
