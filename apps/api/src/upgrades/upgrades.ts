/**
 * The upgrades group's handlers (`objects`' `UpgradesGroup`): the server's upgrade to a release, started from Settings or the MCP port as
 * a job of the engine that outlives the daemon it restarts, read and followed, each the orchestrator's own (`upgradesRead`,
 * `startUpgrade`, `upgradeOf`, `followUpgrade`) run over the request's services (`inRequest`), its refusals answered by the one map
 * (`answeredWrite`, objects/refused.ts).
 *
 * - `GET /api/upgrades` — the release going back goes to, with the floor's words where it refuses it, and the store's last upgrade.
 * - `POST /api/upgrades` — `nemia upgrade <tag>` filed on the engine as a command task (`startUpgrade`), answered as it is filed
 *   (`pending`), under the app's one permit (`UpgradeStarts`). Refused 422 (`Invalid`) for a tag no release folder is named by; 409
 *   (`Conflict`) while an upgrade is at work and for a tag older than the oldest release that reads the store; 403 (`Forbidden`) for a
 *   session's token, since an upgrade restarts the daemon outside any step's fence (`personOnly`).
 * - `GET /api/upgrades/:id` — the upgrade as it stands (`upgradeOf`): its phase, the tail of what it printed, its exit code once ended.
 *   404 for an id no upgrade was started under.
 * - `GET /api/upgrades/:id/output` — what the upgrade prints, followed, as server-sent events (`followUpgrade`): an `output` event a chunk
 *   of text, from its first byte, then `ended`, its data the `Upgrade` as JSON, after which the stream closes. A reader that comes back
 *   after the daemon restarted reads it whole again. 404 before the stream opens for an id no upgrade was started under; a read that
 *   fails on the way ends the stream, and a `GET` of the upgrade says where it stands.
 */
import { Effect, Stream } from 'effect';
import { followUpgrade, startUpgrade, upgradeOf, upgradesRead, type UpgradeFollowed } from 'agent-orchestrator';
import { Api, type UpgradeStreamEvent } from 'objects';
import { readsBounded } from '../objects/answer-bound.ts';
import { answered, answeredWrite } from '../objects/refused.ts';
import { personOnly } from '../caller/index.ts';
import { UpgradeStarts } from './starts.ts';

/**
 * A piece of an upgrade's follow as the stream's event: a chunk printed (`output`), or the upgrade ended (`ended`, the `Upgrade` as
 * JSON).
 */
const eventOf = (followed: UpgradeFollowed): UpgradeStreamEvent =>
  followed.kind === 'output' ? { event: 'output', data: followed.text } : { event: 'ended', data: JSON.stringify(followed.upgrade) };

export const upgradesHandlers = readsBounded(Api, 'upgrades', (handlers) =>
  handlers
    .handle('read', () => answeredWrite((s) => s.inRequest(upgradesRead())))
    .handle('start', ({ payload }) =>
      answeredWrite((s) => {
        personOnly(s, 'POST /api/upgrades', `\`nemia upgrade ${payload.tag}\``);
        return s.inRequest(Effect.flatMap(UpgradeStarts, (starts) => starts.withPermits(1)(startUpgrade(payload))));
      }),
    )
    .handle('upgradeOf', ({ params }) => answeredWrite((s) => s.inRequest(upgradeOf(params.id))))
    .handle('output', ({ params }) =>
      answered(async (s) => {
        const context = await s.inRequest(Effect.context());
        const followed = await s.inRequest(followUpgrade(params.id));
        return followed.pipe(
          Stream.map(eventOf),
          Stream.catch(() => Stream.empty),
          Stream.provideContext(context),
        );
      }),
    ),
);
