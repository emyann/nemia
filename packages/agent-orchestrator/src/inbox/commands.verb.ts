/**
 * `nemia inbox`, each of its forms an entry of the command table: the cards listed, an idea filed as one, a card queued to start on its own
 * or taken off the queue, and a card dropped. None is routed by the table: the Card's verbs are declared in `objects`' Api, and the api's
 * handlers (apps/api/src/objects/cards.ts) call the handlers of `inbox add`, `inbox queue` and `inbox rm` by their `input`. A card's
 * `from:` (`nemia inbox from`) is the command line's alone: the api writes it as part of the Card's whole write (`update`, `replaceCard`),
 * and reads one card with its file as written (`get`).
 */
import { givesNone, refusing, renamed } from '../command/requests.verb.ts';
import { INBOX_READ_WORDS, type Card } from 'objects';
import { Effect, Schema } from 'effect';
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import type { Command, Served } from '../command/entry.verb.ts';
import { setting } from '../config/config.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { parseSelectors, selectorsRefusal, selectsLabels } from '../watch/selector.ts';
import { labelsText, type LeftOut } from '../labels/labels.ts';
import { firstPiece } from '../piece/piece.ts';
import { cardInPlay, cardLabels, noCardLine, type InboxCard, type InboxListing } from './inbox.ts';
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

/** A line per key a card was filed without, since the runs of its `from:` disagree on it: each run with its value, and how to set it. */
const leftOutLines = (name: string, leftOut: readonly LeftOut[]): string[] =>
  leftOut.map(
    ({ key, values }) =>
      `label ${key} not inherited: ${values.map((v) => `${v.run} has ${key}=${v.value}`).join(', ')} — set it with nemia label inbox ${name} ${key}=<value>`,
  );

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

/** What one of `nemia inbox add`'s flags names, once per card. */
const ADD_NAMES: Readonly<Record<string, string>> = { '--workflow': 'workflow', '--repo': 'repository', '--factory': 'factory' };

/** One of `nemia inbox add`'s value flags, keyed by its name, taking what `takes` says, once. */
const addFlag = (flag: string, takes: string): Flag => ({
  flag,
  kind: 'text',
  key: flag.slice(2),
  takes: `${flag} takes ${takes}`,
  twice: `nemia inbox add takes ${flag} once: a card names one ${ADD_NAMES[flag]}.`,
});

/** `nemia inbox add`'s spec: the idea, then `--workflow`, `--repo` and `--factory`, once each. */
const ADD_SPEC: Spec = {
  positionals: [{ key: 'idea', takes: 'required', kind: 'text' }],
  flags: [
    addFlag('--workflow', 'the workflow to start the card on, by name or as a path: nemia inbox add "<idea>" --workflow <name>'),
    addFlag('--repo', 'the repository the idea is about: nemia inbox add "<idea>" --repo <path>'),
    addFlag('--factory', 'the factory that processes the card: nemia inbox add "<idea>" --factory <name>'),
    {
      flag: '--label',
      kind: 'text',
      key: 'label',
      many: true,
      takes:
        '--label takes a label edit, key=value to set one or key- to drop one its from: runs would give: nemia inbox add "<idea>" --label team=core',
    },
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia inbox add does not take ${arg}. It takes the idea, then --workflow <name>, --repo <path>, --factory <name> and --label <key=value> once per label.`
      : `nemia inbox add takes one idea, and ${arg} is a second. Quote an idea with spaces — nemia inbox add "<idea>" — or give it as a file: nemia inbox add ./idea.md.`,
  apart: (_value, flag) => ADD_SPEC.flags.find((f) => f.flag === flag)?.takes ?? '',
  missing:
    'nemia inbox add takes the idea, first: nemia inbox add "<idea>" [--workflow <name>] [--repo <path>] [--factory <name>], or a file: nemia inbox add ./idea.md. Nothing was filed.',
};

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
 * A Card the api answered, as the inbox's own card (`InboxCard`) the command line prints: its name, its body and the keys its spec
 * carries, its factory by its namespace (none for `default`), its labels.
 */
const inboxCardOf = (card: Card): InboxCard => {
  const { metadata, spec, status } = card;
  return {
    name: metadata.name,
    file: status.file ?? `${metadata.name}.md`,
    body: spec.body ?? '',
    ...(spec.workflow === undefined ? {} : { workflow: spec.workflow }),
    ...(spec.repo === undefined ? {} : { repo: spec.repo }),
    ...(spec.queued === undefined ? {} : { queued: spec.queued }),
    ...(spec.gate === undefined ? {} : { gate: spec.gate }),
    ...(spec.model === undefined ? {} : { model: { ...spec.model } }),
    ...(spec.from === undefined ? {} : { from: [...spec.from] }),
    ...(metadata.namespace === undefined || metadata.namespace === 'default' ? {} : { factory: metadata.namespace }),
    ...(metadata.labels === undefined || Object.keys(metadata.labels).length === 0 ? {} : { labels: { ...metadata.labels } }),
  };
};

/**
 * What another machine's api answers of a card filed (`cards.create`: the Card), as `nemia inbox add` prints it: the card, and its file
 * by its name in that machine's inbox, which a start names it by there.
 */
const filedThere = (answer: unknown): { card: InboxCard; file: string } => {
  const card = inboxCardOf(answer as Card);
  return { card, file: card.file };
};

/**
 * `nemia inbox add`: an idea filed as a card. Its handler is handed the idea's text under `idea`, and, for an idea read from a file, the
 * file under `from` and its folder under `dir`, the folder a workflow's path is read from: the CLI's runner reads the file, and the api's
 * route finds the workflow among the folders a start finds one in, so neither a path nor a file reaches the handler from a body.
 */
export const INBOX_ADD: Command<{ card: InboxCard; file: string; labelsLeftOut?: readonly LeftOut[] }, InboxAddInput> = {
  name: 'inbox add',
  served: [{ endpoint: 'cards.create', request: renamed({ idea: 'body' }, ['dir', 'from']), answer: filedThere }],
  usage: '"<idea>"|<file> [--workflow <name>] [--repo <path>] [--factory <name>] [--label <key=value>]...',
  help: ['park an idea as a card in the inbox, named from its first line'],
  spec: ADD_SPEC,
  check: (args) => leftOut(ADD_SPEC, args),
  writes: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the Card's `create`, whose handler calls this one by its `input`",
  },
  input: InboxAddInput,
  handler: ({ idea, label, ...keys }) => Effect.suspend(() => addToInbox({ text: idea, ...keys, labels: [...(label ?? [])] })),
  print: ({ card, file, labelsLeftOut }) => [
    `${card.name}  ${firstPiece(card.body, '\n').slice(0, 56)}${card.workflow ? `  workflow: ${card.workflow}` : ''}${card.repo ? `  repo: ${card.repo}` : ''}${card.factory ? `  factory: ${card.factory}` : ''}${card.labels ? `  labels: ${labelsText(card.labels)}` : ''}`,
    ...leftOutLines(card.name, labelsLeftOut ?? []),
    `filed: ${file} — start it with nemia start ${card.name}${card.workflow ? '' : ' --workflows <w>'}`,
  ],
};

/** What `--workflow` of `nemia inbox queue` takes, said where it is missing and where it stands apart from its value. */
const QUEUE_WORKFLOW_TAKES =
  '--workflow takes the workflow the card starts on, by name or as a path: nemia inbox queue <name> --workflow <w>';

/** `--workflow <w>`, which `nemia inbox queue` writes on the card with the mark. */
const QUEUE_WORKFLOW: Flag = {
  flag: '--workflow',
  kind: 'text',
  key: 'workflow',
  takes: QUEUE_WORKFLOW_TAKES,
  twice: 'nemia inbox queue takes --workflow once: a card starts on one workflow.',
  only: {
    side: 'cli',
    why: 'a card is queued from the board on the workflow it names: the api refuses a workflow sent, and files one with the card',
  },
};

/** `nemia inbox queue`'s spec: the card's name, then `--workflow <w>` once, or `--off`. */
const QUEUE_SPEC: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [QUEUE_WORKFLOW, { flag: '--off', kind: 'switch', key: 'off' }],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia inbox queue does not take ${arg}. It takes the card's name, then --workflow <w>, or --off to take the card back.`
      : `nemia inbox queue queues one card, and ${arg} is a second: nemia inbox queue <name>, once per card.`,
  apart: () => QUEUE_WORKFLOW_TAKES,
  missing:
    'nemia inbox queue takes the name of the card to queue, as nemia inbox lists it: nemia inbox queue <name> [--workflow <w>] [--off].',
};

/** What `nemia inbox queue` did, as the api answers it, and the card as it now reads. */
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

/**
 * What another machine's api answers of a card queued or taken back (the Card), as `nemia inbox queue` prints it: its place in the queue
 * where it has one, and of how many unsaid, which the Card does not carry.
 */
const queuedThere = (answer: unknown, input: Readonly<Record<string, unknown>>): Queued => {
  const read = answer as Card;
  const card = inboxCardOf(read);
  return {
    name: card.name,
    file: card.file,
    was: input.off === true ? 'taken back' : 'queued',
    queued: card.queued ?? null,
    place: read.status.place ?? null,
    of: null,
    card,
    factoryRepo: null,
  };
};

/** What `nemia inbox queue`'s handler takes: the card, the workflow written with the mark (the command line's alone), and `off`. */
export const InboxQueueInput = Schema.Struct({
  name: Schema.String,
  workflow: Schema.optionalKey(Schema.String),
  off: Schema.optionalKey(Schema.Boolean),
});
export type InboxQueueInput = typeof InboxQueueInput.Type;

/**
 * `nemia inbox queue`: a card marked to start on its own, or with `--off` the mark taken back. `--workflow` is the command line's alone,
 * and written as it is handed: its runner reads a path from where it is typed (`inboxQueueRun`), and this handler reads no folder of its
 * own.
 */
export const INBOX_QUEUE: Command<Queued, InboxQueueInput> = {
  name: 'inbox queue',
  served: [
    {
      endpoint: 'cards.queue',
      takes: givesNone('off'),
      request: refusing('inbox queue', ['workflow'], renamed({}, ['off'])),
      answer: queuedThere,
    },
    { endpoint: 'cards.unqueue', as: 'inbox_unqueue', request: renamed({}, ['off', 'workflow']), answer: queuedThere },
  ],
  usage: '<name> [--workflow <w>] [--off]',
  help: ['mark a card to start on its own: the tick starts the oldest queued', 'card once a run slot is free; --off takes the mark back'],
  spec: QUEUE_SPEC,
  check: (args) =>
    args.off === true && args.workflow !== undefined
      ? '--off takes the card out of the queue, and --workflow writes what starts it: give one of them.'
      : leftOut(QUEUE_SPEC, args),
  writes: true,
  ticks: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the Card's `queue` and `unqueue`, whose handlers call this one by its `input`",
  },
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
  print({ name, was, place, of, card, factoryRepo }) {
    if (was === 'not queued') return [`${name}  not queued — nothing to take back`];
    if (was === 'taken back') return [`${name}  taken back: it no longer starts on its own — start it with nemia start ${name}`];
    return [
      `${name}  queued at ${card.queued}, ${of === null ? `${place} in the queue` : `${place} of ${of}`}  workflow: ${card.workflow}${card.repo ? `  repo: ${card.repo}` : ''}${card.factory ? `  factory: ${card.factory}` : ''}`,
      `the tick starts it on its own once its turn comes and a run slot is free${card.repo ? '' : factoryRepo ? `, on ${factoryRepo}, its factory's one repository` : ', on the repository nemia up runs in'} — take it back with nemia inbox queue ${name} --off`,
    ];
  },
};

/**
 * The Card's `update` that sets `from:` as `nemia inbox from` asks, forwarded to another machine's api: the card as its runner read it
 * there (`current`), written whole with its `from:` set to the runs named, or taken off for `--off`, at the version it was read at.
 */
const fromWritten = (input: Readonly<Record<string, unknown>>) => {
  const current = input.current as Card | undefined;
  if (current === undefined)
    return Promise.reject(
      new Invalid({
        message: 'nemia inbox from forwarded reads the card first: run it through its runner, nemia inbox from <name> <run>...',
      }),
    );
  const { from: _was, ...spec } = current.spec;
  const runs = input.off === true ? [] : runsOf(input as Args);
  return Promise.resolve({
    name: current.metadata.name,
    metadata: current.metadata.resourceVersion === undefined ? {} : { resourceVersion: current.metadata.resourceVersion },
    spec: runs.length ? { ...spec, from: runs } : spec,
  });
};

/** What another machine's api answers of a card's `from:` written (the Card), as `nemia inbox from` prints it, beside what it was. */
const fromThere = (answer: unknown, input: Readonly<Record<string, unknown>>): InboxFrom & { name: string; from: string[] } => {
  const card = inboxCardOf(answer as Card);
  const was = (input.current as Card | undefined)?.spec.from ?? [];
  return { card, file: card.file, was: [...was], name: card.name, from: card.from ?? [] };
};

/** `nemia inbox from`'s spec: the card's name, then the runs it is handed as context, or `--off`. */
const FROM_SPEC: Spec = {
  positionals: [
    { key: 'name', takes: 'required', kind: 'name' },
    { key: 'runs', takes: 'many', kind: 'name' },
  ],
  flags: [{ flag: '--off', kind: 'switch', key: 'off' }],
  unknown: (arg) =>
    `nemia inbox from does not take ${arg}. It takes the card's name, then the runs it is handed as context by id, or --off to take its from: off.`,
  missing: 'nemia inbox from takes the name of the card, as nemia inbox lists it: nemia inbox from <name> <run>... or --off.',
};

/** The runs `args` names, as `nemia inbox from` takes them: none for `--off`. */
const runsOf = (args: Args): string[] => (Array.isArray(args.runs) ? args.runs.map(String) : []);

/**
 * `nemia inbox from`: the runs a card's run is handed as context (its `from:`), set, or with `--off` taken off. Context is no wait: the
 * run reads what each concluded when its steps are filed, landed or in flight, and waits on none (`setFrom`).
 */
export const INBOX_FROM: Command<InboxFrom & { name: string; from: string[] }> = {
  name: 'inbox from',
  served: [{ endpoint: 'cards.update', request: fromWritten, answer: fromThere }],
  usage: '<name> <run>... | --off',
  help: ['set the runs a card is handed as context (from:), read and', 'never waited on; --off takes them off'],
  spec: FROM_SPEC,
  check: (args) => {
    if (args.off === true) return runsOf(args).length ? '--off takes the from: off, and the runs set it: give one of them.' : null;
    return runsOf(args).length
      ? null
      : 'nemia inbox from takes the runs the card is handed as context, by id — nemia inbox from <name> <run>... — or --off to take them off.';
  },
  writes: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the command line's alone: the api writes a card's `from:` with the rest of it, the Card's `update` of `objects`' Api (`replaceCard`), never through this handler, which its link calls with the card read first (`fromWritten`)",
  },
  handler: (args) =>
    Effect.map(setFrom(textOf(args, 'name') ?? '', args.off === true ? [] : runsOf(args)), (done) => ({
      ...done,
      name: done.card.name,
      from: done.card.from ?? [],
    })),
  print: ({ card, file, was }) =>
    card.from?.length
      ? [`${card.name}  from: ${card.from.join(', ')} — its run is handed what each concluded, as context, and waits on none (${file})`]
      : [`${card.name}  ${was.length ? `from: taken off (was ${was.join(', ')})` : 'no from: — nothing to take off'}`],
};

/** What `nemia inbox rm`'s handler takes: the card's name. */
export const InboxRmInput = Schema.Struct({ name: Schema.String });
export type InboxRmInput = typeof InboxRmInput.Type;

/**
 * `nemia inbox rm`: one card dropped without starting it, or, for a name with no card, which cards there are (`removed` false), which the
 * command line prints; the api reads the card before it drops it, and refuses a name with none as `Missing`.
 */
export const INBOX_RM: Command<InboxDropped, InboxRmInput> = {
  name: 'inbox rm',
  served: [{ endpoint: 'cards.delete' }],
  usage: '<name>',
  help: ['drop a card without starting it'],
  spec: {
    positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia inbox rm drops one card, and ${arg} is a second: nemia inbox rm <name>, once per card.`,
    missing: 'nemia inbox rm takes the name of the card to drop, as nemia inbox lists it: nemia inbox rm <name>.',
  },
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the Card's `delete`, whose handler calls this one by its `input`",
  },
  input: InboxRmInput,
  handler: ({ name }) => dropFromInbox(name),
  print: (dropped, { name }) => [
    dropped.removed
      ? `${name}  dropped, and nothing started — ${dropped.file} removed`
      : `${noCardLine(name, dropped.cards)} Nothing to drop.`,
  ],
};

/** `nemia inbox`'s entries, in the order `nemia`'s help lists them. */
export const INBOXES: readonly Command[] = [INBOX, INBOX_ADD, INBOX_QUEUE, INBOX_FROM, INBOX_RM] as readonly Command[];
