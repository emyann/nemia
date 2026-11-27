/**
 * The parts of an inbox card the Inbox page and a card's page draw: its state's chip and the runs it was started as, a tick's try and a
 * refusal.
 */
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { type CardState, type InboxEntry } from '../../lib/api/inbox.ts';
import { triedLine, type CardRefusal } from '../../lib/inbox';
import { instantWords } from '../../lib/instant';
import { container } from '../../lib/meaning';
import { CARD_WORDS } from '../../lib/words';
import { useNow } from '../../lib/useNow';
import { Body } from '@/components/ui/ds';

/**
 * A card's state as a chip: its word (`CARD_WORDS`), drawn in its hue's tonal form, and its sentence on hover. `data-card-state` is the
 * state the chip was drawn for, so a check reads it without reading a colour.
 */
export function CardStateChip({ state }: { state: CardState }) {
  const { word, title, hue } = CARD_WORDS[state];
  return (
    <Body
      size="small"
      component="span"
      data-card-state={state}
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 font-mono leading-none ${container[hue]}`}
    >
      {word}
    </Body>
  );
}

/**
 * The runs a card was started as, each linked to its page, then the chip of its state (`CardStateChip`) — its run's phase — where it has
 * one: none while a start made from the page waits for the inbox to say so. In rest itself, a started card being no fault; what it is
 * worth to a person is its chip's. `after` is said after the runs, on the Inbox page what Remove does to it.
 */
export function StartedAs({ startedAs, state, after }: { startedAs: readonly string[]; state: CardState | null; after?: ReactNode }) {
  return (
    <Body size="medium" colorRole="on-surface-variant" data-started-as className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span>
        Started as{' '}
        {startedAs.map((id, i) => (
          <span key={id}>
            {i > 0 && ', '}
            <Link to="/runs/$runId" params={{ runId: id }} className="font-mono underline underline-offset-2">
              {id}
            </Link>
          </span>
        ))}
      </span>{' '}
      {state !== null && <CardStateChip state={state} />}
      {after !== undefined && <span>{after}</span>}
    </Body>
  );
}

/**
 * The tick's last try of a queued card's start, which did not start it (`triedLine`): refused, in amber — it stays queued and waits for
 * you; failed otherwise, muted — the tick tries it again on the next pass.
 */
export function Tried({ entry }: { entry: InboxEntry & { tried: NonNullable<InboxEntry['tried']> } }) {
  const { refused } = entry.tried;
  const now = useNow(60_000);
  return (
    <Body
      size="small"
      data-tried={refused ? 'refused' : 'failed'}
      className={`rounded border px-3 py-2 break-words ${refused ? 'border-failure bg-failure-container text-on-failure-container' : 'border-outline-variant text-on-surface-variant'}`}
    >
      {triedLine(entry, instantWords(new Date(entry.tried.at), new Date(now)))}
    </Body>
  );
}

const NOT_DONE: Record<CardRefusal['action'], string> = {
  start: 'Not started',
  remove: 'Not removed',
  queue: 'Not queued',
  unqueue: 'Not taken off the queue',
  from: 'Its runs to read not changed',
  resend: 'Not sent on',
};

/** What a start, a drop, a queue or its taking back, a `from:` set, or a card sent on, was refused with, in the api's words. */
export function Refused({ refusal }: { refusal: CardRefusal }) {
  return (
    <div data-refused={refusal.action} className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
      <Body size="medium" className="font-medium text-on-failure-container">
        {NOT_DONE[refusal.action]}. The api refused it:
      </Body>
      <Body size="small" className="font-mono whitespace-pre-wrap break-words text-on-failure-container">
        {refusal.message}
      </Body>
    </div>
  );
}

