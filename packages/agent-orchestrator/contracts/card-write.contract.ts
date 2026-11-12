/**
 * Whether a card may be written whole through the Card's update (`PUT /api/namespaces/<factory>/cards/<name>`, `nemia apply`), and why
 * not (agent-orchestrator, src/card-write/card-write.ts, `cardWriteRefusal`), before anything is written: a card a run's record says was
 * started keeps its file as its run read it (`started`, a Conflict, as `nemia inbox from` refuses one); a write that hands back the
 * `resourceVersion` it read, where the card now has another, is stale (`stale`, a Conflict); `queued` is a person's intent said by the
 * card's actions (`nemia inbox queue`, the Card's `queue` and `unqueue`), so a write that changes it is refused (`queued`, an Invalid
 * naming them); `repo` is retired — a card names its factory and its workflow, and the factory places the run — so a write that sets a
 * `repo:` or changes the one an old card has is refused (`repo`, an Invalid naming `nemia factory attach <f> <wf> --repo <name>`), while
 * one that sends an old card's back as it is, or takes it off, is not; and a card with no body is no card (`empty`, an Invalid). Every
 * other write is the package's to read as a card (`parseInboxCard`, which refuses a key's value in its own words) and to write.
 *
 * One refusal is answered where several hold, the first of that order: a started card is refused as started whatever else is wrong.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What the refusal is read from: whether a run was started from the card, its `queued:` now and as sent (absent where unset), its
 * retired `repo:` now and as sent (absent where unset), its `resourceVersion` now and the one the write hands back (absent where it hands
 * none), and the body sent.
 */
export type CardWriteAsk = {
  readonly started: boolean;
  readonly queuedNow?: string;
  readonly queuedSent?: string;
  readonly repoNow?: string;
  readonly repoSent?: string;
  readonly versionNow: string;
  readonly versionSent?: string;
  readonly body?: string;
};

/** Why a card's write is refused, closed: started, stale, `queued` changed, a retired `repo:` set or changed, or no body. */
export type CardWriteRefusal = 'started' | 'stale' | 'queued' | 'repo' | 'empty';

/** Whether the write hands back a version the card no longer has. */
const stale = (ask: CardWriteAsk): boolean => ask.versionSent !== undefined && ask.versionSent !== ask.versionNow;

/** Whether the write changes `queued:`, setting it, moving it or taking it off. */
const requeues = (ask: CardWriteAsk): boolean => ask.queuedSent !== ask.queuedNow;

/** Whether the write sets a `repo:` the card has none of, or another than the one it has: taking one off sets none. */
const placesByRepo = (ask: CardWriteAsk): boolean => ask.repoSent !== undefined && ask.repoSent !== ask.repoNow;

/** Whether the write sends no body. */
const empty = (ask: CardWriteAsk): boolean => ask.body === undefined || ask.body === '';

const cardWriteRefusalSpec = spec<(ask: CardWriteAsk) => CardWriteRefusal | null>({
  ensures: {
    startedRefused: {
      description: 'A card a run was started from is refused as started, whatever else the write says',
      condition: ({ input: [ask], output }) => !ask.started || output === 'started',
    },
    staleRefused: {
      description: 'A write that read a version the card no longer has is refused as stale, unless the card was started',
      condition: ({ input: [ask], output }) => ask.started || !stale(ask) || output === 'stale',
    },
    queuedIsAnAction: {
      description: 'A write that changes when the card was queued is refused, the queue being an action of its own',
      condition: ({ input: [ask], output }) => ask.started || stale(ask) || !requeues(ask) || output === 'queued',
    },
    repoRetired: {
      description: "A write that sets a card's repository, or changes an old card's, is refused: the factory places a card's run",
      condition: ({ input: [ask], output }) => ask.started || stale(ask) || requeues(ask) || !placesByRepo(ask) || output === 'repo',
    },
    oldRepoKept: {
      description: "A write that sends an old card's repository back as it is, or takes it off, is never refused for it",
      condition: ({ input: [ask], output }) => placesByRepo(ask) || output !== 'repo',
    },
    bodyRequired: {
      description: 'A write with no body is refused as empty, where nothing before it refuses it',
      condition: ({ input: [ask], output }) =>
        ask.started || stale(ask) || requeues(ask) || placesByRepo(ask) || !empty(ask) || output === 'empty',
    },
    writtenOtherwise: {
      description: 'A write none of those refuse is let through',
      condition: ({ input: [ask], output }) =>
        ask.started || stale(ask) || requeues(ask) || placesByRepo(ask) || empty(ask) || output === null,
    },
  },
});

/** `cardWriteRefusal`'s type, which src/card-write/card-write.ts takes. */
export type CardWriteRefusalOf = Implementation<typeof cardWriteRefusalSpec>;
