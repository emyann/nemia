/**
 * The server's upgrade, started from the board's Settings or the MCP port (`POST /api/upgrades`): `nemia upgrade <tag>` run on the
 * server as a job of the engine, which outlives the daemon it restarts, its output followed as it runs and read again once the daemon
 * is back (`GET /api/upgrades/:id/output`). The read (`GET /api/upgrades`) says the release going back goes to and the store's last
 * upgrade. The group that serves them is `UpgradesGroup`.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api';
import { BadRequest, Conflict, Failed, Forbidden, Invalid, Missing } from './api-errors.ts';
import { UPGRADE_PHASES, UPGRADE_STREAM_EVENTS } from './words.ts';

/** `POST /api/upgrades`' body: the release to upgrade the server to, by its tag (`v0.4.0`), as `nemia upgrade <tag>` takes it. */
export const UpgradeStart = Schema.Struct({ tag: Schema.String });
export type UpgradeStart = typeof UpgradeStart.Type;

/**
 * An upgrade started: its id, the tag it upgrades to, the release the server ran when it started (`from`; left out on code run from a
 * repository), its phase, the tail of what it printed, its exit code once it ended, and when it started (an ISO time).
 */
export const Upgrade = Schema.Struct({
  id: Schema.String,
  tag: Schema.String,
  from: Schema.optionalKey(Schema.String),
  phase: Schema.Literals(UPGRADE_PHASES),
  output: Schema.String,
  exitCode: Schema.optionalKey(Schema.Number),
  startedAt: Schema.String,
});
export type Upgrade = typeof Upgrade.Type;

/**
 * The release going back goes to: the newest installed release older than the one the server runs, by its tag, and why the store's
 * floor refuses it where it does (`refused`, naming the oldest release that reads the store).
 */
export const PreviousRelease = Schema.Struct({ tag: Schema.String, refused: Schema.optionalKey(Schema.String) });
export type PreviousRelease = typeof PreviousRelease.Type;

/** `GET /api/upgrades`: the release going back goes to (null where none older is installed), and the store's last upgrade (null where none). */
export const UpgradesRead = Schema.Struct({ previous: Schema.NullOr(PreviousRelease), last: Schema.NullOr(Upgrade) });
export type UpgradesRead = typeof UpgradesRead.Type;

/** One event of an upgrade's output stream: a chunk of what it printed (`output`), or its end (`ended`, its data the `Upgrade` as JSON). */
export const UpgradeStreamEvent = Schema.Struct({ event: Schema.Literals(UPGRADE_STREAM_EVENTS), data: Schema.String });
export type UpgradeStreamEvent = typeof UpgradeStreamEvent.Type;

/** An upgrade's id in a path. */
const upgradeParams = { id: Schema.String };

/** The server's upgrades: the read, a start, one upgrade, and its output followed. */
export class UpgradesGroup extends HttpApiGroup.make('upgrades').add(
  HttpApiEndpoint.get('read', '/api/upgrades', { success: UpgradesRead, error: [Failed] }),
  HttpApiEndpoint.post('start', '/api/upgrades', {
    payload: UpgradeStart,
    success: Upgrade,
    error: [BadRequest, Invalid, Conflict, Forbidden, Failed],
  }),
  HttpApiEndpoint.get('upgradeOf', '/api/upgrades/:id', { params: upgradeParams, success: Upgrade, error: [Missing, Failed] }),
  HttpApiEndpoint.get('output', '/api/upgrades/:id/output', {
    params: upgradeParams,
    success: HttpApiSchema.StreamSse({ events: UpgradeStreamEvent }),
    error: [Missing],
  }),
) {}
