/**
 * What `nemia channel` tells a Claude Code session of one event of the feed (apps/cli, src/watch/channel.ts, `channelNotice`): the
 * `notifications/claude/channel` params, `content` the body of the `<channel>` tag the session reads and `meta` its attributes. The
 * event is `objects`' `Event`, the feed's line served as an object, so the session is told the feed in the words the api serves it in
 * and no others: its sentence as the body, and each of its fields as an attribute under its own name, a nested one joined to its parent by
 * `_` (Claude Code drops a key that is no identifier — letters, digits and underscores — so none is spelled otherwise). A field the event
 * does not carry is no attribute. The labels are left out: a selector already chose the event by them, and a label's key may be no
 * identifier. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Event } from 'objects';

/**
 * The attributes of the `<channel>` tag: the event's fields by name, each a string, as the channel's notification carries them. Implement
 * may move it into `src`, which changes no law.
 */
export type ChannelMeta = {
  readonly involved_kind: string;
  readonly involved_name: string;
  readonly reason: string;
  readonly type: string;
  readonly source: string;
  readonly at: string;
  readonly resource_version: string;
  readonly namespace?: string;
  readonly waits?: string;
  readonly on?: string;
  readonly via?: string;
  readonly call?: string;
  readonly try?: string;
};

/** What a channel's notification says of one event: its body and its attributes. */
export type ChannelNotice = { readonly content: string; readonly meta: ChannelMeta };

const channelNoticeSpec = spec<(event: Event) => ChannelNotice>({
  ensures: {
    theSentenceIsTheBody: {
      description: 'The session reads the sentence the feed wrote for a person as the body of the tag',
      condition: ({ input: [event], output }) => output.content === event.message,
    },
    itSaysWhatItIsAbout: {
      description: 'The tag names what the event is about: its kind and its name (a run, run/step, a factory, a daemon or the store)',
      condition: ({ input: [event], output }) =>
        output.meta.involved_kind === event.involved.kind && output.meta.involved_name === event.involved.name,
    },
    itSaysWhyAndWhose: {
      description: 'The tag carries the reason a machine selects on, its type and whose deed it is, as the Event says them',
      condition: ({ input: [event], output }) =>
        output.meta.reason === event.reason && output.meta.type === event.type && output.meta.source === event.source,
    },
    itSaysWhenAndWhereToResume: {
      description: 'The tag carries when the line was written and the cursor just after it, from which a read of the feed goes on',
      condition: ({ input: [event], output }) =>
        output.meta.at === event.metadata.creationTimestamp && output.meta.resource_version === event.metadata.resourceVersion,
    },
    itSaysItsFactoryExactlyWhenItHasOne: {
      description: 'The tag names the namespace (the factory) the event is in exactly when it is in one',
      condition: ({ input: [event], output }) => output.meta.namespace === event.metadata.namespace,
    },
    itSaysEachQualifierExactlyWhenTheEventHasIt: {
      description: 'What a line waits on, where its answer is asked and the call it denied are said exactly when the event says them',
      condition: ({ input: [event], output }) =>
        output.meta.waits === event.waits && output.meta.on === event.on && output.meta.via === event.via && output.meta.call === event.call,
    },
    itSaysTheTryExactlyWhenTheEventHasOne: {
      description: 'The try of a denied call is said exactly when the event carries one',
      condition: ({ input: [event], output }) => (output.meta.try === undefined) === (event.try === undefined),
    },
  },
});

/** `channelNotice`'s type, which `src/watch/channel.ts` takes. */
export type ChannelNoticeOf = Implementation<typeof channelNoticeSpec>;
