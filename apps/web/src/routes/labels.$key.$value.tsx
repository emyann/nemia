import type { ReactNode } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { CardStateChip } from '../components/inbox/InboxParts';
import { PageName, Plate, ScanLines, StatTile, Sticker, TextLink } from '../components/look';
import { inboxSelectedQuery, labelStatsQuery, runsSelectedQuery, spentOf, type RunSummary } from '../lib/api';
import { startedCard } from '../lib/inbox';
import type { Hue } from '../lib/meaning';
import { dollars } from '../lib/money';

/** A bucket a run of the label page is counted in, by its phase and whether it waits on a person. */
type Bucket = 'waiting' | 'running' | 'needs a person' | 'landed' | 'failed' | 'stopped';

const BUCKETS: ReadonlyArray<{ bucket: Bucket; hue: Hue }> = [
  { bucket: 'waiting', hue: 'grey' },
  { bucket: 'running', hue: 'alive' },
  { bucket: 'needs a person', hue: 'yours' },
  { bucket: 'landed', hue: 'sage' },
  { bucket: 'failed', hue: 'failure' },
  { bucket: 'stopped', hue: 'grey' },
];

/** The bucket of `run`: a person's first, then its phase. */
export const bucketOf = (run: Pick<RunSummary, 'phase' | 'waitingOnYou'>): Bucket => {
  if (run.waitingOnYou.length > 0) return 'needs a person';
  switch (run.phase) {
    case 'running':
      return 'running';
    case 'succeeded':
      return 'landed';
    case 'failed':
      return 'failed';
    case 'stopped':
    case 'cancelled':
      return 'stopped';
    default:
      return 'waiting';
  }
};

export const Route = createFileRoute('/labels/$key/$value')({
  loader: ({ context, params }) => {
    const selector = `${params.key}=${params.value}`;
    return Promise.all([
      context.queryClient.ensureQueryData(inboxSelectedQuery(selector)),
      context.queryClient.ensureQueryData(runsSelectedQuery(selector)),
      context.queryClient.ensureQueryData(labelStatsQuery(selector)),
    ]);
  },
  component: LabelPage,
  staticData: { fullBleed: true },
});

function Section({ name, plate, children }: { name: string; plate: ReactNode; children: ReactNode }) {
  return (
    <section data-section={name} aria-label={name} className="flex flex-col gap-4">
      <div>{plate}</div>
      {children}
    </section>
  );
}

/**
 * The page of one label value, `key=value`: the cards of the inbox it holds that are still in play — the api's default listing: not
 * started, or whose run is in flight, each started one with its run's phase (`CardStateChip`) — then the runs it holds counted by
 * where each stands, and what they cost: every try of every run summed, whatever became of it, and the mean of those that landed — each
 * linking to its list filtered by it.
 */
function LabelPage() {
  const { key, value } = Route.useParams();
  const selector = `${key}=${value}`;
  const { data: cards } = useSuspenseQuery(inboxSelectedQuery(selector));
  const { data: runs } = useSuspenseQuery(runsSelectedQuery(selector));
  const { data: stats } = useSuspenseQuery(labelStatsQuery(selector));
  const counts = new Map<Bucket, number>();
  for (const run of runs) counts.set(bucketOf(run), (counts.get(bucketOf(run)) ?? 0) + 1);
  const spent = spentOf(stats);
  const cost = stats.all.total.costPerLanded;
  return (
    <ScanLines className="min-h-full px-4 py-6 sm:px-8">
      <article data-label-page={selector} className="mx-auto flex w-full max-w-[1360px] flex-col gap-10">
        <PageName>{selector}</PageName>
        <Section
          name="in play"
          plate={<Plate count={cards.length} title={cards.length === 1 ? 'Card in play' : 'Cards in play'} quiet={cards.length === 0} />}
        >
          {cards.length === 0 ? (
            <p className="m-0 text-body-medium text-on-surface-variant">
              No card with this label is in play: none waits to start, and no run started from one is at work or waits.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {cards.map((card) => (
                <li key={card.file} data-card={card.name} className="flex flex-wrap items-center gap-2">
                  <TextLink to="/inbox/$name" params={{ name: card.name }} className="text-body-medium">
                    {card.title ?? card.name}
                  </TextLink>
                  {startedCard(card) && <CardStateChip state={card.state} />}
                </li>
              ))}
            </ul>
          )}
          <TextLink to="/inbox" search={{ l: selector }} className="w-fit text-body-medium underline">
            The inbox filtered by {selector}
          </TextLink>
        </Section>
        <Section
          name="runs"
          plate={<Plate count={runs.length} title={runs.length === 1 ? 'Run' : 'Runs'} hue="alive" quiet={runs.length === 0} />}
        >
          <div data-buckets className="flex flex-wrap gap-3">
            {BUCKETS.map(({ bucket, hue }) => (
              <span key={bucket} data-bucket={bucket}>
                <Sticker hue={hue} label={bucket}>
                  {counts.get(bucket) ?? 0}
                </Sticker>
              </span>
            ))}
            <span data-label-spent>
              <StatTile hue="money" label="Spent" value={dollars(spent)} breakdown={null} />
            </span>
            <span data-label-cost>
              <StatTile hue="money" label="Cost per landed run" value={dollars(cost)} breakdown={null} />
            </span>
          </div>
          <TextLink to="/runs" search={{ l: selector }} className="w-fit text-body-medium underline">
            The runs filtered by {selector}
          </TextLink>
        </Section>
      </article>
    </ScanLines>
  );
}
