import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { AsWritten, KeyTable } from '../field/FilePage';
import { Instant } from '../time/Instant';
import { StartedAs } from './InboxParts';
import { Markdown } from '../markdown/Markdown';
import { Labels } from '../field/Labels';
import { attachToCard, cardFileUrl, cardQuery, detachFromCard } from '@/lib/api/inbox';
import { CardFiles } from './CardFiles';
import { labelCard } from '@/lib/api/labels';
import { workflowNameOf } from '@/lib/api/workflows';
import { startedCard } from '@/lib/inbox';

import { seatFactory } from '../nav/nav';
import { useSeat } from '../nav/useSeat';
import { factoryLevel, inboxLevel, Trail } from '../nav/Trail';

/**
 * One inbox card, to read: its body rendered, then each key a card may set with its value and what it means — or, with Source, its file as
 * written. A started card says the runs it was started as, beside its run's phase (`StartedAs`), whether that run is in flight or ended.
 * It starts and drops nothing: the Inbox page does. Its files are listed under its labels (`CardFiles`), attached and taken off until a run
 * is started from it, and a picture its text shows by a file's name is shown from the api.
 */
export function CardPage({ name }: { name: string }) {
  const { data: card } = useSuspenseQuery(cardQuery(name));
  const queryClient = useQueryClient();
  const changed = () => queryClient.invalidateQueries({ queryKey: ['inbox'] });
  const attach = useMutation({ mutationFn: (given: File[]) => attachToCard(card, given), onSuccess: changed });
  const detach = useMutation({ mutationFn: (file: string) => detachFromCard(card, file), onSuccess: changed });
  const shown = Object.fromEntries(card.files.filter((f) => f.kept).map((f) => [f.name, cardFileUrl(card, f.file)]));
  const refusal = attach.error ?? detach.error;

  return (
    <article className="space-y-6">
      <CardTrail name={card.name} />

      <header className="space-y-1">
        <h1 className="font-mono text-body-medium text-muted-foreground">{card.name}</h1>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-body-small text-muted-foreground">
          <span>{card.error === null ? 'inbox card' : 'in the inbox, not a card'}</span>
          {card.workflow && (
            <span data-workflow={card.workflow} title={card.workflow}>
              workflow <span className="font-mono text-foreground">{workflowNameOf(card.workflow)}</span>
            </span>
          )}
          {card.filedAt && (
            <span>
              filed <Instant at={card.filedAt} about="When its file was last written" />
            </span>
          )}
        </p>
      </header>

      {card.error === null && (
        <Labels
          labels={card.labels}
          edit={(edits) => labelCard(card, edits).then(() => queryClient.invalidateQueries({ queryKey: ['inbox'] }))}
        />
      )}

      {card.error === null && (
        <CardFiles
          files={card.files}
          canChange={card.startedAs.length === 0}
          onAttach={(given) => given.length > 0 && attach.mutate(given)}
          onDetach={(file) => detach.mutate(file)}
          pending={attach.isPending || detach.isPending}
          refused={refusal === null ? null : refusal.message}
        />
      )}

      {startedCard(card) && <StartedAs startedAs={card.startedAs} state={card.state} />}

      {card.error !== null && (
        <div className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
          <p className="text-body-medium font-medium text-on-failure-container">Does not read as a card, so it cannot start:</p>
          <p className="font-mono text-body-small whitespace-pre-wrap break-words text-on-failure-container">{card.error}</p>
        </div>
      )}

      <AsWritten file={card.file} source={card.source}>
        {card.body !== null && <Markdown files={shown}>{card.body}</Markdown>}
        {card.keys && (
          <KeyTable
            rows={card.keys}
            note={<>As the card sets them, in its frontmatter. A start names what a card leaves unset: Start on the Inbox page.</>}
          />
        )}
      </AsWritten>
    </article>
  );
}

/**
 * Where a card's page is: its factory where the page sits under one, the Inbox, and the card, by its `name`.
 */
export function CardTrail({ name }: { name: string }) {
  const factory = seatFactory(useSeat());
  return <Trail levels={[...factoryLevel(factory), inboxLevel(factory), { name }]} />;
}
