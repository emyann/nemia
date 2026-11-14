import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { BOARD_LINK_WORDS, commandLine } from 'objects';
import { CutField, CutFrame, CutPress, ScanLines } from '@/components/look';
import type { TokenAsk, TokenAsked } from '@/lib/api/read';
import { signIn } from '@/lib/api/session';
import { LinkRefusal } from './LinkRefusal';
import { PairBrowser } from './PairBrowser';

/** Why the token is asked for, by the refusal that asked it. */
const WHY: Record<TokenAsk, string> = {
  'token-required': 'This Nemia asks every browser for a token of yours before it shows anything, on its own machine as from beyond it.',
  'unknown-token':
    'The token this browser sent is no token this Nemia keeps: it was retired since, or is of another Nemia, and this browser no longer sends it.',
};

/** The command, typed on the machine the store is on, that prints a first-visit link signing a browser in with no token to copy. */
const BOARD_LINK = commandLine(BOARD_LINK_WORDS, {});

/** Reloads the page, where every read is made again with the cookie the api set or cleared. */
const reload = () => window.location.reload();

/**
 * The page the board shows in place of every other once the api asks this browser for a token (`useTokenAsked`) — which every store
 * does, loopback included, of a browser that sends none: why it asks, the way in (`BOARD_LINK_WORDS`, typed on the store's machine,
 * whose link signs the browser in), the api's own words, which say where a token of the person's is minted, a field the person pastes
 * one into, and a press that sends it to the api, which keeps it as this browser's cookie (`signIn`); then the page loads again, and
 * the board is read with it. A token the api refuses is said, in its words, and the page stays. Where the cookie's token is the one
 * refused, the api's refusal cleared the cookie already, so the browser sends none until one is pasted. Under the form, the other way
 * in: this browser paired by a code the person approves (`PairBrowser`), no token pasted; over it, a first-visit link this page was
 * opened on and the api refused (`LinkRefusal`).
 */
export function TokenPage({ asked }: { asked: TokenAsked }) {
  const ask = asked.reason;
  const [token, setToken] = useState('');
  const send = useMutation({ mutationFn: (typed: string) => signIn(typed), onSuccess: reload });
  const pending = send.isPending;
  return (
    <ScanLines className="flex min-h-svh items-center justify-center p-6">
      <CutFrame className="w-full max-w-lg">
        <form
          data-token-page={ask}
          aria-label="A token for this Nemia"
          className="flex flex-col gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const typed = token.trim();
            if (typed !== '') send.mutate(typed);
          }}
        >
          <h1 className="flex items-center gap-2 text-title-large">
            <KeyRound aria-hidden className="size-5" />
            Paste a token
          </h1>
          <LinkRefusal />
          <p className="text-body-medium text-muted-foreground">{WHY[ask]}</p>
          <p data-token-way className="text-body-medium text-muted-foreground">
            To sign this browser in, type <code className="font-mono text-on-surface">{BOARD_LINK}</code> on the machine the store is on and
            open the link it prints; or paste a token of yours here.
          </p>
          {asked.message && (
            <p data-token-said className="font-mono text-body-small break-words text-muted-foreground">
              {asked.message}
            </p>
          )}
          <p className="text-body-medium text-muted-foreground">
            This browser keeps the token you paste for thirty days, until you forget it in Settings.
          </p>
          <CutField>
            <input
              data-token-field
              type="password"
              aria-label="Token"
              name="token"
              autoComplete="off"
              placeholder="Token"
              value={token}
              disabled={pending}
              onChange={(event) => {
                setToken(event.target.value);
                send.reset();
              }}
              className="w-full bg-transparent px-3.5 py-2.5 font-mono text-body-medium text-on-surface outline-none placeholder:text-on-surface-variant"
            />
          </CutField>
          {send.isError && (
            <p role="alert" data-token-refused className="text-body-small break-words text-failure">
              Not kept. The api refused it: {send.error.message}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <CutPress type="submit" isDisabled={pending || token.trim() === ''}>
              {send.isPending ? 'Sending…' : 'Use this token'}
            </CutPress>
          </div>
        </form>
        <section aria-label="Pair this browser" className="flex flex-col gap-3 border-t border-outline-variant p-6">
          <p className="text-body-medium text-muted-foreground">
            Or pair this browser: it shows a code, and you approve it at the server, with no token to copy.
          </p>
          <PairBrowser />
        </section>
      </CutFrame>
    </ScanLines>
  );
}
