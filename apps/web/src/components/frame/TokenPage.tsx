import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CutField, CutFrame, CutPress, ScanLines } from '@/components/look';
import type { TokenAsk, TokenAsked } from '@/lib/api/read';
import { signIn, signOut } from '@/lib/api/session';

/** Why the token is asked for, by the refusal that asked it. */
const WHY: Record<TokenAsk, string> = {
  'token-required':
    'This Nemia is reached from beyond its machine, so it asks every browser for a token of yours before it shows anything.',
  'unknown-token':
    'The token this browser sends is no token this Nemia keeps: it was removed since, or is of another Nemia. Paste one it keeps.',
};

/** Reloads the page, where every read is made again with the cookie the api set or cleared. */
const reload = () => window.location.reload();

/**
 * The page the board shows in place of every other once the api asks this browser for a token (`useTokenAsked`): why it asks, the api's
 * own words, which say where a token of the person's is minted, a field the person pastes one into, and a press that sends it to the
 * api, which keeps it as this browser's cookie (`signIn`); then the page loads again, and the board is read with it. A token the api
 * refuses is said, in its words, and the page stays. Where the cookie's token is the one refused, the page offers to forget it too
 * (`signOut`), which leaves the browser sending none.
 */
export function TokenPage({ asked }: { asked: TokenAsked }) {
  const ask = asked.reason;
  const [token, setToken] = useState('');
  const send = useMutation({ mutationFn: (typed: string) => signIn(typed), onSuccess: reload });
  const forget = useMutation({ mutationFn: signOut, onSuccess: reload });
  const pending = send.isPending || forget.isPending;
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
          <p className="text-body-medium text-muted-foreground">{WHY[ask]}</p>
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
          {forget.isError && (
            <p role="alert" data-token-forget-refused className="text-body-small break-words text-failure">
              Not forgotten. The api refused it: {forget.error.message}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {ask === 'unknown-token' && (
              <Button type="button" variant="outline" data-token-forget isDisabled={pending} onPress={() => forget.mutate()}>
                Forget this browser's token
              </Button>
            )}
            <CutPress type="submit" isDisabled={pending || token.trim() === ''}>
              {send.isPending ? 'Sending…' : 'Use this token'}
            </CutPress>
          </div>
        </form>
      </CutFrame>
    </ScanLines>
  );
}
