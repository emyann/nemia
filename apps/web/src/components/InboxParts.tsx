/** The parts of an inbox card the Inbox page draws: its line under the title, its page's link, a card gone, a tick's try and a refusal. */
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { workflowNameOf, type InboxEntry } from '../lib/api';
import { hasPage, triedLine, unassigned, type CardRefusal } from '../lib/inbox';
import { FactoryTag } from './FactoryTag';

/** A button that does what its form or card is for. */
export const PRIMARY =
  'rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary';
/** A button beside it. */
export const SECONDARY =
  'rounded border border-outline px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40';

/**
 * A card's line under its title: its name; the factory it names, linked to its floor, or, for a card that names none (`unassigned`),
 * that it has no factory yet, and never a tag; its workflow and repository when it names them; and when it was filed. An entry that does
 * not read as a card says nothing of a factory.
 */
export function CardMeta({ entry }: { entry: InboxEntry }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="font-mono">{entry.name}</span>
      {entry.error !== null ? null : unassigned(entry) ? (
        <span data-unassigned title="It names no factory: Start gives it one.">
          no factory yet
        </span>
      ) : (
        <FactoryTag name={entry.factory!} linked />
      )}
      {entry.workflow && (
        <span data-workflow={entry.workflow} title={entry.workflow}>
          workflow <span className="font-mono text-foreground">{workflowNameOf(entry.workflow)}</span>
        </span>
      )}
      {entry.repo && (
        <span data-repo className="font-mono break-all">
          {entry.repo}
        </span>
      )}
      {entry.filedAt && (
        <time dateTime={entry.filedAt} title="When its file was last written">
          {new Date(entry.filedAt).toLocaleString()}
        </time>
      )}
    </p>
  );
}

/** An entry's words, linked to its page where it has one among the entries listed with it (`hasPage`). */
export function PageLink({ entry, entries, children }: { entry: InboxEntry; entries: readonly InboxEntry[]; children: ReactNode }) {
  if (!hasPage(entry, entries)) return <>{children}</>;
  return (
    <Link
      to="/inbox/$name"
      params={{ name: entry.name }}
      className="underline decoration-outline underline-offset-4 hover:decoration-current"
    >
      {children}
    </Link>
  );
}

/**
 * A card the inbox no longer lists, kept in its place for what its start or its drop was refused with: dropped or started behind the page's
 * back. Its first line and name, that it is gone, the refusal, and Dismiss, which takes the line away.
 */
export function GoneItem({ entry, refusal, onDismiss }: { entry: InboxEntry; refusal: CardRefusal; onDismiss: () => void }) {
  return (
    <li
      aria-label={`Card ${entry.name}, no longer in the inbox`}
      data-gone={entry.name}
      className="space-y-3 rounded-lg border border-dashed border-outline p-4"
    >
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        <div className="min-w-0 flex-1 space-y-1">
          <p data-title className="font-medium break-words text-muted-foreground">
            {entry.title ?? entry.file}
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{entry.name}</span>
            <span>Gone from the inbox since this page listed it.</span>
          </p>
        </div>
        <button type="button" onClick={onDismiss} className={`${SECONDARY} shrink-0`}>
          Dismiss
        </button>
      </div>
      <Refused refusal={refusal} />
    </li>
  );
}

/**
 * The tick's last try of a queued card's start, which did not start it (`triedLine`): refused, in amber — it stays queued and waits for
 * you; failed otherwise, muted — the tick tries it again on the next pass.
 */
export function Tried({ entry }: { entry: InboxEntry & { tried: NonNullable<InboxEntry['tried']> } }) {
  const { refused } = entry.tried;
  return (
    <p
      data-tried={refused ? 'refused' : 'failed'}
      className={`rounded border px-3 py-2 text-xs break-words ${refused ? 'border-failure bg-failure-container text-on-failure-container' : 'border-outline-variant text-muted-foreground'}`}
    >
      {triedLine(entry, new Date(entry.tried.at).toLocaleString())}
    </p>
  );
}

const NOT_DONE: Record<CardRefusal['action'], string> = {
  start: 'Not started',
  remove: 'Not removed',
  queue: 'Not queued',
  unqueue: 'Not taken off the queue',
  from: 'Its runs to read not changed',
};

/** What a start, a drop, a queue or its taking back, or a `from:` set, was refused with, in the api's words. */
export function Refused({ refusal }: { refusal: CardRefusal }) {
  return (
    <div data-refused={refusal.action} className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
      <p className="text-sm font-medium text-on-failure-container">{NOT_DONE[refusal.action]}. The api refused it:</p>
      <p className="font-mono text-xs whitespace-pre-wrap break-words text-on-failure-container">{refusal.message}</p>
    </div>
  );
}
