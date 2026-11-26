/**
 * A server's sign-in on its row of a factory's settings page: Sign in where the server reads `needs-auth`, Sign out where it reads
 * `connected`, and nothing for any other state.
 *
 * A person only signs in. The press starts a sign-in the engine holds, and the board draws what it answered: a code to type at the
 * provider's page, where the provider offers one, or an address to open in the browser, where the provider sends the browser back to a
 * callback. The board reads the sign-in's state on every load of the page, which the api answers from memory and spawns nothing for, so a
 * sign-in that waits is drawn again with the way to finish it and a Cancel; it polls every 2 seconds while one waits, and once it reads
 * `connected` the servers are read again, so the row's chip says what a session now finds. No secret or token is typed or shown.
 *
 * By the browser, where the daemon runs on another machine than the person's browser, the provider sends the browser back to a
 * `localhost` address the daemon's machine alone listens on, and that page fails to load. So the person may paste the address the
 * browser landed on, and Complete hands it to the waiting sign-in (`completeSignIn`); a refusal is said in the panel, and the state is
 * read again. The pasted address is sent once and kept nowhere.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, TextField } from '@/components/ui/ds';
import { Pending, TEXT_LINK } from '@/components/look';
import { Instant } from '../time/Instant';
import {
  completeSignIn,
  factoryServersQuery,
  signInServer,
  signInStateQuery,
  signOutServer,
  type SignInStarted,
  type SignInState,
} from '../../lib/api/factories.ts';

/** Where a sign-in stands on the board, as its view draws it. */
export type SignInShown =
  | { readonly at: 'offer' }
  | { readonly at: 'waiting'; readonly started: SignInStarted }
  | { readonly at: 'ended'; readonly why: string }
  | { readonly at: 'connected' };

/** The host of the address a sign-in opens, as its link names it: `github.com`. */
const hostOf = (address: string) => {
  try {
    return new URL(address).host;
  } catch {
    return 'the sign-in page';
  }
};

/** What a waiting sign-in's paste field holds, and what it does: the text typed, its change, and the press that hands it on. */
type Pasting = {
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
function PasteBack({ pending, pasting }: { pending: boolean; pasting: Pasting }) {
  return (
    <div data-sign-in-paste className="flex flex-wrap items-start gap-3">
      <TextField
        label="the address your browser landed on"
        name="callback"
        value={pasting.pasted}
        onChange={pasting.onPasted}
        placeholder="http://localhost:8791/callback?code=…&state=…"
        autoComplete="off"
        spellCheck="false"
        supportingText="Where Nemia runs on another machine, the page your browser lands on after you approve fails to load. Paste its whole address here."
        inputClassName="font-mono"
        className="min-w-64 flex-1"
      />
      <Button
        variant="outlined"
        size="xsmall"
        icon={pending ? Pending : undefined}
        isDisabled={pending || pasting.pasted.trim() === ''}
        onPress={pasting.onComplete}
        className="mt-2"
      >
        Complete
      </Button>
    </div>
  );
}

/**
 * What a waiting sign-in draws by its road: by a code, the code in large type, the provider's page to type it at and when it stops
 * being good; by the browser, the link to open and the field to paste the address the browser landed on. Either has a Cancel.
 */
function Waiting({
  name,
  started,
  pending,
  pasting,
  onCancel,
}: {
  name: string;
  started: SignInStarted;
  pending: boolean;
  pasting: Pasting;
  onCancel: () => void;
}) {
  const cancel = (
    <Button variant="outlined" size="xsmall" icon={pending ? Pending : undefined} isDisabled={pending} onPress={onCancel}>
      Cancel
    </Button>
  );
  if (started.route === 'device') {
    return (
      <>
        <p className="text-body-medium text-on-surface">
          Type this code at{' '}
          <a
            data-sign-in-link
            href={started.verificationUri}
            target="_blank"
            rel="noopener noreferrer"
            className={`${TEXT_LINK} underline`}
          >
            {hostOf(started.verificationUri)}
          </a>{' '}
          and approve {name} there:
        </p>
        <p data-sign-in-code className="font-mono text-headline-medium tracking-widest text-on-surface select-all">
          {started.userCode}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {cancel}
          <span className="text-body-small text-on-surface-variant">
            Waiting until <Instant at={started.until} />.
          </span>
        </div>
      </>
    );
  }
  return (
    <>
      <p className="text-body-medium text-on-surface">
        <a data-sign-in-link href={started.authUrl} target="_blank" rel="noopener noreferrer" className={`${TEXT_LINK} underline`}>
          Open {hostOf(started.authUrl)} to sign in
        </a>
        , pick the repositories {name} may reach, and approve. Waiting until <Instant at={started.until} />.
      </p>
      <PasteBack pending={pending} pasting={pasting} />
      <div>{cancel}</div>
    </>
  );
}

/**
 * What a sign-in of a server shows, in each place it stands: the press that starts one, the code or the link to open while one waits
 * with its Cancel, why the last one ended with the press to try again, and the press that signs out of a connected server; and the api's
 * own words where it refused. One press is drawn at a time, so the one shown is the one `pending`
 * is of, and it draws the kit's small ProgressIndicator while it is. Exported for its stories.
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
          <Button variant="outlined" size="xsmall" icon={pending ? Pending : undefined} isDisabled={pending} onPress={onSignOut}>
            Sign out
          </Button>
          <span className="text-body-small text-on-surface-variant">
            Nemia keeps the sign-in fresh and hands it to every session of this factory.
          </span>
        </div>
      ) : shown.at === 'waiting' ? (
        <Waiting name={name} started={shown.started} pending={pending} pasting={pasting} onCancel={onSignOut} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outlined" size="xsmall" icon={pending ? Pending : undefined} isDisabled={pending} onPress={onSignIn}>
            {shown.at === 'ended' ? 'Sign in again' : 'Sign in'}
          </Button>
          <span className="text-body-small text-on-surface-variant">
            {shown.at === 'ended'
              ? shown.why
              : `Signs ${name} in with what you grant at its provider: you get a code to type there, or a link to open.`}
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

/** Where a sign-in stands, from the server's state and the engine's word on its sign-in, read on every load. */
const shownOf = (state: string | null, held: SignInState | undefined) => {
  if (held?.state === 'waiting' && held.started) return { at: 'waiting', started: held.started } satisfies SignInShown | null;
  if (held?.state === 'expired' || held?.state === 'failed')
    return { at: 'ended', why: held.why ?? `The sign-in ${held.state}.` } satisfies SignInShown | null;
  if (state === 'needs-auth') return { at: 'offer' } satisfies SignInShown | null;
  if (state === 'connected') return { at: 'connected' } satisfies SignInShown | null;
  return null satisfies SignInShown | null;
};

/**
 * The sign-in of `server` of the factory `factory`, whose state the servers' read said `state`: drawn where it is `needs-auth` or
 * `connected`, or a sign-in the engine holds waits or ended.
 */
export function ServerSignIn({ factory, server, state }: { factory: string; server: string; state: string | null }) {
  const queryClient = useQueryClient();
  const servers = factoryServersQuery(factory);
  const stateQuery = signInStateQuery(factory, server);
  const reread = () => {
    void queryClient.invalidateQueries({ queryKey: stateQuery.queryKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: servers.queryKey, exact: true });
  };
  const signIn = useMutation({ mutationFn: () => signInServer(factory, server), onSuccess: reread });
  const signOut = useMutation({ mutationFn: () => signOutServer(factory, server), onSuccess: reread });
  const [pasted, setPasted] = useState('');
  const complete = useMutation({
    mutationFn: (url: string) => completeSignIn(factory, server, url),
    onSuccess: () => setPasted(''),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: stateQuery.queryKey, exact: true }),
  });
  const held = useQuery(stateQuery).data;
  const connected = held?.state === 'connected';
  useEffect(() => {
    if (connected) void queryClient.invalidateQueries({ queryKey: servers.queryKey, exact: true });
  }, [connected, queryClient, servers.queryKey]);
  const shown = shownOf(state, held);
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
