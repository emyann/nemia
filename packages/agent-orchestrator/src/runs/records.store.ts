/**
 * The Run door's records in the keyspace (`src/keyspace/keyspace.store.ts`): a run's record, the claim it holds on the card it was started
 * from and a person's asks of it, each a record at its key (`run-keys.ts`), each write given a revision. What belongs together is one
 * transaction: a run and its claim (`create`); the pass's record and the asks it answers (`settle`); a run's removal with its claim and
 * asks and markers (`forget`); an approval taken back (`takeBack`). A person's markers beside a run (its cancellation, pruning, hold,
 * labels, what was said before a step was filed, a refresh ask) are records under `/registry/runmarks/<id>/` (`run-keys.ts`), each guarded
 * write one transaction asking the marks' machine (`runMarkMove`), composed onto each run read; `nemia rm`'s marker is at
 * `/registry/forgetting/<id>`, outside them, since it outlives the run's record.
 *
 * A store kept before its runs were records has its run files, ask files and claims imported the first time a process opens it
 * (`runsImported`, `runKeyspace`): each run's in one transaction, a key already held never written over, every file read then moved
 * aside under `<root>/imported/`, never deleted. Level-triggered: an import cut short by a crash is taken up by the next open. The
 * markers' files are imported by their own kind (`RUN_MARK_FILES`), taken up on each open after the run files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Option, Schema, Semaphore } from 'effect';
import { fromThrow, type DoorOf } from '../door/door.store.ts';
import {
  keyspaceAt,
  keyspaceFile,
  KeyRefused,
  RECORD_CEILING,
  type KeyRecord,
  type Keyspace,
  type KeyTxn,
} from '../keyspace/keyspace.store.ts';
import { mergeSpent } from '../merge/merge.ts';
import { readPause } from '../pause/pause.store.ts';
import { Conflict, Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import { spentAsks, type RetryAsk } from '../retry/index.ts';
import { spentRoundAsks } from '../round/round.ts';
import { routeAsk } from '../route/index.ts';
import { conditionAsk, personConditions } from '../condition/condition.ts';
import { spentAcceptances, spentApprovals, type RoundAsk } from '../status/status.ts';
import { paused } from '../record/files.store.ts';
import {
  create,
  markerMethods,
  marksFrom,
  overwrite,
  ownKey,
  raced,
  racedOn,
  remove,
  RUN_MARK_FILES,
  type Held,
  type Opened,
} from './marks.store.ts';
import { kindKeyspace, kindKeyspaceHeld } from '../keyspace/import.store.ts';
import {
  acceptanceIn,
  answersIn,
  askIn,
  asksCounted,
  asksDir,
  roundAskIn,
  approvalIn,
  approvalsIn,
  asksIn,
  composedRun,
  heldText,
  readAs,
  recordIn,
  recordValue,
  runFile,
  lstatOf,
  runsDir,
  sayOnce,
  UnreadableRecord,
  When,
  type AskEntry,
} from '../record/record.store.ts';
import type { AskKey, AskWritten, PersonRequest, Run, RunStore } from '../record/record.ts';
import type { AskHeld } from '../../contracts/ask-take-back.contract.ts';
import type { RunId } from '../record/record.model.ts';
import {
  ASK_WORDS,
  askDoneKey,
  askKey,
  askKeyOf,
  askName,
  asksPrefix,
  ASKS_PREFIX,
  claimKey,
  forgettingKey,
  runKey,
  runMarkKey,
  runMarksPrefix,
  RUNMARKS_PREFIX,
  RUNS_PREFIX,
} from './run-keys.ts';

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
function mergeAskIn(text: string, step: string, n: number) {
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
    if (typeof ask === 'string')
      read.notes.push(
        `${where}: ${ask}, so it is not honoured — at the target's next try, take it back (nemia refresh <runId> [<step>] --base --off) and ask again with nemia refresh --base; one at any other key blocks no ask, and goes with the run (nemia rm)`,
      );
    else read.rounds.push(ask);
  }
  return read;
}

/** What an ask holds, by its kind: the ask as its verb gave it, but a merge's, which holds its loop, round, base, commit and time. */
function askHeld(person: PersonRequest) {
  if (person.of !== 'base') return person.ask;
  const { step, round, at, merge } = person.ask;
  return { loop: step, round, onto: merge.onto, sha: merge.sha, at };
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

/** What the text at an ask's key holds, read by its kind's reader: an ask, a stray that reads as none, or nothing. */
const heldAs = (key: AskKey, text: string | undefined) => {
  const held: AskHeld = text === undefined ? 'none' : typeof ASK_READERS[key.of](text, key.step, key.n) === 'string' ? 'stray' : 'ask';
  return held;
};

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
function spentNames(
  run: Run,
  asks: readonly RetryAsk[],
  rounds: readonly RoundAsk[],
  voided: readonly RetryAsk[],
  waiting: readonly AskEntry[],
) {
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
 * The run at `record` with its asks, composed with its markers and the pause: undefined where its record cannot be read, which `said`
 * says.
 */
const composedOf = (
  home: string,
  record: KeyRecord,
  asks: readonly KeyRecord[],
  marks: readonly KeyRecord[],
  said: (line: string) => void,
  pause: ReturnType<typeof readPause>,
) =>
  Effect.gen(function* () {
    const id = record.key.slice(RUNS_PREFIX.length);
    const run = yield* Effect.result(
      fromThrow(() => composedRun(recordIn(id, record.value, record.key), waitingOf(id, asks), marksFrom(id, marks))),
    );
    if (run._tag === 'Success') return yield* fromThrow(() => paused(home, run.success, pause));
    if (!(run.failure instanceof UnreadableRecord)) return yield* Effect.fail(run.failure);
    said(`left out: ${run.failure.message}`);
    return undefined;
  });

/**
 * What one run's reads read from `held`: its record, its asks and its markers, each none where the store has no keyspace or `id` names no
 * key.
 */
const keyReads = (held: Held) => ({
  marksOf: (id: string) =>
    Effect.flatMap(held, (ks) =>
      ks === undefined || !ownKey(id) ? Effect.succeed([]) : Effect.map(ks.list(runMarksPrefix(id)), (l) => l.records),
    ),
  asksOf: (id: string) =>
    Effect.flatMap(held, (ks) =>
      ks === undefined || !ownKey(id) ? Effect.succeed([]) : Effect.map(ks.list(asksPrefix(id)), (l) => l.records),
    ),
  recordOf: (id: string) =>
    Effect.flatMap(held, (ks) => (ks === undefined || !ownKey(id) ? Effect.succeed(undefined) : ks.get(runKey(id)))),
});

/** The records and asks of the runs `due` among `ids`, by id: a whole list where every run is due, else one read per run. */
const dueRecords = (ks: Keyspace, ids: readonly string[], due: readonly string[]) =>
  Effect.gen(function* () {
    const records = new Map<string, KeyRecord>();
    const asks = new Map<string, KeyRecord[]>();
    const marks = new Map<string, KeyRecord[]>();
    if (due.length === 0) return { records, asks, marks };
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
    const markRecords = all
      ? (yield* ks.list(RUNMARKS_PREFIX)).records
      : (yield* Effect.forEach(due, (id) => ks.list(runMarksPrefix(id)))).flatMap((l) => l.records);
    for (const r of markRecords) {
      const id = r.key.slice(RUNMARKS_PREFIX.length).split('/')[0] ?? '';
      marks.set(id, [...(marks.get(id) ?? []), r]);
    }
    return { records, asks, marks };
  });

/** Every run of the store `home`, a run a memo kept (`kept`) taken as kept, one whose record cannot be read said and left out. */
function listedRuns(home: string, held: Held) {
  const method: Shape['runs']['list'] = (said = sayOnce, kept) =>
    Effect.gen(function* () {
      const ks = yield* held;
      if (ks === undefined) return [];
      const pause = yield* fromThrow(() => readPause(home));
      const given = new Set<Run>();
      const ids = (yield* ks.keys(RUNS_PREFIX)).map((key) => key.slice(RUNS_PREFIX.length));
      const due = ids.filter((id) => givenOf(given, kept?.(id)) === undefined);
      const { records, asks, marks } = yield* dueRecords(ks, ids, due);
      const out: Run[] = [...given].map((run) => paused(home, run, pause));
      for (const [id, record] of records) {
        const run = yield* composedOf(home, record, asks.get(id) ?? [], marks.get(id) ?? [], said, pause);
        if (run !== undefined) out.push(run);
      }
      return out.sort((a, b) => a.id.localeCompare(b.id));
    });
  return method;
}

/** The Run door's reads of one run and of every run in `held`, the store's pause read in `home`. */
function runReads(home: string, held: Held) {
  const { asksOf, marksOf, recordOf } = keyReads(held);
  const reads: Pick<Shape['runs'], 'read' | 'find' | 'list' | 'exists' | 'taken' | 'ids'> = {
    read: (id) =>
      Effect.gen(function* () {
        const record = yield* recordOf(id);
        if (record === undefined) return yield* new Missing({ message: `no such run: ${id}  (try 'nemia ls')` });
        const [asks, marks] = [yield* asksOf(id), yield* marksOf(id)];
        const run = yield* fromThrow(() => composedRun(recordIn(id, record.value, record.key), waitingOf(id, asks), marksFrom(id, marks)));
        return yield* fromThrow(() => paused(home, run));
      }),
    find: (id, said = sayOnce) =>
      Effect.gen(function* () {
        const pause = yield* fromThrow(() => readPause(home));
        const record = yield* recordOf(id);
        return record === undefined ? undefined : yield* composedOf(home, record, yield* asksOf(id), yield* marksOf(id), said, pause);
      }),
    list: listedRuns(home, held),
    exists: (id) => Effect.map(recordOf(id), (record) => record !== undefined),
    taken: (id) =>
      Effect.gen(function* () {
        if ((yield* recordOf(id)) !== undefined || (yield* asksOf(id)).length > 0 || (yield* marksOf(id)).length > 0) return true;
        const ks = yield* held;
        if (ks !== undefined && ownKey(id) && (yield* ks.get(forgettingKey(id))) !== undefined) return true;
        return yield* fromThrow(() => ownKey(id) && fs.existsSync(path.join(runsDir(home), id)));
      }),
    ids: () =>
      Effect.gen(function* () {
        const ks = yield* held;
        return ks === undefined ? [] : (yield* ks.keys(RUNS_PREFIX)).map((key) => key.slice(RUNS_PREFIX.length)).sort();
      }),
  };
  return reads;
}

/** A new run's record and its card's claim written in one transaction, each key taken already said as its refusal. */
function createdRun(open: Opened) {
  const method: Shape['runs']['create'] = (run) =>
    Effect.gen(function* () {
      const ks = yield* open;
      const card = run.from?.inbox;
      const writes = [[runKey(run.id), create(recordValue(run))] as const];
      const claim = card === undefined ? [] : [[claimKey(card), create(JSON.stringify({ run: run.id }))] as const];
      yield* ks.txn([...writes, ...claim]).pipe(
        Effect.catchTag('KeyRefused', (err) =>
          Effect.gen(function* () {
            if (err.key === runKey(run.id) && err.refusal === 'exists') return yield* Effect.fail(runTaken(run.id));
            if (card === undefined || err.key !== claimKey(card) || err.refusal !== 'exists') return yield* Effect.fail(raced(err));
            const by = yield* ks.get(claimKey(card));
            return yield* Effect.fail(cardStartedTwice(card, (by && claimedBy(by.value)) ?? 'another run'));
          }),
        ),
      );
    });
  return method;
}

/** The keys of a run's record, the claim it holds, its asks and its markers, removed in one transaction of `ks`. */
const forgottenKeys = (ks: Keyspace, id: string) =>
  racedOn(
    ks.within((tx) =>
      Effect.gen(function* () {
        const removed: string[] = [];
        const record = yield* tx.get(runKey(id));
        const card = record === undefined ? undefined : cardIn(record.value);
        const claim = card === undefined ? undefined : yield* tx.get(claimKey(card));
        const keys = [
          ...(record === undefined ? [] : [runKey(id)]),
          ...(card !== undefined && claim !== undefined && claimedBy(claim.value) === id ? [claimKey(card)] : []),
          ...(yield* tx.list(asksPrefix(id))).map((ask) => ask.key),
          ...(yield* tx.list(runMarksPrefix(id))).map((mark) => mark.key),
        ];
        for (const key of keys) {
          yield* tx.write(key, remove);
          removed.push(key);
        }
        return removed;
      }),
    ),
  );

/** The revision of each run's record, asks and markers in `held`, joined by run. */
const stampsOf = (held: Held) =>
  Effect.gen(function* () {
    const ks = yield* held;
    const parts = new Map<string, string[]>();
    const add = (id: string, part: string) => parts.set(id, [...(parts.get(id) ?? []), part]);
    if (ks !== undefined) {
      for (const [key, revision] of yield* ks.revisions(RUNS_PREFIX)) add(key.slice(RUNS_PREFIX.length), `record=${revision}`);
      for (const [key, revision] of [...(yield* ks.revisions(ASKS_PREFIX))].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const rest = key.slice(ASKS_PREFIX.length);
        const slash = rest.indexOf('/');
        add(rest.slice(0, slash), `${rest.slice(slash + 1)}=${revision}`);
      }
      for (const [key, revision] of [...(yield* ks.revisions(RUNMARKS_PREFIX))].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const rest = key.slice(RUNMARKS_PREFIX.length);
        const slash = rest.indexOf('/');
        add(rest.slice(0, slash), `mark:${rest.slice(slash + 1)}=${revision}`);
      }
    }
    return new Map([...parts].map(([id, p]) => [id, p.join(';')]));
  });

/** What `run` writes as its record: its cancellation left out where a person's marker holds it, as it is composed on read. */
const bareValue = (run: Run, cancelled: boolean) => {
  if (!cancelled) return recordValue(run);
  const { cancelledAt: _, cancelledBy: __, ...bare } = run;
  return recordValue(bare);
};

/** Remove a run's own directory, and a folder of words said that an import left empty: answers each path removed from the store's root. */
const removeRunFiles = (home: string, id: string) => {
  const removed: string[] = [];
  for (const at of [path.join(runsDir(home), `${id}.said`), path.join(runsDir(home), id)]) {
    const st = lstatOf(at);
    if (!st) continue;
    fs.rmSync(at, { recursive: true, force: true });
    if (at.endsWith(id)) removed.push(`${path.relative(home, at)}/`);
  }
  return removed;
};

/** The Run door's writes of a run's record in `open`, and its removal from `held` with its markers, and its own directory in `home`. */
function runWrites(home: string, open: Opened, held: Held) {
  const writes: Pick<Shape['runs'], 'create' | 'rewrite' | 'settle' | 'stamps' | 'forget'> = {
    create: createdRun(open),
    rewrite: (run) =>
      Effect.flatMap(open, (ks) =>
        racedOn(
          ks.within((tx) =>
            Effect.gen(function* () {
              const value = bareValue(run, (yield* tx.get(runMarkKey(run.id, 'cancelled'))) !== undefined);
              return yield* tx.write(runKey(run.id), overwrite(value)).pipe(
                Effect.as(true),
                Effect.catchTag('KeyRefused', (err) => (err.refusal === 'missing' ? Effect.succeed(false) : Effect.fail(err))),
              );
            }),
          ),
        ),
      ),
    settle: (run, spent) =>
      Effect.flatMap(open, (ks) =>
        racedOn(
          ks.within((tx) =>
            Effect.gen(function* () {
              if ((yield* tx.get(runKey(run.id))) === undefined) return false;
              if (spent.write) {
                const value = bareValue(run, (yield* tx.get(runMarkKey(run.id, 'cancelled'))) !== undefined);
                yield* tx.write(runKey(run.id), overwrite(value));
              }
              const waiting = waitingOf(run.id, yield* tx.list(asksPrefix(run.id)));
              yield* setAside(tx, run.id, spentNames(run, spent.asks, spent.rounds, spent.voided ?? [], waiting));
              return true;
            }),
          ),
        ),
      ),
    stamps: () => stampsOf(held),
    forget: (id) =>
      Effect.gen(function* () {
        const ks = yield* held;
        const keys = ks === undefined ? [] : yield* forgottenKeys(ks, id);
        return [...keys, ...(yield* fromThrow(() => removeRunFiles(home, id)))];
      }),
  };
  return writes;
}

/** A person's ask written at its key in `open`, an ask already there answered with why it is no ask of its kind, if it is not. */
function askWritten(open: Opened) {
  const method: Shape['asks']['write'] = (id, person) =>
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
                return { written: false, where: key, stray } satisfies AskWritten;
              }),
        ),
      );
    });
  return method;
}

/** The Run door's asks: read from `held`, written, taken back and routed in `open`. */
function askMethods(open: Opened, held: Held) {
  const { asksOf } = keyReads(held);
  const asks: Shape['asks'] = {
    read: (id) => asksCounted(Effect.map(asksOf(id), (records) => allAsksIn(waitingOf(id, records)))),
    answers: (id) => asksCounted(Effect.map(asksOf(id), (records) => answersIn(allOf(id, records)))),
    write: askWritten(open),
    where: (id, key) => Effect.succeed(askKey(id, key)),
    held: (id, key) =>
      Effect.flatMap(held, (ks) =>
        ks === undefined || !ownKey(id)
          ? Effect.succeed<AskHeld>('none')
          : Effect.map(ks.get(askKeyOf(id, askName(key))), (at) => heldAs(key, at?.value)),
      ),
    takeBack: (id, key, takenBack) =>
      Effect.flatMap(open, (ks) =>
        racedOn(
          ks.within((tx) =>
            Effect.gen(function* () {
              const name = askName(key);
              const at = yield* tx.get(askKeyOf(id, name));
              if (at === undefined) return null;
              const stray = heldAs(key, at.value) === 'stray';
              const read = heldText(at.value);
              const said = 'read' in read && read.read !== null && typeof read.read === 'object' ? read.read : undefined;
              const [done] = yield* setAside(tx, id, [name], () =>
                JSON.stringify(stray || said === undefined ? { stray: at.value, takenBack } : { ...said, takenBack }),
              );
              return done === undefined ? null : { where: done, stray };
            }),
          ),
        ),
      ),
    condition: (id, written) =>
      Effect.flatMap(open, (ks) => {
        const name = conditionAsk(written.step, written.try, written.name);
        const key = askKeyOf(id, name);
        return racedOn(
          ks.within((tx) =>
            Effect.gen(function* () {
              const there = yield* tx.get(key);
              const before = there === undefined ? undefined : personConditions([name], () => heldText(there.value))[0];
              const kept = before !== undefined && before.status === written.status ? before.transitionedAt : written.at;
              const whole = { ...written, transitionedAt: kept };
              const value = JSON.stringify(whole);
              yield* tx.write(key, there === undefined ? create(value) : overwrite(value));
              return whole;
            }),
          ),
        );
      }),
    route: (id, step, n, route) =>
      Effect.flatMap(open, (ks) => {
        const key = askKeyOf(id, routeAsk(step, n));
        const value = JSON.stringify(route);
        return racedOn(
          ks.within((tx) => Effect.flatMap(tx.get(key), (there) => tx.write(key, there === undefined ? create(value) : overwrite(value)))),
        ).pipe(Effect.as(key));
      }),
  };
  return asks;
}

/**
 * The run store over the keyspace `open` opens at the store's root `home`, a person's markers read and written as files there: the Run
 * door's layer, each method an Effect. `held` is the keyspace a read reads, undefined where the store has none and nothing to import, so a
 * read makes no file.
 * @param home The store's root folder, where a person's markers are.
 * @param open The keyspace a write writes, opened and its files imported.
 * @param held The keyspace a read reads, or undefined where there is none.
 */
export function runRecords(home: string, open: Opened, held: Held) {
  const { holds, released, assignees, said, labels, refresh, forgetting, ...markers } = markerMethods(home, open, held);
  return {
    runs: { ...runReads(home, held), ...runWrites(home, open, held), ...markers },
    asks: askMethods(open, held),
    holds,
    released,
    assignees,
    said,
    labels,
    refresh,
    forgetting,
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
  const asksAt = (id: string) => asksDir(home, id);
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

/** An import's own write raced by another, as a refusal. */
const importRaced = (err: KeyRefused) =>
  new Conflict({ message: `${err.key} was written while it was imported: run again.` }) satisfies Refusal as Refusal;

/**
 * Why the waiting ask at `key` is no ask of the kind its name says, read as the tick reads it (`strayOf`): null where it reads as one, is
 * spent, or has a name no kind of ask has, which nothing reads and so blocks no ask.
 */
const strayPlanted = (key: string, text: string) => {
  const name = key.slice(key.indexOf('/', ASKS_PREFIX.length) + 1);
  const [, word, step, n] = /^([a-z]+)-(.+)-(\d+)$/.exec(name) ?? [];
  const of = (Object.keys(ASK_WORDS) as PersonRequest['of'][]).find((kind) => ASK_WORDS[kind] === word);
  if (of === undefined || step === undefined || n === undefined) return null;
  const read = ASK_READERS[of](text, step, Number(n));
  return typeof read === 'string' ? read : null;
};

/**
 * Each of a run's files that reads as it should, with its text: an ask that does not read as JSON, or as the ask its name says, left where
 * it is and said in the log, so no stray ask is ever a record that holds its name.
 */
const plantedTexts = (planted: readonly Planted[], record: Planted | undefined) =>
  Effect.gen(function* () {
    const read: { planted: Planted; text: string }[] = [];
    for (const one of planted) {
      const text = yield* fromThrow(() => textOf(one.file));
      if (text === undefined) continue;
      const stray = one === record ? null : !isJson(text) ? 'it is no JSON, so it is no ask' : strayPlanted(one.key, text);
      if (stray !== null) yield* Effect.logWarning(`${one.file} was not imported: ${stray}; remove it (rm ${one.file}), and ask again`);
      else read.push({ planted: one, text });
    }
    return read;
  });

/** Write each `read` file at its key in one transaction of `keyspace`, a key already held left as it is; answers how many it wrote. */
const writtenOnce = (keyspace: Keyspace, read: readonly { planted: Planted; text: string }[]) =>
  keyspace
    .within((tx) =>
      Effect.gen(function* () {
        let wrote = 0;
        for (const { planted, text } of read) {
          if ((yield* tx.get(planted.key)) !== undefined) continue;
          yield* tx.write(planted.key, create(text));
          wrote++;
        }
        return wrote;
      }),
    )
    .pipe(Effect.catchTag('KeyRefused', (err) => Effect.fail(importRaced(err))));

/** One run's record and asks imported in one transaction, then each file moved aside and its emptied folders removed. */
const runImported = (home: string, keyspace: Keyspace, run: ReturnType<typeof runFilesOf>['runs'][number]) =>
  Effect.gen(function* () {
    const read = yield* plantedTexts([...(run.record ? [run.record] : []), ...run.asks], run.record);
    const made = yield* writtenOnce(keyspace, read);
    yield* fromThrow(() => {
      for (const { planted } of read) moveAside(planted.file, planted.aside);
      for (const dir of [path.join(runsDir(home), `${run.id}.asks`, 'done'), path.join(runsDir(home), `${run.id}.asks`)])
        try {
          fs.rmdirSync(dir);
        } catch {}
    });
    return made;
  });

/** One claim imported where its run's record says it was started from its card, then moved aside, a stale one unimported. */
const claimImported = (keyspace: Keyspace, claim: ReturnType<typeof runFilesOf>['claims'][number]) =>
  Effect.gen(function* () {
    const text = yield* fromThrow(() => textOf(claim.file));
    if (text === undefined) return 0;
    const by = claimedBy(text);
    const record = by === undefined ? undefined : yield* keyspace.get(runKey(by));
    const made = record !== undefined && cardIn(record.value) === claim.card ? yield* writtenOnce(keyspace, [{ planted: claim, text }]) : 0;
    yield* fromThrow(() => moveAside(claim.file, claim.aside));
    return made;
  });

/**
 * Import a store's run files into its keyspace, once: each run's record and asks in one transaction, a key already held left as it is, then
 * every file read moved aside under `<root>/imported/`, never deleted; then each claim whose run's record holds that it was started from
 * its card, a stale one (its run gone, or from another card) moved aside unimported. An ask that does not read as JSON, or as the ask its
 * name says, stays where it is, and is said in the log. A record or an ask larger than a record holds stops the import before anything
 * moves: `Invalid`, naming the file. Answers how many records it made.
 * @param home The store's root folder.
 * @param keyspace The store's keyspace.
 */
export const runsImported = Effect.fnUntraced(function* (home: string, keyspace: Keyspace) {
  const { runs, claims } = runFilesOf(home);
  const every = [...runs.flatMap((r) => [...(r.record ? [r.record] : []), ...r.asks]), ...claims];
  const over = every.find((f) => (fs.statSync(f.file, { throwIfNoEntry: false })?.size ?? 0) > RECORD_CEILING);
  if (over !== undefined)
    return yield* new Invalid({
      message: `${over.file} is larger than a record of the keyspace holds (${RECORD_CEILING} bytes): nothing was imported or moved; move it aside and run again.`,
    });
  let made = 0;
  for (const run of runs) made += yield* runImported(home, keyspace, run);
  for (const claim of claims) made += yield* claimImported(keyspace, claim);
  return made;
});

/**
 * Where the store `home` keeps its run files stands, as the folders that hold them say it: the change time of `runs/` and of `started/`,
 * which a file made, renamed or removed in either moves. Read before each open, so a file planted since the last import is imported too.
 */
const plantedMark = (home: string) =>
  [runsDir(home), startedDir(home)].map((dir) => String(fs.statSync(dir, { bigint: true, throwIfNoEntry: false })?.mtimeNs ?? 0)).join(':');

/** The mark of each store's run folders as this process last imported them, by root. */
const IMPORTED = new Map<string, string>();

/** One import at a time, so two fibers opening one store import it once. */
const IMPORTING = Semaphore.makeUnsafe(1);

/**
 * The keyspace of the store `home`, its run files imported whenever the folders that hold them moved since this process last imported
 * them (`runsImported`): level-triggered, so a file an older process writes beside the keyspace is imported on the next open, and a file
 * already imported is gone from its folder, moved aside. The mark is read before the import, so a file planted while it runs is imported
 * by the next open, and the import's own moves cost one more pass that finds nothing. A failed import is not kept, so the next open
 * imports again.
 * @param home The store's root folder.
 */
const runKeyspace = (home: string) =>
  Effect.flatMap(keyspaceAt(keyspaceFile(home)), (keyspace) => {
    const due = () => IMPORTED.get(home) !== plantedMark(home);
    return Effect.flatMap(fromThrow(due), (stale) =>
      !stale
        ? Effect.succeed(keyspace)
        : IMPORTING.withPermits(1)(
            Effect.flatMap(fromThrow(due), (still) =>
              !still
                ? Effect.succeed(keyspace)
                : Effect.flatMap(
                    fromThrow(() => plantedMark(home)),
                    (mark) =>
                      Effect.map(runsImported(home, keyspace), () => {
                        IMPORTED.set(home, mark);
                        return keyspace;
                      }),
                  ),
            ),
          ),
    );
  });

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
const runKeyspaceHeld = (home: string) =>
  Effect.suspend(() => (!fs.existsSync(keyspaceFile(home)) && !runFilesPlanted(home) ? Effect.succeed(undefined) : runKeyspace(home)));

/**
 * The keyspace of the store `home` with its run files and then its run's marker files imported (`runKeyspace`, `RUN_MARK_FILES`).
 * @param home The store's root folder.
 */
export const markedKeyspace = (home: string) => Effect.flatMap(runKeyspace(home), () => kindKeyspace(home, RUN_MARK_FILES));

/**
 * The keyspace of the store `home` a read reads: undefined where the store has no keyspace file and no run or marker file to import.
 * @param home The store's root folder.
 */
export const markedKeyspaceHeld = (home: string) =>
  Effect.flatMap(runKeyspaceHeld(home), (ks) =>
    ks === undefined ? kindKeyspaceHeld(home, RUN_MARK_FILES) : kindKeyspace(home, RUN_MARK_FILES),
  );
