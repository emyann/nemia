/**
 * The delivery of a chat's outbox to its long-lived task: each entry the person wrote and no mark names yet, said to the task in the
 * words that frame it (`framedForHer`), then marked. Before it says, it looks in what the runtime journalled as said (`state.said`) for
 * the entry's words said since it was written and claimed by no mark, and marks that one without saying again: a delivery cut between
 * the say and the mark is finished, never repeated. Level-triggered: it reads the files and the task's record each time, and carries
 * nothing between calls.
 *
 * Beside it, the questions of hers that wait on the person: each ask the runtime says her session holds open copied into the chat's own
 * folder once (`recordAsks`), so the board's history does not depend on a session's files across a restart; and each answer the person
 * gave carried to her (`answersDue`) — back through the call she holds open, or said to her as words naming the question where no call
 * of it is waiting any more, then marked. Level-triggered the same way: each beat reads the files and the task's record, and the marks
 * are what make a cut delivery finish rather than repeat.
 *
 * A controller: it reaches the runtime through the client, and is the one writer of the delivered marks (`appendDelivered`) and of the
 * answers' (`appendAnswerDone`), and the one that copies an ask into the chat (`appendAsk`).
 */
import { Effect } from 'effect';
import { EngineService, asked, type Engine } from '../runtime-client.ts';
import {
  appendAnswerDone,
  appendAsk,
  appendDelivered,
  readAnswers,
  readAnswersDone,
  readAsks,
  readDelivered,
  readOutbox,
} from './chat.store.ts';
import {
  answeredBefore,
  askDue,
  askOf,
  askWords,
  framedForHer,
  type AnswerOwed,
  type Ask,
  type AskAnswer,
  type SourceSaid,
} from './chat.ts';

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

/**
 * Each ask the task `taskId` says its session holds open, copied into the chat kept in `dir` once, by its id: the ids copied now.
 * The board reads the chat's own folder, so an ask survives the session that asked it; an ask already there is left as it was.
 *
 * An ask asking the same questions as one the person answered already (`answeredBefore`) is copied into no second ask and put to
 * nobody: the answer on record is written back through the call she holds open now, so a question a restart cut between the ask and
 * the answer — asked afresh under a new call id — is answered from what the person said the first time. Level-triggered: nothing is
 * marked for it, and the next beat finds the call gone from `asks` once it has taken the answer.
 */
export const recordAsks = Effect.fn('recordAsks')(function* (taskId: string, dir: string) {
  const e = yield* EngineService;
  const view = yield* asked('view', e.view(taskId));
  const asks = readAsks(dir);
  const answers = readAnswers(dir);
  const known = new Set(asks.map((ask) => ask.id));
  const copied: string[] = [];
  for (const raw of view.asks ?? []) {
    if (known.has(raw.id)) continue;
    const ask = askOf(raw);
    const before = answeredBefore(asks, answers, ask);
    if (before === undefined) {
      appendAsk(dir, ask);
      copied.push(ask.id);
      continue;
    }
    yield* carry(e, taskId, 'return', ask, { ...before, id: ask.id });
  }
  return copied;
});

/** What one carry of the answers did: those returned through the call she holds open, those said as words, and those only marked. */
export type AnswersCarried = Record<AnswerOwed, string[]>;

/**
 * Each answer of the person's in the chat kept in `dir` that no mark names yet, carried to the task `taskId` and marked: `return`,
 * back through the call its ask holds open, which its own result gives her; `words`, said to her naming the question and what they
 * answered (`askWords`), where no call of it is waiting any more; `mark`, nothing said, its held call having taken the answer already.
 *
 * An answer returned through a call is not marked by the beat that returned it: the mark waits until the runtime says the call took it
 * (`asksTaken`), so a holder that died between the two leaves the answer owed, and the next beat says it as words rather than losing
 * it. Returning it again in the meantime writes the answer where the held call reads it a second time, which it reads once.
 */
export const answersDue = Effect.fn('answersDue')(function* (taskId: string, dir: string) {
  const e = yield* EngineService;
  const done = new Set(readAnswersDone(dir).map((mark) => mark.id));
  const owed = readAnswers(dir).filter((answer) => !done.has(answer.id));
  const carried: AnswersCarried = { return: [], words: [], mark: [] };
  if (owed.length === 0) return carried;
  const view = yield* asked('view', e.view(taskId));
  const open = new Set((view.asks ?? []).map((ask) => ask.id));
  const taken = new Set(view.asksTaken ?? []);
  const asks = new Map(readAsks(dir).map((ask) => [ask.id, ask]));
  for (const answer of owed) {
    const ask = asks.get(answer.id);
    if (ask === undefined) continue;
    const owes = askDue(open.has(answer.id), taken.has(answer.id));
    const reached = yield* carry(e, taskId, owes, ask, answer);
    if (!reached) continue;
    if (owes !== 'return') appendAnswerDone(dir, { id: answer.id, how: owes, at: new Date().toISOString() });
    carried[owes].push(answer.id);
  }
  return carried;
});

/**
 * One answer carried as `owes` says: written where the ask's held call reads it, said to her as words, or nothing at all for one its
 * call took already. Answers whether it reached her; a task that will not take it now is left for the next beat.
 */
const carry = (e: Engine, taskId: string, owes: AnswerOwed, ask: Ask, answer: AskAnswer) => {
  if (owes === 'mark') return Effect.succeed(true);
  const sent =
    owes === 'return'
      ? e
          .answerAsk(taskId, { id: ask.id, answers: answer.answers })
          .pipe(Effect.catchTags({ AnswerRefused: () => Effect.succeed(undefined), AnswerUnsent: () => Effect.succeed(undefined) }))
      : e
          .say(taskId, askWords(ask, answer.answers))
          .pipe(Effect.catchTags({ SayRefused: () => Effect.succeed(undefined), SayUnsent: () => Effect.succeed(undefined) }));
  return sent.pipe(
    Effect.orDie,
    Effect.map((reached) => reached !== undefined),
  );
};

/** Whether the chat kept in `dir` holds an answer no mark names yet: what the keeper owes her. */
export const answersOwed = (dir: string): boolean => {
  const done = new Set(readAnswersDone(dir).map((mark) => mark.id));
  return readAnswers(dir).some((answer) => !done.has(answer.id));
};
