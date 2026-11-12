import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { LatestRelease, Readiness, Upgrade } from 'objects';
import { ReadinessList } from '../setup/ReadinessList';
import { ServerReleaseView, type ServerReleaseShown, UpgradeOutcome, UpgradeRun } from './ServerRelease';

/**
 * Settings' Server release section in each of its states: no newer release, a newer one with its notes, upgrading, restarting,
 * upgraded with the pieces new runs wait on, failed, and Back refused by the store's floor.
 */
const meta: Meta = { title: 'Board/ServerRelease' };
export default meta;

/** A box as wide as Settings' column. */
const WIDE: CSSProperties = { width: 768 };

/** A box as wide as a phone. */
const PHONE: CSSProperties = { width: 360 };

/** What the section says the server runs: an install of v0.3.0. */
const RUNNING = 'Nemia 0.3.0, the installed release v0.3.0 (4f2a9c1) at /srv/nemia/v0.3.0';

/** The newer release the check read, with its notes. */
const NEWER: LatestRelease = { version: '0.4.0', newer: true, tag: 'v0.4.0', notes: 'https://example.com/nemia/releases/tag/v0.4.0' };

/** Nothing pressed is told anything in a story. */
const none = () => undefined;

/** The section with nothing to offer: no newer release read, and none older installed. */
const BARE: ServerReleaseShown = { running: RUNNING, previous: null, offers: { upgrade: false, back: 'none' } };

/** What an upgrade prints while it fetches and checks the release. */
const PRINTED =
  'Fetching v0.4.0 …\nChecking the archive against its sum … ok\nUnpacking beside v0.3.0 …\nCarrying the harnesses … 2 carried\nSwitching to v0.4.0 …\n';

/** An upgrade to v0.4.0 from v0.3.0, in `phase`. */
const upgrade = (phase: Upgrade['phase'], extra: Partial<Upgrade> = {}): Upgrade => ({
  id: 'u-7f3k',
  tag: 'v0.4.0',
  from: 'v0.3.0',
  phase,
  output: PRINTED,
  startedAt: '2026-11-12T09:41:00.000Z',
  ...extra,
});

/** A new release that adds a piece new runs wait on. */
const WAITS: Readiness = {
  ready: false,
  pieces: [
    {
      name: 'sandbox-runtime',
      area: 'harness',
      state: 'missing',
      message: 'the sandbox runtime v0.4.0 runs its sessions in is not installed',
      fixes: [{ message: 'install the sandbox runtime', command: 'npm install -g sandbox-runtime', startable: true, index: 0 }],
    },
  ],
};

/** The section as the server runs the newest release it knows: its release alone. */
export const NoNewerRelease: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ServerReleaseView shown={BARE} onStart={none} />
    </div>
  ),
};

/** A newer release read, with its notes, Upgrade, and Back to the release before. */
export const NewerWithNotes: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ServerReleaseView
        shown={{ ...BARE, latest: NEWER, previous: { tag: 'v0.2.1' }, offers: { upgrade: true, back: 'offered' } }}
        onStart={none}
      />
    </div>
  ),
};

/** The same at a phone's width. */
export const Phone: StoryObj = {
  render: () => (
    <div style={PHONE}>
      <ServerReleaseView
        shown={{ ...BARE, latest: NEWER, previous: { tag: 'v0.2.1' }, offers: { upgrade: true, back: 'offered' } }}
        onStart={none}
      />
    </div>
  ),
};

/** An upgrade at work: no press, its output as it prints. */
export const Upgrading: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ServerReleaseView
        shown={{ ...BARE, latest: NEWER, previous: { tag: 'v0.2.1' } }}
        onStart={none}
        run={<UpgradeRun tag="v0.4.0" phase="running" output={PRINTED} reconnecting={false} />}
      />
    </div>
  ),
};

/** Filed, waiting for a slot under the server's ceiling. */
export const WaitingForASlot: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ServerReleaseView
        shown={{ ...BARE, latest: NEWER }}
        onStart={none}
        run={<UpgradeRun tag="v0.4.0" phase="pending" output="" reconnecting={false} />}
      />
    </div>
  ),
};

/** The daemon restarting onto the new release: what it printed stays shown while the stream reconnects. */
export const Restarting: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ServerReleaseView
        shown={{ ...BARE, latest: NEWER }}
        onStart={none}
        run={<UpgradeRun tag="v0.4.0" phase="running" output={PRINTED} reconnecting />}
      />
    </div>
  ),
};

/** Upgraded: the server now runs v0.4.0, this page is the old board's, and the new release adds a piece new runs wait on. */
export const SucceededWithPieces: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ServerReleaseView
        shown={{
          ...BARE,
          running: RUNNING.replaceAll('0.3.0', '0.4.0'),
          previous: { tag: 'v0.3.0' },
          offers: { upgrade: false, back: 'offered' },
        }}
        onStart={none}
        outcome={<UpgradeOutcome upgrade={upgrade('succeeded', { exitCode: 0 })} running="v0.4.0" reload />}
        waitOn={
          <div className="flex flex-col gap-3">
            <h3 className="text-title-small font-title-small">What new runs wait on</h3>
            <ReadinessList readiness={WAITS} onStart={none} />
          </div>
        }
      />
    </div>
  ),
};

/** Refused: its log, and the server left on the release it ran. */
export const Failed: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ServerReleaseView
        shown={{ ...BARE, latest: NEWER, previous: { tag: 'v0.2.1' }, offers: { upgrade: true, back: 'offered' } }}
        onStart={none}
        outcome={
          <UpgradeOutcome
            upgrade={upgrade('failed', {
              exitCode: 1,
              output:
                'Fetching v0.4.0 …\nChecking the archive against its sum … mismatch\nupgrade refused: the archive of v0.4.0 does not match its sum; press Upgrade again to fetch it anew\n',
            })}
            running="v0.3.0"
            reload={false}
          />
        }
      />
    </div>
  ),
};

/** Back refused by the store's floor, in the api's words naming the oldest release the store allows. */
export const BackRefused: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ServerReleaseView
        shown={{
          ...BARE,
          previous: {
            tag: 'v0.2.1',
            refused: 'the store was last written by v0.3.0, and v0.2.1 cannot read it: the oldest release that reads it is v0.3.0.',
          },
          offers: { upgrade: false, back: 'refused' },
        }}
        onStart={none}
      />
    </div>
  ),
};

/** A start the api refused, said under the presses. */
export const StartRefused: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ServerReleaseView
        shown={{
          ...BARE,
          latest: NEWER,
          offers: { upgrade: true, back: 'none' },
          refused: 'an upgrade to v0.4.0 is at work already: read Settings again to follow it.',
        }}
        onStart={none}
      />
    </div>
  ),
};

/** The upgrades read not answered: the running release alone, and why no press is offered. */
export const UpgradesUnread: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ServerReleaseView shown={{ ...BARE, latest: NEWER, unread: 'GET /api/upgrades answered 404' }} onStart={none} />
    </div>
  ),
};
