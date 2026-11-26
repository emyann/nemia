/**
 * The Run door's memory stand-in: a fresh layer of `RunDoor` per call, its runs and a person's files beside them held in maps, built by
 * `runDoorOver` as the files layer is, so the writes are checked the one way on both. A test gives it its program — `Effect.provide(
 * program, runDoorMemory())` — where it needs a run to exist and nothing of the disk; the walks of `test/run-walks.ts` hold it to what
 * the keyspace answers. A run's keys (`where`, `forget`) are named as the keyspace names them (`run-keys.ts`), its markers' keys under
 * `/registry/runmarks/<id>/`, and a `nemia rm` marker's `/registry/forgetting/<id>`.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`). What it holds no
 * file for, it answers as a store with none: no files directory, and no pause.
 */
import { Layer } from 'effect';
import { Missing } from '../refusal/refusal.ts';
import { mergeSpent } from '../merge/merge.ts';
import { spentRoundAsks } from '../round/round.ts';
import { spentAsks, type RetryAsk } from '../retry/index.ts';
import { spentAcceptances, spentApprovals, workStands, type RoundAsk } from '../status/status.ts';
import type {
  AskKey,
  AskOf,
  AskWritten,
  ConditionWritten,
  Assignee,
  Hold,
  PersonRequest,
  Pruned,
  Run,
  SaidBefore,
  TakenBack,
  Unassigned,
  Unheld,
  Released,
} from '../record/record.ts';
import { routeAsk, unrouted, withRoutes, type PersonRoute } from '../route/index.ts';
import { conditionAsk, unconditioned, withConditions } from '../condition/condition.ts';
import { askDoneKey, askKeyOf, askName, claimKey, forgettingKey, runKey, runMarksPrefix, saidKey } from './run-keys.ts';
import type { Labels } from '../labels/labels.ts';
import type { Actor } from 'objects';
import { runMarkMove, runMarkOf } from '../run-marks/run-marks.ts';
import { RunDoor, cardStartedTwice, runDoorOver, runTaken, type RunsLayer } from './runs.store.ts';

/** Where the stand-in says a run's files are: the root its paths are named under, as the files' are under `WF_ROOT`. */
export const MEMORY_ROOT = '/memory';

/** The ask's key: the step and number its name is made of (`askKey`, `run-keys.ts`). */
const keyOf = (person: PersonRequest) =>
  (person.of === 'base'
    ? { of: 'base', step: person.ask.merge.target, n: person.ask.merge.try }
    : { of: person.of, step: person.ask.step, n: 'round' in person.ask ? person.ask.round : person.ask.try }) satisfies AskKey;

/** An ask's name in the stand-in, by which of its verb it is, as the keyspace names it (`askName`). */
const nameOf = (key: AskKey) => askName(key);

/** The keys a record holds that are a person's, composed on read and never written into it (`rewriteRun`). */
const COMPOSED = [
  'approvals',
  'acceptances',
  'pruned',
  'hold',
  'unheld',
  'released',
  'assignee',
  'unassigned',
  'labels',
  'saidBefore',
  'pause',
] as const;
const recordOf = (run: Run) => {
  const kept: Record<string, unknown> = { ...unconditioned(unrouted(run)) };
  for (const key of COMPOSED) delete kept[key];
  return structuredClone(kept) as Run;
};

/** One ask held, by its key's name (`<of>-<step>-<n>`), whether it was set aside, and that a person took it back. */
type Held = { person: PersonRequest; done: boolean; takenBack?: TakenBack };

/** What a stand-in holds: each run's record, and a person's files beside it, by run id; and each run's stamp, a count of its changes. */
type State = {
  records: Map<string, Run>;
  cancelled: Map<string, string>;
  cancellers: Map<string, Actor>;
  pruned: Map<string, Pruned>;
  holds: Map<string, Hold>;
  unheld: Map<string, Unheld>;
  released: Map<string, Released>;
  assignees: Map<string, Assignee>;
  unassigned: Map<string, Unassigned>;
  labels: Map<string, Labels>;
  said: Map<string, Array<SaidBefore & { step: string }>>;
  refresh: Map<string, { at: string }>;
  asks: Map<string, Map<string, Held>>;
  forgetting: Map<string, string[]>;
  routes: Map<string, Map<string, PersonRoute>>;
  conditions: Map<string, Map<string, ConditionWritten>>;
  versions: Map<string, number>;
};

const stateOf = () =>
  ({
    records: new Map(),
    cancelled: new Map(),
    cancellers: new Map(),
    pruned: new Map(),
    holds: new Map(),
    unheld: new Map(),
    released: new Map(),
    assignees: new Map(),
    unassigned: new Map(),
    labels: new Map(),
    said: new Map(),
    refresh: new Map(),
    asks: new Map(),
    forgetting: new Map(),
    routes: new Map(),
    conditions: new Map(),
    versions: new Map(),
  }) satisfies State;

/** The marks the stand-in holds of `id` (`runMarkOf`), which each writer of one asks the machine with, as the files' writers do. */
const marksIn = (st: State, id: string) =>
  runMarkOf({ cancelled: st.cancelled.has(id), pruned: st.pruned.has(id), held: st.holds.has(id) });

/** A change to what the stand-in holds of `id`: its stamp moves. */
const touch = (st: State, id: string) => void st.versions.set(id, (st.versions.get(id) ?? 0) + 1);
const asksOf = (st: State, id: string) => (st.asks.get(id) ?? new Map()) satisfies Map<string, Held> as Map<string, Held>;
const waiting = (st: State, id: string, of: AskOf) =>
  [...asksOf(st, id).values()].filter((h) => !h.done && h.person.of === of).map((h) => structuredClone(h.person.ask));

/** The approvals of run `id` not set aside, as the gate's ask files hold them: each, whether its work still stands or not. */
const approvalsHeld = (st: State, id: string) =>
  [...asksOf(st, id).values()].flatMap((h) => (!h.done && h.person.of === 'gate' ? [structuredClone(h.person.ask)] : []));

/** The run `id`, its person's files composed onto it as `runRecord` composes them. */
function readOf(st: State, id: string) {
  const record = st.records.get(id);
  if (!record) throw new Missing({ message: `no such run: ${id}  (try 'nemia ls')` });
  const approvals = approvalsHeld(st, id).filter((a) => workStands(record, a));
  const acceptances = waiting(st, id, 'loop');
  const [pruned, hold, unheld, labels] = [st.pruned.get(id), st.holds.get(id), st.unheld.get(id), st.labels.get(id)];
  return {
    ...withConditions(withRoutes(structuredClone(record), [...(st.routes.get(id)?.values() ?? [])]), [
      ...(st.conditions.get(id)?.values() ?? []),
    ]),
    ...(st.cancelled.has(id) ? { cancelledAt: st.cancelled.get(id) } : {}),
    ...(st.cancellers.has(id) ? { cancelledBy: structuredClone(st.cancellers.get(id)) } : {}),
    ...(pruned !== undefined ? { pruned: structuredClone(pruned) } : {}),
    ...(hold !== undefined ? { hold: structuredClone(hold) } : {}),
    ...(unheld !== undefined ? { unheld: structuredClone(unheld) } : {}),
    ...(st.released.has(id) ? { released: structuredClone(st.released.get(id)) } : {}),
    ...(st.assignees.has(id) ? { assignee: structuredClone(st.assignees.get(id)) } : {}),
    ...(st.unassigned.has(id) ? { unassigned: structuredClone(st.unassigned.get(id)) } : {}),
    ...(labels !== undefined ? { labels: { ...labels } } : {}),
    ...saidBeforeOf(st, id),
    ...(approvals.length ? { approvals } : {}),
    ...(acceptances.length ? { acceptances } : {}),
  } as Run;
}

/**
 * Remove what the stand-in holds of `id`, answering each key and name removed as the keyspace and the files name them: the record, its
 * claim of a card (which the stand-in holds as the record itself, a run created only while no other from its card stands) and its asks,
 * then each marker under the run's marks key.
 */
function forgetOf(st: State, id: string) {
  const card = st.records.get(id)?.from?.inbox;
  const removed: string[] = [];
  if (st.records.delete(id)) {
    removed.push(runKey(id));
    if (card !== undefined) removed.push(claimKey(card));
  }
  for (const [name, held] of asksOf(st, id)) removed.push(held.done ? askDoneKey(id, name) : askKeyOf(id, name));
  for (const name of st.routes.get(id)?.keys() ?? []) removed.push(askKeyOf(id, name));
  for (const name of st.conditions.get(id)?.keys() ?? []) removed.push(askKeyOf(id, name));
  st.asks.delete(id);
  st.routes.delete(id);
  st.conditions.delete(id);
  const named: Array<[Map<string, unknown>, string]> = [
    [st.cancelled, 'cancelled'],
    [st.pruned, 'pruned'],
    [st.holds, 'hold'],
    [st.unheld, 'unheld'],
    [st.released, 'released'],
    [st.assignees, 'assignee'],
    [st.unassigned, 'unassigned'],
    [st.refresh, 'refresh'],
    [st.labels, 'labels'],
  ];
  const marks: string[] = [];
  for (const [held, name] of named) if (held.delete(id)) marks.push(`${runMarksPrefix(id)}${name}`);
  for (let n = 1; n <= (st.said.get(id)?.length ?? 0); n++) marks.push(saidKey(id, n));
  st.said.delete(id);
  removed.push(...marks.sort());
  st.cancellers.delete(id);
  st.versions.delete(id);
  return removed;
}

function runsOf(st: State) {
  const read = (id: string) => readOf(st, id);
  const ids = () => [...st.records.keys()].sort();
  return {
    read,
    list: (_said, kept) => ids().map((id) => kept?.(id) ?? read(id)),
    find: (id) => (st.records.has(id) ? read(id) : undefined),
    create: (run) => {
      if (st.records.has(run.id)) throw runTaken(run.id);
      const card = run.from?.inbox;
      const other = card === undefined ? undefined : [...st.records.values()].find((r) => r.from?.inbox === card);
      if (card !== undefined && other) throw cardStartedTwice(card, other.id);
      st.records.set(run.id, recordOf(run));
      touch(st, run.id);
    },
    rewrite: (run) => {
      if (!st.records.has(run.id)) return false;
      st.records.set(run.id, recordOf(run));
      touch(st, run.id);
      return true;
    },
    settle: (run, spent) => {
      if (!st.records.has(run.id)) return false;
      if (spent.write) {
        st.records.set(run.id, recordOf(run));
        touch(st, run.id);
      }
      consumeOf(st, run, spent.asks, spent.rounds, spent.voided ?? []);
      return true;
    },
    stamps: () => new Map([...st.versions].filter(([id]) => st.records.has(id)).map(([id, v]) => [id, String(v)])),
    exists: (id) => st.records.has(id),
    taken: (id) =>
      [st.records, st.cancelled, st.pruned, st.holds, st.labels, st.refresh, st.asks, st.said, st.routes, st.conditions].some((m) =>
        m.has(id),
      ),
    calledOff: (id) => st.cancelled.has(id) || st.pruned.has(id) || st.holds.has(id),
    cancel: (id, actor) => {
      const at = st.cancelled.get(id);
      if (at !== undefined) return at;
      const now = new Date().toISOString();
      st.cancelled.set(id, now);
      if (actor) st.cancellers.set(id, structuredClone(actor));
      touch(st, id);
      return now;
    },
    forget: (id) => forgetOf(st, id),
    ids,
    filesAt: () => undefined,
    dropFiles: () => null,
    prune: (id, marker) => {
      if (runMarkMove(marksIn(st, id), marker ? 'prune' : 'unprune').kind === 'refused') return;
      if (marker) st.pruned.set(id, structuredClone(marker));
      else st.pruned.delete(id);
      touch(st, id);
    },
    pruned: (id) => {
      const marker = st.pruned.get(id);
      return marker === undefined ? undefined : structuredClone(marker);
    },
  } satisfies RunsLayer['runs'];
}

/**
 * The name an ask set aside is kept under once another is written at its name, as a key under `done/` is never written over
 * (`setAside`, `records.store.ts`): its name with `.2`, `.3`, … after it, the first not held.
 */
const keptAside = (held: ReadonlyMap<string, Held>, name: string) => {
  let n = 2;
  while (held.has(`${name}.${n}`)) n++;
  return `${name}.${n}`;
};

/** Set aside each ask of `of` named by `spent` (its step and number): consumed, never edited, as `setAside` moves a key. */
function spend(st: State, id: string, of: AskOf, spent: ReadonlyArray<{ step: string; n: number }>) {
  for (const { step, n } of spent) {
    const held = asksOf(st, id).get(nameOf({ of, step, n }));
    if (held && !held.done) {
      held.done = true;
      touch(st, id);
    }
  }
}

/** Set aside each ask, approval and acceptance the run's record answers, and each ask of `voided`, as the keyspace's settle does. */
function consumeOf(st: State, run: Run, retries: readonly RetryAsk[], rounds: readonly RoundAsk[], voided: readonly RetryAsk[]) {
  const tries = [...new Set([...spentAsks(run, retries), ...voided])];
  spend(
    st,
    run.id,
    'try',
    tries.map((a) => ({ step: a.step, n: a.try })),
  );
  const plain = rounds.filter((a) => !a.merge);
  spend(
    st,
    run.id,
    'round',
    spentRoundAsks(run, plain).map((a) => ({ step: a.step, n: a.round })),
  );
  spend(
    st,
    run.id,
    'gate',
    spentApprovals({ ...run, approvals: approvalsHeld(st, run.id) }).map((a) => ({ step: a.step, n: a.try })),
  );
  spend(
    st,
    run.id,
    'loop',
    spentAcceptances(run).map((a) => ({ step: a.step, n: a.try })),
  );
  const merges = rounds.filter((a) => a.merge && mergeSpent(run, a));
  spend(
    st,
    run.id,
    'base',
    merges.flatMap((a) => (a.merge ? [{ step: a.merge.target, n: a.merge.try }] : [])),
  );
}

function asksGroup(st: State) {
  return {
    read: (id) => ({
      asks: waiting(st, id, 'try') as RetryAsk[],
      rounds: [...(waiting(st, id, 'round') as RoundAsk[]), ...(waiting(st, id, 'base') as RoundAsk[])],
      notes: [],
    }),
    answers: (id) =>
      [...asksOf(st, id).values()]
        .filter((h) => h.person.of === 'try' && h.person.ask.message !== undefined && h.takenBack === undefined)
        .map((h) => structuredClone(h.person.ask as RetryAsk)),
    write: (id, person) => {
      const name = nameOf(keyOf(person));
      const where = askKeyOf(id, name);
      const held = st.asks.get(id) ?? new Map<string, Held>();
      const before = held.get(name);
      if (before && !before.done) return { written: false, where, stray: null } satisfies AskWritten;
      if (before) held.set(keptAside(held, name), before);
      held.set(name, { person: structuredClone(person), done: false });
      st.asks.set(id, held);
      touch(st, id);
      return { written: true, where } satisfies AskWritten;
    },
    where: (id, key) => askKeyOf(id, nameOf(key)),
    held: (id, key) => {
      const there = asksOf(st, id).get(nameOf(key));
      return there && !there.done ? 'ask' : 'none';
    },
    takeBack: (id, key, takenBack) => {
      const name = nameOf(key);
      const before = asksOf(st, id).get(name);
      if (!before || before.done) return null;
      before.done = true;
      before.takenBack = structuredClone(takenBack);
      touch(st, id);
      return { where: askDoneKey(id, name), stray: false };
    },
    route: (id, step, n, { route, at }) => {
      const name = routeAsk(step, n);
      const held = st.routes.get(id) ?? new Map<string, PersonRoute>();
      held.set(name, { step, try: n, route: route.trim(), at });
      st.routes.set(id, held);
      touch(st, id);
      return askKeyOf(id, name);
    },
    condition: (id, written) => {
      const name = conditionAsk(written.step, written.try, written.name);
      const held = st.conditions.get(id) ?? new Map<string, ConditionWritten>();
      const before = held.get(name);
      const whole = { ...written, transitionedAt: before?.status === written.status ? before.transitionedAt : written.at };
      held.set(name, whole);
      st.conditions.set(id, held);
      touch(st, id);
      return whole;
    },
  } satisfies RunsLayer['asks'];
}

function holdsOf(st: State) {
  return {
    lift: (id, at, actor) => {
      if (runMarkMove(marksIn(st, id), 'lift').kind !== 'edge') return false;
      if (st.holds.get(id)?.at !== at) return false;
      if (actor) st.unheld.set(id, { since: at, actor: structuredClone(actor) });
      st.holds.delete(id);
      touch(st, id);
      return true;
    },
    put: (id, until, { why, by, actor }) => {
      if (runMarkMove(marksIn(st, id), 'hold').kind !== 'edge') return null;
      const hold: Hold = {
        at: new Date().toISOString(),
        until: [...until],
        ...(why ? { why } : {}),
        ...(by ? { by } : {}),
        ...(actor ? { actor: structuredClone(actor) } : {}),
      };
      st.holds.set(id, hold);
      touch(st, id);
      return structuredClone(hold);
    },
    stands: (id) => st.holds.has(id),
  } satisfies RunsLayer['holds'];
}

function releasedOf(st: State) {
  return {
    put: (id, actor) => {
      if (st.released.has(id)) return null;
      const released: Released = { at: new Date().toISOString(), ...(actor ? { actor: structuredClone(actor) } : {}) };
      st.released.set(id, released);
      touch(st, id);
      return structuredClone(released);
    },
  } satisfies RunsLayer['released'];
}

function assigneesOf(st: State) {
  return {
    put: (id, { forMs, name, why, actor }) => {
      if (st.assignees.has(id)) return null;
      const assignee: Assignee = {
        at: new Date().toISOString(),
        forMs,
        ...(name ? { name } : {}),
        ...(why ? { why } : {}),
        ...(actor ? { actor: structuredClone(actor) } : {}),
      };
      st.assignees.set(id, assignee);
      touch(st, id);
      return structuredClone(assignee);
    },
    end: (id, at, how, actor) => {
      if (st.assignees.get(id)?.at !== at) return false;
      st.unassigned.set(id, { since: at, how, ...(actor ? { actor: structuredClone(actor) } : {}) });
      st.assignees.delete(id);
      touch(st, id);
      return true;
    },
    stands: (id) => st.assignees.has(id),
  } satisfies RunsLayer['assignees'];
}

/** What was said to the run's steps before each was filed, by step, in the order kept, as `saidBefore` composes it; none where none. */
function saidBeforeOf(st: State, id: string) {
  const byStep: Record<string, SaidBefore[]> = {};
  for (const { step, at, text } of st.said.get(id) ?? []) (byStep[step] ??= []).push({ at, text });
  return Object.keys(byStep).length ? { saidBefore: byStep } : {};
}

function saidOf(st: State) {
  return {
    put: (id, step, text) => {
      const kept = { at: new Date().toISOString(), text };
      st.said.set(id, [...(st.said.get(id) ?? []), { step, ...kept }]);
      touch(st, id);
      return { ...kept };
    },
  } satisfies RunsLayer['said'];
}

function labelsOf(st: State) {
  return {
    put: (id, labels) => {
      if (Object.keys(labels).length) st.labels.set(id, { ...labels });
      else if (!st.labels.delete(id)) return;
      touch(st, id);
    },
  } satisfies RunsLayer['labels'];
}

function refreshOf(st: State) {
  return {
    put: (id) => {
      if (st.refresh.has(id)) return null;
      const ask = { at: new Date().toISOString() };
      st.refresh.set(id, ask);
      touch(st, id);
      return { ...ask };
    },
    lift: (id) => {
      const was = st.refresh.delete(id);
      if (was) touch(st, id);
      return was;
    },
    stands: (id) => st.refresh.has(id),
  } satisfies RunsLayer['refresh'];
}

function forgettingOf(st: State) {
  return {
    write: (id, taskIds) => void st.forgetting.set(id, [...taskIds]),
    read: (id) => {
      const taskIds = st.forgetting.get(id);
      return taskIds === undefined ? undefined : [...taskIds];
    },
    list: () => [...st.forgetting.keys()].sort(),
    lift: (id) => void st.forgetting.delete(id),
    where: (id) => forgettingKey(id),
  } satisfies RunsLayer['forgetting'];
}

/** A fresh stand-in's plain methods: the `RunsLayer` the door is over. */
function memoryRuns() {
  const st = stateOf();
  return {
    runs: runsOf(st),
    asks: asksGroup(st),
    holds: holdsOf(st),
    released: releasedOf(st),
    assignees: assigneesOf(st),
    said: saidOf(st),
    labels: labelsOf(st),
    refresh: refreshOf(st),
    forgetting: forgettingOf(st),
  } satisfies RunsLayer;
}

/** A fresh Run door in memory: no run, and nothing kept between two calls (a test makes one per test). */
export const runDoorMemory = () => Layer.succeed(RunDoor)(runDoorOver(memoryRuns())) satisfies Layer.Layer<never>;
