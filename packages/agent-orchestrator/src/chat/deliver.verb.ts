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
 * answers' (`appendAnswerDone`), the one that copies an ask into the chat (`appendAsk`), and the one that marks what became of an
 * ask's call (`appendAskClosed`).
 */
import { Effect } from 'effect';
import { EngineService, asked, type Engine, type TaskView } from '../runtime-client.ts';
import {
  appendAnswerDone,
  appendAsk,
  appendAskClosed,
  appendDelivered,
  readAnswers,
  readAnswersDone,
  readAsks,
  readAsksClosed,
  readDelivered,
  readOutbox,
} from './chat.store.ts';
import {
  answeredBefore,
  sameWords,
  askDue,
  askKey,
  askOf,
  askWords,
  callsOf,
  cutOf,
  framedForHer,
  type AnswerOwed,
  type Ask,
  type AskAnswer,
  type AskClose,
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
 * An ask asking the same questions as one the chat holds already (`sameWords`) is copied into no second ask: a restart cuts her call
 * and she asks the same question afresh under a new id, and the person is asked it once. Where the record answers it
 * (`answeredBefore`) that answer is written back through the call she holds open now, so a question cut between the ask and the
 * answer is answered from what the person said the first time; where it does not, the one copy goes on waiting on them, and their
 * answer reaches her by the road `answersDue` finds for it. Level-triggered: nothing is marked for either, and the next beat finds
 * the call gone from `asks` once it has taken the answer.
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
    if (sameWords(asks, ask) === undefined) {
      appendAsk(dir, ask);
      copied.push(ask.id);
      continue;
    }
    const before = answeredBefore(asks, answers, ask);
    if (before !== undefined) yield* carry(e, taskId, 'return', ask, { ...before, id: ask.id });
  }
  yield* Effect.sync(() => markCuts(dir, view.asks));
  return copied;
});

/**
 * The mark each unanswered ask of the chat in `dir` owes, given the asks `live` its session holds open now: one per ask whose marks
 * and the world disagree about which call of hers waits on the person for it. The ask's words are what a call is read by, not its id
 * — her restarted session asks the same question under a new call id, and `recordAsks` keeps the one copy the person is asked — so
 * the call the marks say (`callsOf`; the ask's own id where no mark names another, and none at all where a `cut` mark stands) is
 * compared with the call asking those words now: `cut` where none does, and `again` naming that call where one does and it is not
 * the call the marks name already.
 *
 * An ask the person has answered is marked `cut` by nothing — nothing of theirs waits on it any more, and the board draws it by
 * their answer — but a call of hers asking its words afresh is marked all the same: the answer on record is owed to that call, and
 * `answersDue` reads its taking of it under that call's own id. Reads the chat's files each time, and carries nothing between beats.
 */
const closesFor = (dir: string, live: NonNullable<TaskView['asks']>): AskClose[] => {
  const answered = new Set(readAnswers(dir).map((answer) => answer.id));
  const closed = readAsksClosed(dir);
  const [cut, calls] = [cutOf(closed), callsOf(closed)];
  const asking = new Map(live.map((raw) => askOf(raw)).map((ask) => [askKey(ask), ask.id]));
  const owed: AskClose[] = [];
  for (const ask of readAsks(dir)) {
    const now = asking.get(askKey(ask));
    const said = cut.has(ask.id) ? undefined : (calls.get(ask.id) ?? ask.id);
    if (now === said || (now === undefined && answered.has(ask.id))) continue;
    const at = new Date().toISOString();
    owed.push(now === undefined ? { id: ask.id, how: 'cut', at } : { id: ask.id, how: 'again', at, call: now });
  }
  return owed;
};

/**
 * What became of each unanswered ask's call, marked, where the session's asks could be read at all (`closesFor`): `cut` for one no
 * call of hers waits on any more, so the board stops asking the person for it and the count her face shows stops counting it;
 * `again`, naming the call, for one a call of hers is asking afresh, which waits once more and whose answer goes to that call.
 *
 * Level-triggered, and idempotent: each beat reads the asks the session holds now and marks only what the marks do not say already.
 * `live` is `undefined` from a harness that cannot say what its session holds open, and from a look that did not read the session at
 * all, and nothing is marked then: an absence read off a harness that does not report asks is no absence, and reading it as one
 * would close a question the person is still owed.
 */
const markCuts = (dir: string, live: TaskView['asks']): void => {
  if (live === undefined) return;
  for (const mark of closesFor(dir, live)) appendAskClosed(dir, mark);
};

/** What one carry of the answers did: those returned through the call she holds open, those said as words, and those only marked. */
export type AnswersCarried = Record<AnswerOwed, string[]>;

/**
 * Each answer of the person's in the chat kept in `dir` that no mark names yet, carried to the task `taskId` and marked: `return`,
 * back through the call its ask holds open, which its own result gives her; `words`, said to her naming the question and what they
 * answered (`askWords`), where no call of it is waiting any more; `mark`, nothing said, its held call having taken the answer already.
 *
 * Which call is waiting for an answer is read by the ask's words, not by its id: her restarted session asks a cut question afresh
 * under a call id of its own, and the chat keeps the one ask under the first call's, so the answer goes to the call asking those
 * words now — the one the live asks name, or the one the keeper's `again` mark named when it saw it, whose taking of the answer is
 * recorded under that id too. Read by the ask's id alone, an answer her new call had already taken would be said to her a second
 * time, in words that say her call did not wait for it.
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
  const live = (view.asks ?? []).map((raw) => askOf(raw));
  const open = new Set(live.map((ask) => ask.id));
  const taken = new Set(view.asksTaken ?? []);
  const asking = new Map(live.map((ask) => [askKey(ask), ask.id]));
  const calls = callsOf(readAsksClosed(dir));
  const asks = new Map(readAsks(dir).map((ask) => [ask.id, ask]));
  for (const answer of owed) {
    const ask = asks.get(answer.id);
    if (ask === undefined) continue;
    const call = asking.get(askKey(ask)) ?? calls.get(ask.id) ?? ask.id;
    const owes = askDue(open.has(call), taken.has(call));
    const reached = yield* carry(e, taskId, owes, { ...ask, id: call }, answer);
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

/**
 * Whether the chat kept in `dir` holds an ask whose marks no longer say what became of its call, given the asks `live` its session
 * holds open now: one unanswered that no call of its words waits on and no `cut` mark names yet, or one marked cut whose words a call
 * of hers is asking again. The two are one rule: a mark is owed wherever an ask's marks and the world disagree — no call waiting and
 * no `cut` mark, or a call waiting and a `cut` mark that stands. `undefined` live asks are a harness that cannot say, and nothing is
 * owed on them. What makes the keeper's beat run the record even where nothing new waits on the person; `recordAsks` does the marking.
 */
export const closesOwed = (dir: string, live: TaskView['asks']): boolean => live !== undefined && closesFor(dir, live).length > 0;

/** Whether the chat kept in `dir` holds an answer no mark names yet: what the keeper owes her. */
export const answersOwed = (dir: string): boolean => {
  const done = new Set(readAnswersDone(dir).map((mark) => mark.id));
  return readAnswers(dir).some((answer) => !done.has(answer.id));
};
