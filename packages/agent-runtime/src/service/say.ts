/**
 * The engine's `say` verb, and what refuses it: words handed to the running session of a task's attempt in flight through its harness,
 * then journalled as a `said` entry with where the session's transcript stood as they went (`transcriptEndOf`).
 */
import type { Harnessed } from './harnessed.ts';
import { Cause, Effect, Schema } from 'effect';
import { fold, idleOf, isLive, nameFor, waitsOnPerson, type Attempt, type Event, type Said, type State } from '../core/index.ts';
import { Journal, type JournalError } from '../core/engine/index.ts';
import type { Runner } from '../harness/index.ts';
import { isClaude, isRemote, isSpec } from './options.ts';
import { transcriptEndOf } from './transcript-end.ts';

/** Words `say` will not hand to a session, and why, in words that say what to do instead. Nothing was sent or journalled. */
export class SayRefused extends Schema.TaggedError<SayRefused>()('SayRefused', {
  message: Schema.String,
}) {}

/**
 * Words `say` could not hand over, or could not journal, for a reason that may pass: a registry that could not be read, a harness that
 * did not take them, a store that did not write. `cause` is what failed, when something did. Ask again.
 */
export class SayUnsent extends Schema.TaggedError<SayUnsent>()('SayUnsent', {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

/**
 * The attempt `say` hands words to, read off the journal: the last, still running. Refused, in words that say what to do,
 * for a task settled, asked to stop, not started, or whose last attempt has ended. `resume` says how to go on instead.
 */
const openAttemptOf = (taskId: string, state: State, resume: string): { last: Attempt } | { refused: string } => {
  const last = state.attempts.at(-1);
  if (state.settled)
    return { refused: `\`${taskId}\` has settled (${state.settled}): no session of it is running to hear anything. ${resume}` };
  if (state.stopRequested) return { refused: `\`${taskId}\` has been asked to stop: its session is being stopped, not steered. ${resume}` };
  if (!last)
    return {
      refused: `\`${taskId}\` has not started an attempt yet, so there is no session to hear anything. Ask again once \`ae ls\` shows it running.`,
    };
  if (last.ended !== null) return { refused: `\`${taskId}\` has no attempt running: attempt ${last.n} ended \`${last.ended}\`. ${resume}` };
  return { last };
};

/** What failed, in words, off a cause: its error's message, or the value itself. */
const wordsOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * `say` over the engine's journal (`read`, `go`), its runners and harnesses, and the harness a task runs on (`harnessOf`), as
 * `Engine.say` describes it.
 */
export const sayVerbOf = (
  go: <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.Effect<A, E>,
  read: (taskId: string) => Effect.Effect<readonly Event[], JournalError>,
  harnessOf: (state: State) => Harnessed,
) =>
  Effect.fn('Engine.say')(function* (taskId: string, text: string) {
    const refuse = (message: string) => Effect.fail(new SayRefused({ message }));
    const resume = 'Continue its session with a new task that carries the words (`resumeFrom`), as `wf retry --message` does.';
    if (typeof text !== 'string' || !text.trim()) return yield* refuse('`text` is empty. Give the words the session should hear.');
    const events = yield* read(taskId);
    if (!events.length) return yield* refuse(`\`${taskId}\` is not a task in this store. \`ae ls\`, or \`list()\`, gives the ones it has.`);
    const state = fold(taskId, events);
    const { name: harness, runner, config: h } = harnessOf(state);
    const deliver = runner.say;
    if (!deliver) {
      return yield* refuse(
        (isSpec(h) ? h.noChannel : undefined) ?? `the \`${harness}\` harness has no channel into a running session. ${resume}`,
      );
    }
    const open = openAttemptOf(taskId, state, resume);
    if ('refused' in open) return yield* refuse(open.refused);
    const { last } = open;
    const name = nameFor(taskId, last.n);
    const unsent = (message: (e: unknown) => string) =>
      Effect.catchCause((cause: Cause.Cause<unknown>) => {
        const e = Cause.squash(cause);
        return Effect.fail(new SayUnsent({ message: message(e), cause: e }));
      });
    const observed = yield* go(runner.observe).pipe(
      unsent(
        (e) => `the \`${harness}\` registry could not be read (${wordsOf(e)}), so ${name} could not be found. Nothing was said; ask again.`,
      ),
    );
    const sighting = observed.get(name);
    if (!sighting && isClaude(h) && runner.find) {
      const registered = yield* go(runner.find(name)).pipe(Effect.catchCause(() => Effect.succeed(undefined)));
      if (registered)
        return yield* Effect.fail(
          new SayUnsent({
            message: `the \`${harness}\` registry could not be read, or did not list ${name}, which Claude Code has registered. Nothing was said; ask again.`,
          }),
        );
    }
    if (!sighting)
      return yield* refuse(
        `\`${taskId}\`'s attempt ${last.n} is not running yet: its harness lists no \`${name}\`. Ask again once \`ae ls\` shows it running.`,
      );
    if (!isLive(sighting.state) && !idleOf(state, sighting)) {
      return yield* refuse(
        `\`${taskId}\`'s session is \`${sighting.state}\` on its harness, not running: the next pass writes its end. ${resume}`,
      );
    }
    if (isRemote(h) && !waitsOnPerson(sighting.state)) {
      return yield* refuse(
        `\`${taskId}\` runs on the \`${harness}\` remote A2A agent, whose Task takes words only once it asks for input, and it is at work. Say them when \`ae ls\` shows it waiting, or ${resume.charAt(0).toLowerCase()}${resume.slice(1)}`,
      );
    }
    const after = yield* transcriptEndOf(runner, name);
    yield* go(deliver({ name, sessionId: sighting.sessionId }, text)).pipe(
      unsent((e) => `${name} was not given the words (${wordsOf(e)}). Nothing was journalled.`),
    );
    const said: Said = { at: new Date().toISOString(), attempt: last.n, text, after };
    yield* go(Effect.flatMap(Journal, (j) => j.append(taskId, { kind: 'said', ...said }))).pipe(
      unsent((e) => `${name} was given the words, but they could not be journalled (${wordsOf(e)}): the record does not show them.`),
    );
    return said;
  });
