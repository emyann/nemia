import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Body, Cell, Column, Label, Row, Table, TableBody, TableHeader } from '@/components/ui/ds';
import { cn } from '@/components/ui/ds/utils';
import { CopyId, CutFrame, CutTag, FRAMED_ROW, FRAMED_TABLE, MeaningTag, TableAtCut } from '@/components/look';
import { factoriesQuery } from '@/lib/api/factories';
import { workflowNameOf } from '@/lib/api/workflows';
import type { InboxEntry } from '@/lib/api/inbox';
import { cardTag, clashWords, factoryRepoOf, triedShown, waitWords, type CardRefusal } from '@/lib/inbox';
import { Instant } from '../time/Instant';
import { CardActions, CardLink } from './CardActions';
import { Refused, Tried } from './InboxParts';

/** The least width the inbox's grid gives a card: as many cards stand in a row as the column holds at this width. */
export const CARD_LEAST = '20rem';

/** How a card is drawn: in a grid, in a chain beside its neighbours (`compact`, which drops what the chain's lines say), or as a row. */
export type CardSize = 'regular' | 'compact';

/** What a card says of where it runs: its factory and its workflow, or that it has none. */
const whereOf = (entry: InboxEntry) =>
  `${entry.factory ?? 'no factory'} / ${entry.workflow === null ? 'no workflow' : workflowNameOf(entry.workflow)}`;

/** Whether a card waits on one only a person can release, and is not queued: the artboard's stuck. */
const stuckOf = (entry: InboxEntry) => entry.state === 'filed' && (entry.waits ?? []).some((w) => w.stalled);

/**
 * The tick's last try of a card's start, saying the repository its factory wires for the card's workflow, which the Card does not carry.
 */
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
          {stuckOf(entry) ? waitWords(entry.name, entry.waits ?? []) : 'Runs once the cards before it are done.'}
        </Body>
      )}
      {entry.clash && (
        <Body size="small" data-card-clash={entry.clash.join(' ')}>
          {clashWords(entry.clash)}
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
      <article
        aria-label={`Card ${entry.name}`}
        data-card={entry.name}
        className={compact ? 'flex h-full min-w-0 flex-col gap-1.5 p-3' : 'flex h-full min-w-0 flex-col gap-2 p-4'}
      >
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
        <CopyId id={entry.name} short={compact} of="card" wrap={!compact} />
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

/** A column's heading, in the look's small caps. */
const HEAD = 'uppercase';

/** What the Filed column wears: drawn from the frame grid's 768-pixel step of the page column, folded under the title below it. */
const FILED_SHOWN = 'hidden @3xl/page:table-cell';

/**
 * What the Factory / workflow column wears: drawn from the page column's 1024-pixel step, folded under the title below it, so that
 * between the two steps the set widths leave the Card column room for a title.
 */
const WHERE_SHOWN = 'hidden @5xl/page:table-cell';

/**
 * A card of the Inbox as a row of the list: its title linked to its page, its name with the control that copies it, its labels and what
 * it reads under it; its state's tag, or nothing; its factory and workflow; when it was filed; and its actions. The factory folds under
 * the title below the page column's 1024-pixel step, and the filing time below the frame grid's 768-pixel step. The row opens the
 * card's page on a press or Enter, through the board's router; a control inside it does its own thing.
 */
function InboxRow({ entry }: { entry: InboxEntry }) {
  const [refusal, setRefusal] = useState<Omit<CardRefusal, 'entry'> | null>(null);
  const navigate = useNavigate();
  const filed = entry.filedAt && <Instant at={entry.filedAt} about="When its file was last written" />;
  return (
    <Row
      id={entry.file}
      textValue={entry.title ?? entry.file}
      data-card={entry.name}
      className={FRAMED_ROW}
      onAction={() => void navigate({ to: '/inbox/$name', params: { name: entry.name } })}
    >
      <Cell data-card-cell className="py-2.5">
        <span className="flex min-w-0 flex-col gap-1">
          <Body size="medium" component="span" data-title className="block min-w-0 font-medium" title={entry.title ?? entry.file}>
            <CardLink
              entry={entry}
              className="block w-fit max-w-full truncate underline decoration-outline underline-offset-4 hover:decoration-current"
            />
          </Body>
          <CopyId id={entry.name} of="card" wrap />
          <Body
            size="small"
            colorRole="on-surface-variant"
            component="span"
            data-card-folded
            className="flex flex-wrap gap-x-3 @5xl/page:hidden"
          >
            <span title="Factory / workflow">{whereOf(entry)}</span>
            {filed && <span className="@3xl/page:hidden">{filed}</span>}
          </Body>
          <LabelValues labels={entry.labels} />
          <Facts entry={entry} compact={false} />
          {refusal && <Refused refusal={{ ...refusal, entry }} />}
        </span>
      </Cell>
      <Cell data-card-tag>
        <StateTag entry={entry} />
      </Cell>
      <Cell data-card-where className={WHERE_SHOWN}>
        <Body size="small" colorRole="on-surface-variant" component="span" title="Factory / workflow" className="block truncate">
          {whereOf(entry)}
        </Body>
      </Cell>
      <Cell data-card-filed className={FILED_SHOWN}>
        <Body size="small" colorRole="on-surface-variant" component="span" className="block truncate">
          {filed}
        </Body>
      </Cell>
      <Cell data-card-actions>
        <span className="flex items-center justify-end gap-2">
          <CardActions entry={entry} chain={null} stuck={stuckOf(entry)} onRefused={setRefusal} />
        </span>
      </Cell>
    </Row>
  );
}

/**
 * The Inbox's cards as a list: the kit's dense table in the look's cut frame, as the runs' finished table is, one header row and the
 * same five columns on every row (Card, State, Factory / workflow, Filed, Actions). The Card column takes what the others leave, each
 * of which keeps its set width, so every column's left edge is one x down the list at any width of the page column; Factory / workflow
 * folds under the title below the page column's 1024-pixel step, and Filed below the frame grid's 768-pixel step. Narrower than its
 * columns, the table scrolls sideways inside its frame. `entries` are the cards, in the page's order.
 */
export function InboxList({ entries }: { entries: readonly InboxEntry[] }) {
  return (
    <CutFrame size={24}>
      <TableAtCut data-table-box>
        <Table aria-label="Cards" density="dense" className={cn('min-w-[480px] table-fixed', FRAMED_TABLE)}>
          <TableHeader>
            <Column id="card" isRowHeader className={HEAD}>
              <Label size="small" component="span">
                Card
              </Label>
            </Column>
            <Column id="state" className={cn(HEAD, 'w-[128px]')}>
              <Label size="small" component="span">
                State
              </Label>
            </Column>
            <Column id="where" className={cn(HEAD, 'w-[200px]', WHERE_SHOWN)}>
              <Label size="small" component="span">
                Factory / workflow
              </Label>
            </Column>
            <Column id="filed" className={cn(HEAD, 'w-[150px]', FILED_SHOWN)}>
              <Label size="small" component="span">
                Filed
              </Label>
            </Column>
            <Column id="actions" align="end" className={cn(HEAD, 'w-[176px]')}>
              <Label size="small" component="span">
                Actions
              </Label>
            </Column>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <InboxRow key={entry.file} entry={entry} />
            ))}
          </TableBody>
        </Table>
      </TableAtCut>
    </CutFrame>
  );
}
