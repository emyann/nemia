/**
 * A server's sign-in on its row of a factory's settings page: Sign in where the server reads `needs-auth`, Sign out where it reads
 * `connected`, and nothing for any other state.
 *
 * A person only signs in. The press starts a sign-in the engine holds, and the board shows the address to open — GitHub's, for the
 * server Nemia ships — where they pick repositories and approve. The board then polls the sign-in's state, which the api answers from
 * memory and spawns nothing for, every 2 seconds while it waits; once it reads `connected` the servers are read again, so the row's chip
 * says what a session now finds. No secret, token or port is typed or shown: the address is the one value the board is handed.
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CutPress, TEXT_LINK } from '@/components/look';
import { Instant } from './Instant';
import { factoryServersQuery, signInServer, signInStateQuery, signOutServer, type SignInState } from '../lib/api';

/** Where a sign-in stands on the board, as its view draws it. */
export type SignInShown =
  | { readonly at: 'offer' }
  | { readonly at: 'waiting'; readonly authUrl: string; readonly until: string }
  | { readonly at: 'ended'; readonly why: string }
  | { readonly at: 'connected' };

/** The host of the address a sign-in opens, as its link names it: `github.com`. */
const hostOf = (authUrl: string): string => {
  try {
    return new URL(authUrl).host;
  } catch {
    return 'the sign-in page';
  }
};

/**
 * What a sign-in of a server shows, in each place it stands: the press that starts one, the link to open while one waits, why the
 * last one ended with the press to try again, and the press that signs out of a connected server; and the api's own words where it
 * refused. Exported for its stories.
 */
export function SignInView({
  name,
  shown,
  refused,
  pending,
  onSignIn,
  onSignOut,
}: {
  name: string;
  shown: SignInShown;
  refused: string | null;
  pending: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  return (
    <div data-server-sign-in={shown.at} className="flex flex-col gap-2">
      {shown.at === 'connected' ? (
        <div className="flex flex-wrap items-center gap-3">
          <CutPress isDisabled={pending} onPress={onSignOut}>
            Sign out
          </CutPress>
          <span className="text-body-small text-muted-foreground">
            Every session of this factory finds the sign-in, and refreshes it on its own.
          </span>
        </div>
      ) : shown.at === 'waiting' ? (
        <p className="text-body-medium text-foreground">
          <a data-sign-in-link href={shown.authUrl} target="_blank" rel="noopener noreferrer" className={`${TEXT_LINK} underline`}>
            Open {hostOf(shown.authUrl)} to sign in
          </a>
          , pick the repositories {name} may reach, and approve. Waiting until <Instant at={shown.until} />.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <CutPress isDisabled={pending} onPress={onSignIn}>
            {shown.at === 'ended' ? 'Sign in again' : 'Sign in'}
          </CutPress>
          <span className="text-body-small text-muted-foreground">
            {shown.at === 'ended' ? shown.why : `Opens ${name}'s sign-in in your browser: you approve there, and type nothing here.`}
          </span>
        </div>
      )}
      {refused !== null && (
        <p data-sign-in-refused className="text-body-small break-words text-failure">
          {refused}
        </p>
      )}
    </div>
  );
}

/** Where a sign-in stands, from the server's state, the last sign-in started here and the engine's word on it. */
const shownOf = (
  state: string | null,
  started: { authUrl: string; until: string } | undefined,
  held: SignInState | undefined,
): SignInShown | null => {
  if (started && (held === undefined || held.state === 'waiting'))
    return { at: 'waiting', authUrl: started.authUrl, until: held?.until ?? started.until };
  if (held?.state === 'expired' || held?.state === 'failed') return { at: 'ended', why: held.why ?? `The sign-in ${held.state}.` };
  if (state === 'needs-auth') return { at: 'offer' };
  if (state === 'connected') return { at: 'connected' };
  return null;
};

/**
 * The sign-in of `server` of the factory `factory`, whose state the servers' read said `state`: drawn where it is `needs-auth` or
 * `connected`, or a sign-in started here has not settled.
 */
export function ServerSignIn({ factory, server, state }: { factory: string; server: string; state: string | null }) {
  const queryClient = useQueryClient();
  const servers = factoryServersQuery(factory);
  const signIn = useMutation({ mutationFn: () => signInServer(factory, server) });
  const signOut = useMutation({
    mutationFn: () => signOutServer(factory, server),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: servers.queryKey, exact: true }),
  });
  const held = useQuery({ ...signInStateQuery(factory, server), enabled: signIn.isSuccess }).data;
  const connected = held?.state === 'connected';
  useEffect(() => {
    if (connected) void queryClient.invalidateQueries({ queryKey: servers.queryKey, exact: true });
  }, [connected, queryClient, servers.queryKey]);
  const shown = shownOf(state, signIn.data, signIn.isSuccess ? held : undefined);
  if (shown === null) return null;
  const failed = signIn.error ?? signOut.error;
  return (
    <SignInView
      name={server}
      shown={shown}
      refused={failed === null ? null : failed instanceof Error ? failed.message : String(failed)}
      pending={signIn.isPending || signOut.isPending}
      onSignIn={() => {
        signOut.reset();
        signIn.mutate();
      }}
      onSignOut={() => {
        signIn.reset();
        signOut.mutate();
      }}
    />
  );
}
