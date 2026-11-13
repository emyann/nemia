import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FactoryCardStart, UnassignedStart } from '../components/factory/FactoryCardStart';
import { FileCard } from '../components/inbox/FileCard';
import { CardMeta, GoneItem, NoQueue, PageLink, QueueButtons, Refused, StartedAs, Tried } from '../components/inbox/InboxParts';
import { CardFrom } from '../components/inbox/CardFrom';
import { Instant } from '../components/time/Instant';
import { SelectorField } from '../components/field/SelectorField';
import { Segment, SegmentedButton } from '../components/ui/ds/components/SegmentedButton';
import { dropCard, inboxAllQuery, queueCard, type InboxEntry } from '../lib/api/inbox.ts';
import { factoriesQuery } from '../lib/api/factories.ts';
import { labelSearch } from '../lib/api/labels.ts';
import { type Started } from '../lib/api/workflows.ts';
import { factorySearch, keptBy, shownIn } from '../lib/factories';
import {
  cardLines,
  cardsEnded,
  cardsInPlay,
  cardsSearch,
  factoryRepoOf,
  inPlay,
  newestCardsFirst,
  queuedWord,
  queueOf,
  startedCard,
  triedShown,
  unassigned,
  type CardRefusal,
} from '../lib/inbox';
import { BUTTON, BUTTON_OUTLINED } from '../lib/classes';

export const Route = createFileRoute('/inbox')({
  validateSearch: (search: Record<string, unknown>) => ({ ...factorySearch(search), ...labelSearch(search), ...cardsSearch(search) }),
  loaderDeps: ({ search }) => ({ l: search.l }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(inboxAllQuery(deps.l)),
  component: InboxPage,
  errorComponent: ({ error }) => (
    <p className="text-body-medium text-failure">
      Could not load the inbox: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

/** What the Inbox says Remove does to a started card, after the runs it was started as. */
const REMOVE_STARTED = 'Remove drops it; to run the idea again, file it again.';

const code = (text: string) => <code className="font-mono text-body-small">{text}</code>;

/**
 * The inbox: a box that files a card, and the cards, newest first, each startable and removable. The page keeps what a start or a drop was
 * refused with, by card, since the inbox is read again after each answer: a card gone behind the page's back leaves the list, and its
 * refusal stays where it was listed until dismissed. A refusal is kept by the entry's file, as `cardLines` matches them: a card and a stray
 * file beside it answer to one name, and a refusal is of one of them.
 *
 * Every factory's cards are listed, each tagged with its own, and a card that names none says so; the factory the top bar picks, kept in
 * the address as `?factory=<name>`, keeps only its own, and is the one the box files into until a person picks another: the counts are of
 * the cards it keeps, and a factory that keeps none says so and how to show every factory's.
 *
 * It reads every card, its run ended or not (`inboxAllQuery`), and lists the cards still in play — not started, or whose run is pending,
 * running or waiting (`CARD_KIND`) — or, under Ended, kept in the address as `?cards=ended`, those whose run ended: each counted after the
 * factory and the label filter, and an In play that lists none offers the ended cards.
 */
function InboxPage() {
  const { factory, l, cards: kind } = Route.useSearch();
  const ended = kind === 'ended';
  const { data: entries } = useSuspenseQuery(inboxAllQuery(l));
  const navigate = useNavigate({ from: '/inbox' });
  const [refusals, setRefusals] = useState<CardRefusal[]>([]);
  const all = newestCardsFirst(entries);
  const kept = shownIn(all, factory);
  const playing = cardsInPlay(kept);
  const over = cardsEnded(kept);
  const cards = ended ? over : playing;
  const queue = queueOf(cards).length;
  const lines = cardLines(entries, refusals).filter(({ entry }) => keptBy(factory)(entry) && inPlay(entry) !== ended);
  const show = (next: 'ended' | undefined) => void navigate({ search: (prev) => ({ ...prev, cards: next }) });
  const refusalFor = (entry: InboxEntry) => (refusal: Omit<CardRefusal, 'entry'> | null) =>
    setRefusals((kept) => [...kept.filter((r) => r.entry.file !== entry.file), ...(refusal ? [{ ...refusal, entry }] : [])]);

  return (
    <article className="space-y-6">
      <p className="text-body-medium text-muted-foreground">
        An idea parked as a card until you start a workflow on it: a file each in the store&apos;s {code('inbox/')}, as the box below or the
        command line parks one. Starting a card writes its run&apos;s record as any start does, and keeps the card, which reads its
        run&apos;s phase from then on: in play while the run waits its turn, works or waits on you, ended once it is over. A card queued
        starts on its own, on the workflow it names, when the daemon — this api, or the command line&apos;s — has a run slot free: the
        oldest queued first.
      </p>
      <FileCard shown={factory} />
      <SelectorField key={l ?? ''} selector={l} onSelect={(next) => void navigate({ search: (prev) => ({ ...prev, l: next }) })} />
      <section aria-label="Cards" className="space-y-3">
        {kept.length > 0 && <CardsSwitch ended={ended} inPlay={playing.length} over={over.length} onShow={show} />}
        <h2 className="flex items-baseline gap-2 text-title-small">
          Cards{' '}
          <span data-count className="text-body-small font-normal text-muted-foreground">
            {cards.length}
          </span>
          {queue > 0 && (
            <span data-queue-count className="text-body-small font-normal text-muted-foreground">
              · {queue} queued
            </span>
          )}
        </h2>
        {lines.length > 0 && (
          <ul className="space-y-3">
            {lines.map(({ entry, refusal, gone }) =>
              gone ? (
                <GoneItem key={`gone:${entry.file}`} entry={entry} refusal={refusal!} onDismiss={() => refusalFor(entry)(null)} />
              ) : (
                <CardItem key={entry.file} entry={entry} entries={entries} refusal={refusal} onRefused={refusalFor(entry)} />
              ),
            )}
          </ul>
        )}
        {cards.length === 0 && kept.length > 0 && <NoneShown ended={ended} over={over.length} />}
        {kept.length === 0 && all.length > 0 && (
          <p data-filtered-out className="text-body-medium text-muted-foreground">
            No card of the factory <span className="font-mono">{factory}</span>.{' '}
            <Link to="/inbox" search={{}} replace className="underline underline-offset-2">
              Show every factory&apos;s
            </Link>
            .
          </p>
        )}
        {all.length === 0 && (
          <p data-empty className="text-body-medium text-muted-foreground">
            The inbox is empty. File an idea in the box above, or from the command line.
          </p>
        )}
      </section>
    </article>
  );
}

/**
 * Which cards the page lists: In play, or Ended, each with its count after the factory and the label filter; `onShow` writes the pick in
 * the address, `?cards=ended`, or none for In play.
 */
function CardsSwitch({
  ended,
  inPlay,
  over,
  onShow,
}: {
  ended: boolean;
  inPlay: number;
  over: number;
  onShow: (next: 'ended' | undefined) => void;
}) {
  return (
    <SegmentedButton
      aria-label="Which cards"
      disallowEmptySelection
      selectedKeys={[ended ? 'ended' : 'in play']}
      onSelectionChange={(keys) => onShow(keys.has('ended') ? 'ended' : undefined)}
      className="max-w-sm"
    >
      <Segment id="in play">
        In play{' '}
        <span data-cards-count="in play" className="font-mono">
          · {inPlay}
        </span>
      </Segment>
      <Segment id="ended">
        Ended{' '}
        <span data-cards-count="ended" className="font-mono">
          · {over}
        </span>
      </Segment>
    </SegmentedButton>
  );
}

/** What the page says where the segment picked lists none of the cards the filters keep, and a link to the other segment. */
function NoneShown({ ended, over }: { ended: boolean; over: number }) {
  return ended ? (
    <p data-none-ended className="text-body-medium text-muted-foreground">
      No card&apos;s run has ended: every card here is still in play.{' '}
      <Link to="/inbox" search={(prev) => ({ ...prev, cards: undefined })} className="underline underline-offset-2">
        Show the cards in play
      </Link>
      .
    </p>
  ) : (
    <p data-none-in-play className="text-body-medium text-muted-foreground">
      No card is in play: every card here was started, and its run has ended.{' '}
      <Link to="/inbox" search={(prev) => ({ ...prev, cards: 'ended' as const })} className="underline underline-offset-2">
        Show the {over} ended
      </Link>
      .
    </p>
  );
}

/**
 * The tick's last try of a card's start (`Tried`), saying the repository its factory wires for the card's workflow, which the Card does not
 * carry: read off the factories with their wiring (`factoryRepoOf`).
 */
function TriedHere({ entry }: { entry: InboxEntry & { tried: NonNullable<InboxEntry['tried']> } }) {
  const factories = useQuery(factoriesQuery).data;
  return <Tried entry={{ ...entry, factoryRepo: factoryRepoOf(entry, factories) }} />;
}

/**
 * Whether a card is drawn started, and as which runs: its state a run's phase (`CARD_KIND`), that phase and the runs the inbox says; else,
 * for a start made from the page that the inbox has not said yet (`startedNow`), that run, with no phase to show.
 */
function startedOf(entry: InboxEntry, startedNow: string | null) {
  const phase = startedCard(entry) ? entry.state : null;
  const startedAs = phase !== null || startedNow === null ? entry.startedAs : [startedNow];
  return { phase, started: phase !== null || startedNow !== null, startedAs };
}

/**
 * A card: its first line, linked to its page, and under it its name, factory, workflow, repository and filing time (`CardMeta`); Start,
 * which opens its start, in its factory or in one picked there, and Remove. Queue on a card that names a factory and a workflow, and
 * Unqueue on a queued one (`QueueButtons`), with why not on a card that names a workflow alone (`NoQueue`); on a queued card its place
 * and when it was queued; and, when the tick tried its start and did not make it, why — a card refused stays queued, as the package keeps
 * it. A started card — its state a run's phase (`CARD_KIND`) — links to its run, in rest, beside its phase's chip, and offers Remove
 * only. An entry that does not read as a
 * card shows why, with its file for a title, and offers Remove when it is a card's file, which the CLI's `inbox rm` can drop.
 *
 * Its page shows the body rendered and its keys explained, and for a file that does not read, the file as written. A folder, a name the api
 * refuses, or a stray file a card of the same name answers for has no page (`hasPage`), and its title is its name alone.
 *
 * A start from this page is held (`startedNow`) until the inbox read again says the card started, its state its run's phase: the start
 * form goes, since the card may not start again, and the card says it was started as that run.
 *
 * What its start, drop, queue or unqueue was last refused with is the page's (`refusal`, told through `onRefused`), shown at its foot.
 * Remove, Queue and Unqueue read the inbox again whatever the answer, so a card dropped, queued or started behind the page's back reads as
 * it is; a card refused because it is gone leaves the list, its refusal kept in its place (`GoneItem`).
 */
function CardItem({
  entry,
  entries,
  refusal,
  onRefused,
}: {
  entry: InboxEntry;
  /** The inbox as the page listed it, which says whether this entry has a page of its own (`hasPage`). */
  entries: readonly InboxEntry[];
  refusal: CardRefusal | null;
  onRefused: (refusal: Omit<CardRefusal, 'entry'> | null) => void;
}) {
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [startedNow, setStartedNow] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: () => dropCard(entry),
    onMutate: () => onRefused(null),
    onError: (error) => onRefused({ action: 'remove', message: error.message }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
  const queue = useMutation({
    mutationFn: (off: boolean) => queueCard(entry, { off }),
    onMutate: () => onRefused(null),
    onError: (error, off) => onRefused({ action: off ? 'unqueue' : 'queue', message: error.message }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
  const { phase, started, startedAs } = startedOf(entry, startedNow);
  const startable = !started && entry.error === null;

  return (
    <li
      aria-label={`Card ${entry.name}`}
      data-card={entry.name}
      className="space-y-3 rounded-lg border border-outline-variant bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start gap-3 @md/page:flex-nowrap">
        <div className="min-w-0 flex-1 space-y-1">
          {entry.error === null ? (
            <p data-title className="font-medium break-words">
              <PageLink entry={entry} entries={entries}>
                {entry.title}
              </PageLink>
            </p>
          ) : (
            <p className="font-mono text-body-medium break-all">
              <PageLink entry={entry} entries={entries}>
                {entry.file}
              </PageLink>
            </p>
          )}
          <CardMeta entry={entry} />
          <CardFrom entry={entry} editable={startable} onRefused={onRefused} />
          <NoQueue entry={entry} />
          {entry.queued && (
            <p className="flex flex-wrap items-baseline gap-x-2 text-body-small text-muted-foreground">
              <span
                data-queued={entry.queued.place ?? ''}
                className="rounded-full border border-outline-variant bg-surface-container-highest px-2 py-0.5 font-medium text-on-surface-variant"
              >
                {queuedWord(entry.queued)}
              </span>
              <span>
                since <Instant data-queued-at at={entry.queued.at} about="When it was queued, which orders the queue" />
              </span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {startable && (
            <button
              type="button"
              aria-expanded={starting}
              onClick={() => setStarting(!starting)}
              className={starting ? BUTTON_OUTLINED : BUTTON}
            >
              {starting ? 'Close' : 'Start'}
            </button>
          )}
          <QueueButtons entry={entry} pending={queue.isPending} onQueue={(off) => queue.mutate(off)} />
          {entry.file.endsWith('.md') && (
            <button type="button" disabled={remove.isPending} onClick={() => remove.mutate()} className={BUTTON_OUTLINED}>
              {remove.isPending ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      </div>

      {started && <StartedAs startedAs={startedAs} state={phase} after={REMOVE_STARTED} />}
      {triedShown(entry) && <TriedHere entry={entry} />}
      {entry.error !== null && (
        <div className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
          <p className="text-body-medium font-medium text-on-failure-container">Does not read as a card, so it cannot start:</p>
          <p className="font-mono text-body-small whitespace-pre-wrap break-words text-on-failure-container">{entry.error}</p>
        </div>
      )}
      {starting && startable && (
        <StartCard
          entry={entry}
          onStarted={setStartedNow}
          onRefused={(message) => onRefused(message === null ? null : { action: 'start', message })}
        />
      )}
      {refusal && <Refused refusal={refusal} />}
    </li>
  );
}

/**
 * A card's start: in the factory it names (`FactoryCardStart`), or, for a card that names none (`unassigned`), in the factory a person
 * picks first (`UnassignedStart`). A start the api took is told to `onStarted`, the card staying in the inbox, and opens the run's page.
 * A refusal is `onRefused`'s to show, since the form may not outlive it.
 */
function StartCard({
  entry,
  onStarted: told,
  onRefused,
}: {
  entry: InboxEntry;
  onStarted: (id: string) => void;
  onRefused: (message: string | null) => void;
}) {
  const navigate = useNavigate();
  const onStarted = (started: Started) => {
    told(started.id);
    void navigate({ to: '/runs/$runId', params: { runId: started.id } });
  };
  return unassigned(entry) ? (
    <UnassignedStart entry={entry} onStarted={onStarted} onRefused={onRefused} />
  ) : (
    <FactoryCardStart entry={entry} onStarted={onStarted} onRefused={onRefused} />
  );
}
