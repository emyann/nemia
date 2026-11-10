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
  satisfiesAfter,
  stateClass,
  stateDrawn,
  statePaint,
  stepState,
  type Drawn,
  type StepState,
  waitsAtGate,
  waitsOnPerson,
} from '../src/lib/status.ts';
import type { StepPhase, StepReason } from 'objects';
import type { StepCodes } from '../src/lib/status.ts';
import { container, meaningOf } from '../src/lib/meaning.ts';
import { HELD_TO_COME, PAUSED, PERSON, stateWordsOf } from '../src/lib/words.ts';
import { isLive, movingInto } from '../src/lib/canvas.ts';

/** A step's phase, by the reason it stands in, as the orchestrator gives that reason (`PHASE_OF`). */
const PHASE: Record<StepReason, StepPhase> = {
  Pending: 'pending',
  Waiting: 'pending',
  Unknown: 'pending',
  Running: 'running',
  Checking: 'running',
  Paused: 'running',
  AwaitingApproval: 'waiting',
  AwaitingAnswer: 'waiting',
  AwaitingRound: 'waiting',
  OverBudget: 'waiting',
  BudgetExhausted: 'waiting',
  Unsigned: 'waiting',
  Denied: 'waiting',
  Succeeded: 'succeeded',
  CheckPassed: 'succeeded',
  Failed: 'failed',
  CheckFailed: 'failed',
  UnreadableCloseout: 'failed',
  Stopped: 'stopped',
  Skipped: 'stopped',
  Sent: 'succeeded',
};

/** The readings of a qualified reason, by what qualifies it: a wait by what it waits on, a question by where it is asked. */
const QUALIFIED = {
  'Waiting on run': { reason: 'Waiting', on: 'run', via: null },
  'Waiting on limit': { reason: 'Waiting', on: 'limit', via: null },
  'Waiting on base': { reason: 'Waiting', on: 'base', via: null },
  'Waiting on pause': { reason: 'Waiting', on: 'pause', via: null },
  'Waiting on hold': { reason: 'Waiting', on: 'hold', via: null },
  'AwaitingAnswer via session': { reason: 'AwaitingAnswer', on: null, via: 'session' },
  'AwaitingAnswer via closeout': { reason: 'AwaitingAnswer', on: null, via: 'closeout' },
} as const satisfies Record<string, Omit<StepCodes, 'phase'>>;

/** A step's codes by name: a reason no field qualifies, or a qualified reading of one that is (`QUALIFIED`). */
type Named = Exclude<StepReason, 'Waiting' | 'AwaitingAnswer'> | keyof typeof QUALIFIED;

/** The codes of the step `named` names, at the phase of its reason. */
const codesOf = (named: Named): StepCodes => {
  const qualified: Omit<StepCodes, 'phase'> =
    named in QUALIFIED ? QUALIFIED[named as keyof typeof QUALIFIED] : { reason: named as StepReason, on: null, via: null };
  return { phase: PHASE[qualified.reason], ...qualified };
};

/** The state of the step `named` names, at its phase, on a run called off or not and held or not. */
const stateAt = (named: Named, runCancelled = false, runHeld = false): StepState => stepState(codesOf(named), runCancelled, runHeld);

/** The codes of a step whose reason is `reason` at `phase`, qualified by nothing. */
const plain = (phase: StepPhase, reason: StepReason): StepCodes => ({ phase, reason, on: null, via: null });

test('stepState: each reason the api carries, read as the state a person acts on', async (t) => {
  await t.test('a qualified reason reads by what qualifies it: an answer by where it is asked, a wait by what it waits on', () => {
    const cases: Array<[keyof typeof QUALIFIED, StepState]> = [
      ['AwaitingAnswer via session', 'asks-in-session'],
      ['AwaitingAnswer via closeout', 'blocked'],
      ['Waiting on limit', 'waiting-for-slot'],
      ['Waiting on run', 'waiting'],
      ['Waiting on base', 'waiting'],
      ['Waiting on pause', 'waiting'],
      ['Waiting on hold', 'waiting'],
    ];
    for (const [named, state] of cases) assert.equal(stateAt(named), state, named);
  });
  await t.test('a step whose record the api could not judge is unreadable, apart from a task the engine has no record of', () => {
    assert.equal(stepState(plain('failed', 'Unknown'), false, false), 'unreadable');
    assert.equal(stepState(plain('pending', 'Unknown'), false, false), 'unknown');
  });
  await t.test("a session that ended is not work that was done: the engine's `Succeeded` alone is never verified", () => {
    assert.equal(stateAt('Succeeded'), 'unverified');
    assert.notEqual(stateAt('Succeeded'), stateAt('CheckPassed'));
  });
  await t.test('a step yet to start on a cancelled run reads cancelled, not waiting', () => {
    for (const named of ['Pending', 'Waiting on run', 'Waiting on limit', 'Waiting on base', 'Waiting on pause'] as const)
      assert.equal(stateAt(named, true), 'cancelled', named);
    assert.equal(stateAt('Running', true), 'working', 'a step still running when the run was called off is running until the stop lands');
  });
  await t.test('a step signed off whose check the pause keeps from being filed (`Waiting` on `pause`) is waiting, never checking', () => {
    const state = stateAt('Waiting on pause');
    assert.equal(state, 'waiting');
    assert.notEqual(state, stateAt('Checking'), 'no check of it is filed');
    assert.equal(isLive(state), false, 'no session or check of it is at work');
  });
  await t.test(
    "a session the store's pause parked between two tool calls (`Paused`, phase `running`) is paused, at rest, and asks nobody",
    () => {
      const state = stepState(plain('running', 'Paused'), false, false);
      assert.equal(state, 'paused');
      assert.equal(stateAt('Paused'), 'paused');
      assert.equal(PERSON[state].rail, 'paused');
      assert.equal(isLive(state), false, 'nothing of it is at work while it is parked');
      assert.equal(waitsOnPerson(state, false), false, "it resumes with the store, on nobody else's word");
      assert.equal(meaningOf(stateDrawn[state].hue), 'rest');
      assert.equal(stateDrawn[state].form, 'ringed');
      assert.equal(stepState(plain('running', 'Paused'), true, true), 'paused', 'a hold or a cancel leaves a parked session as it is');
    },
  );
});

test('stepState, satisfiesAfter, waitsOnPerson, waitsAtGate: what is work done, what waits on a person, and what a hold stops', async (t) => {
  await t.test('only verified and unverified are work done; a refused check, a failed session and an unsigned step are not', () => {
    const notDone: Named[] = [
      'CheckFailed',
      'Failed',
      'Unsigned',
      'Denied',
      'AwaitingAnswer via closeout',
      'AwaitingRound',
      'Checking',
      'Running',
      'Waiting on run',
      'UnreadableCloseout',
      'Unknown',
    ];
    for (const reason of notDone) assert.equal(satisfiesAfter(stateAt(reason)), false, reason);
    assert.equal(satisfiesAfter(stepState(plain('failed', 'Unknown'), false, false)), false, 'unreadable');
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
      assert.equal(stateAt('AwaitingRound'), 'exhausted');
      assert.notEqual(
        stateAt('AwaitingRound'),
        stateAt('AwaitingAnswer via closeout'),
        'its own state, not `blocked`: nothing was left unfinished, the loop asked for more than its workflow allows',
      );
      assert.equal(stateClass.exhausted, stateClass.blocked);
      assert.match(stateClass.exhausted, /\bbg-yours\b/);
      assert.equal(
        stateAt('AwaitingRound', true),
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
    'of the states that wait on a person, a human gate is one a person decides — signed off blocked, at its gate, a loop out of rounds, past its budget — and on a cancelled run, none waits',
    () => {
      const states = Object.keys(stateDrawn) as StepState[];
      const gates = ['blocked', 'awaiting-approval', 'exhausted', 'over-budget', 'budget-exhausted'];
      assert.deepEqual(
        states.filter((s) => waitsAtGate(s, false)),
        gates,
      );
      assert.deepEqual(
        states.filter((s) => waitsOnPerson(s, false)),
        ['asks-in-session', ...gates, 'unsigned', 'denied'],
        'and beside the gates, a session asking through its harness and work to try again that only a person sends',
      );
      assert.equal(states.filter((s) => waitsOnPerson(s, true) || waitsAtGate(s, true)).length, 0);
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
    },
  );
  await t.test(
    'a root of a run the cap on runs in flight holds (`Waiting` on `limit`) is a wait nobody is asked about — never working — and cancelled on a run called off',
    () => {
      const state = stateAt('Waiting on limit');
      assert.equal(state, 'waiting-for-slot');
      assert.equal(isLive(state), false, 'no session of it is at work');
      assert.equal(movingInto(state), false, 'nothing moves into it');
      assert.equal(satisfiesAfter(state), false, 'not work done');
      assert.equal(stateAt('Waiting on limit', true), 'cancelled', 'on a run called off');
      assert.equal(
        stateAt('Waiting on limit', false, true),
        'waiting-for-slot',
        'on a run a person holds: not started, so drawn as not started',
      );
      assert.notEqual(stateClass['waiting-for-slot'], stateClass.working, 'drawn as the wait it is, not as a session at work');
    },
  );
  await t.test('on a run a person holds (`wf hold`), a step at a human gate is `held`, in its own words — and nothing else moves', () => {
    const held: Named[] = ['AwaitingAnswer via closeout', 'AwaitingApproval', 'AwaitingRound', 'OverBudget', 'BudgetExhausted'];
    for (const reason of held) {
      assert.equal(stateAt(reason, false, true), 'held', reason);
      assert.equal(
        waitsOnPerson(stateAt(reason, false, true), false),
        false,
        `${reason}: nobody is asked while the hold stands, and every verb that would answer the gate is refused`,
      );
    }
    const unmoved: Array<[Named, StepState]> = [
      ['Waiting on run', 'waiting'],
      ['Pending', 'waiting'],
      ['Waiting on base', 'waiting'],
      ['Waiting on pause', 'waiting'],
      ['Waiting on limit', 'waiting-for-slot'],
      ['Running', 'working'],
      ['AwaitingAnswer via session', 'asks-in-session'],
      ['Checking', 'checking'],
      ['CheckPassed', 'verified'],
      ['Succeeded', 'unverified'],
      ['CheckFailed', 'failed-check'],
      ['Unsigned', 'unsigned'],
      ['Denied', 'denied'],
      ['Failed', 'failed'],
      ['Stopped', 'cancelled'],
      ['UnreadableCloseout', 'unreadable'],
      ['Unknown', 'unknown'],
    ];
    for (const [reason, state] of unmoved)
      assert.equal(
        stateAt(reason, false, true),
        state,
        `${reason}: the hold stops the answers to a gate; a step not started is drawn as any step not started (grey blocks read as almost done), and what is in flight, a session asking through its harness, or a verdict keeps its state`,
      );
    assert.equal(stepState(plain('failed', 'Unknown'), false, true), 'unreadable', 'an unreadable step, held or not');
    assert.equal(stateAt('Waiting on run', true, true), 'cancelled', 'a run called off is called off, held or not');
    assert.equal(stateAt('AwaitingApproval', true, true), 'awaiting-approval');
    assert.equal(satisfiesAfter('held'), false);
    assert.notEqual(stateClass.held, stateClass.waiting, 'a person stops it, not the order of the steps');
    assert.notEqual(stateClass.held, stateClass.blocked, 'it asks nobody, as a gate does');
  });
  await t.test(
    'a step not started on a held run is named as any step to come, and its hover says the hold — a step not started on a run nobody holds does not',
    () => {
      for (const [reason, on] of [
        ['Waiting on run', 'run'],
        ['Pending', null],
        ['Waiting on limit', 'limit'],
      ] as const) {
        const state = stateAt(reason, false, true);
        assert.equal(state, stateAt(reason), `${reason}: drawn as the same step on a run nobody holds`);
        assert.equal(stateWordsOf(state, on, true), HELD_TO_COME, reason);
        assert.notEqual(stateWordsOf(state, on, false), HELD_TO_COME, `${reason}, on a run nobody holds`);
      }
      assert.equal(HELD_TO_COME.rail, PERSON.waiting.rail, 'its word is the word of a step to come');
      assert.notEqual(HELD_TO_COME.meaning, PERSON.waiting.meaning, 'its hover says the hold');
      assert.equal(stateWordsOf('waiting', 'pause', true), PAUSED, 'a check the pause holds says the pause, held or not');
      assert.equal(stateWordsOf('held', null, true), PERSON.held, 'a gate held says the hold as before');
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
  'step/StepNode.tsx',
  'step/StepRail.tsx',
  'run/RunNode.tsx',
  'step/CanvasLegend.tsx',
  'step/MachineNode.tsx',
  'step/MachineEdge.tsx',
  'factory/FactoryCanvas.tsx',
  'inbox/QueueLane.tsx',
  'look/RunSteps.tsx',
];

test("the meanings of a state's colour: one thing each, read from the look's roles, never a hand-picked hue", async (t) => {
  await t.test(
    'a colour says one thing: a state that waits on a person is yours, a failure is failure and nothing else is, and no state is money',
    () => {
      assert.equal(brokenMeanings(stateDrawn).length, 0, brokenMeanings(stateDrawn).join('; '));
      const states = Object.keys(stateDrawn) as StepState[];
      for (const state of states.filter((s) => waitsOnPerson(s, false))) assert.equal(meaningOf(stateDrawn[state].hue), 'yours', state);
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
    "REFUSED: the run page's banner of a wait on other runs — waiting on runs, held — drawn from another meaning than yours or rest",
    async () => {
      await import('./tsx.ts');
      const { createElement } = await import('react');
      const { routedWith } = await import('./markup-fixtures.ts');
      const { RunWait } = await import('../src/components/run/RunWait.tsx');
      const { LiftHold } = await import('../src/components/run/LiftHold.tsx');
      const tokensOf = (html: string): Set<string> => new Set(/<section[^>]*class="([^"]*)"/.exec(html)![1].split(/\s+/));
      const wears = (tokens: Set<string>, drawn: string) => drawn.split(' ').every((token) => tokens.has(token));
      const runs = [
        { run: 'a-1', missing: false },
        { run: 'a-2', missing: true },
      ];

      const onYou = await routedWith(
        createElement(RunWait, {
          label: 'Waiting on runs',
          wait: { runs, word: 'waiting on a-1, a-2 (missing)', advice: 'start it again', waitingOnYou: true },
        }),
      );
      assert.match(onYou, /data-on-you="true"/);
      assert.equal(wears(tokensOf(onYou), container.yours), true, 'a wait only a person ends reads yours');
      assert.match(onYou, /<a [^>]*href="\/runs\/a-1"[^>]*>a-1<\/a>/, 'a run the store has is linked to its page');
      assert.doesNotMatch(onYou, /href="\/runs\/a-2"/, 'a missing run is named, not linked');
      assert.match(onYou, /<span[^>]*>a-2<\/span>/, 'and still named');

      const resting = await routedWith(
        createElement(RunWait, {
          label: 'Waiting on runs',
          wait: { runs: runs.slice(0, 1), word: 'waiting on a-1', advice: 'it starts once a-1 lands', waitingOnYou: false },
        }),
      );
      const tokens = tokensOf(resting);
      assert.equal(wears(tokens, container.grey), true, 'a wait that ends by itself is at rest, grey');
      for (const hue of ['money', 'failure', 'alive', 'yours'] as const) {
        assert.equal(wears(tokens, container[hue]), false, `a resting wait draws no ${hue}`);
      }

      const held = await routedWith(
        createElement(
          RunWait,
          {
            label: 'Held',
            wait: { runs: runs.slice(0, 1), word: 'held until a-1 lands', advice: 'lift it with hold --off', waitingOnYou: false },
          },
          createElement(LiftHold, { id: 'r-1' }),
        ),
      );
      assert.match(held, /<section aria-label="Held"/);
      assert.match(held, /<section[^>]*>[\s\S]*data-lift[\s\S]*<\/section>/, 'a hold carries its Lift inside the banner');
      assert.doesNotMatch(resting, /data-lift/, 'a wait carries no Lift');
    },
  );
});
