/**
 * The Run door's memory stand-in: a fresh layer of `RunDoor` per call, its runs and a person's files beside them held in maps, built by
 * `runDoorOver` as the files layer is, so the writes are checked the one way on both. A test gives it its program — `Effect.provide(
 * program, runDoorMemory())` — where it needs a run to exist and nothing of the disk; the walks of `test/run-walks.ts` hold it to what
 * the files answer. A run's paths (`where`, `forget`) are under `MEMORY_ROOT`, named as the files name them under `WF_ROOT`.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`). What it holds no
 * file for, it answers as a store with none: no files directory, and no pause.
 */
import path from 'node:path';
import { Layer } from 'effect';
import { Missing } from '../refusal/refusal.ts';
import { mergeSpent } from '../merge/merge.ts';
import { spentRoundAsks } from '../round/round.ts';
import { spentAsks, type RetryAsk } from '../retry/index.ts';
import { spentAcceptances, spentApprovals, type RoundAsk } from '../status/status.ts';
import type { AskKey, AskOf, Hold, PersonRequest, Pruned, Run } from '../record/record.ts';
import { RunDoor, cardStartedTwice, runDoorOver, runTaken, type RunsLayer } from './runs.store.ts';

/** Where the stand-in says a run's files are: the root its paths are named under, as the files' are under `WF_ROOT`. */
export const MEMORY_ROOT = '/memory';

/** The ask's key: the step and number its file is named by (`askWhere`). */
const keyOf = (person: PersonRequest): AskKey =>
  person.of === 'base'
    ? { of: 'base', step: person.ask.merge.target, n: person.ask.merge.try }
    : { of: person.of, step: person.ask.step, n: 'round' in person.ask ? person.ask.round : person.ask.try };

/** An ask's name in the stand-in, by which of its verb it is: no file is written, so none has to keep its former name. */
const nameOf = ({ of, step, n }: AskKey): string => `${of}-${step}-${n}`;
const runsAt = (...parts: string[]): string => path.posix.join(MEMORY_ROOT, 'runs', ...parts);

/** The keys a record holds that are a person's, composed on read and never written into it (`rewriteRun`). */
const COMPOSED = ['approvals', 'acceptances', 'pruned', 'hold', 'pause'] as const;
const recordOf = (run: Run): Run => {
  const kept: Record<string, unknown> = { ...run };
  for (const key of COMPOSED) delete kept[key];
  return structuredClone(kept) as Run;
};

/** One ask held, by its key's name (`<of>-<step>-<n>`), and whether the tick consumed it. */
type Held = { person: PersonRequest; done: boolean };

/** What a stand-in holds: each run's record, and a person's files beside it, by run id; and each run's stamp, a count of its changes. */
type State = {
  records: Map<string, Run>;
  cancelled: Map<string, string>;
  pruned: Map<string, Pruned>;
  holds: Map<string, Hold>;
  refresh: Map<string, { at: string }>;
  asks: Map<string, Map<string, Held>>;
  forgetting: Map<string, string[]>;
  versions: Map<string, number>;
};

const stateOf = (): State => ({
  records: new Map(),
  cancelled: new Map(),
  pruned: new Map(),
  holds: new Map(),
  refresh: new Map(),
  asks: new Map(),
  forgetting: new Map(),
  versions: new Map(),
});

/** A change to what the stand-in holds of `id`: its stamp moves. */
const touch = (st: State, id: string): void => void st.versions.set(id, (st.versions.get(id) ?? 0) + 1);
const asksOf = (st: State, id: string): Map<string, Held> => st.asks.get(id) ?? new Map();
const waiting = (st: State, id: string, of: AskOf) =>
  [...asksOf(st, id).values()].filter((h) => !h.done && h.person.of === of).map((h) => structuredClone(h.person.ask));

/** The run `id`, its person's files composed onto it as `readRun` composes them. */
function readOf(st: State, id: string): Run {
  const record = st.records.get(id);
  if (!record) throw new Missing({ message: `no such run: ${id}  (try 'nemia ls')` });
  const [approvals, acceptances] = [waiting(st, id, 'gate'), waiting(st, id, 'loop')];
  const [pruned, hold] = [st.pruned.get(id), st.holds.get(id)];
  return {
    ...structuredClone(record),
    ...(st.cancelled.has(id) ? { cancelledAt: st.cancelled.get(id) } : {}),
    ...(pruned !== undefined ? { pruned: structuredClone(pruned) } : {}),
    ...(hold !== undefined ? { hold: structuredClone(hold) } : {}),
    ...(approvals.length ? { approvals } : {}),
    ...(acceptances.length ? { acceptances } : {}),
  } as Run;
}

/** Remove what the stand-in holds of `id`, answering each name removed as the files name it under `WF_ROOT`. */
function forgetOf(st: State, id: string): string[] {
  const removed: string[] = [];
  const named: Array<[Map<string, unknown>, string]> = [
    [st.records, `${id}.json`],
    [st.cancelled, `${id}.cancelled`],
    [st.pruned, `${id}.pruned`],
    [st.holds, `${id}.hold`],
    [st.refresh, `${id}.refresh`],
    [st.asks, `${id}.asks/`],
  ];
  for (const [held, name] of named) if (held.delete(id)) removed.push(`runs/${name}`);
  st.versions.delete(id);
  return removed;
}

function runsOf(st: State): RunsLayer['runs'] {
  const read = (id: string) => readOf(st, id);
  const ids = (): string[] => [...st.records.keys()].sort();
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
    stamps: () => new Map([...st.versions].filter(([id]) => st.records.has(id)).map(([id, v]) => [id, String(v)])),
    exists: (id) => st.records.has(id),
    taken: (id) => [st.records, st.cancelled, st.pruned, st.holds, st.refresh, st.asks].some((m) => m.has(id)),
    calledOff: (id) => st.cancelled.has(id) || st.pruned.has(id) || st.holds.has(id),
    cancel: (id) => {
      const at = st.cancelled.get(id);
      if (at !== undefined) return at;
      const now = new Date().toISOString();
      st.cancelled.set(id, now);
      touch(st, id);
      return now;
    },
    forget: (id) => forgetOf(st, id),
    ids,
    filesAt: () => undefined,
    dropFiles: () => null,
    prune: (id, marker) => {
      if (marker) st.pruned.set(id, structuredClone(marker));
      else st.pruned.delete(id);
      touch(st, id);
    },
    pruned: (id) => {
      const marker = st.pruned.get(id);
      return marker === undefined ? undefined : structuredClone(marker);
    },
  };
}

/** Set aside each ask of `of` named by `spent` (its step and number): consumed, never edited, as `doneWith` moves a file. */
function spend(st: State, id: string, of: AskOf, spent: ReadonlyArray<{ step: string; n: number }>): void {
  for (const { step, n } of spent) {
    const held = asksOf(st, id).get(nameOf({ of, step, n }));
    if (held && !held.done) {
      held.done = true;
      touch(st, id);
    }
  }
}

function asksGroup(st: State): RunsLayer['asks'] {
  return {
    read: (id) => ({
      asks: waiting(st, id, 'try') as RetryAsk[],
      rounds: [...(waiting(st, id, 'round') as RoundAsk[]), ...(waiting(st, id, 'base') as RoundAsk[])],
      notes: [],
    }),
    answers: (id) =>
      [...asksOf(st, id).values()]
        .filter((h) => h.person.of === 'try' && h.person.ask.message !== undefined)
        .map((h) => structuredClone(h.person.ask as RetryAsk)),
    consume: (run, retries, rounds, voided = []) => {
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
        spentApprovals(run).map((a) => ({ step: a.step, n: a.try })),
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
    },
    write: (id, person) => {
      const name = nameOf(keyOf(person));
      const where = runsAt(`${id}.asks`, name);
      const held = st.asks.get(id) ?? new Map<string, Held>();
      if (held.has(name)) return { written: false, where, stray: null };
      held.set(name, { person: structuredClone(person), done: false });
      st.asks.set(id, held);
      touch(st, id);
      return { written: true, where };
    },
    where: (id, key) => runsAt(`${id}.asks`, nameOf(key)),
  };
}

function holdsOf(st: State): RunsLayer['holds'] {
  return {
    lift: (id, at) => {
      if (st.holds.get(id)?.at !== at) return false;
      st.holds.delete(id);
      touch(st, id);
      return true;
    },
    put: (id, until, { why, by }) => {
      if (st.holds.has(id)) return null;
      const hold: Hold = { at: new Date().toISOString(), until: [...until], ...(why ? { why } : {}), ...(by ? { by } : {}) };
      st.holds.set(id, hold);
      touch(st, id);
      return structuredClone(hold);
    },
    stands: (id) => st.holds.has(id),
  };
}

function refreshOf(st: State): RunsLayer['refresh'] {
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
  };
}

function forgettingOf(st: State): RunsLayer['forgetting'] {
  return {
    write: (id, taskIds) => void st.forgetting.set(id, [...taskIds]),
    read: (id) => {
      const taskIds = st.forgetting.get(id);
      return taskIds === undefined ? undefined : [...taskIds];
    },
    list: () => [...st.forgetting.keys()].sort(),
    lift: (id) => void st.forgetting.delete(id),
    where: (id) => path.posix.join(MEMORY_ROOT, 'forgetting', `${id}.json`),
  };
}

/** A fresh stand-in's plain methods: the `RunsLayer` the door is over. */
function memoryRuns(): RunsLayer {
  const st = stateOf();
  return { runs: runsOf(st), asks: asksGroup(st), holds: holdsOf(st), refresh: refreshOf(st), forgetting: forgettingOf(st) };
}

/** A fresh Run door in memory: no run, and nothing kept between two calls (a test makes one per test). */
export const runDoorMemory = (): Layer.Layer<never> => Layer.succeed(RunDoor)(runDoorOver(memoryRuns()));
