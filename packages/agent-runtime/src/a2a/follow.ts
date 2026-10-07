/**
 * A session followed live through A2A's `SubscribeToTask`: the handler's answer over a driver's `follow` (`subscription`), and the
 * client's read of it back into the moments a driver gives (`followThrough`).
 *
 * The first answer is the Task as it stands; then a state is a `statusUpdate`, the transcript's whole events an `artifactUpdate` of
 * the artifact `transcript` (a data part: the events and the cursor after them), and a piece of the text being written an
 * `artifactUpdate` of an artifact of its own, named `partial`, under the block's key: its text a text part, `append` and
 * `lastChunk` as the piece says.
 */
import { Stream } from 'effect';
import type { Part, StreamResponse, SubscribeToTaskRequest } from '@a2a-js/sdk';
import { UnsupportedOperationError } from '@a2a-js/sdk/errors';
import { isLive, phaseWordOf, type SessionState } from '../core/index.ts';
import { RunnerError, type Followed, type RunnerOps } from '../harness/index.ts';
import { nameOf, sightingOf, stateOf, taskOfSighting } from './map.ts';

const TRANSCRIPT = 'transcript';
const PARTIAL = 'partial';

/** An update of the artifact `artifactId`, named `name`, of the Task `taskId`: its one part, and whether it adds to the last. */
const artifactUpdate = (
  taskId: string,
  artifactId: string,
  name: string,
  content: Part['content'],
  append: boolean,
  lastChunk: boolean,
): StreamResponse => ({
  payload: {
    $case: 'artifactUpdate',
    value: {
      taskId,
      contextId: '',
      artifact: {
        artifactId,
        name,
        description: '',
        parts: [{ content, metadata: undefined, filename: '', mediaType: '' }],
        metadata: undefined,
        extensions: [],
      },
      append,
      lastChunk,
      metadata: undefined,
    },
  },
});

/** One moment of a followed session as what `SubscribeToTask` answers of the Task `taskId`. */
export const responseOf = (taskId: string, m: Followed): StreamResponse => {
  if (m.kind === 'state')
    return {
      payload: {
        $case: 'statusUpdate',
        value: {
          taskId,
          contextId: '',
          status: { state: stateOf(m.state), message: undefined, timestamp: undefined },
          metadata: undefined,
        },
      },
    };
  if (m.kind === 'events')
    return artifactUpdate(taskId, TRANSCRIPT, TRANSCRIPT, { $case: 'data', value: { events: m.events, cursor: m.cursor } }, true, false);
  return artifactUpdate(taskId, m.key, PARTIAL, { $case: 'text', value: m.text }, m.append, m.last);
};

/** What a `SubscribeToTask` answer says, as the moment a driver gives; none for an answer that is not one (a message). */
export const followedOf = (r: StreamResponse): Followed[] => {
  const p = r.payload;
  const state = (s: SessionState | undefined): Followed[] => (s ? [{ kind: 'state', state: s }] : []);
  if (p?.$case === 'task') return state(sightingOf(p.value)?.state ?? nameOf(p.value.status?.state ?? 0));
  if (p?.$case === 'statusUpdate') return state(nameOf(p.value.status?.state ?? 0));
  if (p?.$case !== 'artifactUpdate' || !p.value.artifact) return [];
  const { artifact, append, lastChunk } = p.value;
  const content = artifact.parts[0]?.content;
  if (artifact.name === TRANSCRIPT && content?.$case === 'data') {
    const { events, cursor } = content.value as { events: Extract<Followed, { kind: 'events' }>['events']; cursor: string };
    return [{ kind: 'events', events, cursor }];
  }
  return [{ kind: 'partial', key: artifact.artifactId, text: content?.$case === 'text' ? content.value : '', append, last: lastChunk }];
};

/**
 * `SubscribeToTask` of the session `params.id`, over the driver's `follow`: the Task as it stands, then each moment as it comes, until
 * the session is over. Refused (`UnsupportedOperationError`) where the driver does not follow sessions and on a Task in a terminal
 * state, which has nothing more to say: its transcript is read instead (`sessionTranscript`). The driver's own failure is thrown as
 * it failed, a `RunnerError`, for the handler to word.
 */
export async function* subscription(
  harness: string,
  ops: RunnerOps,
  params: SubscribeToTaskRequest,
): AsyncGenerator<StreamResponse, void, undefined> {
  if (!ops.follow) throw new UnsupportedOperationError('this agent does not stream: poll getTask.');
  let first = true;
  for await (const m of Stream.toAsyncIterable(ops.follow(params.id))) {
    if (!first) {
      yield responseOf(params.id, m);
      continue;
    }
    first = false;
    if (m.kind !== 'state')
      throw new RunnerError({
        verb: 'follow',
        message: `the \`${harness}\` harness followed \`${params.id}\` without saying its state first.`,
      });
    if (!isLive(m.state))
      throw new UnsupportedOperationError(
        `session \`${params.id}\` has ended (${phaseWordOf(m.state)}): there is nothing to follow. Read its transcript (sessionTranscript).`,
      );
    yield { payload: { $case: 'task', value: taskOfSighting(params.id, { sessionId: params.id, state: m.state }) } };
  }
}

/**
 * `follow` through the seam: the session under `name` followed by `SubscribeToTask`, each answer read back as the moment it carries.
 * A refusal in A2A's words (`UnsupportedOperationError`) fails it as a `RunnerError` that is `refused`; any other failure as one that
 * is not.
 */
export const followThrough =
  (subscribe: (params: SubscribeToTaskRequest) => AsyncGenerator<StreamResponse, void, undefined>) =>
  (name: string): Stream.Stream<Followed, RunnerError> =>
    Stream.fromAsyncIterable(
      subscribe({ tenant: '', id: name }),
      (cause) =>
        new RunnerError({
          verb: 'follow',
          message: cause instanceof Error ? cause.message : String(cause),
          ...(cause instanceof UnsupportedOperationError ? { refused: true } : {}),
        }),
    ).pipe(Stream.map(followedOf), Stream.flattenIterable);
