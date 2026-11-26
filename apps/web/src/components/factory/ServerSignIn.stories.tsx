import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Body } from '@/components/ui/ds';
import { SignInView, signInShownOf, type SignInShown } from './ServerSignIn';

/**
 * A server's sign-in on its row, in each place it stands: offered on `needs-auth`, and on `pending` and `failed` for a server whose
 * record has `oauth`, nothing for one without it, waiting by a code, or with the address to open and
 * the field to
 * paste the address the browser landed on, ended with why and the press to try again, connected with Sign out, and refused in the api's
 * words — a paste refused among them. No node test can judge how each reads, so each is
 * drawn here.
 */
const meta: Meta = { title: 'Factory/ServerSignIn' };
export default meta;

/** The width a row of the settings page gives it. */
const BOX: CSSProperties = { width: 720 };

const AUTH = 'https://github.com/login/oauth/authorize?client_id=Iv23liQBfm9prqhvXkuY&state=story';

const UNTIL = '2026-10-22T12:05:00.000Z';

const BROWSER = { route: 'browser', authUrl: AUTH, until: UNTIL } as const;

const DEVICE = { route: 'device', userCode: 'WDJB-MJHT', verificationUri: 'https://github.com/login/device', until: UNTIL } as const;

/** The view of `github`'s sign-in at `shown`, its paste field holding `pasted`, pressing nothing. */
const view = (shown: SignInShown, refused: string | null = null, pasted = '') => (
  <div style={BOX}>
    <SignInView
      name="github"
      shown={shown}
      refused={refused}
      pending={false}
      pasting={{ pasted, onPasted: () => {}, onComplete: () => {} }}
      onSignIn={() => {}}
      onSignOut={() => {}}
    />
  </div>
);

/**
 * The row's sign-in as the board decides it from the server's `state` and whether its record has `oauth`, no sign-in held, under a
 * line saying what it was given, so a story that decides nothing still draws what it decided of.
 */
const decided = ({ state, oauth }: { state: string; oauth: boolean }) => {
  const shown = signInShownOf(state, oauth, undefined);
  return (
    <div style={BOX} className="flex flex-col gap-2">
      <Body size="small" component="p" className="text-on-surface-variant">
        github reads {state}, {oauth ? 'with' : 'without'} oauth{shown === null ? ': no sign-in is drawn' : ''}
      </Body>
      {shown !== null && view(shown)}
    </div>
  );
};

/** A server that signs in through Nemia, read `pending`, as one with no sign-in can settle: the press that starts one. */
export const OfferedAtPending: StoryObj<{ state: string; oauth: boolean }> = {
  args: { state: 'pending', oauth: true },
  render: decided,
};

/** A server that signs in through Nemia, read `failed`: the press that starts one all the same. */
export const OfferedAtFailed: StoryObj<{ state: string; oauth: boolean }> = {
  args: { state: 'failed', oauth: true },
  render: decided,
};

/** A server without `oauth`, read `pending`: no sign-in is drawn, as before. */
export const NotOfferedWithoutOauth: StoryObj<{ state: string; oauth: boolean }> = {
  args: { state: 'pending', oauth: false },
  render: decided,
};

/** A sign-in by a code started: the code in large type, the provider's page to type it at, when it stops, and Cancel. */
export const WaitingByCode: StoryObj<{ started: typeof DEVICE }> = {
  args: { started: DEVICE },
  render: ({ started }) => view({ at: 'waiting', started }),
};

/** A server that reads needs-auth: the press that starts a sign-in. */
export const Offered: StoryObj = { render: () => view({ at: 'offer' }) };

/** A sign-in by the browser started: the address to open, when it stops waiting, the empty field to paste back into, and Cancel. */
export const Waiting: StoryObj = { render: () => view({ at: 'waiting', started: BROWSER }) };

/** A waiting sign-in with the address the browser landed on pasted, Complete ready to press. */
export const Pasted: StoryObj = {
  render: () =>
    view({ at: 'waiting', started: BROWSER }, null, 'http://localhost:8791/callback?code=3f1c9a0e2b7d4c6e8a10&state=pYk2v9Qm4sT7wX1z'),
};

/** A paste the api refused, in its own words, the sign-in still waiting and the field still holding what was pasted. */
export const PasteRefused: StoryObj = {
  render: () =>
    view(
      { at: 'waiting', started: BROWSER },
      'what was pasted for `github` is not the address its sign-in sends the browser back to. Paste the address your browser landed on after you approved, starting http://localhost:8791/callback.',
      'http://localhost:3000/factories/default/settings',
    ),
};

/** A sign-in no one approved in time: why, and the press to start another. */
export const Expired: StoryObj = { render: () => view({ at: 'ended', why: 'No sign-in was approved by 12:05 PM.' }) };

/** A connected server: the press that signs it out. */
export const Connected: StoryObj = { render: () => view({ at: 'connected' }) };

/** A sign-in the api refused, in its own words. */
export const Refused: StoryObj = {
  render: () =>
    view(
      { at: 'offer' },
      'a sign-in to `linear` already waits on port 8791 until 12:05 PM, and the harness listens there for one at a time. Finish it in the browser, or ask again after then.',
    ),
};
