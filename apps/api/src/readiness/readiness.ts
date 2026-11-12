/**
 * The readiness group's handlers (`objects`' `ReadinessGroup`): whether this machine is ready to run the store's workflows, and a need's
 * fix started, read and followed, each the orchestrator's own (`readinessOf`, `startFix`, `fixOf`, `followFix`) run over the request's
 * services (`inRequest`), its refusals answered by the one map (`answeredWrite`, objects/refused.ts).
 *
 * - `GET /api/readiness` — the read, piece by piece (`readinessOf`), over the machine's facts (`Facts`, the app's environment the one it
 *   listens under) and the app's memory of its needs (`needsMemoryLayer`, app.ts), which the daemon's sweep fills: none swept yet, the
 *   checks are run now.
 * - `POST /api/readiness/fixes` — a need's fix filed on the engine as a command task (`startFix`), answered as it is filed (`pending`).
 *   Refused 404 (`Missing`) for no such need, factory or workflow; 422 (`Invalid`) for a workflow named without its factory, an index or
 *   an answer amiss, a fix a person types on the server (naming its command), and a workflow's or a repository's fix of a factory not
 *   trusted, naming `nemia factory trust <factory>`; 409 (`Conflict`) for a fix that takes a need away while an unfinished run needs it,
 *   naming `nemia cancel <run>` for each; 403 (`Forbidden`) for a session's token, since a fix acts on the machine outside a step's fence
 *   (`personOnly`).
 * - `GET /api/readiness/fixes/:id` — the fix as it stands (`fixOf`): its phase, the tail of what it printed, its exit code once settled.
 *   404 for an id no fix was started under.
 * - `GET /api/readiness/fixes/:id/output` — what the fix prints, followed, as server-sent events (`followFix`): an `output` event a chunk
 *   of text, from its first byte, then `ended`, its data the `Fix` as JSON, after which the stream closes. 404 before the stream opens for
 *   an id no fix was started under; a read that fails on the way ends the stream, and a `GET` of the fix says where it stands.
 */
import { Context, Effect, Stream } from 'effect';
import { readsBounded } from '../objects/answer-bound.ts';
import { followFix, fixOf, liveFacts, readinessOf, startFix, type FixFollowed, type ReadinessFacts } from 'agent-orchestrator';
import { Api, type FixStreamEvent } from 'objects';
import { answered, answeredWrite } from '../objects/refused.ts';
import { personOnly } from '../caller/caller.ts';

/**
 * The machine's facts the readiness read asks, over the environment `env` the api listens under: the process's own (`liveFacts`) by
 * default, a test's where its app's layer gives another (`Layer.succeed(Facts, …)`), so its read runs no command of the machine's.
 */
export const Facts = Context.Reference<(env: NodeJS.ProcessEnv) => ReadinessFacts>('api/readiness/Facts', {
  defaultValue: () => (env) => ({ ...liveFacts(), env }),
});

/** A piece of a fix's follow as the stream's event: a chunk printed (`output`), or the fix ended (`ended`, the `Fix` as JSON). */
const eventOf = (followed: FixFollowed): FixStreamEvent =>
  followed.kind === 'output' ? { event: 'output', data: followed.text } : { event: 'ended', data: JSON.stringify(followed.fix) };

export const readinessHandlers = readsBounded(Api, 'readiness', (handlers) =>
  handlers
    .handle('read', () => answeredWrite((s) => s.inRequest(Effect.flatMap(Facts, (facts) => readinessOf(facts(s.env))))))
    .handle('fix', ({ payload }) =>
      answeredWrite((s) => {
        personOnly(s, 'POST /api/readiness/fixes', `\`nemia doctor fix ${payload.need}\``);
        return s.inRequest(startFix(payload));
      }),
    )
    .handle('fixOf', ({ params }) => answeredWrite((s) => s.inRequest(fixOf(params.id))))
    .handle('fixOutput', ({ params }) =>
      answered(async (s) => {
        const context = await s.inRequest(Effect.context());
        const followed = await s.inRequest(followFix(params.id));
        return followed.pipe(
          Stream.map(eventOf),
          Stream.catch(() => Stream.empty),
          Stream.provideContext(context),
        );
      }),
    ),
);
