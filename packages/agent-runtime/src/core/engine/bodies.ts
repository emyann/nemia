/**
 * Bodies: a long text a store keeps once, named from a journal's entries by the sha256 of its UTF-8 (`BodyRef`), as a Pod's spec
 * names a ConfigMap rather than copying it.
 *
 * A store that keeps bodies holds a brief in parts, each part its text or `{ body }`, a schema an end is held to, a nudge and an
 * answer's text as references, each where the field it stands for was (`split`); `Journal.layer` puts every body before the line
 * that names it, and reads each line back as the event appended, key for key (`resolver`). A text under `BODY_MIN_BYTES`, or one
 * that is no well-formed UTF-16, stays in its line. Nothing removes a body but `removeBody` and `sweep` (`core/engine/sweep.ts`).
 */
import { Effect, Schema } from 'effect';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Event } from '../domain.ts';
import type { StoredEvent } from '../event-schema.ts';
import { readText } from './tally.ts';

/** A body's name: the sha256 of its text's UTF-8, in 64 lowercase hex digits. */
export type BodyRef = string;

/** The shape of a `BodyRef`. */
export const BODY_REF = /^[0-9a-f]{64}$/;

/** The size, in bytes of UTF-8, from which a text is kept as a body rather than in its line. */
export const BODY_MIN_BYTES = 1024;

/**
 * How long a body put stays out of `sweep`'s and `removeBody`'s reach, from its latest put: long enough for the line that names it,
 * written after it, to reach the journal.
 */
export const BODY_GRACE_MS = 24 * 60 * 60 * 1000;

/** A body store that failed: what it said. */
export class BodyError extends Schema.TaggedError<BodyError>()('BodyError', { message: Schema.String }) {}

/** A body not removed, and why: a journal still names it, it was put within the grace, or there is no such body. */
export class BodyRefused extends Schema.TaggedError<BodyRefused>()('BodyRefused', { message: Schema.String }) {}

/** One body a store holds: its reference, the time of its latest put in ms since the epoch, and its size in bytes. */
export type BodyEntry = { readonly ref: BodyRef; readonly atMs: number; readonly bytes: number };

/**
 * Where a store keeps its bodies, as a plain value: what a store adds to `JournalOps` to keep each long text once. An application
 * with its own database implements it beside its journal.
 */
export type BodyOps = {
  /** Keep `text` under `ref`, its sha256; a body already there keeps its text and takes the time of this put. */
  readonly put: (ref: BodyRef, text: string) => Effect.Effect<void, BodyError>;
  /** The text kept under `ref`, or `undefined` when there is none. */
  readonly get: (ref: BodyRef) => Effect.Effect<string | undefined, BodyError>;
  /** Remove the body under `ref` if its latest put is still before `before` (ms since the epoch): whether it was removed. */
  readonly remove: (ref: BodyRef, before: number) => Effect.Effect<boolean, BodyError>;
  /** Every body the store holds. */
  readonly list: Effect.Effect<readonly BodyEntry[], BodyError>;
  /** Optional: where a body is kept, named in the words of a body missing or altered. */
  readonly located?: (ref: BodyRef) => string;
};

/** The reference of `text`: the sha256 of its UTF-8. */
export const refOf = (text: string): BodyRef => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

const wellFormed = (text: string) => Buffer.from(text, 'utf8').toString('utf8') === text;

const failure = (cause: unknown) => new BodyError({ message: cause instanceof Error ? cause.message : String(cause) });

const missing = (cause: unknown) => (cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';

/**
 * Bodies as files, `<root>/bodies/<ref>`: a put writes a file beside it and renames it in, so a body is whole or absent, and a put
 * of one already there only sets its time. A read is counted (`io().reads`).
 */
export const filesBodies = (root: string): BodyOps => {
  const dir = path.join(root, 'bodies');
  const at = (ref: BodyRef) => path.join(dir, ref);
  return {
    located: at,
    put: (ref, text) =>
      Effect.try({
        try: () => {
          const now = new Date();
          try {
            fs.utimesSync(at(ref), now, now);
            return;
          } catch (cause) {
            if (!missing(cause)) throw cause;
          }
          fs.mkdirSync(dir, { recursive: true });
          const temp = path.join(dir, `.${ref}.${process.pid}.${crypto.randomUUID()}`);
          fs.writeFileSync(temp, text);
          fs.renameSync(temp, at(ref));
        },
        catch: failure,
      }),
    get: (ref) =>
      Effect.try({
        try: () => {
          try {
            return readText(at(ref));
          } catch (cause) {
            if (missing(cause)) return undefined;
            throw cause;
          }
        },
        catch: failure,
      }),
    remove: (ref, before) =>
      Effect.try({
        try: () => {
          const stat = fs.statSync(at(ref), { throwIfNoEntry: false });
          if (!stat || stat.mtimeMs >= before) return false;
          fs.unlinkSync(at(ref));
          return true;
        },
        catch: failure,
      }),
    list: Effect.try({
      try: () =>
        (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
          .filter((name) => BODY_REF.test(name))
          .flatMap((ref) => {
            const stat = fs.statSync(at(ref), { throwIfNoEntry: false });
            return stat ? [{ ref, atMs: stat.mtimeMs, bytes: stat.size }] : [];
          }),
      catch: failure,
    }),
  };
};

/** Bodies in memory, for tests: each with the time of its latest put. */
export const memoryBodies = (): BodyOps => {
  const kept = new Map<BodyRef, { text: string; atMs: number }>();
  return {
    put: (ref, text) => Effect.sync(() => void kept.set(ref, { text: kept.get(ref)?.text ?? text, atMs: Date.now() })),
    get: (ref) => Effect.sync(() => kept.get(ref)?.text),
    remove: (ref, before) =>
      Effect.sync(() => {
        const body = kept.get(ref);
        return body !== undefined && body.atMs < before && kept.delete(ref);
      }),
    list: Effect.sync(() => [...kept].map(([ref, { text, atMs }]) => ({ ref, atMs, bytes: Buffer.byteLength(text) }))),
  };
};

/** What a field kept as a body is stored as, and the field it is read back as. */
const STANDS_FOR = { briefParts: 'brief', closeoutSchemaBody: 'closeoutSchema', nudgeBody: 'nudge', textBody: 'text' } as const;

/** `entry`'s keys in order, each key `swaps` names replaced in its place by the fields it maps to. */
const swapped = (entry: object, swaps: Record<string, Record<string, unknown>>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (Object.hasOwn(swaps, key)) Object.assign(out, swaps[key]);
    else out[key] = value;
  }
  return out;
};

/**
 * An event as a store that keeps bodies holds it, and the bodies it names. A `filed` brief becomes `briefParts` — `parts` when they
 * join into the brief, else the brief as one part — each part long enough a `{ body }`; its schema an end is held to, as JSON, a
 * `closeoutSchemaBody`; a `starting` nudge a `nudgeBody`; an `input`'s text a `textBody`. A field none of whose text is long enough
 * stays as it is, and an event with none is given back as it came.
 */
export const split = (event: Event, parts?: readonly string[]): { entry: Event | StoredEvent; bodies: Map<BodyRef, string> } => {
  const bodies = new Map<BodyRef, string>();
  const keep = (text: string): BodyRef | undefined => {
    if (Buffer.byteLength(text) < BODY_MIN_BYTES || !wellFormed(text)) return undefined;
    const ref = refOf(text);
    bodies.set(ref, text);
    return ref;
  };
  const swaps: Record<string, Record<string, unknown>> = {};
  const swap = (key: string, as: string, text: string | undefined) => {
    const ref = text === undefined ? undefined : keep(text);
    if (ref) swaps[key] = { [as]: ref };
  };
  if (event.kind === 'filed') {
    const cut = parts?.join('') === event.brief ? parts : [event.brief];
    const stored = cut.map((part) => {
      const ref = keep(part);
      return ref ? { body: ref } : part;
    });
    if (stored.some((part) => typeof part !== 'string')) swaps.brief = { briefParts: stored };
    if (event.closeoutSchema !== undefined) swap('closeoutSchema', 'closeoutSchemaBody', JSON.stringify(event.closeoutSchema));
  }
  if (event.kind === 'starting') swap('nudge', 'nudgeBody', event.nudge);
  if (event.kind === 'input') swap('text', 'textBody', event.text);
  return { entry: Object.keys(swaps).length ? (swapped(event, swaps) as StoredEvent) : event, bodies };
};

/** The bodies `entry` names, as a store holds it, in the order of its keys: anything that is no entry names none. */
export const refsOf = (entry: unknown): BodyRef[] => {
  if (typeof entry !== 'object' || entry === null) return [];
  const fields = entry as Record<string, unknown>;
  const parts = Array.isArray(fields.briefParts) ? (fields.briefParts as unknown[]) : [];
  const named = parts.map((part) => (typeof part === 'object' && part !== null ? (part as { body?: unknown }).body : undefined));
  named.push(fields.closeoutSchemaBody, fields.nudgeBody, fields.textBody);
  return named.filter((ref): ref is BodyRef => typeof ref === 'string');
};

/** A stored entry read back: a `filed` event with its brief and an `input` with its text, whatever the store held. */
export type Resolved =
  | Exclude<StoredEvent, { kind: 'filed' | 'input' }>
  | (Extract<StoredEvent, { kind: 'filed' }> & { brief: string })
  | (Extract<StoredEvent, { kind: 'input' }> & { text: string });

/** Whether `entry` must be read back before it is an event: it names a body, or lacks the text a body would stand for. */
const unresolved = (entry: StoredEvent) =>
  Object.keys(STANDS_FOR).some((key) => Object.hasOwn(entry, key)) ||
  (entry.kind === 'filed' && entry.brief === undefined) ||
  (entry.kind === 'input' && entry.text === undefined);

/**
 * A reader of stored entries through `bodies`, or through none for a store that keeps none: each entry naming a body comes back with
 * the text in the field's place, its other keys in their order; any other entry comes back as it is. A body read is kept by its
 * reference, and each entry read back by the entry, for the reader's life, so a reread reads nothing.
 *
 * Refuses, with a `BodyError` saying what to do, a body missing or whose text is not the one its reference names, a reference read
 * from a store that keeps no bodies, and a `filed` event with no brief or an `input` with no text.
 */
export const resolver = (bodies: BodyOps | undefined) => {
  const texts = new Map<BodyRef, string>();
  const done = new WeakMap<object, Resolved>();
  const where = (ref: BodyRef) => `body ${ref}${bodies?.located ? ` (${bodies.located(ref)})` : ''}`;
  const text = (ref: BodyRef): Effect.Effect<string, BodyError> => {
    const known = texts.get(ref);
    if (known !== undefined) return Effect.succeed(known);
    if (!bodies) return Effect.fail(new BodyError({ message: `names ${where(ref)}, and this store keeps no bodies: read it with the store that wrote it.` }));
    return Effect.flatMap(bodies.get(ref), (got) => {
      if (got === undefined) return Effect.fail(new BodyError({ message: `names ${where(ref)}, which is missing: restore it from a backup of the store.` }));
      if (refOf(got) !== ref) {
        return Effect.fail(new BodyError({ message: `names ${where(ref)}, which holds another text than its reference names: restore it from a backup of the store.` }));
      }
      texts.set(ref, got);
      return Effect.succeed(got);
    });
  };
  const field = (key: keyof typeof STANDS_FOR, value: unknown): Effect.Effect<unknown, BodyError> => {
    if (key !== 'briefParts') return key === 'closeoutSchemaBody' ? Effect.map(text(value as BodyRef), (json) => JSON.parse(json) as unknown) : text(value as BodyRef);
    return Effect.map(
      Effect.forEach(value as (string | { body: BodyRef })[], (part) => (typeof part === 'string' ? Effect.succeed(part) : text(part.body))),
      (texts) => texts.join(''),
    );
  };
  const read = Effect.fn('resolve')(function* (entry: StoredEvent) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry)) {
      if (Object.hasOwn(STANDS_FOR, key)) out[STANDS_FOR[key as keyof typeof STANDS_FOR]] = yield* field(key as keyof typeof STANDS_FOR, value);
      else out[key] = value;
    }
    if (out.kind === 'filed' && typeof out.brief !== 'string') return yield* Effect.fail(new BodyError({ message: 'is a `filed` event with no `brief` and no `briefParts`: take it out.' }));
    if (out.kind === 'input' && typeof out.text !== 'string') return yield* Effect.fail(new BodyError({ message: 'is an `input` with no `text` and no `textBody`: take it out.' }));
    const resolved = out as Resolved;
    done.set(entry, resolved);
    return resolved;
  });
  return {
    /** Whether any of `entries` must be read back before it is an event. */
    needed: (entries: readonly StoredEvent[]) => entries.some(unresolved),
    /** `entry` read back, its bodies' texts in their fields' places. */
    resolve: (entry: StoredEvent): Effect.Effect<Resolved, BodyError> => {
      if (!unresolved(entry)) return Effect.succeed(entry as Resolved);
      const known = done.get(entry);
      return known ? Effect.succeed(known) : read(entry);
    },
  };
};
