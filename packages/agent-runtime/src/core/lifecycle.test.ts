/**
 * The lifecycle is a statechart, and `decide` moves a task only along its edges.
 *
 * The corpus below is every journal shape `decide.test.ts` walks — filed, queued, admitted, starting, spawned, ended each way,
 * held open and answered or closed, asked to stop — under every sighting a harness can give, before and after the grace
 * window and the deadline. Each case is read the way a pass reads it: the state off the journal (`lifecycleOf`), the event
 * off the journal and the sighting (`observe`), and the machine's move. Every move must be an edge; applied to the journal,
 * it must land where `lifecycleOf` then says; and every edge of the machine must be taken by some case, so the table holds
 * no edge the runtime cannot reach. An event with no edge is refused, at shipped defaults, and the refusal is `decide`'s answer.
 *
 * The tick's memo (`core/engine/memo.ts`) skips a settled task until the feed names it, and folds it again when the feed does. That is
 * sound only if a settled task stays settled whatever is appended to it, and decides nothing whatever the pass sees — an attempt
 * left open, a session live or blocked, a clock past its deadline and every grace window.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decide,
  fold,
  lifecycleOf,
  nameFor,
  observe,
  settledQuiet,
  spawnRefused,
  type Action,
  type Event,
  type Sighting,
} from './domain.ts';
import {
  diagram,
  edgesOf,
  FINAL,
  lifecycleGraph,
  machineWithout,
  STATES,
  statesOf,
  transition,
  VERBS,
  withoutEdge,
  type LifecycleEvent,
  type LifecycleState,
  type Verb,
} from './lifecycle.ts';
import { at, corpusOf, ended, filed, JOURNALS, S, spawned, starting, T0, TASK, type Case } from '../../test/lifecycle-corpus.ts';

/**
 * What a harness can say of the name, keyed by the name of the record's last attempt: every one of A2A's states a sighting
 * speaks, the three ways `working` reads and an end with a statement and without.
 */
const SIGHTINGS: Record<string, Omit<Sighting, 'sessionId'> | undefined> = {
  unseen: undefined,
  submitted: { state: 'submitted' },
  working: { state: 'working', busy: true },
  'working, quiet': { state: 'working', quietMs: 90_000, nativeId: 'native-q' },
  'working, quiet, stated': { state: 'working', quietMs: 90_000, closeout: { payload: { outcome: 'done' }, at: 0 } },
  'input-required': { state: 'input-required', waitingFor: 'permission prompt' },
  'auth-required': { state: 'auth-required', waitingFor: 'authentication' },
  completed: { state: 'completed', nativeId: 'native-d', closeout: { payload: { outcome: 'done' }, at: 0 } },
  'completed, no statement': { state: 'completed' },
  failed: { state: 'failed', exitCode: 1 },
  rejected: { state: 'rejected' },
  canceled: { state: 'canceled' },
  'input-required, idle, held': { state: 'input-required', busy: false, held: true },
  'completed, held': { state: 'completed', busy: false, held: true },
  'working, quiet, held': { state: 'working', quietMs: 90_000, nativeId: 'native-q', held: true },
  'input-required, not held': { state: 'input-required', busy: false, held: false, nativeId: 'native-r' },
};

/** The corpus under every sighting a harness can give, and one more: a pass that could not read the harness; at a time more, late. */
const corpus = (): Case[] => corpusOf(SIGHTINGS, { unread: true, late: true });

/** What the engine journals for an action, and nothing for one that writes nothing (`step` in `engine.ts`). */
const journalled = (action: Action, ms: number): Event[] => {
  switch (action.do) {
    case 'start':
      return [{ kind: 'starting', at: at(ms), attempt: action.attempt, resumeFrom: action.resumeFrom, nudge: action.nudge }];
    case 'spawn':
      return [{ kind: 'spawned', at: at(ms), attempt: action.attempt }];
    case 'record-end':
      return [
        {
          kind: 'ended',
          at: at(ms),
          attempt: action.attempt,
          sessionId: action.sessionId,
          observed: action.observed,
          reason: action.reason,
          nativeId: action.nativeId,
          closeout: action.closeout,
          ...(action.stated !== undefined ? { stated: action.stated } : {}),
        },
      ];
    case 'settle':
      return [{ kind: 'settled', at: at(ms), outcome: action.outcome, note: action.note }];
    case 'stop':
    case 'nothing':
      return [];
  }
};

/** A row of a table: its name and its claim. */
type Row = { name: string; run: () => void };

const edgeKey = (from: string, event: string, to: string) => `${from} --${event}--> ${to}`;

test('every move of the corpus is an edge of the machine, and lands where the journal it writes then says', () => {
  const edges = new Set(edgesOf().map((e) => edgeKey(e.from, e.event, e.to)));
  const taken = new Set<string>();
  let cases = 0;
  for (const c of corpus()) {
    const state = fold(TASK, c.events);
    if (settledQuiet(state)) continue;
    cases++;
    const from = lifecycleOf(state);
    const event = observe(state, c.observed, c.now);
    const moved = transition(from, event);
    assert.ok(!('refused' in moved), `${c.name}: ${from} refused ${event.type}`);
    if ('refused' in moved) continue;
    const key = edgeKey(from, event.type, moved.to);
    assert.ok(edges.has(key), `${c.name}: ${key} is not an edge`);
    taken.add(key);
    assert.deepEqual(decide(state, c.observed, c.now), moved.action, `${c.name}: decide is the move`);
    const after = fold(TASK, [...c.events, ...journalled(moved.action, c.now.at.getTime() - T0.getTime())]);
    assert.equal(lifecycleOf(after), moved.to, `${c.name}: ${key} by ${moved.action.do}, and the journal then reads ${lifecycleOf(after)}`);
  }
  assert.ok(cases > 1000, `the corpus is the product it says (${cases} cases)`);
  const intent = fold(TASK, JOURNALS['intent, no spawn']);
  const end = spawnRefused(intent, 1, 'no such model');
  assert.deepEqual(
    end,
    {
      do: 'record-end',
      attempt: 1,
      sessionId: '(never started)',
      observed: 'failed',
      reason: 'unstartable',
      error: 'no such model',
    },
    "the spawn call's one event: an unstartable end",
  );
  assert.equal(lifecycleOf(fold(TASK, [...JOURNALS['intent, no spawn'], ...journalled(end, 2 * S)])), 'ending');
  taken.add(edgeKey('starting', 'SPAWN_REFUSED', 'ending'));
  assert.deepEqual(
    [...edges].filter((e) => !taken.has(e)),
    [],
    'every edge is taken by some case: the table holds no edge the runtime cannot reach',
  );
});

test('ADOPTION after a crash: an intent with no spawn and a session under its name is followed, not spawned again, and its end recorded', () => {
  const events = JOURNALS['intent, no spawn'];
  const state = fold(TASK, events);
  const live = new Map([[nameFor(TASK, 1), { sessionId: 'adopted', state: 'working' as const }]]);
  const now = { at: new Date(T0.getTime() + 60 * S), graceMs: 30_000 };
  assert.equal(lifecycleOf(state), 'starting');
  assert.deepEqual(
    transition('starting', observe(state, live, now)),
    { to: 'starting', action: { do: 'nothing', why: 'running (working)' } },
    'adopted: nothing to do, and no spawn',
  );
  const done = new Map([[nameFor(TASK, 1), { sessionId: 'adopted', state: 'completed' as const, nativeId: 'n-1' }]]);
  const moved = transition('starting', observe(state, done, now));
  assert.ok(!('refused' in moved));
  assert.deepEqual('action' in moved && moved.action, {
    do: 'record-end',
    attempt: 1,
    sessionId: 'adopted',
    observed: 'done',
    reason: 'harness',
    nativeId: 'n-1',
    closeout: undefined,
  });
  assert.equal(lifecycleOf(state), 'starting', 'the journal is the state: reading it again reads the same, restart or not');
});

/** An event with no edge: what the machine answers, and what `decide` does with it. */
const REFUSED_ROWS: Row[] = [
  {
    name: 'REFUSED: an event with no edge in the state it meets is refused, at shipped defaults, and nothing is done; a final state refuses every event',
    run: () => {
      const sighting: Sighting = { sessionId: 's', state: 'working' };
      const seen = { attempt: 1, sighting, asked: false, holds: false };
      const cases: Array<[LifecycleState, LifecycleEvent]> = [
        ['submitted', { type: 'UNSPAWNED', attempt: 1, name: 'n' }],
        ['submitted', { type: 'SESSION_LIVE', ...seen }],
        ['starting', { type: 'LOST', attempt: 1 }],
        ['starting', { type: 'READY', attempt: 2 }],
        ['working', { type: 'SPAWN_REFUSED', attempt: 1, error: 'e' }],
        ['working', { type: 'NOTHING_OPEN' }],
        ['input-required', { type: 'SESSION_LIVE', ...seen }],
        ['input-required', { type: 'READY', attempt: 2 }],
        ['stopping', { type: 'DEADLINE_PASSED', attempt: 1, live: true, sighting }],
        ['stopping', { type: 'READY', attempt: 1 }],
        ['ending', { type: 'READY', attempt: 2 }],
        ['ending', { type: 'SESSION_ENDED', ...seen }],
      ];
      for (const [from, event] of cases)
        assert.deepEqual(transition(from, event), { refused: { state: from, event: event.type } }, `${from} on ${event.type}`);
      for (const from of FINAL)
        for (const e of edgesOf()) assert.ok('refused' in transition(from, { type: e.event } as LifecycleEvent), `${from} took ${e.event}`);
    },
  },
  {
    name: 'REFUSED: decide answers a missing edge with nothing, and says which — it never guesses a move',
    run: () => {
      const state = fold(TASK, JOURNALS.spawned);
      const observed = new Map([[nameFor(TASK, 1), { sessionId: 's', state: 'completed' as const }]]);
      const now = { at: new Date(T0.getTime() + 5 * S), graceMs: 30_000 };
      assert.equal(decide(state, observed, now).do, 'record-end', 'the shipped lifecycle ends it');
      assert.deepEqual(decide(state, observed, now, withoutEdge('working', 'SESSION_ENDED')), {
        do: 'nothing',
        why: 'refused: no edge from working on SESSION_ENDED',
        refused: { state: 'working', event: 'SESSION_ENDED' },
      });
      assert.deepEqual(spawnRefused(fold(TASK, JOURNALS['intent, no spawn']), 1, 'e', withoutEdge('starting', 'SPAWN_REFUSED')), {
        do: 'nothing',
        why: 'refused: no edge from starting on SPAWN_REFUSED',
        refused: { state: 'starting', event: 'SPAWN_REFUSED' },
      });
      assert.equal(decide(state, observed, now).do, 'record-end', 'the pruned machine is a copy: the shipped one keeps the edge');
    },
  },
];

test('REFUSED: an event the machine has no edge for is refused, never guessed — by the machine, and by `decide`', async (t) => {
  for (const row of REFUSED_ROWS) await t.test(row.name, row.run);
});

/**
 * Every entry a writer can append to a settled task: the verbs' (`say`, `file` again under its id), a pass's (`measured`, an end), a
 * hand's, and a stop an older runtime journalled, or one `requestStop` read the task unsettled for and a pass settled before it wrote.
 */
const LATER: Record<string, Event[]> = {
  nothing: [],
  'asked to stop': [{ kind: 'stop-requested', at: at(4 * S) }],
  said: [{ kind: 'said', at: at(4 * S), attempt: 1, text: 'hi' }],
  answered: [{ kind: 'input', at: at(4 * S), text: 'go on' }],
  closed: [{ kind: 'closed', at: at(4 * S) }],
  admitted: [{ kind: 'admitted', at: at(4 * S) }],
  measured: [{ kind: 'measured', at: at(4 * S), attempt: 1, usage: { costUsd: 1 } }],
  'an end written late': [ended(1, 'done', 'harness', 'native-late')],
  'filed again under its id': [filed({ holdOpen: true })],
  'a second attempt': [starting(2, 4 * S), spawned(2, 5 * S)],
  'settled again': [{ kind: 'settled', at: at(4 * S), outcome: 'succeeded' }],
};

/** A settled task, on any pass and after any entry: what the memo rests on. */
const SETTLED_ROWS: Row[] = [
  {
    name: 'a settled task is decided nothing before anything is observed of it, on any pass — its state is final and would refuse every event',
    run: () => {
      for (const outcome of ['succeeded', 'failed', 'stopped'] as const) {
        const state = fold(TASK, [...JOURNALS.spawned, { kind: 'settled', at: at(3 * S), outcome }]);
        assert.equal(settledQuiet(state), true);
        const observed = new Map([[nameFor(TASK, 1), { sessionId: 's', state: 'working' as const }]]);
        const now = { at: new Date(T0.getTime() + 99 * S), graceMs: 30_000 };
        assert.deepEqual(decide(state, observed, now), { do: 'nothing', why: `settled: ${outcome}` }, 'no refusal on it');
        assert.ok(
          FINAL.has(lifecycleOf(state)),
          'what the short-circuit saves: its state is final, and asked, the machine would refuse it',
        );
        assert.deepEqual(transition(lifecycleOf(state), observe(state, observed, now)), {
          refused: { state: lifecycleOf(state), event: 'SETTLED' },
        });
      }
      assert.equal(settledQuiet(fold(TASK, JOURNALS.spawned)), false);
    },
  },
  {
    name: "what the tick's memo rests on: a settled task decides nothing in every journal shape, under every sighting and clock, whatever is appended after",
    run: () => {
      let cases = 0;
      for (const c of corpus())
        for (const outcome of ['succeeded', 'failed', 'stopped'] as const)
          for (const [l, later] of Object.entries(LATER)) {
            const state = fold(TASK, [...c.events, { kind: 'settled', at: at(3 * S), outcome }, ...later]);
            assert.equal(settledQuiet(state), true, `${c.name} · settled ${outcome} · ${l}: still settled`);
            assert.deepEqual(
              decide(state, c.observed, c.now),
              { do: 'nothing', why: `settled: ${state.settled}` },
              `${c.name} · settled ${outcome} · ${l}`,
            );
            cases++;
          }
      assert.ok(cases > 10_000, `every shape, every outcome, every later entry (${cases} cases)`);
      const open = fold(TASK, [
        filed({ deadlineSeconds: 1 }),
        starting(1),
        spawned(1),
        { kind: 'settled', at: at(3 * S), outcome: 'stopped' },
      ]);
      assert.equal(open.attempts.at(-1)!.ended, null, 'the attempt is open');
      assert.equal(
        decide(open, new Map([[nameFor(TASK, 1), { sessionId: 's', state: 'working' }]]), { at: new Date(T0.getTime() + 1e9), graceMs: 0 })
          .do,
        'nothing',
        'settled over an attempt still open, with its session live and the deadline long past',
      );
    },
  },
];

test('a settled task is final: it decides nothing, before anything is observed and whatever is appended after', async (t) => {
  for (const row of SETTLED_ROWS) await t.test(row.name, row.run);
});

/** The states no move reaches from `submitted`, over the machine's edges and the verbs given. */
const unreached = (verbs: readonly Verb[]): LifecycleState[] => {
  const moves = [...edgesOf(), ...verbs.flatMap((v) => v.from.map((from) => ({ from, to: v.to })))];
  const reached = new Set<string>(['submitted']);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of moves)
      if (reached.has(e.from) && !reached.has(e.to)) {
        reached.add(e.to);
        grew = true;
      }
  }
  return STATES.filter((s) => !reached.has(s));
};

/** The machine read as data: what it holds, and what is drawn from it. */
const MACHINE_ROWS: Row[] = [
  {
    name: 'the machine: its states are the ones named, each edge names one action, every state but a final one leaves or holds by an edge, every state is reached, and a guarded edge falls through to one with no guard, so a guard never leaves an event unanswered',
    run: () => {
      assert.deepEqual(statesOf(), [...STATES]);
      assert.deepEqual([...FINAL].sort(), ['canceled', 'completed', 'failed']);
      const actions = new Set(['nothing', 'start', 'spawn', 'record-end', 'stop', 'settle']);
      for (const e of edgesOf()) assert.ok(actions.has(e.action), `${e.from} on ${e.event} does ${e.action}, not one action`);
      for (const s of STATES)
        if (!FINAL.has(s))
          assert.ok(
            edgesOf().some((e) => e.from === s),
            `${s} has no edge`,
          );
      assert.deepEqual(unreached(VERBS), [], "reached from where a task begins, by the pass's edges and a person's verbs");
      assert.deepEqual(
        unreached(VERBS.filter((v) => v.verb !== 'requestStop')),
        ['stopping'],
        'a person asking it to stop is the one way into `stopping`: no pass moves there',
      );
      const last = new Map(edgesOf().map((e) => [`${e.from} ${e.event}`, e]));
      for (const [k, e] of last) assert.equal(e.guard, undefined, `${k}: its last edge is guarded`);
    },
  },
  {
    name: 'the diagram is drawn from the machine: an edge taken away takes exactly its one line with it',
    run: () => {
      const line = '  working --> ending: LOST / record-end';
      const whole = diagram().split('\n');
      assert.ok(whole.includes(line), 'the edge is drawn');
      assert.deepEqual(
        diagram(machineWithout('working', 'LOST')).split('\n'),
        whole.filter((l) => l !== line),
      );
    },
  },
  {
    name: "the diagram draws a person's verbs from their data: one line per state each is taken from, and a verb taken away takes exactly its lines",
    run: () => {
      const whole = diagram().split('\n');
      const close = '  input_required --> ending: close [awaitsWord] (by person)';
      assert.ok(whole.includes(close), 'a verb is drawn with its guard and who writes it');
      assert.ok(whole.includes('  working --> stopping: requestStop [stoppable] (by person)'));
      assert.equal(whole.filter((l) => l.includes(': requestStop ')).length, 5, 'one line per state the stop is taken from');
      assert.deepEqual(
        diagram(
          undefined,
          VERBS.filter((v) => v.verb !== 'close'),
        ).split('\n'),
        whole.filter((l) => l !== close),
      );
    },
  },
  {
    name: 'the graph a board draws is the machine read as plain data, and a fresh copy on every call',
    run: () => {
      const graph = lifecycleGraph();
      assert.deepEqual(graph, { initial: 'submitted', states: statesOf(), final: [...FINAL], edges: edgesOf(), verbs: VERBS });
      assert.deepEqual(graph.states, [...STATES]);
      assert.deepEqual(JSON.parse(JSON.stringify(graph)), graph, 'plain data: a JSON round trip changes nothing');
      graph.edges.pop();
      graph.states.pop();
      assert.deepEqual(lifecycleGraph().edges, edgesOf(), 'a caller that changes its copy changes no other');
      const verbs: unknown = JSON.parse(JSON.stringify(VERBS));
      lifecycleGraph().verbs[0].from.pop();
      assert.deepEqual(lifecycleGraph().verbs, verbs, 'nor the verbs, down to the states each is taken from');
      assert.ok(
        lifecycleGraph().edges.some((e) => e.from === 'ending' && e.event === 'CLOSED' && e.guard === 'lastDone' && e.to === 'completed'),
        'a guarded edge keeps its guard',
      );
    },
  },
];

test('the machine as data: its states, edges and reach, the diagram drawn from it, and the graph a board draws', async (t) => {
  for (const row of MACHINE_ROWS) await t.test(row.name, row.run);
});

test('UNREAD: a pass that could not read the harness does nothing to an attempt in flight, past its grace too, and never reads it lost', () => {
  const unread = new Set([nameFor(TASK, 1)]);
  const state = fold(TASK, JOURNALS.spawned);
  for (const ms of [2 * S, 45 * S, 3600 * S]) {
    const now = { at: new Date(T0.getTime() + ms), graceMs: 30_000, unread };
    assert.deepEqual(observe(state, new Map(), now), { type: 'UNREAD', attempt: 1, overdue: false });
    assert.deepEqual(decide(state, new Map(), now), { do: 'nothing', why: 'its harness could not be read this pass' });
  }
  assert.deepEqual(
    observe(state, new Map(), { at: new Date(T0.getTime() + 45 * S), graceMs: 30_000 }),
    { type: 'LOST', attempt: 1 },
    'read, and not there: the grace still tells a late registration from a session gone',
  );
  assert.deepEqual(
    observe(state, new Map(), { at: new Date(T0.getTime() + 45 * S), graceMs: 30_000, unread: new Set([nameFor('t-2', 1)]) }),
    { type: 'LOST', attempt: 1 },
    "another task's name unread says nothing of this one",
  );
  const timed = fold(TASK, [filed({ deadlineSeconds: 40 }), starting(1), spawned(1)]);
  const past = { at: new Date(T0.getTime() + 45 * S), graceMs: 30_000, unread };
  assert.deepEqual(
    decide(timed, new Map(), past),
    {
      do: 'record-end',
      attempt: 1,
      sessionId: '(never seen)',
      observed: 'failed',
      reason: 'deadline',
      nativeId: undefined,
      closeout: undefined,
    },
    'past its deadline, the deadline ends it, as it does a session nobody sees',
  );
});

test("UNREAD in `stopping`: a person's stop waits for a read before the deadline, and ends the attempt once it has passed, so the stop is bounded", () => {
  const unread = new Set([nameFor(TASK, 1)]);
  const stop = { kind: 'stop-requested', at: at(2 * S) } as const;
  const untimed = fold(TASK, [filed(), starting(1), spawned(1), stop]);
  const timed = fold(TASK, [filed({ deadlineSeconds: 40 }), starting(1), spawned(1), stop]);
  const read = (ms: number) => ({ at: new Date(T0.getTime() + ms), graceMs: 30_000, unread });
  assert.equal(lifecycleOf(timed), 'stopping');
  assert.deepEqual(
    decide(untimed, new Map(), read(3600 * S)),
    { do: 'nothing', why: 'its harness could not be read this pass' },
    'no deadline: it waits for a read',
  );
  assert.deepEqual(
    decide(timed, new Map(), read(30 * S)),
    { do: 'nothing', why: 'its harness could not be read this pass' },
    'before the deadline: it waits',
  );
  const cut = {
    do: 'record-end',
    attempt: 1,
    sessionId: '(never seen)',
    observed: 'stopped',
    reason: 'operator',
    nativeId: undefined,
    closeout: undefined,
  };
  assert.deepEqual(decide(timed, new Map(), read(45 * S)), cut, 'past the deadline: cut as a lost one is');
  assert.deepEqual(transition('stopping', { type: 'UNREAD', attempt: 1, overdue: true }), { to: 'stopping', action: cut });
  assert.deepEqual(transition('stopping', { type: 'UNREAD', attempt: 1, overdue: false }), {
    to: 'stopping',
    action: { do: 'nothing', why: 'its harness could not be read this pass' },
  });
  const after = fold(TASK, [filed({ deadlineSeconds: 40 }), starting(1), spawned(1), stop, ...journalled(cut as Action, 45 * S)]);
  assert.deepEqual(
    decide(after, new Map(), read(46 * S)),
    { do: 'settle', outcome: 'stopped', note: 'operator' },
    'what the cut leads to: nothing open, and the stop settles the task',
  );
});

test('UNREAD before the missing spawn: an intent with no spawn on the record whose harness could not be read is neither spawned again nor cut by a stop, until a read or its deadline', () => {
  const unread = new Set([nameFor(TASK, 1)]);
  const read = (ms: number) => ({ at: new Date(T0.getTime() + ms), graceMs: 30_000, unread });
  const nothing = { do: 'nothing', why: 'its harness could not be read this pass' };
  const intent = fold(TASK, [filed({ deadlineSeconds: 40 }), starting(1)]);
  assert.equal(lifecycleOf(intent), 'starting');
  assert.deepEqual(
    observe(intent, new Map(), read(2 * S)),
    { type: 'UNREAD', attempt: 1, overdue: false },
    'after a crash between the spawn and its entry a session may run under the name, which an unread harness cannot rule out',
  );
  assert.deepEqual(decide(intent, new Map(), read(2 * S)), nothing, 'not spawned a second time');
  assert.deepEqual(
    decide(intent, new Map(), { at: new Date(T0.getTime() + 2 * S), graceMs: 30_000 }),
    { do: 'spawn', attempt: 1, name: nameFor(TASK, 1) },
    'read, and not there: spawned',
  );
  assert.deepEqual(decide(intent, new Map(), read(45 * S)).do, 'record-end', 'the deadline, read first, still ends it');
  const stopped = fold(TASK, [filed({ deadlineSeconds: 40 }), starting(1), { kind: 'stop-requested', at: at(2 * S) }]);
  assert.deepEqual(decide(stopped, new Map(), read(30 * S)), nothing, 'not cut on a read that failed');
  assert.deepEqual(
    decide(stopped, new Map(), read(45 * S)),
    {
      do: 'record-end',
      attempt: 1,
      sessionId: '(never seen)',
      observed: 'stopped',
      reason: 'operator',
      nativeId: undefined,
      closeout: undefined,
    },
    "a person's stop on it waits for a read as a spawned one's does, and is cut once the deadline has passed",
  );
});
