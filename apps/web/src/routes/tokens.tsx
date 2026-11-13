import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { commandLine, TOKEN_ADD_WORDS } from 'objects';
import { Refusal } from '@/components/gate/Ask';
import { TokenTable } from '@/components/token/TokenTable';
import { tokensQuery } from '@/lib/api/tokens';

/** The command that mints a token, typed on the machine the store is on: its token is printed once there, and kept nowhere else. */
const MINT = commandLine(TOKEN_ADD_WORDS, {});

/** Settings' Tokens, at /tokens: the person's standing tokens, each retired here. Its loader reads the list. */
export const Route = createFileRoute('/tokens')({
  loader: ({ context }) => context.queryClient.prefetchQuery(tokensQuery),
  component: TokensPage,
});

/**
 * The store's standing tokens (`GET /api/tokens`): each one's name, who holds it — yours, or the agent's — the factory it is bound to or
 * store-wide, its narrowing and when it was minted, with a Retire each (`TokenTable`). A token that is no person's, an agent's, is refused
 * the list (403), said as the board says a refusal; none kept says how one is minted.
 */
function TokensPage() {
  const read = useQuery(tokensQuery);
  return (
    <article
      data-tokens-page={read.isError ? 'refused' : read.data ? 'loaded' : 'reading'}
      className="mx-auto flex max-w-4xl flex-col gap-6"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-title-large">Tokens</h1>
        <p className="text-body-medium text-muted-foreground">
          The tokens that reach this store: yours, for a browser or a program of yours, and those an agent holds. Mint one on the store's
          machine with <code className="font-mono text-on-surface">{MINT}</code> (<code className="font-mono">--agent</code> for an
          agent's); retire one here.
        </p>
      </header>
      {read.isError ? (
        <Refusal error={read.error} not="Not listed" />
      ) : !read.data ? (
        <p className="text-body-medium text-muted-foreground">Reading the tokens…</p>
      ) : read.data.tokens.length === 0 ? (
        <p data-tokens-none className="text-body-medium text-muted-foreground">
          No token is kept.
        </p>
      ) : (
        <TokenTable tokens={read.data.tokens} />
      )}
    </article>
  );
}
