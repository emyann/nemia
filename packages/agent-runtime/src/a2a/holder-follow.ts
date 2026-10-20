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
 * `ops` with its `follow` alone asking `holder` at every call, and every other verb left as it is — the same function values,
 * so nothing else can reach the holder. `ops` unchanged where no holder function is given for this harness.
 *
 * The function is asked at each follow and never at the build: a layer above may build its engine once for its whole process
 * (the api does) while a holder's port is ephemeral, so a holder captured here would be the one that was up at startup — a
 * guard that fires on a transition, which the level-triggered rule refuses. `undefined` means the holder is gone, or there
 * never was one, and the follow is `ops.follow`'s: read off the files both engines share, as a viewer with no holder reads
 * today. An agent it answers that this runtime cannot take is refused at that follow (`holderAgentRefusal`).
 */
export const holderSeamOf = (
  holder: (() => HolderAgent | undefined) | undefined,
  harness: string,
  credentials: Credentials | undefined,
  ops: SeamOps,
): SeamOps =>
  holder === undefined
    ? ops
    : {
        ...ops,
        follow: (name: string) => {
          const agent = holder();
          if (agent === undefined) return local(ops, harness)(name);
          const refused = holderAgentRefusal(harness, agent);
          return refused
            ? Stream.fail(new RunnerError({ verb: 'follow', message: refused, refused: true }))
            : holderFollowOf(agent, harness, credentials)(name);
        },
      };

/**
 * `ops`'s own `follow`, for a harness no one holds now — or, for a harness that has none of its own, a refusal naming what to
 * start: the seam always carries a `follow` once a holder function is given, since whether there is a holder is only known at
 * the call, so a harness that cannot be followed here says so there instead of at the build.
 */
const local =
  (ops: SeamOps, harness: string) =>
  (name: string): Stream.Stream<Followed, RunnerError> =>
    ops.follow
      ? ops.follow(name)
      : Stream.fail(
          new RunnerError({
            verb: 'follow',
            message: `no engine holds the \`${harness}\` harness's sessions now, and this harness follows none of its own: start the engine that holds them, or read \`${name}\`'s transcript instead for what is new.`,
            refused: true,
          }),
        );

/**
 * Why the holder given for the harness `harness` cannot be taken, or `undefined`. Asked by `Engine.layer`, in the order
 * below, so a holder that could never be dialled is refused before any task is filed: a harness this engine does not run
 * (`place.harnesses`, the ones it does); and a harness it does not run as Claude Code attached (`place.claude`), since no other
 * harness's sessions are held by one process — a remote agent's are the other party's, followed at its own address, and every
 * other harness's are read off the store both engines share.
 *
 * Then `holder` itself, which is a function asked at every follow: anything else — a card inline, as the option took before it was
 * asked per follow — is refused here, as every other function-valued option of `EngineOptions` is, rather than throwing out of the
 * first follow with no words.
 *
 * What that function *answers* is not here to read at the build, since it is asked at each follow, so the two checks that read the
 * agent are `holderAgentRefusal`'s, made at the follow that asks for it, in the same words. A `credentials` that answers for no
 * scheme is not refused here either: only `authOf` knows whether it answers for this scheme and this agent, and it refuses the
 * first follow in words naming the fix.
 */
export const holderRefusal = (
  harness: string,
  holder: unknown,
  place: { harnesses: readonly string[]; claude: boolean },
): string | undefined => {
  if (!place.harnesses.includes(harness)) {
    const runs = place.harnesses.length ? place.harnesses.map((n) => `\`${n}\``).join(', ') : 'none';
    return `\`holder\` names the \`${harness}\` harness, which this engine does not run: it runs ${runs}. Name a harness of \`harnesses\`, whose sessions the holder runs.`;
  }
  if (!place.claude) {
    return `\`holder\` names the \`${harness}\` harness, which this engine does not run as Claude Code attached (\`'claude'\`): a port serves the sessions one process holds attached, and no other harness has any — a remote agent's are the other party's, followed at its own address, and every other harness's are read off the store both engines share. Follow this harness's sessions here, and take the entry off.`;
  }
  if (typeof holder !== 'function') {
    return `the holder of the \`${harness}\` harness is a function, \`() => { card } | undefined\`, asked at every follow of that harness's sessions: give one answering the card that engine's \`hold()\` answered for this harness, or \`undefined\` while no one holds them, and its token through \`credentials\`.`;
  }
  return undefined;
};

/**
 * Why the agent a holder function answered for `harness` cannot be dialled, or `undefined`: an entry with a key that is not
 * `card`, and a card that does not decode, worded by `cardOfJson` as a configured agent's is. Asked at the follow and not at
 * the build, because the function is asked at the follow: the agent does not exist until then. The follow fails with it, as
 * a refusal, and nothing is dialled.
 */
export const holderAgentRefusal = (harness: string, agent: unknown): string | undefined => {
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
