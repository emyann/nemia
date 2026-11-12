/**
 * `nemia inbox`, each of its forms an entry of the command table: the cards listed, an idea filed as one, a card queued to start on its own
 * or taken off the queue, its `from:` set, and a card dropped. None is routed by the table: the Card's verbs are declared in `objects`'
 * Api, and the api's handlers (apps/api/src/objects/cards.ts) call the handlers of `inbox add`, `inbox queue` and `inbox rm` by their
 * `input`. The writes' words are the client's (`objects`' `INBOX_WORDS`): it parses, words and prints them, and the entries here spread
 * those words beside their handlers. A card's `from:` (`nemia inbox from`) the api writes as part of the Card's whole write (`update`,
 * `replaceCard`), and reads one card with its file as written (`get`).
 */
import { INBOX_READ_WORDS, INBOX_ADD_WORDS, INBOX_FROM_WORDS, INBOX_QUEUE_WORDS, INBOX_RM_WORDS, runsNamed } from 'objects';
import { Effect, Schema } from 'effect';
import { type Args } from '../command/command.ts';
import { tableEntry, type Command, type Served } from '../command/entry.verb.ts';
import { setting } from '../config/config.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { parseSelectors, selectorsRefusal, selectsLabels } from '../watch/selector.ts';
import type { LeftOut } from '../labels/labels.ts';
import { cardInPlay, cardLabels, type InboxCard, type InboxListing } from './inbox.ts';
import { addToInbox, dropFromInbox, queueInInbox, type InboxDropped, type InboxQueued } from './inbox.store.ts';
import { EngineService } from '../runtime-client.ts';
import { howOf } from '../summary/how.verb.ts';
import { inboxJudged, setFrom, type InboxFrom } from './inbox.verb.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** Every value under `key`, in the order given. */
const listOf = (args: Args, key: string): string[] => {
  const value = args[key];
  return Array.isArray(value) ? value.map(String) : [];
};

/**
 * `nemia inbox`, whose words the client holds (`objects`' `INBOX_READ_WORDS`): each card still in play (`cardInPlay`), or every card with
 * `--all`; the client prints the cards' `Table` (`GET /api/cards`). A started card's state is its run's phase, judged through the
 * informer the caller keeps (`kept.runs`). `ended` counts the cards the selector takes that are left out for their run having ended: none
 * with `--all`.
 */
export const INBOX: Served<{ cards: InboxListing[]; ended: number; defaultStarts: boolean }> = {
  ...INBOX_READ_WORDS,
  handler: (args, kept) =>
    Effect.gen(function* () {
      const selector = listOf(args, 'selector');
      const refused = selectorsRefusal(selector);
      if (refused) return yield* Effect.fail(new Invalid({ message: `nemia inbox -l: ${refused}` }));
      const selectors = parseSelectors(selector);
      const e = yield* EngineService;
      const cards = yield* inboxJudged(e, yield* howOf(kept));
      const selected = cards.filter((card) => selectsLabels(selectors, cardLabels(card)));
      const shown = args.all === true ? selected : selected.filter(cardInPlay);
      const defaultStarts = yield* setting('defaultFactoryStarts');
      return { cards: shown, ended: selected.length - shown.length, defaultStarts };
    }),
};

/**
 * What `nemia inbox add`'s handler takes: the idea's text, the file it was read from (`from`, what a refusal calls it), and the keys the
 * card writes; `repo`, retired, refused whenever given (`addToInbox`). Its own, not `objects`' `CardFile`.
 */
export const InboxAddInput = Schema.Struct({
  idea: Schema.String,
  from: Schema.optionalKey(Schema.String),
  workflow: Schema.optionalKey(Schema.String),
  repo: Schema.optionalKey(Schema.String),
  factory: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type InboxAddInput = typeof InboxAddInput.Type;

/**
 * `nemia inbox add`: an idea filed as a card, its words the client's (`objects`' `INBOX_ADD_WORDS`). Its handler is handed the idea's text
 * under `idea` — the client reads a file where it is typed and sends its text — and the keys the api's `create` found (`filingOf`).
 */
export const INBOX_ADD: Served<{ card: InboxCard; file: string; labelsLeftOut?: readonly LeftOut[] }, InboxAddInput> = {
  ...INBOX_ADD_WORDS,
  input: InboxAddInput,
  handler: ({ idea, label, ...keys }) => Effect.suspend(() => addToInbox({ text: idea, ...keys, labels: [...(label ?? [])] })),
};

/** What `nemia inbox queue` did, and the card as it now reads. */
type Queued = {
  name: string;
  file: string;
  was: InboxQueued['was'];
  queued: string | null;
  place: number | null;
  of: number | null;
  card: InboxCard;
  factoryRepo: string | null;
};

/** What `nemia inbox queue`'s handler takes: the card, the workflow written with the mark, by its name, and `off`. */
export const InboxQueueInput = Schema.Struct({
  name: Schema.String,
  workflow: Schema.optionalKey(Schema.String),
  off: Schema.optionalKey(Schema.Boolean),
});
export type InboxQueueInput = typeof InboxQueueInput.Type;

/**
 * `nemia inbox queue`: a card marked to start on its own, or with `off` the mark taken back, its words the client's (`objects`'
 * `INBOX_QUEUE_WORDS`). A `workflow` is written as it is handed: the api's `queue` sends one by name, and this handler reads no folder.
 */
export const INBOX_QUEUE: Served<Queued, InboxQueueInput> = {
  ...INBOX_QUEUE_WORDS,
  input: InboxQueueInput,
  handler: ({ name, workflow, off }) =>
    Effect.gen(function* () {
      const done = yield* queueInInbox(name, { off: off === true, ...(workflow !== undefined ? { workflow } : {}) });
      return {
        name: done.card.name,
        file: done.file,
        was: done.was,
        queued: done.card.queued ?? null,
        place: done.place ?? null,
        of: done.of ?? null,
        card: done.card,
        factoryRepo: done.factoryRepo,
      };
    }),
};

/**
 * `nemia inbox from`: the runs a card's run is handed as context (its `from:`), set, or with `--off` taken off, its words the client's
 * (`objects`' `INBOX_FROM_WORDS`), which writes the card whole through the Card's `update`. Context is no wait: the run reads what each
 * concluded when its steps are filed, landed or in flight, and waits on none (`setFrom`).
 */
export const INBOX_FROM: Served<InboxFrom & { name: string; from: string[] }> = {
  ...INBOX_FROM_WORDS,
  handler: (args) =>
    Effect.map(setFrom(textOf(args, 'name') ?? '', args.off === true ? [] : [...runsNamed(args)]), (done) => ({
      ...done,
      name: done.card.name,
      from: done.card.from ?? [],
    })),
};

/** What `nemia inbox rm`'s handler takes: the card's name. */
export const InboxRmInput = Schema.Struct({ name: Schema.String });
export type InboxRmInput = typeof InboxRmInput.Type;

/**
 * `nemia inbox rm`: one card dropped without starting it, or, for a name with no card, which cards there are (`removed` false); the api
 * reads the card before it drops it, and refuses a name with none as `Missing`. Its words the client's (`objects`' `INBOX_RM_WORDS`).
 */
export const INBOX_RM: Served<InboxDropped, InboxRmInput> = {
  ...INBOX_RM_WORDS,
  input: InboxRmInput,
  handler: ({ name }) => dropFromInbox(name),
};

/** `nemia inbox`'s entries, in the order `nemia`'s help lists them. */
export const INBOXES: readonly (Command | Served)[] = [
  INBOX,
  tableEntry(INBOX_ADD),
  tableEntry(INBOX_QUEUE),
  INBOX_FROM,
  tableEntry(INBOX_RM),
];
