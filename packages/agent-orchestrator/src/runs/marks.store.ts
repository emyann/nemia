/**
 * A person's markers beside a run in the keyspace (`src/keyspace/keyspace.store.ts`): under `/registry/runmarks/<id>/` a run's
 * cancellation,
 * pruning, hold, who lifted it, labels, refresh ask and each word said to a step before it was filed (`run-keys.ts`), each the text its
 * file held, and `nemia rm`'s marker at `/registry/forgetting/<id>`, outside them, since it outlives the run's record. Each write that
 * reads first is one transaction asking the marks' machine (`runMarkMove`). A store kept before them has its marker files imported by the
 * kind `RUN_MARK_FILES`, moved aside under `<root>/imported/`, never deleted. The Run door (`records.store.ts`) composes them onto each
 * run.
 */
import path from 'node:path';
import { Effect, Option, Schema } from 'effect';
import type { Actor } from 'objects';
import { asideOf, entriesIn, namesIn, type ImportKind } from '../keyspace/import.store.ts';
import { KeyRefused, type KeyRecord, type Keyspace, type KeyTxn } from '../keyspace/keyspace.store.ts';
import { pauseStands } from '../pause/pause.store.ts';
import { Conflict, type Refusal } from '../refusal/refusal.ts';
import type { Labels } from '../labels/labels.ts';
import { dropFiles, filesAt } from '../record/files.store.ts';
import { assigneeIn, cancelledIn, holdIn, isSaid, labelsIn, prunedIn, runsDir, type RunMarks } from '../record/record.store.ts';
import type { Assignee, Hold, Pruned, RunStore, SaidBefore } from '../record/record.ts';
import { fromThrow, type DoorOf } from '../door/door.store.ts';
import { runMarkMove, runMarkOf } from '../run-marks/run-marks.ts';
import type { RunId } from '../record/record.model.ts';
import {
  forgettingKey,
  FORGETTING_PREFIX,
  RUN_MARKERS,
  runMarkKey,
  runMarksPrefix,
  saidKey,
  saidPrefix,
  type RunMarker,
} from './run-keys.ts';

/** The Run door's shape: each method of the run store answering an Effect, a run's id taken as `RunId`. */
type Shape = DoorOf<RunStore, RunId>;

/**
 * A write that makes its key.
 * @param value The text the key holds.
 */
export const create = (value: string) => ({ verb: 'create', expected: null, value }) as const;

/**
 * A write that overwrites its key, naming no revision.
 * @param value The text the key holds.
 */
export const overwrite = (value: string) => ({ verb: 'update', expected: null, value }) as const;

/** A write that deletes its key, naming no revision. */
export const remove = { verb: 'delete', expected: null, value: '' } as const;

/**
 * A keyspace's refusal of a write the door did not foresee, as a refusal naming its key.
 * @param err The keyspace's refusal.
 */
export const raced = (err: { readonly key: string }) =>
  new Conflict({ message: `${err.key} changed while it was written: run the command again.` }) satisfies Refusal as Refusal;

/** The keyspace a write writes, opened and its files imported. */
export type Opened = Effect.Effect<Keyspace, Refusal>;

/** The keyspace a read reads, or undefined where there is none. */
export type Held = Effect.Effect<Keyspace | undefined, Refusal>;

/**
 * A keyspace's refusal inside a transaction, as the door's `raced` refusal.
 * @param effect The program run in the transaction.
 */
export const racedOn = <A, E, R>(effect: Effect.Effect<A, E | KeyRefused, R>) =>
  Effect.catchIf(
    effect,
    (err): err is KeyRefused => err instanceof KeyRefused,
    (err) => Effect.fail(raced(err)),
  );

/**
 * A run's markers as `records`, those listed under its marks prefix, hold them.
 * @param id The run's id.
 * @param records The records listed under the run's marks prefix.
 */
export const marksFrom = (id: string, records: readonly KeyRecord[]) => {
  const prefix = runMarksPrefix(id);
  const text: Partial<Record<RunMarker, string>> = {};
  const said: { n: number; text: string }[] = [];
  for (const r of records) {
    const name = r.key.slice(prefix.length);
    if (name.startsWith('said/')) said.push({ n: Number(name.slice('said/'.length)), text: r.value });
    else if ((RUN_MARKERS as readonly string[]).includes(name)) text[name as RunMarker] = r.value;
  }
  return { ...text, said: said.sort((a, b) => a.n - b.n).map((w) => w.text) } satisfies RunMarks;
};

/**
 * Whether `id` names a key of its own under the prefix: one holding a `/` would name another's, or an ask's, so names no run.
 * @param id The run's id.
 */
export const ownKey = (id: string) => id !== '' && !id.includes('/');

/** The marks a run carries now, by which of its three records are there, in a transaction `tx`. */
const marksIn = (tx: KeyTxn, id: string) =>
  Effect.gen(function* () {
    const [cancelled, pruned, held] = [
      yield* tx.get(runMarkKey(id, 'cancelled')),
      yield* tx.get(runMarkKey(id, 'pruned')),
      yield* tx.get(runMarkKey(id, 'hold')),
    ];
    return runMarkOf({ cancelled: cancelled !== undefined, pruned: pruned !== undefined, held: held !== undefined });
  });

/** A write of `value` at `key` in `tx`: over the record there, or making it. */
const put = (tx: KeyTxn, key: string, value: string) =>
  Effect.flatMap(tx.get(key), (there) => tx.write(key, there === undefined ? create(value) : overwrite(value)));

/** The record at `key` taken away in `tx`, whether it was there. */
const drop = (tx: KeyTxn, key: string) =>
  Effect.flatMap(tx.get(key), (there) => (there === undefined ? Effect.succeed(false) : Effect.as(tx.write(key, remove), true)));

/** What `nemia rm` writes of a run it forgets: any key beside these is left unread. */
const forgettingIn = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ run: Schema.String, taskIds: Schema.Array(Schema.String) })),
);

/** What a marker method needs: where to write inside one transaction, and where to read. */
type Marking = {
  readonly inside: <A>(body: (tx: KeyTxn) => Effect.Effect<A, KeyRefused>) => Effect.Effect<A, Refusal>;
  readonly held: Held;
};

/** Whether the keyspace read holds `key` of the run `id`, false where there is no keyspace or `id` names no key of its own. */
const holds = (held: Held, id: string, key: string) =>
  Effect.flatMap(held, (ks) =>
    ks === undefined || !ownKey(id) ? Effect.succeed(false) : Effect.map(ks.get(key), (there) => there !== undefined),
  );

/** The run's hold, put and lifted as the machine allows. */
const holdMethods = ({ inside, held }: Marking) =>
  ({
    lift: (id, at, actor?: Actor) =>
      inside((tx) =>
        Effect.gen(function* () {
          if (runMarkMove(yield* marksIn(tx, id), 'lift').kind !== 'edge') return false;
          const there = yield* tx.get(runMarkKey(id, 'hold'));
          if (there === undefined || holdIn(there.value).at !== at) return false;
          if (actor) yield* put(tx, runMarkKey(id, 'unheld'), JSON.stringify({ since: at, actor }, null, 2));
          yield* tx.write(runMarkKey(id, 'hold'), remove);
          return true;
        }),
      ),
    put: (id, until, said) =>
      inside((tx) =>
        Effect.gen(function* () {
          if (runMarkMove(yield* marksIn(tx, id), 'hold').kind !== 'edge') return null as Hold | null;
          const { why, by, actor } = said;
          const hold: Hold = {
            at: new Date().toISOString(),
            until: [...until],
            ...(why ? { why } : {}),
            ...(by ? { by } : {}),
            ...(actor ? { actor } : {}),
          };
          yield* tx.write(runMarkKey(id, 'hold'), create(JSON.stringify(hold, null, 2)));
          return hold;
        }),
      ),
    stands: (id) => holds(held, id, runMarkKey(id, 'hold')),
  }) satisfies Shape['holds'];

/** The run's assignee: put exclusively, ended only while the one put at `at` stands, its receipt written in the same transaction. */
const assigneeMethods = ({ inside, held }: Marking) =>
  ({
    put: (id, said) =>
      inside((tx) =>
        Effect.gen(function* () {
          if ((yield* tx.get(runMarkKey(id, 'assignee'))) !== undefined) return null as Assignee | null;
          const { forMs, name, why, actor } = said;
          const assignee: Assignee = {
            at: new Date().toISOString(),
            forMs,
            ...(name ? { name } : {}),
            ...(why ? { why } : {}),
            ...(actor ? { actor } : {}),
          };
          yield* tx.write(runMarkKey(id, 'assignee'), create(JSON.stringify(assignee, null, 2)));
          return assignee;
        }),
      ),
    end: (id, at, how, actor?: Actor) =>
      inside((tx) =>
        Effect.gen(function* () {
          const there = yield* tx.get(runMarkKey(id, 'assignee'));
          if (there === undefined || assigneeIn(there.value).at !== at) return false;
          yield* put(tx, runMarkKey(id, 'unassigned'), JSON.stringify({ since: at, how, ...(actor ? { actor } : {}) }, null, 2));
          yield* tx.write(runMarkKey(id, 'assignee'), remove);
          return true;
        }),
      ),
    stands: (id) => holds(held, id, runMarkKey(id, 'assignee')),
  }) satisfies Shape['assignees'];

/** What `nemia rm` wrote down of the tasks of a run it forgets. */
const forgettingMethods = ({ inside, held }: Marking) =>
  ({
    write: (id, taskIds) =>
      inside((tx) => Effect.asVoid(put(tx, forgettingKey(id), JSON.stringify({ run: id, taskIds: [...taskIds] }, null, 2)))),
    read: (id) =>
      Effect.flatMap(held, (ks) =>
        ks === undefined || !ownKey(id)
          ? Effect.succeed(undefined as string[] | undefined)
          : Effect.map(ks.get(forgettingKey(id)), (there) => {
              const marker = there === undefined ? undefined : Option.getOrUndefined(forgettingIn(there.value));
              return marker !== undefined && marker.run === id ? [...marker.taskIds] : undefined;
            }),
      ),
    list: () =>
      Effect.flatMap(held, (ks) =>
        ks === undefined
          ? Effect.succeed([] as string[])
          : Effect.map(ks.keys(FORGETTING_PREFIX), (keys) => keys.map((k) => k.slice(FORGETTING_PREFIX.length)).sort()),
      ),
    lift: (id) =>
      Effect.flatMap(held, (ks) =>
        ks === undefined || !ownKey(id) ? Effect.void : Effect.asVoid(racedOn(ks.within((tx) => drop(tx, forgettingKey(id))))),
      ),
    where: (id) => Effect.succeed(forgettingKey(id)),
  }) satisfies Shape['forgetting'];

/** The words said to a step, the labels and the refresh ask of a run. */
const smallMethods = ({ inside, held }: Marking) =>
  ({
    said: {
      put: (id, step, text) =>
        inside((tx) =>
          Effect.gen(function* () {
            const taken = (yield* tx.list(saidPrefix(id))).map((r) => Number(r.key.slice(saidPrefix(id).length)));
            const kept = { at: new Date().toISOString(), text } satisfies SaidBefore;
            yield* tx.write(saidKey(id, Math.max(0, ...taken) + 1), create(JSON.stringify({ step, ...kept }, null, 2)));
            return kept;
          }),
        ),
    },
    labels: {
      put: (id, labels: Labels) =>
        inside((tx) =>
          Object.keys(labels).length === 0
            ? Effect.asVoid(drop(tx, runMarkKey(id, 'labels')))
            : Effect.asVoid(put(tx, runMarkKey(id, 'labels'), JSON.stringify(labels, null, 2))),
        ),
    },
    refresh: {
      put: (id) =>
        inside((tx) =>
          Effect.gen(function* () {
            if ((yield* tx.get(runMarkKey(id, 'refresh'))) !== undefined) return null;
            const ask = { at: new Date().toISOString() };
            yield* tx.write(runMarkKey(id, 'refresh'), create(JSON.stringify(ask, null, 2)));
            return ask;
          }),
        ),
      lift: (id) => inside((tx) => drop(tx, runMarkKey(id, 'refresh'))),
      stands: (id) => holds(held, id, runMarkKey(id, 'refresh')),
    },
  }) satisfies Pick<Shape, 'said' | 'labels' | 'refresh'>;

/** The run's cancellation and pruning, and whether it was called off. */
const calledMethods = (home: string, { inside, held }: Marking) =>
  ({
    calledOff: (id) =>
      Effect.gen(function* () {
        const ks = yield* held;
        const keys = ks === undefined || !ownKey(id) ? [] : yield* ks.keys(runMarksPrefix(id));
        const called = (['cancelled', 'pruned', 'hold'] as const).some((marker) => keys.includes(runMarkKey(id, marker)));
        return called || (yield* fromThrow(() => pauseStands(home)));
      }),
    cancel: (id, actor?: Actor) =>
      inside((tx) =>
        Effect.gen(function* () {
          const at = new Date().toISOString();
          if (runMarkMove(yield* marksIn(tx, id), 'cancel').kind !== 'edge') {
            const there = yield* tx.get(runMarkKey(id, 'cancelled'));
            return (there && cancelledIn(there.value).at) || at;
          }
          yield* tx.write(runMarkKey(id, 'cancelled'), create(actor ? JSON.stringify({ at, actor }) : at));
          return at;
        }),
      ),
    prune: (id, marker?: Pruned) =>
      inside((tx) =>
        Effect.gen(function* () {
          if (runMarkMove(yield* marksIn(tx, id), marker ? 'prune' : 'unprune').kind === 'refused') return;
          if (marker) yield* put(tx, runMarkKey(id, 'pruned'), JSON.stringify(marker, null, 2));
          else yield* drop(tx, runMarkKey(id, 'pruned'));
        }),
      ),
    pruned: (id) =>
      Effect.flatMap(held, (ks) =>
        ks === undefined || !ownKey(id)
          ? Effect.succeed(undefined as Pruned | undefined)
          : Effect.map(ks.get(runMarkKey(id, 'pruned')), (there) => (there === undefined ? undefined : prunedIn(there.value))),
      ),
  }) satisfies Pick<Shape['runs'], 'calledOff' | 'cancel' | 'prune' | 'pruned'>;

/**
 * The Run door's markers beside a run: records written in `open`, read from `held`; the store's pause and a run's files directory are read
 * in `home`.
 * @param home The store's root folder.
 * @param open The keyspace a write writes, opened and its files imported.
 * @param held The keyspace a read reads, or undefined where there is none.
 */
export function markerMethods(home: string, open: Opened, held: Held) {
  const marking = {
    inside: <A>(body: (tx: KeyTxn) => Effect.Effect<A, KeyRefused>) => Effect.flatMap(open, (ks) => racedOn(ks.within(body))),
    held,
  } satisfies Marking;
  const { said, labels, refresh } = smallMethods(marking);
  return {
    ...calledMethods(home, marking),
    filesAt: (id: string) => fromThrow(() => filesAt(home, id)),
    dropFiles: (id: string) => fromThrow(() => dropFiles(home, id)),
    holds: holdMethods(marking),
    assignees: assigneeMethods(marking),
    said,
    labels,
    refresh,
    forgetting: forgettingMethods(marking),
  };
}

/** Where `nemia rm` wrote down the engine's tasks of the runs it forgot, `forgetting/<id>.json` each. */
const forgettingAt = (home: string) => path.join(home, 'forgetting');

/** The marker files a run had beside its record, by the ending its file's name has: what the kind's import reads. */
const MARKER_ENDINGS = RUN_MARKERS.map((marker) => ({ marker, end: `.${marker}` }));

/**
 * The entries of `runs/` that are no marker, no record, no asks folder and no run's own directory: a name with a `.` in it the import
 * never takes up.
 */
const strayMarks = (home: string) =>
  entriesIn(runsDir(home))
    .filter((entry) => !entry.startsWith('.') && entry.includes('.'))
    .filter((entry) => !entry.endsWith('.json') && !entry.endsWith('.asks') && !entry.endsWith('.said'))
    .filter((entry) => !MARKER_ENDINGS.some(({ end }) => entry.endsWith(end)))
    .map((entry) => ({
      entry: path.join(runsDir(home), entry),
      why: 'a run keeps a file beside its record only as one of its markers (cancelled, pruned, hold, unheld, assignee, unassigned, labels, refresh, said)',
    }));

/**
 * How a marker's file reads as its record: its text, but for the labels, which must be a JSON object of strings for the run to be read
 * labelled by them.
 */
const markerRead = (marker: RunMarker) => (text: string) =>
  marker === 'labels' && labelsIn(text) === undefined && text.trim() !== '{}'
    ? { unreadable: 'it is no JSON object of strings' }
    : { value: text };

/**
 * The marker files of a store from before the keyspace: each `runs/<id>.<marker>` (`cancelled`, `pruned`, `hold`, `unheld`, `assignee`,
 * `unassigned`,
 * `labels`, `refresh`) at `/registry/runmarks/<id>/<marker>`, each word of `runs/<id>.said/<n>.json` at `.../said/<n>`, and each
 * `forgetting/<id>.json`
 * of a run `nemia rm` forgot at `/registry/forgetting/<id>`: what the kind's import takes up, in the text each held. A labels file that
 * is no
 * object of strings, a word that is no `{ step, at, text }` and a forgetting file naming another run stay where they are, said in the
 * log, as
 * does each other file beside a run's record (`strays`).
 */
export const RUN_MARK_FILES: ImportKind = {
  name: 'run-marks',
  folders: (home) => [runsDir(home), forgettingAt(home)],
  files: (home) => [
    ...MARKER_ENDINGS.flatMap(({ marker, end }) =>
      namesIn(runsDir(home), end)
        .filter((id) => id !== '')
        .map((id) => {
          const file = path.join(runsDir(home), `${id}${end}`);
          return { file, key: runMarkKey(id, marker), aside: asideOf(home, file), read: markerRead(marker) };
        }),
    ),
    ...entriesIn(runsDir(home))
      .filter((entry) => entry.endsWith('.said') && entry !== '.said')
      .flatMap((entry) => {
        const id = entry.slice(0, -'.said'.length);
        return entriesIn(path.join(runsDir(home), entry)).flatMap((name) => {
          const [, n] = /^(\d+)\.json$/.exec(name) ?? [];
          if (n === undefined) return [];
          const file = path.join(runsDir(home), entry, name);
          return [
            {
              file,
              key: saidKey(id, Number(n)),
              aside: asideOf(home, file),
              read: (text: string) =>
                isSaid(text) ? { value: text } : { unreadable: 'it is no word kept for a step ({ step, at, text })' },
            },
          ];
        });
      }),
    ...entriesIn(forgettingAt(home))
      .filter((entry) => entry.endsWith('.json') && !entry.startsWith('.'))
      .map((entry) => {
        const id = entry.slice(0, -'.json'.length);
        const file = path.join(forgettingAt(home), entry);
        return {
          file,
          key: forgettingKey(id),
          aside: asideOf(home, file),
          read: (text: string) => {
            const marker = Option.getOrUndefined(forgettingIn(text));
            return marker !== undefined && marker.run === id ? { value: text } : { unreadable: 'it is no marker of its run' };
          },
        };
      }),
  ],
  strays: strayMarks,
};
