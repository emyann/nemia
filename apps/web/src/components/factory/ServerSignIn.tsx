/**
 * A server's sign-in on its row of a factory's settings page: Sign in where the server reads `needs-auth`, Sign out where it reads
 * `connected`, and nothing for any other state.
 *
 * A person only signs in. The press starts a sign-in the engine holds, and the board shows the address to open — GitHub's, for the
 * builtin server — where they pick repositories and approve. The board then polls the sign-in's state, which the api answers from
 * memory and spawns nothing for, every 2 seconds while it waits; once it reads `connected` the servers are read again, so the row's chip
 * says what a session now finds. No secret, token or port is typed or shown: the address is the one value the board is handed.
 *
 * Where the daemon runs on another machine than the person's browser, the provider sends the browser back to a `localhost` address the
 * daemon's machine alone listens on, and that page fails to load. So while a sign-in waits the person may paste the address the browser
 * landed on, and Complete hands it to the waiting sign-in (`completeSignIn`); a refusal is said in the panel, and the state is read
 * again. The pasted address is sent once and kept nowhere.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CutPress, TEXT_LINK } from '@/components/look';
import { Instant } from '../time/Instant';
import {
  completeSignIn,
  factoryServersQuery,
  signInServer,
  signInStateQuery,
  signOutServer,
  type SignInState,
} from '../../lib/api/factories.ts';

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

/** What a waiting sign-in's paste field holds, and what it does: the text typed, its change, and the press that hands it on. */
export type Pasting = {
  readonly pasted: string;
  readonly onPasted: (text: string) => void;
  readonly onComplete: () => void;
};

/** No paste field's state: a view drawn where no sign-in waits, which shows no field, is given this. */
const NOT_PASTING: Pasting = { pasted: '', onPasted: () => {}, onComplete: () => {} };

/**
 * The field a waiting sign-in takes the address the browser landed on in, for a browser that runs on another machine than the daemon,
 * and the press that hands it on: pressed only once something is pasted.
 */
function PasteBack({ name, pending, pasting }: { name: string; pending: boolean; pasting: Pasting }) {
  const id = `sign-in-callback-${name}`;
  return (
    <Field data-sign-in-paste>
      <FieldLabel htmlFor={id}>the address your browser landed on</FieldLabel>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          id={id}
          name="callback"
          className="min-w-64 flex-1 font-mono"
          value={pasting.pasted}
          onChange={(e) => pasting.onPasted(e.target.value)}
          placeholder="http://localhost:8791/callback?code=…&state=…"
          autoComplete="off"
          spellCheck={false}
        />
        <CutPress isDisabled={pending || pasting.pasted.trim() === ''} onPress={pasting.onComplete}>
          Complete
        </CutPress>
      </div>
      <FieldDescription>
        Where Nemia runs on another machine, the page your browser lands on after you approve fails to load. Paste its whole address here.
      </FieldDescription>
    </Field>
  );
}

/**
 * What a sign-in of a server shows, in each place it stands: the press that starts one, the link to open while one waits with the
 * field to paste the address the browser landed on, why the last one ended with the press to try again, and the press that signs out
 * of a connected server; and the api's own words where it refused. Exported for its stories.
 */
export function SignInView({
  name,
  shown,
  refused,
  pending,
  pasting = NOT_PASTING,
  onSignIn,
  onSignOut,
}: {
  name: string;
  shown: SignInShown;
  refused: string | null;
  pending: boolean;
  pasting?: Pasting;
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
        <>
          <p className="text-body-medium text-foreground">
            <a data-sign-in-link href={shown.authUrl} target="_blank" rel="noopener noreferrer" className={`${TEXT_LINK} underline`}>
              Open {hostOf(shown.authUrl)} to sign in
            </a>
            , pick the repositories {name} may reach, and approve. Waiting until <Instant at={shown.until} />.
          </p>
          <PasteBack name={name} pending={pending} pasting={pasting} />
        </>
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
  const stateQuery = signInStateQuery(factory, server);
  const [pasted, setPasted] = useState('');
  const complete = useMutation({
    mutationFn: (url: string) => completeSignIn(factory, server, url),
    onSuccess: () => setPasted(''),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: stateQuery.queryKey, exact: true }),
  });
  const held = useQuery({ ...stateQuery, enabled: signIn.isSuccess }).data;
  const connected = held?.state === 'connected';
  useEffect(() => {
    if (connected) void queryClient.invalidateQueries({ queryKey: servers.queryKey, exact: true });
  }, [connected, queryClient, servers.queryKey]);
  const shown = shownOf(state, signIn.data, signIn.isSuccess ? held : undefined);
  if (shown === null) return null;
  const failed = signIn.error ?? signOut.error ?? complete.error;
  return (
    <SignInView
      name={server}
      shown={shown}
      refused={failed === null ? null : failed instanceof Error ? failed.message : String(failed)}
      pending={signIn.isPending || signOut.isPending || complete.isPending}
      pasting={{
        pasted,
        onPasted: setPasted,
        onComplete: () => complete.mutate(pasted.trim()),
      }}
      onSignIn={() => {
        signOut.reset();
        complete.reset();
        setPasted('');
        signIn.mutate();
      }}
      onSignOut={() => {
        signIn.reset();
        signOut.mutate();
      }}
    />
  );
}
