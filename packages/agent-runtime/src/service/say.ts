/**
 * The engine's `say` verb, and what refuses it: words handed to the running session of a task's attempt in flight through its harness,
 * then journalled as a `said` entry with where the session's transcript stood as they went (`transcriptEndOf`).
 */
import type { Harnessed } from './harnessed.ts';
import { Effect, Schema } from 'effect';
import { idleOf, isLive, waitsOnPerson, type Event, type Said, type State } from '../core/index.ts';
import { Journal, type JournalError } from '../core/engine/index.ts';
import type { Runner } from '../harness/index.ts';
import { isRemote, isSpec } from './options.ts';
import { sessionReached, unsentOf, wordsOf, type WrittenVerb } from './written-verb.ts';
import { transcriptEndOf } from './transcript-end.ts';
import { TaskId } from '../core/model.ts';

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

/** What to do instead of saying words to a session that is not there to hear them. */
const RESUME = 'Continue its session with a new task that carries the words (`resumeFrom`).';

/** `say`'s refusal, in its words. */
const refused = (message: string) => new SayRefused({ message });

/** `say` as a verb written to a session: its reach is the runner's `say`, and a spec without one says why in its `noChannel`. */
const SAY: WrittenVerb<SayRefused, SayUnsent, NonNullable<Harnessed['runner']['say']>> = {
  refused,
  unsent: (message, cause) => new SayUnsent({ message, cause }),
  reachOf: ({ runner }) => runner.say,
  unreached: ({ name, config: h }) =>
    (isSpec(h) ? h.noChannel : undefined) ?? `the \`${name}\` harness has no channel into a running session. ${RESUME}`,
  looked: 'registry',
  undone: 'said',
  open: {
    settled: ' to hear anything',
    unstarted: 'no session to hear anything. Ask again once `ae ls` shows it running.',
    instead: RESUME,
  },
};

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
    if (typeof text !== 'string' || !text.trim())
      return yield* Effect.fail(refused('`text` is empty. Give the words the session should hear.'));
    const { state, harnessed, reach: deliver, last, name, sighting } = yield* sessionReached({ go, read, harnessOf }, SAY, taskId);
    const { name: harness, runner, config: h } = harnessed;
    if (!isLive(sighting.state) && !idleOf(state, sighting)) {
      return yield* Effect.fail(
        refused(`\`${taskId}\`'s session is \`${sighting.state}\` on its harness, not running: the next pass writes its end. ${RESUME}`),
      );
    }
    if (isRemote(h) && !waitsOnPerson(sighting.state)) {
      return yield* Effect.fail(
        refused(
          `\`${taskId}\` runs on the \`${harness}\` remote A2A agent, whose Task takes words only once it asks for input, and it is at work. Say them when \`ae ls\` shows it waiting, or ${RESUME.charAt(0).toLowerCase()}${RESUME.slice(1)}`,
        ),
      );
    }
    const after = yield* transcriptEndOf(runner, name);
    yield* go(deliver({ name, sessionId: sighting.sessionId }, text)).pipe(
      unsentOf(SAY, (e) => `${name} was not given the words (${wordsOf(e)}). Nothing was journalled.`),
    );
    const said: Said = { at: new Date().toISOString(), attempt: last.n, text, after };
    yield* go(Effect.flatMap(Journal, (j) => j.append(TaskId.read(taskId), { kind: 'said', ...said }))).pipe(
      unsentOf(SAY, (e) => `${name} was given the words, but they could not be journalled (${wordsOf(e)}): the record does not show them.`),
    );
    return said;
  });
