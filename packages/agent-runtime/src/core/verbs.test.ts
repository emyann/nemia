/**
 * A person's verbs, as the lifecycle declares them (`VERBS`), against what their refusals and the journal do. Over every journal shape
 * of the lifecycle's corpus and a few of this file's own, `verbBreaches` holds each verb to its data: its guard holds exactly in the
 * states it is taken from; its refusal lets it journal only there, and in each of them at least once; the entry it journals makes the
 * next pass read the state the data names; and it has a writer whose entry is the kind the data names. Planted fixtures make it refuse.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, lifecycleOf, VERB_GUARDS, type Event, type State } from './domain.ts';
import { STATES, VERBS, type LifecycleState, type Verb } from './lifecycle.ts';
import { answerRefusalOf, closeRefusalOf, stopRefusalOf } from './engine/filing.ts';
import { at, ended, filed, JOURNALS, S, signed, spawned, starting, TASK } from '../../test/lifecycle-corpus.ts';

/** How a verb is written: its refusal, off the record, and the entry it journals when it is not refused. */
type Writer = { refusal: (taskId: string, state: State | undefined) => string | undefined; entry: Event };

type Guards = Record<string, (state: State) => boolean>;

const WRITES: Record<string, Writer> = {
  requestStop: { refusal: stopRefusalOf, entry: { kind: 'stop-requested', at: at(9 * S) } },
  answer: { refusal: (id, state) => answerRefusalOf(id, state, 'go on'), entry: { kind: 'input', at: at(9 * S), text: 'go on' } },
  close: { refusal: closeRefusalOf, entry: { kind: 'closed', at: at(9 * S) } },
};

/**
 * The corpus's journals, and the ones it lacks: a task settled each other way, and a held one signed without a session or asked
 * to stop.
 */
const OWN: Record<string, Event[]> = {
  'settled failed': [filed(), starting(1), spawned(1), ended(1, 'failed'), { kind: 'settled', at: at(3 * S), outcome: 'failed' }],
  'settled stopped': [filed(), { kind: 'stop-requested', at: at(0) }, { kind: 'settled', at: at(S), outcome: 'stopped' }],
  'held open, signed, no session recorded': [filed({ holdOpen: true }), starting(1), spawned(1), ended(1, 'succeeded')],
  'held open, signed, stop asked': [
    filed({ holdOpen: true }),
    starting(1),
    spawned(1),
    signed(1),
    { kind: 'stop-requested', at: at(3 * S) },
  ],
};
const ALL = { ...JOURNALS, ...OWN };

const inOrder = (states: Iterable<LifecycleState>) => STATES.filter((s) => new Set(states).has(s)).join(', ');

/** What one verb breaks over the journals, once its writer and guard are known to exist. */
const breachesOf = (v: Verb, guard: (state: State) => boolean, writer: Writer, journals: Record<string, Event[]>): string[] => {
  const out: string[] = [];
  const outside = new Set<LifecycleState>();
  const accepted = new Set<LifecycleState>();
  const reads = new Set<LifecycleState>();
  const holds = new Map<LifecycleState, boolean>();
  for (const events of Object.values(journals)) {
    const state = fold(TASK, events);
    const now = lifecycleOf(state);
    const listed = v.from.includes(now);
    if (guard(state) !== listed) holds.set(now, listed);
    if (writer.refusal(TASK, state) !== undefined) continue;
    if (!listed) {
      outside.add(now);
      continue;
    }
    accepted.add(now);
    const next = lifecycleOf(fold(TASK, [...events, writer.entry]));
    if (next !== v.to) reads.add(next);
  }
  for (const s of STATES.filter((x) => holds.has(x))) {
    const listed = holds.get(s);
    out.push(
      `${v.verb}'s guard \`${v.guard}\` ${listed ? 'refuses' : 'holds'} in ${s}, which its data ${listed ? 'lists' : 'does not list'}`,
    );
  }
  if (outside.size) out.push(`${v.verb} journals in ${inOrder(outside)}, which it is not taken from`);
  if (reads.size) out.push(`${v.verb} journalled: the next pass reads ${inOrder(reads)}, not ${v.to}`);
  const never = v.from.filter((s) => !accepted.has(s));
  if (never.length) out.push(`${v.verb} is never accepted in ${inOrder(never)}, which its data lists`);
  return out;
};

/**
 * Where a person's verbs and their data disagree, over the journals given: each breach a sentence naming the verb, the state and what
 * the data says of it. None, at shipped defaults.
 */
const verbBreaches = (
  verbs: readonly Verb[],
  guards: Guards,
  writes: Record<string, Writer>,
  journals: Record<string, Event[]>,
): string[] =>
  verbs.flatMap((v) => {
    const writer = writes[v.verb];
    if (!writer) return [`${v.verb} has no writer: nothing journals it`];
    if (writer.entry.kind !== v.entry) return [`${v.verb} journals \`${writer.entry.kind}\`, not the \`${v.entry}\` its data names`];
    const guard = guards[v.guard];
    if (!guard) return [`${v.verb}'s guard \`${v.guard}\` has no predicate`];
    return breachesOf(v, guard, writer, journals);
  });

const copy = (): Verb[] => VERBS.map((v) => ({ ...v, from: [...v.from] }));
const planted = (verb: string, change: Partial<Verb>): Verb[] => copy().map((v) => (v.verb === verb ? { ...v, ...change } : v));

test('at shipped defaults, every verb is taken exactly from the states its data lists, under its guard, and leads where its data says', () => {
  assert.deepEqual(verbBreaches(VERBS, VERB_GUARDS, WRITES, ALL), []);
  const read = new Set(Object.values(ALL).map((events) => lifecycleOf(fold(TASK, events))));
  assert.deepEqual(
    STATES.filter((s) => !read.has(s)),
    [],
    'every state is read by some journal',
  );
});

/** A row of the table: its name and the planted fixture it holds the checker to. */
type Row = { name: string; run: () => void };

const REFUSED: Row[] = [
  {
    name: 'REFUSED: a state the data lists and the guard refuses is said, and that the verb is never taken there',
    run: () => {
      const from = [...VERBS.find((v) => v.verb === 'requestStop')!.from, 'completed' as const];
      assert.deepEqual(verbBreaches(planted('requestStop', { from }), VERB_GUARDS, WRITES, ALL), [
        "requestStop's guard `stoppable` refuses in completed, which its data lists",
        'requestStop is never accepted in completed, which its data lists',
      ]);
    },
  },
  {
    name: 'REFUSED: a verb whose data names another state than the one its entry makes the next pass read',
    run: () => {
      assert.deepEqual(verbBreaches(planted('close', { to: 'submitted' }), VERB_GUARDS, WRITES, ALL), [
        'close journalled: the next pass reads ending, not submitted',
      ]);
    },
  },
  {
    name: 'REFUSED: a refusal that lets a verb journal where it is not taken from',
    run: () => {
      const writes = { ...WRITES, requestStop: { ...WRITES.requestStop, refusal: () => undefined } };
      assert.deepEqual(verbBreaches(VERBS, VERB_GUARDS, writes, ALL), [
        'requestStop journals in stopping, completed, failed, canceled, which it is not taken from',
      ]);
    },
  },
  {
    name: 'REFUSED: a guard that holds in a state its data does not list',
    run: () => {
      const breaches = verbBreaches(VERBS, { ...VERB_GUARDS, stoppable: () => true }, WRITES, ALL);
      assert.deepEqual(breaches, [
        "requestStop's guard `stoppable` holds in stopping, which its data does not list",
        "requestStop's guard `stoppable` holds in completed, which its data does not list",
        "requestStop's guard `stoppable` holds in failed, which its data does not list",
        "requestStop's guard `stoppable` holds in canceled, which its data does not list",
      ]);
    },
  },
  {
    name: 'REFUSED: a verb in the data with no writer, a writer whose entry is another kind, and a guard with no predicate',
    run: () => {
      const extra: Verb = { verb: 'reopen', entry: 'input', by: 'person', from: ['completed'], to: 'submitted', guard: 'awaitsWord' };
      assert.deepEqual(verbBreaches([...copy(), extra], VERB_GUARDS, WRITES, ALL), ['reopen has no writer: nothing journals it']);
      const writes = { ...WRITES, close: { ...WRITES.close, entry: { kind: 'input', at: at(9 * S), text: 'go on' } as Event } };
      assert.deepEqual(verbBreaches(VERBS, VERB_GUARDS, writes, ALL), ['close journals `input`, not the `closed` its data names']);
      assert.deepEqual(verbBreaches(planted('answer', { guard: 'waits' }), VERB_GUARDS, WRITES, ALL), [
        "answer's guard `waits` has no predicate",
      ]);
    },
  },
];

test('REFUSED: verbBreaches says each way a verb and its data can disagree, and nothing else', async (t) => {
  for (const row of REFUSED) await t.test(row.name, row.run);
});
