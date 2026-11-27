import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { Body } from '@/components/ui/ds';
import { CopyId, CutFrame, CutTag, MeaningTag } from '@/components/look';
import { factoriesQuery } from '@/lib/api/factories';
import { workflowNameOf } from '@/lib/api/workflows';
import type { InboxEntry } from '@/lib/api/inbox';
import { cardTag, factoryRepoOf, triedShown, type CardRefusal } from '@/lib/inbox';
import { Instant } from '../time/Instant';
import { CardActions, CardLink } from './CardActions';
import { Refused, Tried } from './InboxParts';

/** How a card is drawn: in a grid, in a chain beside its neighbours (`compact`, which drops what the chain's lines say), or as a row. */
export type CardSize = 'regular' | 'compact';

/** What a card says of where it runs: its factory and its workflow, or that it has none. */
const whereOf = (entry: InboxEntry) =>
  `${entry.factory ?? 'no factory'} / ${entry.workflow === null ? 'no workflow' : workflowNameOf(entry.workflow)}`;

/** Whether a card waits on one only a person can release, and is not queued: the artboard's stuck. */
const stuckOf = (entry: InboxEntry) => entry.state === 'filed' && (entry.waits ?? []).some((w) => w.stalled);

/** The tick's last try of a card's start, saying the repository its factory wires for the card's workflow, which the Card does not carry. */
function TriedHere({ entry }: { entry: InboxEntry & { tried: NonNullable<InboxEntry['tried']> } }) {
  const factories = useQuery(factoriesQuery).data;
  return <Tried entry={{ ...entry, factoryRepo: factoryRepoOf(entry, factories) }} />;
}

/** The tag a card wears: its one word, in its meaning, its sentence on hover; none for a card filed that says nothing. */
function StateTag({ entry }: { entry: InboxEntry }) {
  const tag = cardTag(entry);
  if (tag === null) return null;
  return (
    <span title={tag.title} data-card-state={tag.word} className="inline-flex flex-none">
      <CutTag>
        <MeaningTag hue={tag.hue} form={tag.form} className="uppercase">
          {tag.word}
        </MeaningTag>
      </CutTag>
    </span>
  );
}

/** A card's labels on one line: each value, and `key: value` on hover. */
function LabelValues({ labels }: { labels: Readonly<Record<string, string>> }) {
  const pairs = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  if (pairs.length === 0) return null;
  return (
    <Body size="small" colorRole="on-surface-variant" data-card-labels className="flex flex-wrap gap-x-3">
      {pairs.map(([key, value]) => (
        <span key={key} title={`${key}: ${value}`}>
          {value}
        </span>
      ))}
    </Body>
  );
}

/** What a card says under its title: the runs it reads, and what it waits on. */
function Facts({ entry, compact }: { entry: InboxEntry; compact: boolean }) {
  const waits = (entry.waits ?? []).length > 0;
  return (
    <>
      {entry.from.length > 0 && (
        <Body size="small" colorRole="on-surface-variant" data-card-reads className="inline-flex items-center gap-1">
          <Paperclip aria-hidden size={14} />
          Reads {entry.from.length} {entry.from.length === 1 ? 'run' : 'runs'}
        </Body>
      )}
      {waits && !compact && (
        <Body size="small" colorRole="on-surface-variant" data-card-waits>
          {stuckOf(entry) ? 'A card before it ended without succeeding: edit what it runs after, or cancel its start.' : 'Runs once the cards before it are done.'}
        </Body>
      )}
      {entry.error !== null && (
        <Body size="small" data-card-error className="break-words text-failure">
          Does not read as a card, so it cannot start: {entry.error}
        </Body>
      )}
    </>
  );
}

/**
 * A card of the Inbox in a grid or a chain: a cut frame, in a colour only for a card at work, waiting on you, refused or stuck, with its
 * state's tag, its factory and workflow and when it was filed, its title linked to its page, its name with the control that copies it,
 * its labels, what it reads and what it waits on, the tick's last try where it has one, and its actions (`CardActions`). The compact
 * size, in a chain, leaves the labels and the line of what it waits on out: the chain's wires say it. `chain` is the cards of its
 * chain where the page draws it whole.
 */
export function InboxCard({
  entry,
  size = 'regular',
  chain = null,
}: {
  entry: InboxEntry;
  size?: CardSize;
  chain?: readonly InboxEntry[] | null;
}) {
  const [refusal, setRefusal] = useState<Omit<CardRefusal, 'entry'> | null>(null);
  const compact = size === 'compact';
  const tag = cardTag(entry);
  const stuck = stuckOf(entry);
  return (
    <CutFrame hue={tag?.frame ?? 'none'} size={compact ? 12 : 24} fill className="h-full w-full">
      <article aria-label={`Card ${entry.name}`} data-card={entry.name} className={compact ? 'flex h-full flex-col gap-1.5 p-3' : 'flex h-full flex-col gap-2 p-4'}>
        <div className="flex items-center gap-2">
          <StateTag entry={entry} />
          <Body size="small" colorRole="on-surface-variant" component="span" title="Factory / workflow" className="min-w-0 flex-1 truncate">
            {whereOf(entry)}
          </Body>
          {entry.filedAt && (
            <Body size="small" colorRole="on-surface-variant" component="span" className="whitespace-nowrap">
              <Instant at={entry.filedAt} about="When its file was last written" />
            </Body>
          )}
        </div>
        <Body size="medium" component="p" data-title className="font-medium break-words">
          <CardLink entry={entry} className="underline decoration-outline underline-offset-4 hover:decoration-current" />
        </Body>
        <CopyId id={entry.name} short={compact} of="card" />
        {!compact && <LabelValues labels={entry.labels} />}
        <Facts entry={entry} compact={compact} />
        {!compact && triedShown(entry) && <TriedHere entry={entry} />}
        {refusal && <Refused refusal={{ ...refusal, entry }} />}
        <div className="mt-auto flex items-center justify-end gap-2 pt-1">
          <CardActions entry={entry} chain={chain} stuck={stuck} onRefused={setRefusal} />
        </div>
      </article>
    </CutFrame>
  );
}

/**
 * A card of the Inbox as a row of the list: its title first, linked to its page, with its name and copy control under it, then its
 * state's tag, its factory and workflow, when it was filed, and its actions at the end.
 */
export function InboxCardRow({ entry, chain = null }: { entry: InboxEntry; chain?: readonly InboxEntry[] | null }) {
  const [refusal, setRefusal] = useState<Omit<CardRefusal, 'entry'> | null>(null);
  const stuck = stuckOf(entry);
  return (
    <li aria-label={`Card ${entry.name}`} data-card={entry.name} className="space-y-1 border-b border-outline-variant py-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,12rem)_auto_auto] items-center gap-x-4">
        <div className="min-w-0">
          <Body size="medium" component="p" data-title className="truncate font-medium">
            <CardLink entry={entry} className="underline decoration-outline underline-offset-4 hover:decoration-current" />
          </Body>
          <CopyId id={entry.name} of="card" />
        </div>
        <div className="flex">
          <StateTag entry={entry} />
        </div>
        <Body size="small" colorRole="on-surface-variant" component="span" title="Factory / workflow" className="truncate">
          {whereOf(entry)}
        </Body>
        <Body size="small" colorRole="on-surface-variant" component="span" className="whitespace-nowrap">
          {entry.filedAt && <Instant at={entry.filedAt} about="When its file was last written" />}
        </Body>
        <div className="flex items-center justify-end gap-2">
          <CardActions entry={entry} chain={chain} stuck={stuck} onRefused={setRefusal} />
        </div>
      </div>
      <Facts entry={entry} compact={false} />
      {refusal && <Refused refusal={{ ...refusal, entry }} />}
    </li>
  );
}
