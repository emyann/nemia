import { useState } from 'react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FactoryCardStart, UnassignedStart } from '../components/FactoryCardStart';
import { FileCard } from '../components/FileCard';
import { CardMeta, GoneItem, NoQueue, PageLink, QueueButtons, PRIMARY, Refused, SECONDARY, Tried } from '../components/InboxParts';
import { CardFrom } from '../components/CardFrom';
import { dropCard, inboxQuery, queueCard, type InboxEntry, type Started } from '../lib/api';
import { factorySearch, keptBy, shownIn } from '../lib/factories';
import { cardLines, newestCardsFirst, queuedWord, queueOf, unassigned, type CardRefusal } from '../lib/inbox';

export const Route = createFileRoute('/inbox')({
  validateSearch: factorySearch,
  loader: ({ context }) => context.queryClient.ensureQueryData(inboxQuery),
  component: InboxPage,
  errorComponent: ({ error }) => (
    <p className="text-body-medium text-failure">
      Could not load the inbox: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

const code = (text: string) => <code className="font-mono text-body-small">{text}</code>;

/**
 * The inbox: a box that files a card, and the cards, newest first, each startable and removable. The page keeps what a start or a drop was
 * refused with, by card, since the inbox is read again after each answer: a card gone behind the page's back leaves the list, and its
 * refusal stays where it was listed until dismissed. A refusal is kept by the entry's file, as `cardLines` matches them: a card and a stray
 * file beside it answer to one name, and a refusal is of one of them.
 *
 * Every factory's cards are listed, each tagged with its own, and a card that names none says so; the factory the sidebar picks, kept in
 * the address as `?factory=<name>`, keeps only its own, and is the one the box files into until a person picks another: the counts are of
 * the cards it keeps, and a factory that keeps none says so and how to show every factory's.
 */
function InboxPage() {
  const { data: entries } = useSuspenseQuery(inboxQuery);
  const { factory } = Route.useSearch();
  const [refusals, setRefusals] = useState<CardRefusal[]>([]);
  const all = newestCardsFirst(entries);
  const cards = shownIn(all, factory);
  const queue = queueOf(cards).length;
  const lines = cardLines(entries, refusals).filter(({ entry }) => keptBy(factory)(entry));
  const refusalFor = (entry: InboxEntry) => (refusal: Omit<CardRefusal, 'entry'> | null) =>
    setRefusals((kept) => [...kept.filter((r) => r.entry.file !== entry.file), ...(refusal ? [{ ...refusal, entry }] : [])]);

  return (
    <article className="space-y-6">
      <p className="text-body-medium text-muted-foreground">
        An idea parked as a card until you start a workflow on it: a file each in the store&apos;s {code('inbox/')}, as the box below or the
        command line parks one. Starting a card writes its run&apos;s record as any start does, and removes the card. A card queued starts
        on its own, on the workflow it names, when the daemon — this api, or the command line&apos;s — has a run slot free: the oldest
        queued first.
      </p>
      <FileCard shown={factory} />
      <section aria-label="Cards" className="space-y-3">
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
        {cards.length === 0 && all.length > 0 && (
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
 * A card: its first line, linked to its page, and under it its name, factory, workflow, repository and filing time (`CardMeta`); Start,
 * which opens its start, in its factory or in one picked there, and Remove. Queue on a card that names a factory and a workflow, and
 * Unqueue on a queued one (`QueueButtons`), with why not on a card that names a workflow alone (`NoQueue`); on a queued card its place
 * and when it was queued; and, when the tick tried its start and did not make it, why — a card refused stays queued, as the package keeps
 * it. A card a run's record names — started, its removal failed — links to its run and offers Remove only. An entry that does not read as a
 * card shows why, with its file for a title, and offers Remove when it is a card's file, which the CLI's `inbox rm` can drop.
 *
 * Its page shows the body rendered and its keys explained, and for a file that does not read, the file as written. A folder, a name the api
 * refuses, or a stray file a card of the same name answers for has no page (`hasPage`), and its title is its name alone.
 *
 * A start from this page whose card could not be removed is kept (`kept`): the start form goes, since the card may not start again, and the
 * card says it was started as that run, before the inbox is read again and names it, with why its removal failed, in the api's words —
 * which only the start's answer carries, so a later visit says it was started, and not why.
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
  const [kept, setKept] = useState<{ id: string; why: string } | null>(null);
  const remove = useMutation({
    mutationFn: () => dropCard(entry.name),
    onMutate: () => onRefused(null),
    onError: (error) => onRefused({ action: 'remove', message: error.message }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
  const queue = useMutation({
    mutationFn: (off: boolean) => queueCard(entry.name, { off }),
    onMutate: () => onRefused(null),
    onError: (error, off) => onRefused({ action: off ? 'unqueue' : 'queue', message: error.message }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
  const startedAs = kept && !entry.startedAs.includes(kept.id) ? [...entry.startedAs, kept.id] : entry.startedAs;
  const started = startedAs.length > 0;
  const startable = !started && entry.error === null;

  return (
    <li
      aria-label={`Card ${entry.name}`}
      data-card={entry.name}
      className="space-y-3 rounded-lg border border-outline-variant bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
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
                since{' '}
                <time data-queued-at dateTime={entry.queued.at} title="When it was queued: what orders the queue">
                  {new Date(entry.queued.at).toLocaleString()}
                </time>
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
              className={starting ? SECONDARY : PRIMARY}
            >
              {starting ? 'Close' : 'Start'}
            </button>
          )}
          <QueueButtons entry={entry} pending={queue.isPending} onQueue={(off) => queue.mutate(off)} />
          {entry.file.endsWith('.md') && (
            <button type="button" disabled={remove.isPending} onClick={() => remove.mutate()} className={SECONDARY}>
              {remove.isPending ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      </div>

      {started && <StartedAs startedAs={startedAs} kept={kept} />}
      {entry.queued && entry.tried && <Tried entry={{ ...entry, tried: entry.tried }} />}
      {entry.error !== null && (
        <div className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
          <p className="text-body-medium font-medium text-on-failure-container">Does not read as a card, so it cannot start:</p>
          <p className="font-mono text-body-small whitespace-pre-wrap break-words text-on-failure-container">{entry.error}</p>
        </div>
      )}
      {starting && startable && (
        <StartCard
          entry={entry}
          onKept={setKept}
          onRefused={(message) => onRefused(message === null ? null : { action: 'start', message })}
        />
      )}
      {refusal && <Refused refusal={refusal} />}
    </li>
  );
}

/** The runs a card still in the inbox was started as, each linked, and why its removal failed where this page was told (`kept`). */
function StartedAs({ startedAs, kept }: { startedAs: readonly string[]; kept: { why: string } | null }) {
  return (
    <p data-started-as className="text-body-medium text-yours">
      Started as{' '}
      {startedAs.map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <Link to="/runs/$runId" params={{ runId: id }} className="font-mono underline underline-offset-2">
            {id}
          </Link>
        </span>
      ))}
      , and still here because its removal failed. Remove drops it; to run the idea again, file it again.
      {kept && (
        <span data-kept className="mt-1 block font-mono text-body-small break-all">
          {kept.why}
        </span>
      )}
    </p>
  );
}

/**
 * A card's start: in the factory it names (`FactoryCardStart`), or, for a card that names none (`unassigned`), in the factory a person
 * picks first (`UnassignedStart`). A start the api took opens the run's page — unless the card stayed in the inbox, which `onKept` is
 * told of, with why, and
 * the page stays. A refusal is `onRefused`'s to show, since the form may not outlive it.
 */
function StartCard({
  entry,
  onKept,
  onRefused,
}: {
  entry: InboxEntry;
  onKept: (kept: { id: string; why: string }) => void;
  onRefused: (message: string | null) => void;
}) {
  const navigate = useNavigate();
  const onStarted = (started: Started) => {
    if (started.removed === false) onKept({ id: started.id, why: started.why ?? 'the api did not say why' });
    else void navigate({ to: '/runs/$runId', params: { runId: started.id } });
  };
  return unassigned(entry) ? (
    <UnassignedStart entry={entry} onStarted={onStarted} onRefused={onRefused} />
  ) : (
    <FactoryCardStart entry={entry} onStarted={onStarted} onRefused={onRefused} />
  );
}
