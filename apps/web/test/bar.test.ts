/**
 * The side bar (src/lib/bar.ts), as tables: its address read and written, what a press shows or closes, what Open visits, its width and
 * the room it takes, and how it closes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAR_DEFAULT,
  BAR_GAP,
  BAR_MIN,
  barMost,
  barOf,
  barOpens,
  barOver,
  barSearch,
  barValue,
  barWidth,
  escapeDoes,
  focusGoesBack,
  inspects,
  nextBar,
  parseWidth,
  machineState,
  specStep,
  type Bar,
  wholeMachine,
} from '../src/lib/bar.ts';

const HIRING: Bar = { kind: 'start', factory: 'hiring' };
const OTHER: Bar = { kind: 'start', factory: 'other' };
const RUN: Bar = { kind: 'run', run: 'abc' };
const REVIEW: Bar = { kind: 'step', run: 'abc', step: 'review' };
const SHIP: Bar = { kind: 'step', run: 'abc', step: 'ship' };
const FACTORY: Bar = { kind: 'factory', factory: 'hiring' };
const SPEC: Bar = { kind: 'spec', from: 'repo', workflow: 'dev', step: 'review' };
const STATE: Bar = { kind: 'state', machine: 'lifecycle', state: 'input-required' };

test("barOf, barValue and barSearch: a bar's address, read and written", async (t) => {
  await t.test('the address opens a bar only for a known kind with a name: anything else opens none', () => {
    for (const value of [undefined, '', 'start:', 'starts', 'run', 'factory', 'nope:x', ':hiring', 42, ['start:hiring'], null])
      assert.equal(barOf(value), undefined, `${JSON.stringify(value)} opens no bar`);
    assert.deepEqual(barOf('start:hiring'), HIRING);
    assert.deepEqual(barOf('start:a:b'), { kind: 'start', factory: 'a:b' });
  });
  await t.test(
    'the bare word start opens the start of a run in no factory yet, which asks for one, and no other kind is a bare word',
    () => {
      const ASKING: Bar = { kind: 'start', factory: null };
      assert.deepEqual(barOf('start'), ASKING);
      assert.equal(barValue(ASKING), 'start');
      assert.deepEqual(barOf(barValue(ASKING)), ASKING);
      for (const value of ['starts', 'run', 'factory', 'step', 'spec', 'state', 'start:', 'Start', ' start'])
        assert.equal(barOf(value), undefined, `${value} opens no bar`);
      assert.equal(inspects(ASKING), false, 'a press beside it closes it not');
      assert.equal(barOpens(ASKING), null, 'it has no page');
      assert.deepEqual(nextBar(ASKING, HIRING), HIRING, 'the start in a factory is another bar');
      assert.equal(nextBar(ASKING, ASKING), undefined);
    },
  );
  await t.test("the bare word gauges opens the machine's gauges, and gauges with a name opens none", () => {
    const GAUGES: Bar = { kind: 'gauges' };
    assert.deepEqual(barOf('gauges'), GAUGES);
    assert.equal(barValue(GAUGES), 'gauges');
    assert.deepEqual(barOf(barValue(GAUGES)), GAUGES);
    for (const value of ['gauges:', 'gauges:x', 'Gauges', 'gauge']) assert.equal(barOf(value), undefined, `${value} opens no bar`);
    assert.equal(barOpens(GAUGES), null, 'it has no page');
    assert.equal(nextBar(GAUGES, GAUGES), undefined, 'pressing the bottom bar again closes it');
    assert.deepEqual(nextBar(GAUGES, HIRING), HIRING);
  });
  await t.test('the bare word waiting opens the runs waiting on you, and waiting with a name opens none', () => {
    const WAITING: Bar = { kind: 'waiting' };
    assert.deepEqual(barOf('waiting'), WAITING);
    assert.equal(barValue(WAITING), 'waiting');
    assert.deepEqual(barOf(barValue(WAITING)), WAITING);
    for (const value of ['waiting:', 'waiting:x', 'Waiting', 'waitings', 'wait'])
      assert.equal(barOf(value), undefined, `${value} opens no bar`);
    assert.equal(barOpens(WAITING), null, 'it has no page: each row opens its run');
    assert.equal(inspects(WAITING), true, 'a press on the empty canvas closes it');
    assert.equal(nextBar(WAITING, WAITING), undefined, 'pressing the bell again closes it');
    assert.deepEqual(nextBar(WAITING, { kind: 'gauges' }), { kind: 'gauges' });
  });
  await t.test("a run's address names the run, and a step's names its run up to the first slash and the step after it", () => {
    assert.deepEqual(barOf('run:abc'), RUN);
    assert.deepEqual(barOf('step:abc/review'), REVIEW);
    assert.deepEqual(barOf('step:abc/a/b'), { kind: 'step', run: 'abc', step: 'a/b' }, 'a run id holds no slash; a step keeps its own');
    assert.deepEqual(barOf('step:abc/x:y'), { kind: 'step', run: 'abc', step: 'x:y' });
    for (const value of ['run:', 'run:a/b', 'step:abc', 'step:/x', 'step:abc/', 'step:', 'inspect:abc'])
      assert.equal(barOf(value), undefined, `${value} opens no bar`);
  });
  await t.test("a factory's address names the factory whole, a slash or a colon in its name kept, and none without a name", () => {
    assert.deepEqual(barOf('factory:hiring'), FACTORY);
    assert.deepEqual(barOf('factory:a/b'), { kind: 'factory', factory: 'a/b' });
    assert.deepEqual(barOf('factory:a:b'), { kind: 'factory', factory: 'a:b' });
    assert.equal(barOf('factory:'), undefined, 'factory: opens no bar');
  });
  await t.test(
    "a workflow's step's address names where the workflow is read from, the workflow up to the next slash and the step after it",
    () => {
      assert.deepEqual(barOf('spec:repo/dev/review'), SPEC);
      assert.deepEqual(barOf('spec:yours/mine/plan'), { kind: 'spec', from: 'yours', workflow: 'mine', step: 'plan' });
      assert.deepEqual(barOf('spec:yours/w/a/b:c'), { kind: 'spec', from: 'yours', workflow: 'w', step: 'a/b:c' }, 'a step keeps its own');
      for (const value of [
        'spec:other/dev/review',
        'spec:repo/dev',
        'spec:repo//review',
        'spec:repo/dev/',
        'spec:/dev/review',
        'spec:repo',
        'spec:',
      ])
        assert.equal(barOf(value), undefined, `${value} opens no bar`);
    },
  );
  await t.test(
    "a machine's state's address names the machine up to the first slash and the state after it, and none without either",
    () => {
      assert.deepEqual(barOf('state:lifecycle/input-required'), STATE);
      assert.deepEqual(barOf('state:m/a/b:c'), { kind: 'state', machine: 'm', state: 'a/b:c' }, 'a state keeps its own');
      for (const value of ['state:lifecycle', 'state:/x', 'state:lifecycle/', 'state:'])
        assert.equal(barOf(value), undefined, `${value} opens no bar`);
    },
  );
  await t.test('a bar written to the address reads back as the same bar', () => {
    for (const value of [
      'start:hiring',
      'start:a:b',
      'factory:hiring',
      'factory:a/b',
      'factory:a:b',
      'run:abc',
      'step:abc/review',
      'step:abc/a/b',
      'step:abc/x:y',
      'spec:repo/dev/review',
      'spec:yours/w/a/b:c',
      'state:lifecycle/input-required',
      'state:m/a/b:c',
    ])
      assert.equal(barValue(barOf(value)!), value);
    assert.deepEqual(barOf(barValue(OTHER)), OTHER);
  });
  await t.test("the root's search keeps a well-formed bar and nothing else, so the routes' own keys are theirs", () => {
    assert.deepEqual(barSearch({ bar: 'start:x', factory: 'y', step: 'z' }), { bar: 'start:x' });
    assert.deepEqual(barSearch({ bar: 'bogus' }), {});
    assert.deepEqual(barSearch({ bar: 7 }), {});
    assert.deepEqual(barSearch({}), {});
    assert.deepEqual(barSearch({ bar: 'step:r/s', step: 's' }), { bar: 'step:r/s' });
  });
});

test('barOpens: what Open visits', async (t) => {
  await t.test('Open visits nothing for a state of a machine, which has no page', () => {
    assert.equal(barOpens(STATE), null);
  });
  await t.test(
    "REFUSED: Open visits a workflow's step's page in the place the page under the bar is read in, never the step of another folder",
    () => {
      const page = { to: '/workflows/$from/$workflow/$step', params: { from: 'repo', workflow: 'dev', step: 'review' } };
      assert.deepEqual(barOpens(SPEC, { factory: 'pipao', repo: '/r' }), { ...page, search: { factory: 'pipao', repo: '/r' } });
      assert.deepEqual(barOpens(SPEC), { ...page, search: {} }, 'with no place, none rides along');
      assert.deepEqual(
        barOpens(RUN, { factory: 'pipao' }),
        { to: '/runs/$runId', params: { runId: 'abc' } },
        "a run's page reads no place",
      );
    },
  );
  await t.test("Open visits a factory's floor for a factory", () => {
    assert.deepEqual(barOpens(FACTORY), { to: '/factories/$factory', params: { factory: 'hiring' } });
  });
  await t.test("Open visits a run's page for a run, the step's session for a step, and nothing for the start of a run", () => {
    assert.deepEqual(barOpens(RUN), { to: '/runs/$runId', params: { runId: 'abc' } });
    assert.deepEqual(barOpens(REVIEW), { to: '/runs/$runId/steps/$step', params: { runId: 'abc', step: 'review' } });
    assert.equal(barOpens(HIRING), null);
  });
});

test('nextBar, specStep, machineState and inspects: what a press shows or closes', async (t) => {
  await t.test('pressing what the bar shows closes it, and pressing anything else shows that', () => {
    assert.equal(nextBar(HIRING, { ...HIRING }), undefined);
    assert.deepEqual(nextBar(HIRING, OTHER), OTHER, 'the same kind for another factory switches, not closes');
    assert.deepEqual(nextBar(undefined, HIRING), HIRING);
  });
  await t.test('pressing the step the bar shows closes it, and another step, the run or another kind switches it', () => {
    assert.equal(nextBar(REVIEW, { ...REVIEW }), undefined);
    assert.equal(nextBar(RUN, { ...RUN }), undefined);
    assert.deepEqual(nextBar(REVIEW, SHIP), SHIP, 'another step of the same run');
    assert.deepEqual(nextBar(REVIEW, { ...REVIEW, run: 'xyz' }), { ...REVIEW, run: 'xyz' }, 'the same step of another run');
    assert.deepEqual(nextBar(RUN, REVIEW), REVIEW);
    assert.deepEqual(nextBar(REVIEW, RUN), RUN);
    assert.deepEqual(nextBar({ kind: 'start', factory: 'abc' }, RUN), RUN, 'another kind of the same name');
  });
  await t.test('pressing the factory the bar shows closes it, and another factory or the start of a run in it switches it', () => {
    assert.equal(nextBar(FACTORY, { ...FACTORY }), undefined);
    assert.deepEqual(nextBar(FACTORY, { kind: 'factory', factory: 'other' }), { kind: 'factory', factory: 'other' });
    assert.deepEqual(nextBar(FACTORY, HIRING), HIRING, 'the start of a run in the same factory is another bar');
    assert.deepEqual(nextBar(HIRING, FACTORY), FACTORY);
  });
  await t.test(
    "pressing the workflow's step the bar shows closes it, and another step, the same step of another workflow or a run's step switches it",
    () => {
      assert.equal(nextBar(SPEC, { ...SPEC }), undefined);
      const implement: Bar = { ...SPEC, step: 'implement' };
      assert.deepEqual(nextBar(SPEC, implement), implement, 'another step of the same workflow');
      const elsewhere: Bar = { ...SPEC, workflow: 'other' };
      assert.deepEqual(nextBar(SPEC, elsewhere), elsewhere, 'the same step of another workflow');
      const mine: Bar = { ...SPEC, from: 'yours' };
      assert.deepEqual(nextBar(SPEC, mine), mine, 'the same workflow and step, read from yours');
      const ran: Bar = { kind: 'step', run: 'dev', step: 'review' };
      assert.deepEqual(nextBar(SPEC, ran), ran, "a run's step of the same name");
    },
  );
  await t.test(
    "a workflow's canvas and its Build read the step the bar shows of that workflow alone: not another's, nor yours of the same name",
    () => {
      assert.equal(specStep(SPEC, 'repo', 'dev'), 'review');
      assert.equal(specStep(SPEC, 'yours', 'dev'), null, 'yours, of the same name');
      assert.equal(specStep(SPEC, 'repo', 'other'), null, 'another workflow');
      assert.equal(specStep({ kind: 'step', run: 'dev', step: 'review' }, 'repo', 'dev'), null, "a run's step");
      assert.equal(specStep(undefined, 'repo', 'dev'), null, 'no bar');
    },
  );
  await t.test(
    "pressing the machine's state the bar shows closes it, and another state, the same state of another machine or another kind switches it",
    () => {
      assert.equal(nextBar(STATE, { ...STATE }), undefined);
      const working: Bar = { ...STATE, state: 'working' };
      assert.deepEqual(nextBar(STATE, working), working, 'another state of the same machine');
      const elsewhere: Bar = { ...STATE, machine: 'other' };
      assert.deepEqual(nextBar(STATE, elsewhere), elsewhere, 'the same state of another machine');
      assert.deepEqual(nextBar(STATE, SPEC), SPEC, "a workflow's step");
    },
  );
  await t.test("a machine's canvas reads the state the bar shows of that machine alone: not another's, nor another kind", () => {
    assert.equal(machineState(STATE, 'lifecycle'), 'input-required');
    assert.equal(machineState(STATE, 'other'), null, 'another machine');
    assert.equal(machineState({ kind: 'step', run: 'lifecycle', step: 'input-required' }, 'lifecycle'), null, "a run's step");
    assert.equal(machineState(SPEC, 'lifecycle'), null, "a workflow's step");
    assert.equal(machineState(undefined, 'lifecycle'), null, 'no bar');
  });
  await t.test(
    'a press on the empty canvas closes only what a canvas inspects: never the start of a run, whose brief it would lose',
    () => {
      assert.equal(inspects(RUN), true);
      assert.equal(inspects(REVIEW), true);
      assert.equal(inspects(FACTORY), true);
      assert.equal(inspects(SPEC), true);
      assert.equal(inspects(STATE), true);
      assert.equal(inspects(HIRING), false);
      assert.equal(inspects(undefined), false);
    },
  );
});

test('escapeDoes and focusGoesBack: how the bar closes, and where the focus goes', async (t) => {
  await t.test('Escape closes the bar, unless something else took it, it ends a composition, or it leaves a field that holds text', () => {
    const key = { defaultPrevented: false, isComposing: false, fieldText: null };
    assert.equal(escapeDoes(key), 'close');
    assert.equal(escapeDoes({ ...key, fieldText: '' }), 'close', 'an empty field loses nothing');
    assert.equal(escapeDoes({ ...key, fieldText: 'a brief' }), 'leave');
    assert.equal(escapeDoes({ ...key, defaultPrevented: true }), 'ignore', 'a menu or a modal closed on it');
    assert.equal(escapeDoes({ ...key, isComposing: true, fieldText: 'a' }), 'ignore');
  });
  await t.test(
    "REFUSED: the bar's close gives the focus back only while it still holds it, never once the focus left it for the page",
    () => {
      assert.equal(focusGoesBack({ left: false, now: 'in' }), true, 'Escape or Close pressed in the bar');
      assert.equal(focusGoesBack({ left: false, now: 'nothing' }), true, 'what held the focus inside the bar went with it');
      assert.equal(focusGoesBack({ left: true, now: 'nothing' }), false, 'a press on the empty drawing took the focus off');
      assert.equal(focusGoesBack({ left: false, now: 'out' }), false, 'something on the page took the focus');
      assert.equal(focusGoesBack({ left: true, now: 'out' }), false);
    },
  );
});

test("parseWidth, barWidth, barMost, barOver and wholeMachine: the bar's width and the room it takes", async (t) => {
  await t.test('a stored width reads as a number of pixels, else the default', () => {
    for (const raw of [null, '', 'abc', '-5', '0', 'NaN', '1e9x', 'Infinity'])
      assert.equal(parseWidth(raw), BAR_DEFAULT, `${JSON.stringify(raw)} reads as the default`);
    assert.equal(parseWidth('600'), 600);
    assert.equal(parseWidth('640.5'), 640.5);
  });
  await t.test(
    'the width stays between the least and the window less a strip of page, and a window too narrow for both is the whole width',
    () => {
      assert.equal(barWidth(100, 1280), BAR_MIN);
      assert.equal(barWidth(5000, 1280), 1280 - BAR_GAP);
      assert.equal(barWidth(600, 1280), 600);
      assert.equal(barWidth(600, BAR_MIN + BAR_GAP - 1), BAR_MIN + BAR_GAP - 1);
    },
  );
  await t.test('the widest the bar is drawn is the window less a strip of page, or the whole of a window too narrow for both', () => {
    assert.equal(barMost(1280), 1280 - BAR_GAP);
    assert.equal(barMost(BAR_MIN + BAR_GAP), BAR_MIN);
    assert.equal(barMost(390), 390);
  });
  await t.test(
    'the bar covers the part of a frame right of its left edge, and none with no bar, past the frame, or on a narrow screen',
    () => {
      assert.equal(barOver(1280, null, false), 0);
      assert.equal(barOver(1280, 704, true), 0);
      assert.equal(barOver(900, 1000, false), 0);
      assert.equal(barOver(1280, 1280 - BAR_DEFAULT, false), BAR_DEFAULT);
    },
  );
  await t.test(
    "REFUSED: the floor gives its queue lane's room to a bar of the whole machine alone: its gauges, the runs waiting on you",
    () => {
      assert.equal(wholeMachine({ kind: 'gauges' }), true);
      assert.equal(wholeMachine({ kind: 'waiting' }), true);
      const pages: Bar[] = [
        { kind: 'factory', factory: 'nemia' },
        { kind: 'run', run: 'r' },
        { kind: 'step', run: 'r', step: 'plan' },
        { kind: 'spec', from: 'repo', workflow: 'dev', step: 'plan' },
        { kind: 'start', factory: null },
        { kind: 'state', machine: 'lifecycle', state: 'running' },
      ];
      assert.deepEqual(
        pages.map((bar) => [bar.kind, wholeMachine(bar)]),
        pages.map((bar) => [bar.kind, false]),
      );
      assert.equal(wholeMachine(undefined), false, 'nor no bar at all');
    },
  );
});
