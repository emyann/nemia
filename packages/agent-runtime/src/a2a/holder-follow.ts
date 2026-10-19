/**
 * The viewer's side of a holder's port: one live session followed across processes, and nothing else dialled.
 *
 * A viewer is an engine of this runtime given the holder's served card inline (`HolderAgent`, `EngineOptions.holder`) and a
 * `credentials` that answers for the card's `bearer` scheme. Its `follow` of a session goes to the holder's port, over the
 * SDK's client (`connectionOf`, which takes a `{ card }` agent as it stands), as `SubscribeToTask` of the Task whose id is the
 * session's own name — a holder of ours serves the session's name as its Task's id, so there is nothing to resolve, which is
 * why `remoteFollowOf` is not reused: that one needs the `remote/` registry to find the Task a send made.
 *
 * Every other verb stays local: a spawn, a stop, words said, a view, a transcript, logs and output are read from the files
 * both processes share, so a viewer still answers with the holder down — just not live. The seam is the one `follow`
 * replaced (`holderSeamOf`), never the whole of a runner.
 *
 * No retry in this slice: a subscription that drops ends the viewer's stream, and a reader asks again from the cursor it
 * holds (`packages/agent-runtime/docs/open-issues.md`).
 */
import { Effect, Stream } from 'effect';
import { RunnerError, type Followed } from '../harness/index.ts';
import type { SeamOps } from './client.ts';
import { cardOfJson } from './card.ts';
import { followedOf } from './follow.ts';
import { connectionOf, type Credentials } from './remote-client.ts';
import { abortedOnReturn } from './remote-follow.ts';
import { REQUEST_MS, SEND_MS } from './remote.ts';
import { wordsOf } from './said.ts';

/**
 * A holder of this runtime's own sessions, as a viewer's engine is given it: the card the holder served, as the JSON `hold()`
 * answered (`Served.cards`). Its token is not here: `credentials` gives it for the card's `bearer` scheme.
 */
export type HolderAgent = { card: Record<string, unknown> };

/**
 * The viewer's `follow` of the sessions of `harness`, dialled on `agent`: the session `name`'s Task subscribed to on the
 * holder's port, each answer read back as the moments a driver gives (`followedOf`). The connection is made at the first
 * follow and dropped at the first failure, as a remote agent's is; the subscription's signal is one of the connection's
 * `follows`, so its headers alone are bounded and the stream itself is not. A failure is the follow's own refusal, naming
 * what the holder said.
 */
export const holderFollowOf =
  (agent: HolderAgent, harness: string, credentials: Credentials | undefined) =>
  (name: string): Stream.Stream<Followed, RunnerError> => {
    const connection = connectionOf(harness, agent, credentials, REQUEST_MS, SEND_MS);
    return Stream.unwrap(
      Effect.gen(function* () {
        const stop = yield* Effect.acquireRelease(
          Effect.sync(() => new AbortController()),
          (c) => Effect.sync(() => c.abort()),
        );
        connection.follows.add(stop.signal);
        const client = yield* Effect.tryPromise({
          try: () => connection.ask(async (c) => c),
          catch: (cause) =>
            new RunnerError({
              verb: 'follow',
              message: `the engine holding \`${name}\` could not be reached (${wordsOf(cause)}): read its transcript instead for what is new.`,
              refused: true,
            }),
        });
        const answers = client.resubscribeTask({ tenant: '', id: name }, { signal: stop.signal });
        return Stream.fromAsyncIterable(
          abortedOnReturn(answers, stop),
          (cause) => new RunnerError({ verb: 'follow', message: wordsOf(cause) }),
        );
      }),
    ).pipe(Stream.map(followedOf), Stream.flattenIterable);
  };

/**
 * `ops` with its `follow` alone dialled on `agent` (`holderFollowOf`), and every other verb left as it is — the same function
 * values, so nothing else can reach the holder. `ops` unchanged where no holder is given for this harness.
 */
export const holderSeamOf = (
  agent: HolderAgent | undefined,
  harness: string,
  credentials: Credentials | undefined,
  ops: SeamOps,
): SeamOps => (agent === undefined ? ops : { ...ops, follow: holderFollowOf(agent, harness, credentials) });

/**
 * Why the holder given for the harness `harness` cannot be taken, or `undefined`. Asked by `Engine.layer`, in the order
 * below, so a holder that could never be dialled is refused before any task is filed: a harness this engine does not run
 * (`place.harnesses`, the ones it does); a harness that is a remote A2A agent (`place.remote`), whose sessions are the other
 * party's and are followed on its own address; an entry with a key that is not `card`; and a card that does not decode,
 * worded by `cardOfJson` as a configured agent's is. A `credentials` that answers for no scheme is not refused here: only
 * `authOf` knows whether it answers for this scheme and this agent, and it refuses the first follow in words naming the fix.
 */
export const holderRefusal = (
  harness: string,
  agent: unknown,
  place: { harnesses: readonly string[]; remote: boolean },
): string | undefined => {
  if (!place.harnesses.includes(harness)) {
    const runs = place.harnesses.length ? place.harnesses.map((n) => `\`${n}\``).join(', ') : 'none';
    return `\`holder\` names the \`${harness}\` harness, which this engine does not run: it runs ${runs}. Name a harness of \`harnesses\`, whose sessions the holder runs.`;
  }
  if (place.remote) {
    return `\`holder\` names the \`${harness}\` harness, which is a remote A2A agent: its sessions are the other party's, followed at its own address, and no holder of ours serves them. Take the entry off.`;
  }
  if (typeof agent !== 'object' || agent === null || Object.keys(agent).some((k) => k !== 'card')) {
    const given =
      typeof agent === 'object' && agent !== null
        ? Object.keys(agent)
            .map((k) => `\`${k}\``)
            .join(', ')
        : `a ${typeof agent}`;
    return `the holder of the \`${harness}\` harness takes \`card\` and nothing else, and was given ${given}. Give the card that engine's \`hold()\` answered for this harness, and its token through \`credentials\`.`;
  }
  const read = cardOfJson((agent as { card: unknown }).card);
  return 'wrong' in read
    ? `the holder of the \`${harness}\` harness has no card this runtime reads: ${read.wrong}. Give the card that engine's \`hold()\` answered for this harness, as the JSON it answered.`
    : undefined;
};
