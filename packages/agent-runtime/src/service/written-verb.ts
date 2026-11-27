/**
 * What `say`, `interrupt` and `answerAsk` share, written once: each a verb written to the running session of a task's attempt in
 * flight, from outside it. The task read off the journal, its harness asked for the verb's reach, the open attempt, the session found
 * on its harness — each refused in the verb's own words — and a failure that may pass worded as the verb's unsent.
 */
import { Cause, Effect } from 'effect';
import { fold, nameFor, unknownTask, type Attempt, type Event, type State } from '../core/index.ts';
import type { Journal, JournalError } from '../core/engine/index.ts';
import type { Runner } from '../harness/index.ts';
import { verbHarnessOf, type Capability } from '../harness/declaration.ts';
import type { Harnessed } from './harnessed.ts';

/**
 * What failed, in words, off a cause: its error's message, or the value itself.
 * @param e What failed.
 */
export const wordsOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** What a verb written to a session says where no session of a task is there to take it. */
type OpenWords = {
  /** Said of a task settled, after "no session of it is running". */
  readonly settled: string;
  /** Said of a task that has started no attempt, after "so there is". */
  readonly unstarted: string;
  /** What to do instead, said after each refusal but the unstarted one; none where the refusal says enough. */
  readonly instead?: string;
};

/**
 * The attempt a verb written from outside a session acts on, read off the journal: the last, still running. Refused, in the verb's
 * `words`, for a task settled, asked to stop, not started, or whose last attempt has ended.
 */
const openAttemptOf = (taskId: string, state: State, words: OpenWords) => {
  const last = state.attempts.at(-1);
  const instead = words.instead === undefined ? '' : ` ${words.instead}`;
  if (state.settled)
    return { refused: `\`${taskId}\` has settled (${state.settled}): no session of it is running${words.settled}.${instead}` } satisfies
      | { last: Attempt }
      | { refused: string } as { last: Attempt } | { refused: string };
  if (state.stopRequested)
    return { refused: `\`${taskId}\` has been asked to stop: its session is being stopped, not steered.${instead}` } satisfies
      | { last: Attempt }
      | { refused: string } as { last: Attempt } | { refused: string };
  if (!last)
    return { refused: `\`${taskId}\` has not started an attempt yet, so there is ${words.unstarted}` } satisfies
      | { last: Attempt }
      | { refused: string } as { last: Attempt } | { refused: string };
  if (last.ended !== null)
    return { refused: `\`${taskId}\` has no attempt running: attempt ${last.n} ended \`${last.ended}\`.${instead}` } satisfies
      | { last: Attempt }
      | { refused: string } as { last: Attempt } | { refused: string };
  return { last } satisfies { last: Attempt } | { refused: string } as { last: Attempt } | { refused: string };
};

/** The engine's reads a verb written to a session is made over: its journal (`read`, `go`) and the harness a task runs on. */
type WrittenPorts = {
  readonly go: <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.Effect<A, E>;
  readonly read: (taskId: string) => Effect.Effect<readonly Event[], JournalError>;
  readonly harnessOf: (state: State) => Harnessed;
};

/** A verb written to a session: its two failures, made from words, and what it says where it cannot reach one. */
export type WrittenVerb<Refused, Unsent, Reach> = {
  /** The Engine verb a harness declares to be asked this one (`verbHarnessOf`); none where every harness is asked it (`say`). */
  readonly capability?: Capability;
  /** The verb's refusal: nothing was done, and asking again as it was asked will not change that. */
  readonly refused: (message: string) => Refused;
  /** The verb's failure that may pass, with what failed. */
  readonly unsent: (message: string, cause: unknown) => Unsent;
  /** The verb's reach on a harness's runner, or `undefined` where the harness has none. */
  readonly reachOf: (harnessed: Harnessed) => Reach | undefined;
  /** Why a harness without the reach refuses it, in words that say what to do instead. */
  readonly unreached: (harnessed: Harnessed) => string;
  /** What the harness is called where it could not be read: `harness`, or `registry`. */
  readonly looked: string;
  /** What was not done where the harness could not be read: `said`, `sent`, `answered`. */
  readonly undone: string;
  /** What the verb says where no session of the task is there to take it. */
  readonly open: OpenWords;
};

/**
 * `effect`'s failure, of any kind, as `verb`'s unsent in the words `message` gives of what failed.
 * @param verb The verb, whose `unsent` makes the failure.
 * @param message What builds the unsent's words of what failed, from the value the effect failed with.
 */
export const unsentOf =
  <Unsent>(verb: Pick<WrittenVerb<unknown, Unsent, unknown>, 'unsent'>, message: (e: unknown) => string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.catchCause((cause: Cause.Cause<E>) => {
        const e = Cause.squash(cause);
        return Effect.fail(verb.unsent(message(e), e));
      }),
    );

/**
 * `effect`, the reach of a verb handed to a session, its failure worded as `verb`'s refusal where the harness refused it (`refused`)
 * and as its unsent, in the words `message` gives of what failed, otherwise.
 * @param verb The verb, whose `refused` and `unsent` make the failure.
 * @param message What builds the unsent's words of what failed, from the failure's own words.
 */
export const handedOver =
  <Refused, Unsent>(verb: Pick<WrittenVerb<Refused, Unsent, unknown>, 'refused' | 'unsent'>, message: (words: string) => string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.catchCause((cause: Cause.Cause<E>) => {
        const e = Cause.squash(cause) as { refused?: boolean };
        return Effect.fail(e.refused === true ? verb.refused(wordsOf(e)) : verb.unsent(message(wordsOf(e)), e));
      }),
    );

/**
 * The sessions `harnessed` lists that a verb looks for `name` among: by that one name where its runner looks by name (`observeFor`),
 * so what the look reads does not grow with every session the harness has run, and its whole listing (`observe`) otherwise. A name
 * the look by name left unread fails the look, in the harness's words, as a listing that could not be read does.
 * @param harnessed The harness the task runs on.
 * @param name The session's name.
 * @param harness The harness the task was filed on, for a runner that routes.
 */
const lookFor = (harnessed: Harnessed, name: string, harness: string | undefined) => {
  const { observe, observeFor } = harnessed.runner;
  if (!observeFor) return observe;
  return observeFor([{ name, harness }]).pipe(
    Effect.flatMap((o) =>
      o.unread.has(name)
        ? Effect.fail(new Error(o.unreadWhy?.get(name) ?? o.why?.join(' ') ?? `the look left \`${name}\` unread`))
        : Effect.succeed(o.seen),
    ),
  );
};

/**
 * The session of `taskId`'s attempt in flight that `verb` is written to, reached over `ports`: refused, in this order, for a task the
 * store has no record of, a harness that does not declare the verb or has not its reach, a task with no attempt open
 * (`openAttemptOf`) and a session its harness does not list; a harness that could not be read is the verb's unsent. What the verb
 * then asks of the session's state is its own.
 * @param ports The engine's journal and runners (`go`, `read`) and the harness a task runs on (`harnessOf`).
 * @param verb The verb written to the session.
 * @param taskId The task's id.
 */
export const sessionReached = <Refused, Unsent, Reach>(ports: WrittenPorts, verb: WrittenVerb<Refused, Unsent, Reach>, taskId: string) =>
  Effect.gen(function* () {
    const events = yield* ports.read(taskId);
    if (!events.length) return yield* Effect.fail(verb.refused(unknownTask(taskId)));
    const state = fold(taskId, events);
    const harnessed = ports.harnessOf(state);
    const taken = verb.capability === undefined || verbHarnessOf(verb.capability, harnessed.name, [harnessed]).kind === 'taken';
    const reach = taken ? verb.reachOf(harnessed) : undefined;
    if (reach === undefined) return yield* Effect.fail(verb.refused(verb.unreached(harnessed)));
    const open = openAttemptOf(taskId, state, verb.open);
    if ('refused' in open) return yield* Effect.fail(verb.refused(open.refused));
    const { last } = open;
    const name = nameFor(taskId, last.n);
    const observed = yield* ports
      .go(lookFor(harnessed, name, state.harness))
      .pipe(
        unsentOf(
          verb,
          (e) =>
            `the \`${harnessed.name}\` ${verb.looked} could not be read (${wordsOf(e)}), so ${name} could not be found. Nothing was ${verb.undone}; ask again.`,
        ),
      );
    const sighting = observed.get(name);
    if (!sighting) {
      return yield* Effect.fail(
        verb.refused(
          `\`${taskId}\`'s attempt ${last.n} is not running yet: its harness lists no \`${name}\`. Ask again once \`ae ls\` shows it running.`,
        ),
      );
    }
    return { state, harnessed, reach, last, name, sighting };
  });
