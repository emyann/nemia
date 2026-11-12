/**
 * What Settings' Server release section offers and says of the server's release: the Upgrade and Back buttons (`upgradeOffers`, proved
 * by `contracts/upgrade-offers.contract.ts`), off the version and the upgrades read (`offersReadOf`); whether an upgrade is still at work
 * (`atWork`); and the words of a release the server runs (`releaseWord`). Pure: the drawing is `components/settings/ServerRelease.tsx`.
 */
import type { Release, Upgrade, UpgradesRead, VersionAnswer } from 'objects';
import type { UpgradeOffers, UpgradeOffersOf, UpgradeOffersRead } from '../../contracts/upgrade-offers.contract.ts';

export type { UpgradeOffers } from '../../contracts/upgrade-offers.contract.ts';

/**
 * What Settings offers: Upgrade where the release check read a newer release and no upgrade is at work; Back pressable where an older
 * release is installed, the store's floor allows it and no upgrade is at work, shown refused wherever the floor refuses it (so its reason
 * is read, at work or not), and not shown where none older is installed.
 */
export const upgradeOffers: UpgradeOffersOf = (read: UpgradeOffersRead): UpgradeOffers => {
  const back = read.previous === null ? 'none' : read.previous.refused ? 'refused' : read.upgrading ? 'none' : 'offered';
  return { upgrade: read.newer && !read.upgrading, back };
};

/** Whether `upgrade` is still at work: filed and waiting for a slot (`pending`), or running. */
export const atWork = (upgrade: Upgrade | null | undefined): boolean => upgrade?.phase === 'pending' || upgrade?.phase === 'running';

/**
 * What the offers read of the version and the upgrades read: a newer release read with a tag to upgrade to, the release going back goes
 * to and whether the floor refuses it, and the store's last upgrade still at work. An upgrades read not answered (an older api, or one
 * that failed) offers neither: no tag is known to go back to, and whether one is at work cannot be told.
 */
export function offersReadOf(version: VersionAnswer, upgrades: UpgradesRead | undefined): UpgradeOffersRead {
  if (upgrades === undefined) return { newer: false, previous: null, upgrading: false };
  return {
    newer: version.latest?.newer === true && version.latest.tag !== undefined,
    previous: upgrades.previous === null ? null : { refused: upgrades.previous.refused !== undefined },
    upgrading: atWork(upgrades.last),
  };
}

/** The release the server runs, in words: its tag (`v0.4.0`), `an install` where it carries none, `a checkout` for code run from one. */
export const releaseWord = (release: Release | undefined): string =>
  release === undefined ? 'a release this api does not say' : release.kind === 'checkout' ? 'a checkout' : (release.tag ?? 'an install');
