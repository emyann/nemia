import { createFileRoute, redirect } from '@tanstack/react-router';
import { CardTrail, CardPage } from '../components/inbox/CardPage';
import { cardQuery } from '../lib/api/inbox.ts';
import { namespaceOf } from '../lib/api/namespace.ts';
import { objectHome } from '../lib/factoryAddress';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/**
 * The page of an inbox card, at /inbox/$name: `inbox_` draws it on its own, not inside the Inbox page, which has no outlet for it.
 * A card of a named factory is loaded again at the address it belongs at (`objectHome`), its search kept.
 */
export const Route = createFileRoute('/inbox_/$name')({
  loader: async ({ context, params, location }) => {
    const card = await context.queryClient.ensureQueryData(cardQuery(params.name));
    const home = objectHome(`/inbox/${encodeURIComponent(params.name)}`, namespaceOf(card.factory), undefined);
    if (home) throw redirect({ href: `${home}${location.searchStr}`, replace: true });
    return card;
  },
  component: Page,
  errorComponent: Failed,
});

/** The card's page, read off its address. */
function Page() {
  return <CardPage name={Route.useParams().name} />;
}

/** That the card could not be loaded, and why, under where its page is. */
function Failed({ error }: { error: unknown }) {
  return (
    <div className="space-y-3">
      <CardTrail name={Route.useParams().name} />
      <ReadTrouble what="this card" error={error} />
    </div>
  );
}
