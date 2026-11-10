/**
 * A feed line as an `Event` (from `objects`): the namespace it is served in (`eventNamespace`) and the reason it is served under
 * (`eventReason`), both proved by contracts/event.contract.ts, and the object itself (`eventOf`), named by the byte its line starts at
 * and versioned by the cursor just after it. A line read off the door is already upgraded to v1's fields (`upgraded`), so a v0 line and
 * its v1 form come to one Event. A field the line holds that is no word of the Event's Schema — a newer writer's — is served as the
 * feed's table says of the served reason, or left out where the Schema lets it be. Pure.
 */
import {
  ANSWER_VIA,
  API_VERSION,
  DEFAULT_NAMESPACE,
  EVENT_SOURCES,
  EVENT_TYPES,
  EVENT_WAITS,
  type Event,
  INVOLVED_KINDS,
  WAIT_ON,
} from 'objects';
import type { EventInvolvedKind, EventNamespace, EventReason } from '../../contracts/event.contract.ts';
import { isRunLine, isStoreLine, messageOf, REASON_CODES, sourceOf, typeOf, type FeedLine } from '../feed/index.ts';

/** The namespace an event is in: the factory its line names, `default` for a run's or a step's that names none, else none. */
export const eventNamespace: EventNamespace = (kind, factory) => {
  if (factory !== undefined && factory !== '') return factory;
  return kind === 'Run' || kind === 'Step' ? DEFAULT_NAMESPACE : undefined;
};

/** The reason an event is served under: its line's, where it is one of `known`, else `Unknown`. */
export const eventReason: EventReason = (reason, known) => (known.includes(reason) ? reason : 'Unknown');

/** Whether `word` is one of `words`, narrowed to them. */
const oneOf = <const W extends string>(words: readonly W[], word: unknown): word is W =>
  typeof word === 'string' && (words as readonly string[]).includes(word);

/** What a line is about: its `involved.kind` where it is a word of the Event's, else what the line's shape says it is. */
const kindOf = (line: FeedLine): EventInvolvedKind => {
  const said = line.involved?.kind;
  if (oneOf(INVOLVED_KINDS, said)) return said;
  if (isRunLine(line)) return line.step === undefined ? 'Run' : 'Step';
  return isStoreLine(line) ? 'Store' : 'Daemon';
};

/** The name of what a line is about, as `involvedOf` reads it. */
const nameOf = (line: FeedLine): string =>
  line.involved?.name ??
  (isRunLine(line)
    ? line.step === undefined
      ? line.run
      : `${line.run}/${line.step}`
    : isStoreLine(line)
      ? line.store
      : String(line.daemon));

/** The labels a line carries, only those with a string value, or none where it carries none. */
const labelsOf = (line: FeedLine): Record<string, string> | undefined => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(line.labels ?? {})) if (typeof value === 'string') out[key] = value;
  return Object.keys(out).length > 0 ? out : undefined;
};

/**
 * An event's `resourceVersion`: a position, not a digest — the byte of the feed just after its line, where a read from it goes on, which
 * only grows as the feed is written.
 */
export const feedPosition = (end: number): string => String(end);

/** The line `line`, which starts at byte `start` of the feed and ends just before `end`, as an Event. */
export const eventOf = (line: FeedLine, start: number, end: number): Event => {
  const labels = labelsOf(line);
  const kind = kindOf(line);
  const namespace = eventNamespace(kind, labels?.factory);
  const served = eventReason(line.reason ?? 'Unknown', REASON_CODES);
  const reason = oneOf(REASON_CODES, served) ? served : 'Unknown';
  return {
    apiVersion: API_VERSION,
    kind: 'Event',
    metadata: {
      name: String(start),
      ...(namespace !== undefined ? { namespace } : {}),
      ...(labels !== undefined ? { labels } : {}),
      creationTimestamp: line.at,
      resourceVersion: feedPosition(end),
    },
    involved: { kind, name: nameOf(line) },
    reason,
    type: oneOf(EVENT_TYPES, line.type) ? line.type : typeOf(reason),
    message: line.message ?? messageOf({ word: line.word, ...(line.note !== undefined ? { note: line.note } : {}) }),
    source: oneOf(EVENT_SOURCES, line.source) ? line.source : sourceOf(reason),
    ...(oneOf(EVENT_WAITS, line.waits) ? { waits: line.waits } : {}),
    ...(oneOf(WAIT_ON, line.on) ? { on: line.on } : {}),
    ...(oneOf(ANSWER_VIA, line.via) ? { via: line.via } : {}),
    ...(line.call !== undefined ? { call: line.call } : {}),
    ...(line.try !== undefined ? { try: line.try } : {}),
  };
};
