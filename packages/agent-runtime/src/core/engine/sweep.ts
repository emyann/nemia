/**
 * Removing a body nothing names: the one way a body goes. Each call reads the world — every reference in every journal and in the
 * feed from its start, and every body's time — and carries nothing to the next.
 */
import { Effect } from 'effect';
import type { BodiedJournalOps, JournalError, SweepReport } from './journal.ts';
import { BODY_GRACE_MS, BODY_REF, BodyRefused, refsOf, type BodyEntry, type BodyError, type BodyRef } from './bodies.ts';

/** Who names a body first: a task's journal, or the feed's entry for a task. */
type Referrers = Map<BodyRef, string>;

/** Every body a task's journal names, with the first task whose journal names it, in words, put into `named`. */
const journalsNaming = Effect.fn('journalsNaming')(function* (ops: BodiedJournalOps, named: Referrers) {
  for (const taskId of yield* ops.list) {
    for (const ref of (yield* ops.read(taskId)).flatMap(refsOf)) if (!named.has(ref)) named.set(ref, `task ${taskId}'s journal`);
  }
});

/** Every body a feed entry names, with the first entry's task, in words, put into `named` where nothing named it before. */
const feedNaming = Effect.fn('feedNaming')(function* (ops: BodiedJournalOps, named: Referrers) {
  for (const entry of (yield* ops.feed(0)).entries) {
    const { taskId, event } = (typeof entry === 'object' && entry !== null ? entry : {}) as { taskId?: unknown; event?: unknown };
    for (const ref of refsOf(event)) if (!named.has(ref)) named.set(ref, `the feed's entry for task ${String(taskId)}`);
  }
});

/** Every body a journal or the feed names, with the first that names it, in words. */
const referrers = Effect.fn('referrers')(function* (ops: BodiedJournalOps) {
  const named: Referrers = new Map();
  yield* journalsNaming(ops, named);
  yield* feedNaming(ops, named);
  return named;
});

const at = (ms: number) => new Date(ms).toISOString();

/**
 * The bodies of `ops` no journal and no feed entry names, put more than `BODY_GRACE_MS` ago: counted with their bytes, and, given
 * `yes`, removed, each only if no put came since it was listed, a body put again counted as kept.
 */
export const sweep = Effect.fn('sweep')(function* (ops: BodiedJournalOps, options: { yes?: boolean } = {}) {
  const named = yield* referrers(ops);
  const before = Date.now() - BODY_GRACE_MS;
  const listed = yield* ops.bodies.list;
  const removable = listed.filter((body) => !named.has(body.ref) && body.atMs < before);
  const removed: BodyEntry[] = [];
  if (options.yes) for (const body of removable) if (yield* ops.bodies.remove(body.ref, before)) removed.push(body);
  const report: SweepReport = {
    removable: removable.length,
    bytes: removable.reduce((sum, body) => sum + body.bytes, 0),
    kept: listed.length - (options.yes ? removed : removable).length,
    removed: removed.length,
    removedBytes: removed.reduce((sum, body) => sum + body.bytes, 0),
  };
  return report;
});

/**
 * Remove the body `ref` of `ops`. Refused, saying what to do, when `ref` is no reference, there is no such body, a journal or the
 * feed names it, or it was put within the grace.
 */
export const removeBody = Effect.fn('removeBody')(function* (
  ops: BodiedJournalOps,
  ref: BodyRef,
): Effect.fn.Return<void, JournalError | BodyError | BodyRefused> {
  if (typeof ref !== 'string' || !BODY_REF.test(ref)) {
    return yield* Effect.fail(
      new BodyRefused({
        message: `${JSON.stringify(ref)} is no body's reference: give the sha256 of its text, in 64 lowercase hex digits, as a journal names it.`,
      }),
    );
  }
  const body = (yield* ops.bodies.list).find((listed) => listed.ref === ref);
  if (!body) return yield* Effect.fail(new BodyRefused({ message: `There is no body ${ref} in this store: nothing to remove.` }));
  const named = (yield* referrers(ops)).get(ref);
  if (named) {
    return yield* Effect.fail(
      new BodyRefused({
        message: `Body ${ref} is still named by ${named}, and a body is removed only once no journal and no feed entry names it: leave it.`,
      }),
    );
  }
  const before = Date.now() - BODY_GRACE_MS;
  if (body.atMs >= before) {
    return yield* Effect.fail(
      new BodyRefused({
        message: `Body ${ref} was put at ${at(body.atMs)}, within the grace of a put whose line may still be on its way: remove it after ${at(body.atMs + BODY_GRACE_MS)}.`,
      }),
    );
  }
  if (!(yield* ops.bodies.remove(ref, before))) {
    return yield* Effect.fail(
      new BodyRefused({ message: `Body ${ref} was put again while it was being removed, and is kept: run it again after the grace.` }),
    );
  }
});
