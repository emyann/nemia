/**
 * The delivery of a chat's outbox to its long-lived task: each entry the person wrote and no mark names yet, said to the task in the
 * words that frame it (`framedForHer`), then marked. Before it says, it looks in what the runtime journalled as said (`state.said`) for
 * the entry's words said since it was written and claimed by no mark, and marks that one without saying again: a delivery cut between
 * the say and the mark is finished, never repeated. Level-triggered: it reads the files and the task's record each time, and carries
 * nothing between calls.
 *
 * A controller: it reaches the runtime through the client, and is the one writer of the delivered marks (`appendDelivered`).
 */
import { Effect } from 'effect';
import { EngineService, asked } from '../runtime-client.ts';
import { appendDelivered, readDelivered, readOutbox } from './chat.store.ts';
import { framedForHer, type SourceSaid } from './chat.ts';

/**
 * What one delivery did: the entries found said already and marked without saying again (`marked`), those it said, and those left for
 * the next, the task refusing to hear them now.
 */
export type Delivered = { marked: string[]; said: string[]; left: string[] };

/** The key a said is claimed by: its attempt and its time. */
const keyOf = (s: { attempt: number; at: string } | { attempt: number; said: string }): string =>
  `${s.attempt} ${'at' in s ? s.at : s.said}`;

/** The first said of `said` with `text`, at or after `since`, that no key of `claimed` names. */
const unclaimed = (said: readonly SourceSaid[], text: string, since: string, claimed: ReadonlySet<string>) =>
  said.find((s) => s.text === text && s.at >= since && !claimed.has(keyOf(s)));

/**
 * Delivers the outbox of the chat kept in `dir` to the task `taskId`, in order, and stops at the first entry the task does not hear
 * now (`SayRefused`, `SayUnsent`), which the next call tries again.
 */
export const deliverOutbox = Effect.fn('deliverOutbox')(function* (taskId: string, dir: string) {
  const e = yield* EngineService;
  const marks = readDelivered(dir);
  const marked = new Set(marks.map((m) => m.id));
  const owed = readOutbox(dir).filter((entry) => !marked.has(entry.id));
  const done: Delivered = { marked: [], said: [], left: [] };
  if (owed.length === 0) return done;
  const claimed = new Set(marks.map(keyOf));
  const { state } = yield* asked('view', e.view(taskId));
  for (const [i, entry] of owed.entries()) {
    const text = framedForHer(entry.text);
    const found = unclaimed(state.said, text, entry.at, claimed);
    const heard =
      found ??
      (yield* e
        .say(taskId, text)
        .pipe(Effect.catchTags({ SayRefused: () => Effect.succeed(undefined), SayUnsent: () => Effect.succeed(undefined) }), Effect.orDie));
    if (heard === undefined) return { ...done, left: owed.slice(i).map((o) => o.id) };
    appendDelivered(dir, { id: entry.id, said: heard.at, attempt: heard.attempt });
    claimed.add(keyOf(heard));
    (found === undefined ? done.said : done.marked).push(entry.id);
  }
  return done;
});

/** Whether the chat kept in `dir` has an entry no mark names yet: what the keeper owes it. */
export const outboxOwed = (dir: string): boolean => {
  const marked = new Set(readDelivered(dir).map((m) => m.id));
  return readOutbox(dir).some((entry) => !marked.has(entry.id));
};
