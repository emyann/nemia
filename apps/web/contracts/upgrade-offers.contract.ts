/**
 * What the board's Settings offers of the server's release (`upgradeOffers`, src/lib/upgrade.ts), off `GET /api/version` as it is now:
 * the Upgrade button, where the daemon's release check read a newer release, and the Back button, where an older release is installed
 * and the store's floor lets the server go back to it — or that Back is refused, with the api's words naming the oldest it may go to.
 * Level-triggered: an upgrade still at work, started here, in another browser or by an agent on the MCP port, takes both buttons away
 * until it has ended.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What the offers read of `GET /api/version`: a newer release read, the release going back would go to, and an upgrade at work. */
export type UpgradeOffersRead = {
  /** The release check read a release newer than the one the server runs (`latest.newer`). */
  readonly newer: boolean;
  /** The release going back goes to, and whether the store's floor refuses it (`previous.refused` present); null where none is installed. */
  readonly previous: { readonly refused: boolean } | null;
  /** The store's last upgrade is still at work (its phase `pending` or `running`). */
  readonly upgrading: boolean;
};

/** Back's offer: pressable, shown refused with the api's reason, or not shown. */
export type BackOffer = 'offered' | 'refused' | 'none';

/** What Settings offers: the Upgrade button or not, and Back's offer. */
export type UpgradeOffers = { readonly upgrade: boolean; readonly back: BackOffer };

const upgradeOffersSpec = spec<(read: UpgradeOffersRead) => UpgradeOffers>({
  ensures: {
    upgradeForANewerRelease: {
      description: 'Upgrade is offered exactly where a newer release was read and no upgrade is at work',
      condition: ({ input: [read], output }) => output.upgrade === (read.newer && !read.upgrading),
    },
    backToAnAllowedRelease: {
      description: 'Back is pressable exactly where an older release is installed, the floor allows it, and no upgrade is at work',
      condition: ({ input: [read], output }) =>
        (output.back === 'offered') === (read.previous !== null && !read.previous.refused && !read.upgrading),
    },
    aRefusedBackSaysWhy: {
      description: 'Where the floor refuses the release going back would go to, Back is shown refused, so its reason is read',
      condition: ({ input: [read], output }) => (output.back === 'refused') === (read.previous !== null && read.previous.refused),
    },
  },
});

/** `upgradeOffers`'s type, which src/lib/upgrade.ts takes. */
export type UpgradeOffersOf = Implementation<typeof upgradeOffersSpec>;
