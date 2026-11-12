/**
 * The server's upgrades, as `objects` says them (`UpgradesGroup`): the read (`GET /api/upgrades`: the release going back goes to, and the
 * store's last upgrade), an upgrade started (`POST /api/upgrades`, an `Upgrade`), and its output followed as server-sent events at
 * `upgradeOutputPath`, each event's data decoded by `objects`' schema of it (`UPGRADE_STREAM_SCHEMAS`).
 */
import { queryOptions } from '@tanstack/react-query';
import type { Schema } from 'effect';
import { Upgrade, UpgradesRead } from 'objects';
import { retryUnlessGone } from './gone.ts';
import { call, read, write } from './objects.ts';

/** How often the read is made again while the store's last upgrade is at work: its end is seen within this, stream or none. */
const UPGRADING_EVERY_MS = 2_000;

/**
 * The upgrades read, made again every two seconds while the last upgrade is pending or running, and not again otherwise. An api that
 * serves no such read (an older one answers 404) is said at once, never tried again.
 */
export const upgradesQuery = queryOptions({
  queryKey: ['upgrades'],
  queryFn: () => call((c) => c.upgrades.read(), read(UpgradesRead)),
  refetchInterval: (query) => {
    const phase = query.state.data?.last?.phase;
    return phase === 'pending' || phase === 'running' ? UPGRADING_EVERY_MS : false;
  },
  retry: retryUnlessGone,
});

/** The server upgraded (or taken back) to the release `tag`, as the upgrade typed at its machine does: the upgrade as filed. */
export const startUpgrade = (tag: string): Promise<Upgrade> =>
  call(
    (c) => c.upgrades.start({ payload: { tag } }),
    write(Upgrade, 'The upgrade may have started: read Settings again before starting it again.'),
  );

/**
 * Where an upgrade's output is followed, as server-sent events: `output`, a chunk of what it printed; `ended`, its end, its data the
 * `Upgrade`.
 */
export const upgradeOutputPath = (id: string): string => `/api/upgrades/${encodeURIComponent(id)}/output`;

/** The data of the stream's events: `output` is text as printed, never JSON, so only `ended` is decoded. */
type UpgradeStreamData = { ended: Upgrade };

/** The schema of each decoded event of an upgrade's stream: `ended`'s data is `objects`' `Upgrade`. */
export const UPGRADE_STREAM_SCHEMAS: { readonly [K in keyof UpgradeStreamData]: Schema.Decoder<UpgradeStreamData[K]> } = { ended: Upgrade };
