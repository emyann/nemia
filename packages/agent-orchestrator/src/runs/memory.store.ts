/**
 * The Run door's memory stand-in: a fresh layer of `RunDoor` per call, its runs and a person's files beside them held in maps, built by
 * `runDoorOver` as the files layer is, so the writes are checked the one way on both. A test gives it its program — `Effect.provide(
 * program, runDoorMemory())` — where it needs a run to exist and nothing of the disk; the walks of `test/run-walks.ts` hold it to what
 * the files answer. A run's paths (`where`, `forget`) are under `MEMORY_ROOT`, named as the files name them under `WF_ROOT`.
 *
 * Reached through `agent-orchestrator/testing` alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`). What it holds no
 * file for, it answers as a store with none: no files directory, and no pause.
 */
import path from 'node:path';
import { Layer } from 'effect';
import { Conflict, Missing } from '../refusal/refusal.ts';
import { mergeSpent } from '../merge/merge.ts';
import { spentRoundAsks } from '../round/round.ts';
import { spentAsks, type RetryAsk } from '../retry/index.ts';
import { spentAcceptances, spentApprovals, type RoundAsk } from '../status/status.ts';
import type { AskKey, Hold, PersonAsk, Pruned, Run } from '../record/record.ts';
import { RunDoor, runDoorOver, type RunsLayer } from './runs.store.ts';

/** Where the stand-in says a run's files are: the root its paths are named under, as the files' are under `WF_ROOT`. */
export const MEMORY_ROOT = '/memory';

/** One ask held, by its key's name (`<kind>-<step>-<n>`), and whether the tick consumed it. */
type Held = { person: PersonAsk; done: boolean };

/** The ask's key: the step and number its file is named by (`askWhere`). */
const keyOf = (person: PersonAsk): AskKey =>
  person.kind === 'merge'
    ? { kind: 'merge', step: person.ask.merge.target, n: person.ask.merge.try }
    : { kind: person.kind, step: person.ask.step, n: 'round' in person.ask ? person.ask.round : person.ask.try };

const nameOf = ({ kind, step, n }: AskKey): string => `${kind}-${step}-${n}`;
const runsAt = (...parts: string[]): string => path.posix.join(MEMORY_ROOT, 'runs', ...parts);

/** The keys a record holds that are a person's, composed on read and never written into it (`rewriteRun`). */
const COMPOSED = ['approvals', 'acceptances', 'pruned', 'hold', 'pause'] as const;
const recordOf = (run: Run): Run => {
  const kept: Record<string, unknown> = { ...run };
  for (const key of COMPOSED) delete kept[key];
  return structuredClone(kept) as Run;
};

/** A fresh stand-in's plain methods: the `RunsLayer` the door is over. */
function memoryRuns(): RunsLayer {
  const records = new Map<string, Run>();
  const cancelled = new Map<string, string>();
  const pruned = new Map<string, Pruned>();
  const holds = new Map<string, Hold>();
  const refresh = new Map<string, { at: string }>();
  const asks = new Map<string, Map<string, Held>>();
  const forgetting = new Map<string, string[]>();
  const versions = new Map<string, number>();
  const touch = (id: string): void => void versions.set(id, (versions.get(id) ?? 0) + 1);
  const asksOf = (id: string): Map<string, Held> => asks.get(id) ?? new Map();
  const waiting = (id: string, kind: PersonAsk['kind']) =>
    [...asksOf(id).values()].filter((h) => !h.done && h.person.kind === kind).map((h) => h.person.ask);

  const read = (id: string): Run => {
    const record = records.get(id);
    if (!record) throw new Missing({ message: `no such run: ${id}  (try 'nemia ls')` });
    const [approvals, acceptances] = [waiting(id, 'approve'), waiting(id, 'accept')];
    return {
      ...structuredClone(record),
      ...(cancelled.has(id) ? { cancelledAt: cancelled.get(id) } : {}),
      ...(pruned.has(id) ? { pruned: structuredClone(pruned.get(id)!) } : {}),
      ...(holds.has(id) ? { hold: structuredClone(holds.get(id)!) } : {}),
      ...(approvals.length ? { approvals } : {}),
      ...(acceptances.length ? { acceptances } : {}),
    } as Run;
  };
  const ids = (): string[] => [...records.keys()].sort();
  const spend = (id: string, kind: PersonAsk['kind'], spent: ReadonlyArray<{ step: string; n: number }>): void => {
    for (const { step, n } of spent) {
      const held = asksOf(id).get(nameOf({ kind, step, n }));
      if (held && !held.done) {
        held.done = true;
        touch(id);
      }
    }
  };

  return {
    runs: {
      read,
      list: (_said, kept) => ids().map((id) => kept?.(id) ?? read(id)),
      find: (id) => (records.has(id) ? read(id) : undefined),
      create: (run) => {
        if (records.has(run.id))
          throw new Conflict({ message: `run ${run.id} already exists: start it under a new id, or forget the one there with nemia rm ${run.id}` });
        records.set(run.id, recordOf(run));
        touch(run.id);
      },
      rewrite: (run) => {
        if (!records.has(run.id)) return false;
        records.set(run.id, recordOf(run));
        touch(run.id);
        return true;
      },
      stamps: () => new Map([...versions].filter(([id]) => records.has(id)).map(([id, v]) => [id, String(v)])),
      exists: (id) => records.has(id),
      taken: (id) => [records, cancelled, pruned, holds, refresh, asks].some((m) => m.has(id)),
      calledOff: (id) => cancelled.has(id) || pruned.has(id) || holds.has(id),
      cancel: (id) => {
        if (!cancelled.has(id)) {
          cancelled.set(id, new Date().toISOString());
          touch(id);
        }
        return cancelled.get(id)!;
      },
      forget: (id) => {
        const removed: string[] = [];
        const drop = (held: Map<string, unknown>, name: string): void => {
          if (held.delete(id)) removed.push(`runs/${name}`);
        };
        drop(records, `${id}.json`);
        drop(cancelled, `${id}.cancelled`);
        drop(pruned, `${id}.pruned`);
        drop(holds, `${id}.hold`);
        drop(refresh, `${id}.refresh`);
        drop(asks, `${id}.asks/`);
        versions.delete(id);
        return removed;
      },
      ids,
      filesAt: () => undefined,
      dropFiles: () => null,
      prune: (id, marker) => {
        if (marker) pruned.set(id, structuredClone(marker));
        else pruned.delete(id);
        touch(id);
      },
      pruned: (id) => (pruned.has(id) ? structuredClone(pruned.get(id)!) : undefined),
    },
    asks: {
      read: (id) => {
        const rounds: RoundAsk[] = [...(waiting(id, 'round') as RoundAsk[]), ...(waiting(id, 'merge') as RoundAsk[])];
        return { asks: structuredClone(waiting(id, 'retry') as RetryAsk[]), rounds: structuredClone(rounds), notes: [] };
      },
      answers: (id) =>
        [...asksOf(id).values()]
          .filter((h) => h.person.kind === 'retry' && h.person.ask.message !== undefined)
          .map((h) => structuredClone(h.person.ask as RetryAsk)),
      consume: (run, retries, rounds, voided = []) => {
        spend(run.id, 'retry', [...new Set([...spentAsks(run, retries), ...voided])].map((a) => ({ step: a.step, n: a.try })));
        const plain = rounds.filter((a) => !a.merge);
        spend(run.id, 'round', spentRoundAsks(run, plain).map((a) => ({ step: a.step, n: a.round })));
        spend(run.id, 'approve', spentApprovals(run).map((a) => ({ step: a.step, n: a.try })));
        spend(run.id, 'accept', spentAcceptances(run).map((a) => ({ step: a.step, n: a.try })));
        spend(
          run.id,
          'merge',
          rounds.filter((a) => a.merge && mergeSpent(run, a)).map((a) => ({ step: a.merge!.target, n: a.merge!.try })),
        );
      },
      write: (id, person) => {
        const key = keyOf(person);
        const where = runsAt(`${id}.asks`, nameOf(key));
        const held = asks.get(id) ?? new Map<string, Held>();
        if (held.has(nameOf(key))) return { written: false, where, stray: null };
        held.set(nameOf(key), { person: structuredClone(person), done: false });
        asks.set(id, held);
        touch(id);
        return { written: true, where };
      },
      where: (id, key) => runsAt(`${id}.asks`, nameOf(key)),
    },
    holds: {
      lift: (id, at) => {
        if (holds.get(id)?.at !== at) return false;
        holds.delete(id);
        touch(id);
        return true;
      },
      put: (id, until, { why, by }) => {
        if (holds.has(id)) return null;
        const hold: Hold = { at: new Date().toISOString(), until: [...until], ...(why ? { why } : {}), ...(by ? { by } : {}) };
        holds.set(id, hold);
        touch(id);
        return structuredClone(hold);
      },
      stands: (id) => holds.has(id),
    },
    refresh: {
      put: (id) => {
        if (refresh.has(id)) return null;
        const ask = { at: new Date().toISOString() };
        refresh.set(id, ask);
        touch(id);
        return { ...ask };
      },
      lift: (id) => {
        const was = refresh.delete(id);
        if (was) touch(id);
        return was;
      },
      stands: (id) => refresh.has(id),
    },
    forgetting: {
      write: (id, taskIds) => void forgetting.set(id, [...taskIds]),
      read: (id) => (forgetting.has(id) ? [...forgetting.get(id)!] : undefined),
      list: () => [...forgetting.keys()].sort(),
      lift: (id) => void forgetting.delete(id),
      where: (id) => path.posix.join(MEMORY_ROOT, 'forgetting', `${id}.json`),
    },
  };
}

/** A fresh Run door in memory: no run, and nothing kept between two calls (a test makes one per test). */
export const runDoorMemory = (): Layer.Layer<RunDoor> => Layer.succeed(RunDoor)(runDoorOver(memoryRuns()));
