import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SignInView, type SignInShown } from './ServerSignIn';

/**
 * A server's sign-in on its row, in each place it stands: offered on `needs-auth`, waiting with the address to open, ended with why and
 * the press to try again, connected with Sign out, and refused in the api's words. No node test can judge how each reads, so each is
 * drawn here.
 */
const meta: Meta = { title: 'Board/ServerSignIn' };
export default meta;

/** The width a row of the settings page gives it. */
const BOX: CSSProperties = { width: 720 };

const AUTH = 'https://github.com/login/oauth/authorize?client_id=Iv23liQBfm9prqhvXkuY&state=story';

/** The view of `github`'s sign-in at `shown`, pressing nothing. */
const view = (shown: SignInShown, refused: string | null = null) => (
  <div style={BOX}>
    <SignInView name="github" shown={shown} refused={refused} pending={false} onSignIn={() => {}} onSignOut={() => {}} />
  </div>
);

/** A server that reads needs-auth: the press that starts a sign-in. */
export const Offered: StoryObj = { render: () => view({ at: 'offer' }) };

/** A sign-in started: the address to open in the browser, and when it stops waiting. */
export const Waiting: StoryObj = { render: () => view({ at: 'waiting', authUrl: AUTH, until: '2026-10-22T12:05:00.000Z' }) };

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
