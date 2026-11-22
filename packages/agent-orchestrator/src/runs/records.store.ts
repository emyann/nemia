/**
 * The Run door's records in the keyspace (`src/keyspace/keyspace.store.ts`): a run's record, the claim it holds on the card it was started
 * from and a person's asks of it, each a record at its key (`run-keys.ts`), each write given a revision. What belongs together is one
 * transaction: a run and its claim (`create`); the pass's record and the asks it answers (`settle`); a run's removal with its claim and asks
 * (`forget`); an approval taken back (`takeBack`). A person's markers beside a run (its cancellation, pruning, hold, labels, what was said
 * before a step was filed, a refresh ask, `nemia rm`'s marker) stay files (`src/record/files.store.ts`), read and written through
 * `fromThrow`, and composed onto each run read.
 *
 * A store kept before its runs were records has its run files, ask files and claims imported the first time a process opens it
 * (`runsImported`, `runKeyspace`): each run's in one transaction, a key already held never written over, every file read then moved
 * aside under `<root>/imported/`, never deleted. Level-triggered: an import cut short by a crash is taken up by the next open.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Option, Schema, Semaphore } from 'effect';
import { fromThrow, type DoorOf } from '../door/door.store.ts';
import { keyspaceAt, keyspaceFile, RECORD_CEILING, type KeyRecord, type Keyspace, type KeyTxn } from '../keyspace/keyspace.store.ts';
import { mergeSpent } from '../merge/merge.ts';
import { pauseStands, readPause } from '../pause/pause.store.ts';
import { Conflict, Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import { spentAsks, type RetryAsk } from '../retry/index.ts';
import { spentRoundAsks } from '../round/round.ts';
import { routeAsk } from '../route/index.ts';
import { spentAcceptances, spentApprovals, type RoundAsk } from '../status/status.ts';
import {
  calledOffByMarker,
  dropFiles,
  filesAt,
  labelled,
  markerRunIds,
  paused,
  readForgetting,
  removeMarkerFiles,
  removeRefresh,
  refreshStands,
  forgettingRuns,
  forgettingWhere,
  liftForgetting,
  writeForgetting,
  writeLabels,
  writePruned,
  writeRefresh,
} from '../record/files.store.ts';
import {
  acceptanceIn,
  answersIn,
  askIn,
  roundAskIn,
  approvalIn,
  approvalsIn,
  asksIn,
  composedRun,
  heldText,
  holdFile,
  keepSaid,
  markCancelled,
  readAs,
  readPruned,
  recordIn,
  recordValue,
  removeHold,
  restStamps,
  runFile,
  runsDir,
  sayOnce,
  UnreadableRecord,
  When,
  writeHold,
  type AskEntry,
} from '../record/record.store.ts';
import type { AskWritten, PersonRequest, Run, RunStore } from '../record/record.ts';
import type { RunId } from '../record/record.model.ts';
import { askDoneKey, askKey, askKeyOf, askName, asksPrefix, ASKS_PREFIX, claimKey, runKey, RUNS_PREFIX } from './run-keys.ts';

/** The Run door's shape: each method of the run store answering an Effect, a run's id taken as `RunId`. */
type Shape = DoorOf<RunStore, RunId>;

/**
 * A record already at the id of a new run, as a refusal.
 * @param id The id of the new run.
 */
export const runTaken = (id: string) =>
  new Conflict({ message: `run ${id} already exists: start it under a new id, or forget the one there with nemia rm ${id}` });

/**
 * A run from a card another run from it stands for, as a refusal: one run per card, held by the card's claim.
 * @param card The card the new run is started from.
 * @param run The id of the run already started from it.
 */
export const cardStartedTwice = (card: string, run: string) =>
  new Conflict({
    message: `card ${card} was started already as run ${run}: read it with nemia show ${run}, or forget it with nemia rm ${run} and start the card again`,
  }) satisfies Conflict;

const claimIn = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ run: Schema.String })));
const fromCardIn = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ from: Schema.Struct({ inbox: Schema.String }) })));

/** The run a claim's text names, or undefined where it does not read as a claim. */
const claimedBy = (text: string) => Option.getOrUndefined(claimIn(text))?.run;

/** The card a record's text says its run was started from, or undefined. */
const cardIn = (text: string) => Option.getOrUndefined(fromCardIn(text))?.from.inbox;

/** A write that makes its key. */
const create = (value: string) => ({ verb: 'create', expected: null, value }) as const;

/** A write that overwrites its key, naming no revision. */
const overwrite = (value: string) => ({ verb: 'update', expected: null, value }) as const;

/** A write that deletes its key, naming no revision. */
const remove = { verb: 'delete', expected: null, value: '' } as const;

/** A keyspace's refusal of a write the door did not foresee, as a refusal naming its key. */
const raced = (err: { readonly key: string }) =>
  new Conflict({ message: `${err.key} changed while it was written: run the command again.` }) satisfies Refusal as Refusal;

/** The waiting asks among a run's records: those directly under its prefix, a spent one's `done/` left out. */
const waitingOf = (id: string, records: readonly KeyRecord[]) =>
  records.flatMap((r) => {
    const name = r.key.slice(asksPrefix(id).length);
    return name.includes('/') ? [] : [{ name, text: r.value, where: r.key } satisfies AskEntry];
  });

/** Each of a run's asks, waiting and spent, named from its prefix (`done/<name>` for a spent one). */
const allOf = (id: string, records: readonly KeyRecord[]) =>
  records.map((r) => ({ name: r.key.slice(asksPrefix(id).length), text: r.value, where: r.key }) satisfies AskEntry);

const MergeAskSchema = Schema.StructWithRest(
  Schema.Struct({
    loop: Schema.NonEmptyString,
    round: Schema.Int,
    onto: Schema.NonEmptyString,
    sha: Schema.NonEmptyString,
    at: When,
    landing: Schema.optional(Schema.Struct({ step: Schema.NonEmptyString, check: Schema.NonEmptyString })),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/**
 * One merge ask, read: the loop's target and its try from its name; the looping step, the round it is on, the base branch, its commit and
 * when from what it holds — as a round ask of that looping step and round, with what it merges (`RoundAsk.merge`) — or why it cannot be
 * read.
 * @param text What the merge ask holds.
 * @param step The loop's target, from its name.
 * @param n The target's try that merges, from its name.
 */
export function mergeAskIn(text: string, step: string, n: number) {
  const held = heldText(text);
  if ('unreadable' in held) return held.unreadable satisfies RoundAsk | string;
  const read = readAs(MergeAskSchema, held.read);
  if ('refused' in read)
    return (read.refused === 'at' ? 'it says no time it was given' : 'it is not an ask nemia refresh --base wrote') satisfies
      | RoundAsk
      | string;
  const { loop, round, onto, sha, at, landing } = read.read;
  return { step: loop, round, at, merge: { target: step, try: n, onto, sha, ...(landing ? { landing: { ...landing } } : {}) } } satisfies
    | RoundAsk
    | string;
}

/** The asks waiting among a run's (`asksIn`), a person's merges among its rounds. */
function allAsksIn(asks: readonly AskEntry[]) {
  const read = asksIn(asks);
  for (const { name, text, where } of asks) {
    const [, target, n] = /^merge-(.+)-(\d+)$/.exec(name) ?? [];
    if (target === undefined || n === undefined) continue;
    const ask = mergeAskIn(text, target, Number(n));
    if (typeof ask === 'string') read.notes.push(`${where}: ${ask}, so it is not honoured — remove it, and ask with nemia refresh --base`);
    else read.rounds.push(ask);
  }
  return read;
}

/** What an ask holds, by its kind: the ask as its verb gave it, but a merge's, which holds its loop, round, base, commit and time. */
function askHeld(person: PersonRequest) {
  if (person.of !== 'base') return person.ask;
  const { step, round, at, merge } = person.ask;
  return { loop: step, round, onto: merge.onto, sha: merge.sha, at, ...(merge.landing ? { landing: merge.landing } : {}) };
}

/** Each kind of ask's reader: what it holds read as that ask, or why it is not one. */
const ASK_READERS: Record<PersonRequest['of'], (text: string, step: string, n: number) => unknown> = {
  try: askIn,
  round: roundAskIn,
  gate: approvalIn,
  loop: acceptanceIn,
  base: mergeAskIn,
};

/** Why the text at an ask's name is no ask of its kind, read as the tick reads it: null where it reads as one. */
function strayOf(person: PersonRequest, text: string, step: string, n: number) {
  const read = ASK_READERS[person.of](text, step, n);
  return typeof read === 'string' ? read : null;
}

/** The first key under `done/` for `name` no record holds: the plain name, else `.2`, `.3`, …. */
const doneKeyFree = (id: string, name: string, held: ReadonlySet<string>) => {
  for (let k = 1; k <= 1000; k++) {
    const key = askDoneKey(id, k === 1 ? name : `${name}.${k}`);
    if (!held.has(key)) return key;
  }
  return askDoneKey(id, `${name}.1001`);
};

/** Move each named waiting ask of the run under `done/`, inside the transaction `tx`: one already gone is passed over. */
const setAside = (tx: KeyTxn, id: string, names: readonly string[], value?: (text: string) => string) =>
  Effect.gen(function* () {
    if (names.length === 0) return [] as string[];
    const records = yield* tx.list(asksPrefix(id));
    const held = new Set(records.map((r) => r.key));
    const moved: string[] = [];
    for (const name of new Set(names)) {
      const at = records.find((r) => r.key === askKeyOf(id, name));
      if (at === undefined) continue;
      const done = doneKeyFree(id, name, held);
      held.add(done);
      yield* tx.write(done, create(value === undefined ? at.value : value(at.value)));
      yield* tx.write(at.key, remove);
      moved.push(done);
    }
    return moved;
  });

/** The names of the asks a run's record answers: tries, rounds, approvals and acceptances it spent, merges it took, and the void. */
function spentNames(run: Run, asks: readonly RetryAsk[], rounds: readonly RoundAsk[], voided: readonly RetryAsk[], waiting: readonly AskEntry[]) {
  return [
    ...[...new Set([...spentAsks(run, asks), ...voided])].map((a) => askName({ of: 'try', step: a.step, n: a.try })),
    ...spentRoundAsks(
      run,
      rounds.filter((a) => !a.merge),
    ).map((a) => askName({ of: 'round', step: a.step, n: a.round })),
    ...spentApprovals({ ...run, approvals: approvalsIn(waiting).approvals }).map((a) => askName({ of: 'gate', step: a.step, n: a.try })),
    ...spentAcceptances(run).map((a) => askName({ of: 'loop', step: a.step, n: a.try })),
    ...rounds.flatMap((a) => (a.merge && mergeSpent(run, a) ? [askName({ of: 'base', step: a.merge.target, n: a.merge.try })] : [])),
  ];
}

/**
 * The run a memo kept, noted in `given` by identity: listed as given, labels and all, since its stamp still holds, and the very run is
 * handed back (`keptOf`).
 */
function givenOf(given: Set<Run>, run: Run | undefined) {
  if (run) given.add(run);
  return run;
}

/**
 * The run store over the keyspace `open` opens at the store's root `home`, a person's markers read and written as files there: the Run
 * door's layer, each method an Effect. `held` is the keyspace a read reads, undefined where the store has none and nothing to import, so a
 * read makes no file.
 * @param home The store's root folder, where a person's markers are.
 * @param open The keyspace a write writes, opened and its files imported.
 * @param held The keyspace a read reads, or undefined where there is none.
 */
export function runRecords(home: string, open: Effect.Effect<Keyspace, Refusal>, held: Effect.Effect<Keyspace | undefined, Refusal>) {
  const asksOf = (id: string) =>
    Effect.gen(function* () {
      const ks = yield* held;
      return ks === undefined ? [] : (yield* ks.list(asksPrefix(id))).records;
    });
  const composed = (record: KeyRecord, asks: readonly KeyRecord[], id: string) =>
    fromThrow(() => composedRun(home, recordIn(id, record.value, record.key), waitingOf(id, asks)));
  const recordOf = (id: string) =>
    Effect.gen(function* () {
      const ks = yield* held;
      return ks === undefined ? undefined : yield* ks.get(runKey(id));
    });
  const read = (id: string) =>
    Effect.gen(function* () {
      const record = yield* recordOf(id);
      if (record === undefined) return yield* new Missing({ message: `no such run: ${id}  (try 'nemia ls')` });
      const run = yield* composed(record, yield* asksOf(id), id);
      return yield* fromThrow(() => paused(home, labelled(home, run)));
    });
  const found = (id: string, said: (line: string) => void, pause: ReturnType<typeof readPause>) =>
    Effect.gen(function* () {
      const record = yield* recordOf(id);
      if (record === undefined) return undefined;
      const run = yield* Effect.result(composed(record, yield* asksOf(id), id));
      if (run._tag === 'Failure') {
        if (run.failure instanceof UnreadableRecord) {
          said(`left out: ${run.failure.message}`);
          return undefined;
        }
        return yield* Effect.fail(run.failure);
      }
      return yield* fromThrow(() => paused(home, labelled(home, run.success), pause));
    });
  return {
    runs: {
      read,
      find: (id, said = sayOnce) => Effect.flatMap(fromThrow(() => readPause(home)), (pause) => found(id, said, pause)),
      list: (said = sayOnce, kept) =>
        Effect.gen(function* () {
          const ks = yield* held;
          if (ks === undefined) return [];
          const pause = yield* fromThrow(() => readPause(home));
          const given = new Set<Run>();
          const ids = (yield* ks.keys(RUNS_PREFIX)).map((key) => key.slice(RUNS_PREFIX.length));
          const due = ids.filter((id) => givenOf(given, kept?.(id)) === undefined);
          const keptRuns = [...given];
          const records = new Map<string, KeyRecord>();
          const asks = new Map<string, KeyRecord[]>();
          if (due.length > 0) {
            const all = due.length === ids.length;
            const listed = all
              ? (yield* ks.list(RUNS_PREFIX)).records
              : (yield* Effect.forEach(due, (id) => ks.get(runKey(id)))).filter((r) => r !== undefined);
            for (const r of listed) records.set(r.key.slice(RUNS_PREFIX.length), r);
            const askRecords = all
              ? (yield* ks.list(ASKS_PREFIX)).records
              : (yield* Effect.forEach(due, (id) => ks.list(asksPrefix(id)))).flatMap((l) => l.records);
            for (const r of askRecords) {
              const id = r.key.slice(ASKS_PREFIX.length).split('/')[0] ?? '';
              asks.set(id, [...(asks.get(id) ?? []), r]);
            }
          }
          const out: Run[] = [];
          for (const id of ids) {
            const kept = keptRuns.find((r) => r.id === id);
            if (kept) {
              out.push(paused(home, kept, pause));
              continue;
            }
            const record = records.get(id);
            if (record === undefined) continue;
            const run = yield* Effect.result(composed(record, asks.get(id) ?? [], id));
            if (run._tag === 'Failure') {
              if (run.failure instanceof UnreadableRecord) said(`left out: ${run.failure.message}`);
              else return yield* Effect.fail(run.failure);
              continue;
            }
            out.push(yield* fromThrow(() => paused(home, labelled(home, run.success), pause)));
          }
          return out.sort((a, b) => a.id.localeCompare(b.id));
        }),
      create: (run) =>
        Effect.gen(function* () {
          const ks = yield* open;
          const card = run.from?.inbox;
          const writes = [[runKey(run.id), create(recordValue(run))] as const];
          const claim = card === undefined ? [] : [[claimKey(card), create(JSON.stringify({ run: run.id }))] as const];
          yield* ks.txn([...writes, ...claim]).pipe(
            Effect.catchTag('KeyRefused', (err) =>
              Effect.gen(function* () {
                if (err.key === runKey(run.id) && err.refusal === 'exists') return yield* Effect.fail(runTaken(run.id));
                if (card !== undefined && err.key === claimKey(card) && err.refusal === 'exists') {
                  const by = yield* ks.get(claimKey(card));
                  return yield* Effect.fail(cardStartedTwice(card, (by && claimedBy(by.value)) ?? 'another run'));
                }
                return yield* Effect.fail(raced(err));
              }),
            ),
          );
        }),
      rewrite: (run) =>
        Effect.gen(function* () {
          const ks = yield* open;
          return yield* ks.write(runKey(run.id), overwrite(recordValue(run))).pipe(
            Effect.as(true),
            Effect.catchTag('KeyRefused', (err) => (err.refusal === 'missing' ? Effect.succeed(false) : Effect.fail(raced(err)))),
          );
        }),
      settle: (run, spent) =>
        Effect.gen(function* () {
          const ks = yield* open;
          return yield* ks
            .within((tx) =>
              Effect.gen(function* () {
                if ((yield* tx.get(runKey(run.id))) === undefined) return false;
                if (spent.write) yield* tx.write(runKey(run.id), overwrite(recordValue(run)));
                const waiting = waitingOf(run.id, yield* tx.list(asksPrefix(run.id)));
                yield* setAside(tx, run.id, spentNames(run, spent.asks, spent.rounds, spent.voided ?? [], waiting));
                return true;
              }),
            )
            .pipe(Effect.catchTag('KeyRefused', (err) => Effect.fail(raced(err))));
        }),
      stamps: () =>
        Effect.gen(function* () {
          const ks = yield* held;
          const markers = yield* fromThrow(() => restStamps(home));
          const parts = new Map<string, string[]>();
          const add = (id: string, part: string) => parts.set(id, [...(parts.get(id) ?? []), part]);
          if (ks !== undefined) {
            for (const [key, revision] of yield* ks.revisions(RUNS_PREFIX)) add(key.slice(RUNS_PREFIX.length), `record=${revision}`);
            for (const [key, revision] of [...(yield* ks.revisions(ASKS_PREFIX))].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
              const rest = key.slice(ASKS_PREFIX.length);
              const slash = rest.indexOf('/');
              add(rest.slice(0, slash), `${rest.slice(slash + 1)}=${revision}`);
            }
          }
          for (const [id, stamp] of markers) add(id, stamp);
          return new Map([...parts].map(([id, p]) => [id, p.join(';')]));
        }),
      exists: (id) => Effect.map(recordOf(id), (record) => record !== undefined),
      taken: (id) =>
        Effect.gen(function* () {
          if ((yield* recordOf(id)) !== undefined || (yield* asksOf(id)).length > 0) return true;
          return yield* fromThrow(() => markerRunIds(home).includes(id));
        }),
      calledOff: (id) => fromThrow(() => calledOffByMarker(home, id) || pauseStands(home)),
      cancel: (id, actor) => fromThrow(() => markCancelled(home, id, actor)),
      forget: (id) =>
        Effect.gen(function* () {
          const ks = yield* held;
          const keys =
            ks === undefined
              ? []
              : yield* ks
                  .within((tx) =>
                    Effect.gen(function* () {
                      const removed: string[] = [];
                      const record = yield* tx.get(runKey(id));
                      if (record !== undefined) {
                        yield* tx.write(runKey(id), remove);
                        removed.push(runKey(id));
                        const card = cardIn(record.value);
                        const claim = card === undefined ? undefined : yield* tx.get(claimKey(card));
                        if (card !== undefined && claim !== undefined && claimedBy(claim.value) === id) {
                          yield* tx.write(claimKey(card), remove);
                          removed.push(claimKey(card));
                        }
                      }
                      for (const ask of yield* tx.list(asksPrefix(id))) {
                        yield* tx.write(ask.key, remove);
                        removed.push(ask.key);
                      }
                      return removed;
                    }),
                  )
                  .pipe(Effect.catchTag('KeyRefused', (err) => Effect.fail(raced(err))));
          return [...keys, ...(yield* fromThrow(() => removeMarkerFiles(home, id)))];
        }),
      ids: () =>
        Effect.gen(function* () {
          const ks = yield* held;
          return ks === undefined ? [] : (yield* ks.keys(RUNS_PREFIX)).map((key) => key.slice(RUNS_PREFIX.length)).sort();
        }),
      filesAt: (id) => fromThrow(() => filesAt(home, id)),
      dropFiles: (id) => fromThrow(() => dropFiles(home, id)),
      prune: (id, marker) => fromThrow(() => writePruned(home, id, marker)),
      pruned: (id) => fromThrow(() => readPruned(home, id)),
    },
    asks: {
      read: (id) => Effect.map(asksOf(id), (records) => allAsksIn(waitingOf(id, records))),
      answers: (id) => Effect.map(asksOf(id), (records) => answersIn(allOf(id, records))),
      write: (id, person) =>
        Effect.gen(function* () {
          const ks = yield* open;
          const [step, n] =
            person.of === 'base'
              ? [person.ask.merge.target, person.ask.merge.try]
              : [person.ask.step, 'round' in person.ask ? person.ask.round : person.ask.try];
          const key = askKey(id, { of: person.of, step, n });
          return yield* ks.write(key, create(JSON.stringify(askHeld(person)))).pipe(
            Effect.as({ written: true, where: key } satisfies AskWritten as AskWritten),
            Effect.catchTag('KeyRefused', (err) =>
              err.refusal !== 'exists'
                ? Effect.fail(raced(err))
                : Effect.map(ks.get(key), (there) => {
                    const stray = there === undefined ? null : strayOf(person, there.value, step, n);
                    return { written: false, where: key, stray } satisfies AskWritten as AskWritten;
                  }),
            ),
          );
        }),
      where: (id, key) => Effect.succeed(askKey(id, key)),
      takeBack: (id, step, n, takenBack) =>
        Effect.gen(function* () {
          const ks = yield* open;
          return yield* ks
            .within((tx) =>
              Effect.gen(function* () {
                const name = askName({ of: 'gate', step, n });
                const at = yield* tx.get(askKeyOf(id, name));
                if (at === undefined || typeof approvalIn(at.value, step, n) === 'string') return null;
                const held = heldText(at.value);
                const said = 'read' in held && held.read !== null && typeof held.read === 'object' ? held.read : {};
                const [done] = yield* setAside(tx, id, [name], () => JSON.stringify({ ...said, takenBack }));
                return done ?? null;
              }),
            )
            .pipe(Effect.catchTag('KeyRefused', (err) => Effect.fail(raced(err))));
        }),
      route: (id, step, n, route) =>
        Effect.gen(function* () {
          const ks = yield* open;
          const key = askKeyOf(id, routeAsk(step, n));
          const value = JSON.stringify(route);
          yield* ks
            .within((tx) =>
              Effect.flatMap(tx.get(key), (there) => tx.write(key, there === undefined ? create(value) : overwrite(value))),
            )
            .pipe(Effect.catchTag('KeyRefused', (err) => Effect.fail(raced(err))));
          return key;
        }),
    },
    holds: {
      lift: (id, at, actor) => fromThrow(() => removeHold(home, id, at, actor)),
      put: (id, until, said) => fromThrow(() => writeHold(home, id, until, said)),
      stands: (id) => fromThrow(() => fs.existsSync(holdFile(home, id))),
    },
    said: { put: (id, step, text) => fromThrow(() => keepSaid(home, id, step, text)) },
    labels: { put: (id, labels) => fromThrow(() => writeLabels(home, id, labels)) },
    refresh: {
      lift: (id) => fromThrow(() => removeRefresh(home, id)),
      put: (id) => fromThrow(() => writeRefresh(home, id)),
      stands: (id) => fromThrow(() => refreshStands(home, id)),
    },
    forgetting: {
      write: (id, taskIds) => fromThrow(() => writeForgetting(home, id, taskIds)),
      read: (id) => fromThrow(() => readForgetting(home, id)),
      list: () => fromThrow(() => forgettingRuns(home)),
      lift: (id) => fromThrow(() => liftForgetting(home, id)),
      where: (id) => fromThrow(() => forgettingWhere(home, id)),
    },
  } satisfies Shape;
}

/** The file names of `dir`, sorted; none where it cannot be listed. */
const filesIn = (dir: string) => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
};

/** Where the claims of the cards started were kept as files, `<card>.json` each. */
const startedDir = (home: string) => path.join(home, 'started');

/** A file to import: where it is, the key it goes to, and where it is moved once imported. */
type Planted = { readonly file: string; readonly key: string; readonly aside: string };

/**
 * The run files a store keeps, by run: each `runs/<id>.json` and each file of `runs/<id>.asks/` and its `done/`, and each claim of
 * `started/`, with the key each goes to and where it is moved aside.
 * @param home The store's root folder.
 */
export function runFilesOf(home: string) {
  const imported = path.join(home, 'imported');
  const runs = filesIn(runsDir(home))
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.slice(0, -'.json'.length));
  const asksAt = (id: string) => path.join(runsDir(home), `${id}.asks`);
  const ids = [
    ...new Set([
      ...runs,
      ...(() => {
        try {
          return fs
            .readdirSync(runsDir(home))
            .filter((n) => n.endsWith('.asks'))
            .map((n) => n.slice(0, -'.asks'.length));
        } catch {
          return [];
        }
      })(),
    ]),
  ].sort();
  const byRun = ids.map((id) => ({
    id,
    record: runs.includes(id)
      ? ({ file: runFile(home, id), key: runKey(id), aside: path.join(imported, 'runs', `${id}.json`) } satisfies Planted)
      : undefined,
    asks: [
      ...filesIn(asksAt(id)).map(
        (n) =>
          ({ file: path.join(asksAt(id), n), key: askKeyOf(id, n), aside: path.join(imported, 'runs', `${id}.asks`, n) }) satisfies Planted,
      ),
      ...filesIn(path.join(asksAt(id), 'done')).map(
        (n) =>
          ({
            file: path.join(asksAt(id), 'done', n),
            key: askDoneKey(id, n),
            aside: path.join(imported, 'runs', `${id}.asks`, 'done', n),
          }) satisfies Planted,
      ),
    ],
  }));
  const claims = filesIn(startedDir(home))
    .filter((n) => n.endsWith('.json'))
    .map(
      (n) =>
        ({
          card: n.slice(0, -'.json'.length),
          file: path.join(startedDir(home), n),
          key: claimKey(n.slice(0, -'.json'.length)),
          aside: path.join(imported, 'started', n),
        }) as const,
    );
  return { runs: byRun, claims };
}

/** The text of `file`, or undefined where it is gone. */
const textOf = (file: string) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
};

/** Move `file` to `aside`, never over a file there: the first of `aside`, `aside.2`, … no file holds. One gone already is passed over. */
const moveAside = (file: string, aside: string) => {
  fs.mkdirSync(path.dirname(aside), { recursive: true });
  let to = aside;
  for (let k = 2; fs.existsSync(to) && k < 1000; k++) to = `${aside}.${k}`;
  try {
    fs.renameSync(file, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
};

/** Whether `text` reads as JSON: an ask that does not is left where it is. */
const isJson = (text: string) => Option.isSome(Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(text));

/**
 * Import a store's run files into its keyspace, once: each run's record and asks in one transaction, a key already held left as it is, then
 * every file read moved aside under `<root>/imported/`, never deleted; then each claim whose run's record holds that it was started from
 * its card, a stale one (its run gone, or from another card) moved aside unimported. An ask that does not read as JSON stays where it is,
 * and is said in the log. A record or an ask larger than a record holds stops the import before anything moves: `Invalid`, naming the
 * file. Answers how many records it made.
 * @param home The store's root folder.
 * @param keyspace The store's keyspace.
 */
export const runsImported = Effect.fnUntraced(function* (home: string, keyspace: Keyspace) {
  const { runs, claims } = runFilesOf(home);
  if (runs.length === 0 && claims.length === 0) return 0;
  const every = [...runs.flatMap((r) => [...(r.record ? [r.record] : []), ...r.asks]), ...claims];
  const over = every.find((f) => (fs.statSync(f.file, { throwIfNoEntry: false })?.size ?? 0) > RECORD_CEILING);
  if (over !== undefined)
    return yield* Effect.fail(
      new Invalid({
        message: `${over.file} is larger than a record of the keyspace holds (${RECORD_CEILING} bytes): nothing was imported or moved; move it aside and run again.`,
      }),
    );
  let made = 0;
  for (const run of runs) {
    const read: { planted: Planted; text: string }[] = [];
    for (const planted of [...(run.record ? [run.record] : []), ...run.asks]) {
      const text = yield* fromThrow(() => textOf(planted.file));
      if (text === undefined) continue;
      if (planted !== run.record && !isJson(text)) {
        yield* Effect.logWarning(`${planted.file} was not imported: it is no JSON, so it is no ask; remove it, and ask again`);
        continue;
      }
      read.push({ planted, text });
    }
    made += yield* keyspace
      .within((tx) =>
        Effect.gen(function* () {
          let wrote = 0;
          for (const { planted, text } of read)
            if ((yield* tx.get(planted.key)) === undefined) {
              yield* tx.write(planted.key, create(text));
              wrote++;
            }
          return wrote;
        }),
      )
      .pipe(Effect.catchTag('KeyRefused', (err) => Effect.fail(new Conflict({ message: `${err.key} was written while it was imported: run again.` }))));
    yield* fromThrow(() => {
      for (const { planted } of read) moveAside(planted.file, planted.aside);
      for (const dir of [path.join(runsDir(home), `${run.id}.asks`, 'done'), path.join(runsDir(home), `${run.id}.asks`)])
        try {
          fs.rmdirSync(dir);
        } catch {}
    });
  }
  for (const claim of claims) {
    const text = yield* fromThrow(() => textOf(claim.file));
    if (text === undefined) continue;
    const by = claimedBy(text);
    const record = by === undefined ? undefined : yield* keyspace.get(runKey(by));
    if (record !== undefined && cardIn(record.value) === claim.card)
      made += yield* keyspace
        .within((tx) =>
          Effect.flatMap(tx.get(claim.key), (there) => (there === undefined ? Effect.as(tx.write(claim.key, create(text)), 1) : Effect.succeed(0))),
        )
        .pipe(Effect.catchTag('KeyRefused', (err) => Effect.fail(new Conflict({ message: `${err.key} was written while it was imported: run again.` }))));
    yield* fromThrow(() => moveAside(claim.file, claim.aside));
  }
  return made;
});

/** The stores whose run files this process has imported, by root. */
const IMPORTED = new Set<string>();

/** One import at a time, so two fibers opening one store import it once. */
const IMPORTING = Semaphore.makeUnsafe(1);

/**
 * The keyspace of the store `home`, its run files imported the first time this process opens it (`runsImported`); a failed import is not
 * kept, so the next open imports again.
 * @param home The store's root folder.
 */
export const runKeyspace = (home: string) =>
  Effect.flatMap(keyspaceAt(keyspaceFile(home)), (keyspace) =>
    IMPORTED.has(home)
      ? Effect.succeed(keyspace)
      : IMPORTING.withPermits(1)(
          Effect.suspend(() =>
            IMPORTED.has(home)
              ? Effect.succeed(keyspace)
              : Effect.map(runsImported(home, keyspace), () => {
                  IMPORTED.add(home);
                  return keyspace;
                }),
          ),
        ),
  );

/** Whether the store `home` keeps a run file to import: a record, an asks folder or a claim. */
const runFilesPlanted = (home: string) => {
  const planted = (dir: string, end: string) => {
    try {
      return fs.readdirSync(dir).some((n) => n.endsWith(end));
    } catch {
      return false;
    }
  };
  return planted(runsDir(home), '.json') || planted(runsDir(home), '.asks') || planted(startedDir(home), '.json');
};

/**
 * The keyspace of the store `home` a read reads: undefined where the store has no keyspace file and no run file to import, so a read
 * makes no file; else `runKeyspace`'s.
 * @param home The store's root folder.
 */
export const runKeyspaceHeld = (home: string) =>
  Effect.suspend(() => (!fs.existsSync(keyspaceFile(home)) && !runFilesPlanted(home) ? Effect.succeed(undefined) : runKeyspace(home)));
