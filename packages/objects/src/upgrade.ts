/**
 * The server's upgrade, started from the board's Settings or the MCP port (`POST /api/upgrades`): `nemia upgrade <tag>` run on the
 * server as a job of the engine, which outlives the daemon it restarts, its output followed as it runs and read again once the daemon
 * is back (`GET /api/upgrades/:id/output`). The read (`GET /api/upgrades`) says the release going back goes to and the store's last
 * upgrade. The group that serves them is `UpgradesGroup`.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from 'effect/http-api';
import { BadRequest, Conflict, Failed, Forbidden, Invalid, Missing } from './api-errors.ts';
import { describedNumber } from './meta.ts';
import { UPGRADE_PHASES, UPGRADE_STREAM_EVENTS } from './words.ts';
import { QueuedFor } from './run.ts';

/** `POST /api/upgrades`' body: the release to upgrade the server to, by its tag (`v0.4.0`), as `nemia upgrade <tag>` takes it. */
export const UpgradeStart = Schema.Struct({
  tag: Schema.String.annotate({
    description: 'The release to upgrade the server to, by its tag (v0.4.0), as `nemia upgrade <tag>` takes it.',
  }),
});
export type UpgradeStart = typeof UpgradeStart.Type;

/**
 * An upgrade started: its id, the tag it upgrades to, the release the server ran when it started (`from`; left out on code run from a
 * repository), its phase, the tail of what it printed, its exit code once it ended, when it started (an ISO time), and why it has not
 * started while it is pending and held (`queuedFor`).
 */
export const Upgrade = Schema.Struct({
  id: Schema.String.annotate({ description: "The upgrade's id." }),
  tag: Schema.String.annotate({ description: 'The tag of the release it upgrades to.' }),
  from: Schema.optionalKey(
    Schema.String.annotate({ description: 'The release the server ran when it started; left out on code run from a repository.' }),
  ),
  phase: Schema.Literals(UPGRADE_PHASES).annotate({
    description:
      'Where the upgrade stands, as the task that runs it says: pending until it starts, running, then succeeded on exit 0 or failed.',
  }),
  output: Schema.String.annotate({ description: 'The tail of what it printed.' }),
  exitCode: Schema.optionalKey(describedNumber('Its exit code once it ended; absent while it runs.')),
  startedAt: Schema.String.annotate({ description: 'When it started, as an ISO 8601 time.' }),
  queuedFor: Schema.optionalKey(QueuedFor),
});
export type Upgrade = typeof Upgrade.Type;

/**
 * The release going back goes to: the newest installed release older than the one the server runs, by its tag, and why the store's
 * floor refuses it where it does (`refused`, naming the oldest release that reads the store).
 */
export const PreviousRelease = Schema.Struct({
  tag: Schema.String.annotate({ description: 'The tag of the newest installed release older than the one the server runs.' }),
  refused: Schema.optionalKey(
    Schema.String.annotate({
      description: "Why the store's floor refuses it, naming the oldest release that reads the store; absent where it is not refused.",
    }),
  ),
});
export type PreviousRelease = typeof PreviousRelease.Type;

/**
 * `GET /api/upgrades`: the release going back goes to (null where none older is installed), and the store's last upgrade (null where
 * none).
 */
export const UpgradesRead = Schema.Struct({
  previous: Schema.NullOr(PreviousRelease).annotate({
    description: 'The release going back goes to; null where no older release is installed.',
  }),
  last: Schema.NullOr(Upgrade).annotate({ description: "The store's last upgrade; null where none." }),
});
export type UpgradesRead = typeof UpgradesRead.Type;

/** One event of an upgrade's output stream: a chunk of what it printed (`output`), or its end (`ended`, its data the `Upgrade` as JSON). */
export const UpgradeStreamEvent = Schema.Struct({
  event: Schema.Literals(UPGRADE_STREAM_EVENTS).annotate({
    description: 'What the event is: a chunk of output, or the end of the upgrade.',
  }),
  data: Schema.String.annotate({ description: 'A chunk of what the upgrade printed, or, at its end, the Upgrade as JSON.' }),
});
export type UpgradeStreamEvent = typeof UpgradeStreamEvent.Type;

/** An upgrade's id in a path. */
const upgradeParams = { id: Schema.String.annotate({ description: "The upgrade's id." }) };

/** The server's upgrades: the read, a start, one upgrade, and its output followed. */
export class UpgradesGroup extends HttpApiGroup.make('upgrades').add(
  HttpApiEndpoint.get('read', '/api/upgrades', { success: UpgradesRead, error: [Failed] }).annotate(
    OpenApi.Description,
    "Reads the release going back would go to and the store's last upgrade. Answers UpgradesRead.",
  ),
  HttpApiEndpoint.post('start', '/api/upgrades', {
    payload: UpgradeStart,
    success: Upgrade,
    error: [BadRequest, Invalid, Conflict, Forbidden, Failed],
  }).annotate(
    OpenApi.Description,
    "Starts the server's upgrade to the release the body's tag names, run as a job of the engine that outlives the daemon it restarts. Answers the Upgrade started.",
  ),
  HttpApiEndpoint.get('upgradeOf', '/api/upgrades/:id', { params: upgradeParams, success: Upgrade, error: [Missing, Failed] }).annotate(
    OpenApi.Description,
    'Reads an upgrade by its id: the tag it upgrades to, the release it started from, its phase, the tail of what it printed and its exit code once it ended. Answers the Upgrade.',
  ),
  HttpApiEndpoint.get('output', '/api/upgrades/:id/output', {
    params: upgradeParams,
    success: HttpApiSchema.StreamSse({ events: UpgradeStreamEvent }),
    error: [Missing],
  }).annotate(
    OpenApi.Description,
    "Follows an upgrade's output as server-sent events while it runs, and again once the daemon is back. Answers a stream of UpgradeStreamEvent.",
  ),
) {}
