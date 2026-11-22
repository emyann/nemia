import { type FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, SquareTerminal } from 'lucide-react';
import { BOARD_LINK_WORDS, commandLine, OPEN_WORDS } from 'objects';
import { CopyButton } from '@/components/command/CopyButton';
import { CutFrame, CutPress, ScanLines } from '@/components/look';
import { Button, Disclosure, DisclosurePanel, DisclosureTrigger, TextField } from '@/components/ui/ds';
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

/** Why a browser is asked to sign in on a store served on this machine alone, by the refusal that asked it: no token is asked of it. */
const WHY_HERE: Record<TokenAsk, string> = {
  'token-required': 'This Nemia runs on this machine, and lets in a browser it signed in itself.',
  'unknown-token': 'This browser’s sign-in is no longer one this Nemia keeps: it was retired, or is of another Nemia.',
};

/** The command, typed on the machine the store is on, that prints a first-visit link signing a browser in with no token to copy. */
const BOARD_LINK = commandLine(BOARD_LINK_WORDS, {});

/** The command, typed at a terminal on this machine, that opens the board in its browser signed in, with nothing to copy. */
const OPEN = commandLine(OPEN_WORDS, {});

/** Reloads the page, where every read is made again with the cookie the api set or cleared. */
const reload = () => window.location.reload();

/**
 * The page the board shows in place of every other once the api asks this browser for a token (`useTokenAsked`) — which every store does,
 * loopback included, of a browser that sends none. On a store served on this machine alone (`asked.exposed` false) it asks for no token:
 * it names the one command that opens the board here signed in (`OPEN_WORDS`), with a press that copies it and one that
 * reloads, and keeps the paste field folded in a closed disclosure, for someone handed a token (an outside operator, a step's served
 * board). On a store marked exposed it says why it asks, the way in (`BOARD_LINK_WORDS`, typed on the store's machine, whose link signs
 * the browser in), the api's own words, which say where a token of the person's is minted, and the field; under the form, the other way
 * in: this browser paired by a code the person approves (`PairBrowser`), no token pasted. Either way, over it, a first-visit link this
 * page was opened on and the api refused (`LinkRefusal`). A pasted token is sent to the api, which keeps it as this browser's cookie
 * (`signIn`); then the page loads again, and the board is read with it. A token the api refuses is said, in its words, and the page
 * stays. Where the cookie's token is the one refused, the api's refusal cleared the cookie already, so the browser sends none until one
 * is pasted or a link signs it in.
 */
export function TokenPage({ asked }: { asked: TokenAsked }) {
  return asked.exposed ? <TokenAskedPage asked={asked} /> : <OpenHerePage asked={asked} />;
}

/** The token typed, and its sending to the api, which keeps it as this browser's cookie and then reloads the page. */
function useTokenSent() {
  const [token, setToken] = useState('');
  const send = useMutation({ mutationFn: (typed: string) => signIn(typed), onSuccess: reload });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const typed = token.trim();
    if (typed !== '') send.mutate(typed);
  };
  return { token, setToken, send, submit };
}

/** The kit's field a token is pasted into, what the api said of one it refused, and the press that sends it. */
function TokenField({ sent }: { sent: ReturnType<typeof useTokenSent> }) {
  const { token, setToken, send } = sent;
  const pending = send.isPending;
  return (
    <>
      <TextField
        data-token-field
        type="password"
        label="Token"
        name="token"
        autoComplete="off"
        value={token}
        isDisabled={pending}
        onChange={(typed) => {
          setToken(typed);
          send.reset();
        }}
        className="[--md3-field-notch:var(--md-sys-color-surface-container-low)]"
        inputClassName="font-mono"
      />
      {send.isError && (
        <p role="alert" data-token-refused className="text-body-small break-words text-failure">
          Not kept. The api refused it: {send.error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <CutPress pending={send.isPending} type="submit" isDisabled={pending || token.trim() === ''}>
          {send.isPending ? 'Sending…' : 'Use this token'}
        </CutPress>
      </div>
    </>
  );
}

/** The page on a store served on this machine alone: the command that opens the board here signed in, and no token asked. */
function OpenHerePage({ asked }: { asked: TokenAsked }) {
  const sent = useTokenSent();
  const [pasting, setPasting] = useState(false);
  return (
    <ScanLines className="flex min-h-svh items-center justify-center p-6">
      <CutFrame className="w-full max-w-lg">
        <form
          data-token-page={asked.reason}
          data-token-here
          aria-label="Open Nemia from your terminal"
          className="flex flex-col gap-4 p-6"
          onSubmit={sent.submit}
        >
          <h1 className="flex items-center gap-2 text-title-large">
            <SquareTerminal aria-hidden className="size-5" />
            Open Nemia from your terminal
          </h1>
          <LinkRefusal />
          <p className="text-body-medium text-on-surface-variant">{WHY_HERE[asked.reason]}</p>
          <div data-token-way className="flex flex-col gap-2">
            <p className="text-body-medium text-on-surface-variant">Type this in a terminal on this machine:</p>
            <p className="flex items-center gap-2 rounded-shape-small bg-surface-container px-3 py-2">
              <code className="min-w-0 flex-1 font-mono text-body-medium break-all text-on-surface">{OPEN}</code>
              <CopyButton text={OPEN} />
            </p>
            <p className="text-body-medium text-on-surface-variant">
              It opens the board at localhost in your browser, signed in, with nothing to copy or paste. It stays signed in while you use
              it.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="outlined" data-token-reload onPress={reload}>
              Reload
            </Button>
          </div>
          <Disclosure isExpanded={pasting} onExpandedChange={setPasting}>
            <DisclosureTrigger>I was given a token</DisclosureTrigger>
            <DisclosurePanel isUnstyled>
              {pasting && (
                <div className="flex flex-col gap-4 pt-2">
                  {asked.message && (
                    <p data-token-said className="font-mono text-body-small break-words text-on-surface-variant">
                      {asked.message}
                    </p>
                  )}
                  <TokenField sent={sent} />
                </div>
              )}
            </DisclosurePanel>
          </Disclosure>
        </form>
      </CutFrame>
    </ScanLines>
  );
}

/** The page on a store marked exposed: why it asks, the ways in, and the field a token is pasted into. */
function TokenAskedPage({ asked }: { asked: TokenAsked }) {
  const ask = asked.reason;
  const sent = useTokenSent();
  return (
    <ScanLines className="flex min-h-svh items-center justify-center p-6">
      <CutFrame className="w-full max-w-lg">
        <form data-token-page={ask} aria-label="A token for this Nemia" className="flex flex-col gap-4 p-6" onSubmit={sent.submit}>
          <h1 className="flex items-center gap-2 text-title-large">
            <KeyRound aria-hidden className="size-5" />
            Paste a token
          </h1>
          <LinkRefusal />
          <p className="text-body-medium text-on-surface-variant">{WHY[ask]}</p>
          <p data-token-way className="text-body-medium text-on-surface-variant">
            To sign this browser in, type <code className="font-mono text-on-surface">{BOARD_LINK}</code> on the machine the store is on and
            open the link it prints; or paste a token of yours here.
          </p>
          {asked.message && (
            <p data-token-said className="font-mono text-body-small break-words text-on-surface-variant">
              {asked.message}
            </p>
          )}
          <p className="text-body-medium text-on-surface-variant">
            This browser keeps the token you paste while you use it, until thirty days after your last visit, or until you forget it in
            Settings.
          </p>
          <TokenField sent={sent} />
        </form>
        <section aria-label="Pair this browser" className="flex flex-col gap-3 border-t border-outline-variant p-6">
          <p className="text-body-medium text-on-surface-variant">
            Or pair this browser: it shows a code, and you approve it at the server, with no token to copy.
          </p>
          <PairBrowser />
        </section>
      </CutFrame>
    </ScanLines>
  );
}
