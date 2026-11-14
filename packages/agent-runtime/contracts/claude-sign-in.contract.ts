/**
 * Whether Claude Code is signed in on this machine, as one ask of `claude auth status` says it (agent-runtime,
 * src/harness/claude/sign-in.ts, `claudeSignInOf`): what a Claude Code job's `prepare` reads before its spawn, so a session that would
 * fail at its first request for want of a credential is refused before anything runs.
 *
 * Claude Code documents the command as exiting 0 when logged in and 1 when not, its JSON carrying `loggedIn`; measured at 2.1.322, a
 * credential that is present reads as signed in whether or not it is valid, so `signed-in` means a credential is there, never that it
 * works. The ask is read off its child by the caller: an exit with its code and the `loggedIn` its stdout's JSON carries (none where it
 * carries no boolean one), a run killed at its bound, or a child that never ran or ended by a signal. The words of each answer, and
 * what the spawn does on `timed-out` and `unknown`, are the caller's.
 *
 * The two types (`ClaudeSignInAsk`, `ClaudeSignIn`) are this contract's, which `src/harness/claude/sign-in.ts` hands on.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** One ask of `claude auth status`, as its child ended. */
export type ClaudeSignInAsk =
  | { readonly kind: 'exited'; readonly code: number; readonly loggedIn: boolean | undefined }
  | { readonly kind: 'timed-out' }
  | { readonly kind: 'not-run' };

/** What the ask says of the machine's sign-in. */
export type ClaudeSignIn = 'signed-in' | 'signed-out' | 'timed-out' | 'unknown';

/** Whether the ask ended with an exit the command documents as signed in: 0, its JSON not saying otherwise. */
const saysIn = (ask: ClaudeSignInAsk): boolean => ask.kind === 'exited' && ask.code === 0 && ask.loggedIn !== false;

/** Whether the ask ended with an exit the command documents as signed out: its JSON says so, or it exited 1 with no JSON read. */
const saysOut = (ask: ClaudeSignInAsk): boolean =>
  ask.kind === 'exited' && (ask.loggedIn === false || (ask.code === 1 && ask.loggedIn === undefined));

const claudeSignInSpec = spec<(ask: ClaudeSignInAsk) => ClaudeSignIn>({
  ensures: {
    loggedOutIsSignedOut: {
      description: 'An answer whose JSON says it is not logged in is signed out, whatever its exit',
      condition: ({ input: [ask], output }) => !(ask.kind === 'exited' && ask.loggedIn === false) || output === 'signed-out',
    },
    exitOneUnreadIsSignedOut: {
      description: 'An exit of 1 with no JSON read is signed out, as the command documents its exit',
      condition: ({ input: [ask], output }) =>
        !(ask.kind === 'exited' && ask.code === 1 && ask.loggedIn === undefined) || output === 'signed-out',
    },
    signedOutOnlyWhenSaid: {
      description: 'Nothing is signed out that the command did not say is: no timeout, no failed start, no other exit',
      condition: ({ input: [ask], output }) => output !== 'signed-out' || saysOut(ask),
    },
    exitZeroIsSignedIn: {
      description: 'An exit of 0 whose JSON does not say logged out is signed in',
      condition: ({ input: [ask], output }) => !saysIn(ask) || output === 'signed-in',
    },
    signedInOnlyWhenSaid: {
      description: 'Nothing is signed in but an exit of 0 that its JSON does not contradict',
      condition: ({ input: [ask], output }) => output !== 'signed-in' || saysIn(ask),
    },
    aTimeoutSaysSo: {
      description: 'An ask killed at its bound is a timeout, never read as signed in or out',
      condition: ({ input: [ask], output }) => (ask.kind === 'timed-out') === (output === 'timed-out'),
    },
    noAnswerIsUnknown: {
      description: 'A command that did not run, or answered neither way, leaves the sign-in unknown',
      condition: ({ input: [ask], output }) => ask.kind === 'timed-out' || saysIn(ask) || saysOut(ask) || output === 'unknown',
    },
  },
});
export type ClaudeSignInOf = Implementation<typeof claudeSignInSpec>;
