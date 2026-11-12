import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { askPairing, claimPairing } from '@/lib/api/pairing';
import { signIn } from '@/lib/api/session';
import { clientNameOf } from '@/lib/setup';

/** How often a pairing's claim is asked again while it waits on the person, in milliseconds. */
const CLAIM_EVERY_MS = 2_000;

/** Reloads the page, where every read is made again with the cookie the api set. */
const reload = () => window.location.reload();

/** The status a refusal carries, where it carries one. */
const statusOf = (error: unknown): number | undefined => {
  const status = typeof error === 'object' && error !== null ? Reflect.get(error, 'status') : undefined;
  return typeof status === 'number' ? status : undefined;
};

/**
 * A pairing asked for, waiting: the code the person approves, large, and the command that approves it at the server's shell; whether it
 * waits or was approved; and why the token was not kept (`notKept`), or the claim could not be asked (`unasked`).
 */
function PairCode({ code, approved, notKept, unasked }: { code: string; approved: boolean; notKept?: string; unasked?: string }) {
  return (
    <div data-pair-browser={approved ? 'claimed' : 'waiting'} className="flex flex-col gap-2">
      <p className="text-body-medium text-muted-foreground">
        Approve this browser with its code, at the server's shell or from a board already signed in:
      </p>
      <p
        data-pair-code
        className="self-start bg-surface-container-high px-3 py-2 font-mono text-body-large tracking-widest text-on-surface select-all"
      >
        {code}
      </p>
      <p data-pair-said className="text-body-small text-muted-foreground" aria-live="polite">
        {approved ? 'Approved: signing this browser in…' : 'Waiting for the approval…'}
      </p>
      {notKept !== undefined && (
        <p role="alert" className="text-body-small break-words text-failure">
          The pairing was approved, but the api did not keep its token: {notKept}
        </p>
      )}
      {unasked !== undefined && (
        <p role="alert" className="text-body-small break-words text-failure">
          Could not ask whether it is approved: {unasked}
        </p>
      )}
    </div>
  );
}

/**
 * The sign-in's other way: this browser paired, with no token pasted. Pressed, it asks the api for a pairing under this browser's name
 * (`board-<browser>`), shows the code the person approves — at the server's shell by its pairings' approve command, or from a board
 * already signed in — and asks for the claim every two seconds until it is approved; then the token the claim answers is sent once as
 * the bearer of `POST /api/session`, which keeps it as this browser's cookie, and the page loads again, forgetting it. A pairing that
 * lapsed, or was claimed elsewhere, is said, with the press to ask again.
 */
export function PairBrowser() {
  const ask = useMutation({ mutationFn: () => askPairing(clientNameOf(navigator.userAgent)) });
  const asked = ask.data;
  const claim = useQuery({
    queryKey: ['pair-claim', asked?.id],
    queryFn: () => claimPairing(asked?.id ?? '', asked?.secret ?? ''),
    enabled: asked !== undefined,
    refetchInterval: (query) => (query.state.data?.phase === 'waiting' ? CLAIM_EVERY_MS : false),
    retry: false,
    gcTime: 0,
  });
  const send = useMutation({ mutationFn: (token: string) => signIn(token), onSuccess: reload });
  const phase = claim.data?.phase;
  const token = claim.data?.token;
  const refused = claim.isError ? statusOf(claim.error) : undefined;
  const lapsed = phase === 'expired' || refused === 409 || refused === 404;
  useEffect(() => {
    if (phase === 'claimed' && token !== undefined && send.isIdle) send.mutate(token);
  }, [phase, token, send]);

  const again = () => ask.mutate();

  if (asked !== undefined && !lapsed)
    return (
      <PairCode
        code={asked.code}
        approved={send.isPending || phase === 'claimed'}
        {...(send.isError ? { notKept: send.error.message } : {})}
        {...(claim.isError && !lapsed ? { unasked: claim.error.message } : {})}
      />
    );
  return (
    <div data-pair-browser={lapsed ? 'lapsed' : 'idle'} className="flex flex-col gap-2">
      {lapsed && (
        <p role="alert" data-pair-lapsed className="text-body-small text-failure">
          That pairing lapsed or was used before it was approved: ask for another one, and approve its code within ten minutes.
        </p>
      )}
      {ask.isError && (
        <p role="alert" className="text-body-small break-words text-failure">
          Could not ask for a pairing: {ask.error.message}
        </p>
      )}
      <div>
        <Button variant="outline" data-pair-press isDisabled={ask.isPending} onPress={again}>
          <Link2 aria-hidden />
          {ask.isPending ? 'Asking…' : 'Pair this browser'}
        </Button>
      </div>
    </div>
  );
}
