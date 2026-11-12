/**
 * `nemia inbox`, each of its forms an entry of the command table: the cards listed, an idea filed as one, a card queued to start on its own
 * or taken off the queue, its `from:` set, and a card dropped. None is routed by the table: the Card's verbs are declared in `objects`'
 * Api, and the api's handlers (apps/api/src/objects/cards.ts) call the handlers of `inbox add`, `inbox queue` and `inbox rm` by their
 * `input`. The writes' words are the client's (`objects`' `INBOX_WORDS`): it parses, words and prints them, and the entries here spread
 * those words beside their handlers. A card's `from:` (`nemia inbox from`) the api writes as part of the Card's whole write (`update`,
 * `replaceCard`), and reads one card with its file as written (`get`).
 */
import { givesNone } from '../command/requests.verb.ts';
import { INBOX_ADD_WORDS, INBOX_FROM_WORDS, INBOX_QUEUE_WORDS, INBOX_RM_WORDS, runsNamed } from 'objects';
import { Effect, Schema } from 'effect';
import { type Args } from '../command/command.ts';
import { tableEntry, type Command, type Served } from '../command/entry.verb.ts';
import { setting } from '../config/config.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { parseSelectors, SELECTOR_FORM, selectorsRefusal, selectsLabels } from '../watch/selector.ts';
import type { LeftOut } from '../labels/labels.ts';
import { cardInPlay, cardLabels, inboxLines, type InboxCard, type InboxListing } from './inbox.ts';
import { addToInbox, dropFromInbox, queueInInbox, type InboxDropped, type InboxQueued } from './inbox.store.ts';
import { EngineService } from '../runtime-client.ts';
import { howOf } from '../summary/how.verb.ts';
import { inboxJudged, setFrom, type InboxFrom } from './inbox.verb.ts';

export const INBOX_HELP = `nemia inbox [--all]
nemia inbox -l <selector>... [--all] [--show-labels] [-L <key>]...
nemia inbox add "<idea>"|<file> [--workflow <name>] [--repo <path>] [--factory <name>] [--label <key=value>]...
nemia inbox queue <name> [--workflow <w>] [--off]
nemia inbox from <name> <run>... | --off
nemia inbox rm <name>

An inbox is cards before they are started: \${WF_ROOT:-~/.agent-workflows}/inbox/, one <name>.md per card, beside
runs/. A card is a plan's card with two differences — its keys optional, and no after:, since what it waits on
is said at start:

    ---
    workflow: dev              # what runs it, chosen at start when the card does not say
    repo: /home/me/code/app    # the repository it is about, as an absolute path
    queued: 2026-09-16T10:00:00.000Z   # when it was queued to start on its own: nemia inbox queue writes it
    gate: review               # the step whose closeout waits for nemia approve in the run it starts
    factory: acme              # the factory it is started in (nemia factory --help); required to start
    from: add-cache-a1b2       # runs its run is handed as context, comma-separated: read, never waited on
    labels: { team: core }     # a person's labels: what -l selects it by, copied to the run it starts
    ---
    Cache the engine's views between passes.

  nemia inbox       lists the cards still in play: its name, the first line of its body, its workflow and repo when
                 set, and started as <runId>, <phase> for a card a run's record says it was started as, the phase
                 its run is in now (waiting on you where it waits on a person): a started card stays in the inbox,
                 and is not started again. A card whose run ended (succeeded, failed, stopped, cancelled) is listed
                 with --all. An entry that does not read as a card is listed with why. -l keeps the cards a selector takes
                 (key=v, key!=v, "key in (a,b)", "key notin (a,b)", key), over its labels, workflow and factory,
                 given again for another; --show-labels adds its labels to its line, -L <key> that key's value.
  nemia inbox add   files an idea, text or a file, named with the slug a run id makes of its first line, suffix and
                 all; --workflow, --repo and --factory write the keys, over a file's own; --label key=value (or
                 key-) edits its labels:, over a file's own and what the runs of its from: agree on.
  nemia inbox queue marks a card to start on its own: each pass, once every run has been advanced and a run slot is
                 free (WF_MAX_RUNS; always, with no cap), the tick starts the oldest queued card, one per pass, on its
                 workflow:, in its factory:, on its repo:, else its factory's one repository, else the directory nemia up
                 runs in. --workflow writes the key too; --off, or nemia inbox rm, takes the card back. nemia inbox says
                 queued and its place; a start the package refused is said there and on nemia up's line, and the card is
                 not tried again until it is edited or queued again (or, with no repository named by the card or its
                 factory, nemia up runs in another repository); a start that failed otherwise is said once, and tried
                 again on the next pass.
  nemia inbox from  sets the runs a card's run is handed as context (from:), each by its id, landed or still in
                 flight: what each concluded is read when the run's steps are filed, and none is waited on.
                 --off takes the key off.
  nemia inbox rm    drops a card without starting it. A name with no card says so, and which cards there are.

Refused by name: a key a card does not have, a key set to nothing, a repo: that is not an absolute path to a
directory, a queued: that is not a time or is on a card with no workflow:, a gate: naming more than one step or
saying true, a factory: that is not a factory's name — and, at start, a gate: naming no step of the workflow, a
card that names no factory and is started with no --factory, never one taken from its folder or its repo:, a
factory: the store does not have, default, or one that does not offer the workflow — an add with no idea, and a name that would
leave the folder; and a queue of a name with no card, of a card with no workflow and no --workflow, of one
already queued, of one a run was started from, and of one that names no factory, or default; a from: naming a run the store does not have, or one twice.`;

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

/** The refusal of a `-l` given no selector, or one of the command's own flags for it. */
const INBOX_SELECTOR_TAKES = `nemia inbox -l takes a selector of the cards' labels, workflow and factory: ${SELECTOR_FORM}`;

/** The refusal of a `-L` given no key. */
const LABEL_COLUMN_TAKES = 'nemia inbox -L takes the label key whose value each line shows: nemia inbox -L team';

/**
 * `nemia inbox`: each card still in play (`cardInPlay`), or every card with `--all`, a line each, and how to start, queue or drop one; or
 * that the inbox is empty. A started card's state is its run's phase, judged through the informer the caller keeps (`kept.runs`). `ended`
 * counts the cards the selector takes that are left out for their run having ended: none with `--all`.
 */
export const INBOX: Command<{ cards: InboxListing[]; ended: number; defaultStarts: boolean }> = {
  name: 'inbox',
  usage: '',
  help: [
    'the cards still in play: name, first line, workflow and repo when set,',
    'and started as <runId>, <phase> (nemia inbox --help); --all: those whose',
    'run ended too; -l: the cards a selector takes; --show-labels, -L <key>:',
    'their labels on each line',
  ],
  spec: {
    positionals: [],
    flags: [
      { flag: '-l', kind: 'text', key: 'selector', many: true, takes: INBOX_SELECTOR_TAKES },
      { flag: '--all', kind: 'switch', key: 'all' },
      { flag: '--show-labels', kind: 'switch', key: 'showLabels' },
      { flag: '-L', kind: 'text', key: 'labelColumns', many: true, takes: LABEL_COLUMN_TAKES },
    ],
    apart: (_value, flag) => (flag === '-L' ? LABEL_COLUMN_TAKES : INBOX_SELECTOR_TAKES),
    unknown: (arg) =>
      `nemia inbox does not take ${arg}. It lists the inbox — nemia inbox — files a card with nemia inbox add "<idea>", queues one with nemia inbox queue <name>, and drops one with nemia inbox rm <name> (nemia inbox --help).`,
  },
  writes: false,
  class: 'read',
  served: [
    { endpoint: 'cards.listAll', query: { fieldSelector: 'status.inPlay=true' }, takes: givesNone('name') },
    { endpoint: 'cards.getAll', as: 'inbox_card' },
  ],
  only: {
    side: 'cli',
    why: "the command line's listing: the api's list of the Card (`GET /api/cards`, `objects`' Api) is the package's `cardList`, never this handler, and prints its rows as a Table (`cardTable`)",
  },
  manual: INBOX_HELP,
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
  print: ({ cards, ended, defaultStarts }, args) =>
    cards.length
      ? [
          ...inboxLines(cards, defaultStarts, {
            showLabels: args.showLabels === true,
            columns: listOf(args, 'labelColumns'),
          }),
          `\nstart one: nemia start <name> [--workflows <w>] [--repo <r>] [--factory <f>] — queue one: nemia inbox queue <name> — drop one: nemia inbox rm <name>`,
        ]
      : ended
        ? [`no card in play${inboxSelected(args)}, and ${ended} whose run ended — list them with nemia inbox --all`]
        : listOf(args, 'selector').length
          ? [`no card of the inbox matches -l ${listOf(args, 'selector').join(' -l ')} — see them all with nemia inbox --show-labels`]
          : [`the inbox is empty — park an idea with nemia inbox add "<idea>"`],
};

/** `nemia inbox`'s `-l` as its empty line says it: ` matches -l a -l b`, or nothing where none was given. */
const inboxSelected = (args: Args): string =>
  listOf(args, 'selector').length ? ` matches -l ${listOf(args, 'selector').join(' -l ')}` : '';

/**
 * What `nemia inbox add`'s handler takes: the idea's text, the file it was read from and that file's folder (`from`, `dir`), and the keys
 * the card writes. Its own, not `objects`' `CardFile`: a body's `from` is where a workflow is read from, and the api finds the folder.
 */
export const InboxAddInput = Schema.Struct({
  idea: Schema.String,
  from: Schema.optionalKey(Schema.String),
  dir: Schema.optionalKey(Schema.String),
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
