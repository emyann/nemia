/**
 * The keyspace's records of the runs' observed status (`/registry/runstatus/<id>`, `run-status.ts`) in the store `StoreRoot` names:
 * written by the daemon's pass alone (`runStatusesWritten`), read by whoever serves the runs (`runStatusesHeld`). A record is written only
 * where it differs from what the keyspace holds (`recordDue`, the times measured to the read left out of what is compared), one that no
 * run stands for is deleted, all in one transaction, so a revision moves exactly when a run's status does. A GET writes nothing here.
 */
import { Effect, Option, Schema } from 'effect';
import { isObject } from 'effect/Predicate';
import { StoreRoot } from '../config/root.store.ts';
import { keyspaceAt, keyspaceFile, RECORD_CEILING } from '../keyspace/keyspace.store.ts';
import { recordDue } from '../observed/observed.ts';
import { RUNSTATUS_PREFIX, runStatusKey } from '../runs/run-keys.ts';
import { comparedText, type StatusRecord } from './run-status.ts';

/** A value as the JSON it is, or none where it is no JSON. */
const unknownIn = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));

/**
 * The record `value` is, or null where it is no record this pass wrote.
 * @param value The text of a record of `/registry/runstatus/`.
 */
export const recordIn = (value: string) => {
  const read = unknownIn(value);
  if (Option.isNone(read) || !isObject(read.value) || !isObject(read.value['spec']) || !isObject(read.value['status'])) return null;
  return read.value as StatusRecord;
};

/** The text two records are compared by, of a value the keyspace holds: its compared text where it reads, else the text itself. */
const heldCompared = (value: string) => {
  const record = recordIn(value);
  return record === null ? value : comparedText(record);
};

/**
 * Each run's observed status written where it differs from the keyspace's record of it (`recordDue`), the record of every run not in
 * `observed` deleted, all in one transaction. A status whose record would pass what a record holds (`RECORD_CEILING`) is left unwritten,
 * its run served as one with no record, and named in the log. A write another hand raced is left to the next pass.
 * @param observed The status of each run the pass judged, by the run's id.
 */
export const runStatusesWritten = Effect.fn('runStatusesWritten')(function* (observed: ReadonlyMap<string, StatusRecord>) {
  const home = yield* StoreRoot;
  const keyspace = yield* keyspaceAt(keyspaceFile(home));
  const wanted = new Map<string, { text: string; compared: string }>();
  for (const [id, record] of observed) {
    const text = JSON.stringify(record);
    if (Buffer.byteLength(text) > RECORD_CEILING) {
      yield* Effect.logWarning(
        `the observed status of run ${id} is larger than a record holds (${RECORD_CEILING} bytes): it is served as a run with no record, judged on each read, and moves no revision`,
      );
      continue;
    }
    wanted.set(runStatusKey(id), { text, compared: comparedText(record) });
  }
  return yield* keyspace
    .within((tx) =>
      Effect.gen(function* () {
        const held = new Map((yield* tx.list(RUNSTATUS_PREFIX)).map((r) => [r.key, r] as const));
        let written = 0;
        for (const key of new Set([...held.keys(), ...wanted.keys()])) {
          const record = held.get(key);
          const now = wanted.get(key);
          const due = recordDue(record === undefined ? null : heldCompared(record.value), now?.compared ?? null);
          if ('keep' in due) continue;
          yield* tx.write(key, { verb: due.write, expected: record?.revision ?? null, value: now?.text ?? '' });
          written += 1;
        }
        return written;
      }),
    )
    .pipe(Effect.catchTag('KeyRefused', () => Effect.succeed(0)));
});

/** A run's observed status as the keyspace holds it, and the revision it is at. */
export type StatusHeld = { readonly record: StatusRecord; readonly revision: number };

/** Every run's observed status the keyspace holds, by the run's id: a value that reads as no record is left out. */
export const runStatusesHeld = Effect.fn('runStatusesHeld')(function* () {
  const home = yield* StoreRoot;
  const keyspace = yield* keyspaceAt(keyspaceFile(home)).pipe(Effect.orDie);
  const { records } = yield* keyspace.list(RUNSTATUS_PREFIX);
  const held = new Map<string, StatusHeld>();
  for (const { key, value, revision } of records) {
    const record = recordIn(value);
    if (record !== null) held.set(key.slice(RUNSTATUS_PREFIX.length), { record, revision });
  }
  return held;
});
