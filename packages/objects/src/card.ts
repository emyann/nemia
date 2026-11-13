/**
 * The Card: an inbox card served as an object. Its `spec` is what a person wrote on the card — the workflow that runs it, the repository
 * it is about, its gate, the runs it is handed as context, when it was queued, and its body — and its `status` what Nemia read of it:
 * where it is in its life (`state`), the runs it was started as, the tick's last missed start of it, its title, and why an entry of the
 * inbox does not read as a card. Its labels are its `metadata.labels`, its factory its `metadata.namespace`.
 *
 * Beside it, the bodies of its verbs: a card filed (`CardFile`), a card written whole (`CardWrite`), a card written from its text
 * (`CardEdit`), a card started (`CardStart`) and its labels edited (`LabelEdit`), each as the api is sent it. Plain Schemas of JSON, as
 * every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { startExtras } from './run-actions.ts';

/**
 * Where a card is in its life, closed: its own word until it starts — `filed`, `queued`, `refused` (queued, and the tick's start of it
 * refused) — and its run's phase from then on, the run phases in their order (the orchestrator's `RUN_PHASES`).
 */
export const CARD_STATES = [
  'filed',
  'queued',
  'refused',
  'pending',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'stopped',
  'cancelled',
] as const;
export type CardState = (typeof CARD_STATES)[number];

/**
 * The keys a card's frontmatter may set, in the order a card's page lists them: six are its `spec`'s, `factory` is its
 * `metadata.namespace` and `labels` its `metadata.labels`.
 */
export const CARD_KEYS = ['workflow', 'repo', 'queued', 'gate', 'model', 'factory', 'from', 'labels'] as const;

/** A key a card's frontmatter may set. */
export type CardKey = (typeof CARD_KEYS)[number];

/**
 * What each of a card's keys means, in one line, in `CARD_KEYS`' order: what the board shows beside a card's value, and the description
 * of the Card's field that holds it, which `nemia explain` and the api's OpenAPI document both read.
 */
export const CARD_KEY_MEANINGS: Readonly<Record<CardKey, string>> = {
  workflow:
    'what runs the card when it is started: the name of a workflow its factory offers; else the start names one. A path an older card holds is not read',
  repo: "retired: an older card's repository, read and not used, since the card's factory places its run (`nemia factory attach <factory> <workflow> --repo <name>`); a new or changed value is refused",
  queued:
    'the time `nemia inbox queue` marked the card to start on its own: the tick starts it when a run slot frees, oldest first; unset, a person starts it',
  gate: 'a step of its workflow whose closeout waits for a person — `nemia approve` — before anything after it is filed, in the run it starts: none when unset',
  model:
    "the model a step of its workflow runs on in the run it starts, and in no other run, as `<step>=<model>`, comma-separated: `implement=fable`; its other steps run on their agents' models, and none when unset",
  factory:
    'the factory that processes the card: its run is started in it, on its repository when it has only one; required to start, unless the start names one',
  from: 'runs whose conclusions its run is handed as context, by id, comma-separated: it does not wait on them; none when unset',
  labels:
    "a person's labels on the card, a map of a key to its value: what `-l key=value` selects it by, copied to the run it starts; none when unset",
};

/** A field of the card's spec, described by its key's meaning. */
const described = <S extends Schema.Top>(schema: S, key: CardKey) => schema.annotate({ description: CARD_KEY_MEANINGS[key] });

/** What a person wrote on the card: each key absent where the card does not set it; `body` absent on an entry that does not read. */
export const CardSpec = Schema.Struct({
  workflow: Schema.optionalKey(described(Schema.String, 'workflow')),
  repo: Schema.optionalKey(described(Schema.String, 'repo')),
  gate: Schema.optionalKey(described(Schema.String, 'gate')),
  model: Schema.optionalKey(described(Schema.Record(Schema.String, Schema.String), 'model')),
  from: Schema.optionalKey(described(Schema.Array(Schema.String), 'from')),
  queued: Schema.optionalKey(described(Schema.String, 'queued')),
  body: Schema.optionalKey(
    Schema.String.annotate({ description: "the card's idea, in markdown, under its frontmatter: its first line is its title" }),
  ),
});
export type CardSpec = typeof CardSpec.Type;

/** The tick's last start of a queued card that did not happen: when, on which repository, why, and whether it was a refusal. */
export const CardLastStart = Schema.Struct({
  at: Schema.String,
  repo: Schema.String,
  why: Schema.String,
  refused: Schema.Boolean,
});
export type CardLastStart = typeof CardLastStart.Type;

/** A label key a card was filed without, since the runs of its `from:` disagree on it: each run with its value. */
export const CardLabelLeftOut = Schema.Struct({
  key: Schema.String,
  values: Schema.Array(Schema.Struct({ run: Schema.String, value: Schema.String })),
});
export type CardLabelLeftOut = typeof CardLabelLeftOut.Type;

/**
 * What Nemia read of the card: its `state`, the runs it was started as (`runs`), the tick's last missed start (`lastStart`), the first
 * line of its body (`title`, absent where it has none), and why the entry does not read as a card (`error`, absent on a card).
 */
export const CardStatus = Schema.Struct({
  state: Schema.Literals(CARD_STATES),
  runs: Schema.Array(Schema.String),
  lastStart: Schema.optionalKey(CardLastStart),
  title: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
  /** Whether the card is still in play: not started, or its run not ended. `nemia inbox` and the board list these by default. */
  inPlay: Schema.Boolean,
  /** A queued card's place in the order the tick starts cards in, from 1, among every card queued and not started, every factory's. */
  place: Schema.optionalKey(Schema.Number),
  /**
   * The entry's file in the inbox: `<name>.md` for a card, and for a stray entry that is no card (`idea.txt`, a folder `sub/`) its own
   * file, which is its name, its `error` saying why it is no card.
   */
  file: Schema.optionalKey(Schema.String),
  /** The card's file as written, frontmatter and body: on a read of one card alone, never on a list's items. */
  source: Schema.optionalKey(Schema.String),
  /** The label keys the card was filed without, as the runs of its `from:` disagree on them: on the answer of a filing alone. */
  labelsLeftOut: Schema.optionalKey(Schema.Array(CardLabelLeftOut)),
  /** How many cards are queued and not started, every factory's, the card among them: on the answer of a queue alone. */
  queueLength: Schema.optionalKey(Schema.Number),
  /**
   * The repository a queued card starts on, the one its factory's wiring names for its workflow, else its factory's only one: on the
   * answer of a queue alone, where it has one.
   */
  factoryRepo: Schema.optionalKey(Schema.String),
});
export type CardStatus = typeof CardStatus.Type;

/** An inbox card, as an object. */
export const Card = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Card'),
  metadata: ObjectMeta,
  spec: CardSpec,
  status: CardStatus,
});
export type Card = typeof Card.Type;

/** A page of the inbox's cards. */
export const CardList = listOf('Card', Card);
export type CardList = typeof CardList.Type;

/**
 * A card filed (create): its body, the workflow that runs it by name, the factory it is filed in, and its labels as `key=value`. `from`
 * is retired, read and ignored: the factory finds the workflow. `repo` is retired and refused: the factory places the card's run
 * (`nemia factory attach <factory> <workflow> --repo <name>`).
 */
export const CardFile = Schema.Struct({
  body: Schema.String,
  workflow: Schema.optionalKey(Schema.String),
  from: Schema.optionalKey(Schema.Literals(['repo', 'yours'])),
  repo: Schema.optionalKey(Schema.String),
  factory: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type CardFile = typeof CardFile.Type;

/**
 * A card started: the workflow its run is started on, by name — the card's own `workflow:` when it names none, as `nemia start <card>`
 * takes it, `from` being retired, read and ignored, since the factory finds the workflow and places the run — the runs it waits on
 * (`after`) and reads as context (`context`), the brief given in place of the card's body, the labels it is started with
 * (`key=value`, `key-`), the inbox cards it is handed (`cards`), and what a start of a brief takes beside (`startExtras`: models, gates,
 * no worktree, inputs).
 */
export const CardStart = Schema.Struct({
  workflow: Schema.optionalKey(Schema.String),
  from: Schema.optionalKey(Schema.Literals(['repo', 'yours'])),
  after: Schema.optionalKey(Schema.Array(Schema.String)),
  context: Schema.optionalKey(Schema.Array(Schema.String)),
  brief: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.Array(Schema.String)),
  cards: Schema.optionalKey(Schema.Array(Schema.String)),
  ...startExtras,
});
export type CardStart = typeof CardStart.Type;

/**
 * A card written whole (update): its spec as it is to be, its labels (absent leaves them, `{}` takes them all off), and the
 * `resourceVersion` it was read at, which makes the write refused where the card has changed since (absent: the last writer wins).
 * `queued` must be sent as the card has it: queueing is the card's own action.
 */
export const CardWrite = Schema.Struct({
  metadata: Schema.Struct({
    resourceVersion: Schema.optionalKey(Schema.String),
    labels: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
  spec: CardSpec,
});
export type CardWrite = typeof CardWrite.Type;

/**
 * A card written from its text (edit): `source`, the card's file as it is to be, frontmatter and body, as `status.source` serves it and
 * `nemia inbox edit` sends it, read as the card's own file is read; its name kept, and its labels, which their own verb edits. With the
 * `resourceVersion` it was read at, the write is refused where the card has changed since (absent: the last writer wins).
 */
export const CardEdit = Schema.Struct({
  source: Schema.String.annotate({
    description: "The card's file as it is to be, frontmatter and body, as status.source serves it and nemia inbox add reads a file.",
  }),
  resourceVersion: Schema.optionalKey(Schema.String),
});
export type CardEdit = typeof CardEdit.Type;

/**
 * A card queued (queue), in its query: the workflow it starts on, by its name, written over the card's own; absent, the card's own
 * `workflow:`. A workflow is named, never sent as a path: the daemon finds it where a start of the card would. In the query, so a queue
 * sent with no body, or a body the api does not read, queues as it did before the key.
 */
export const CardQueue = Schema.Struct({
  workflow: Schema.optionalKey(Schema.String),
});
export type CardQueue = typeof CardQueue.Type;
