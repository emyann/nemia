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
import { Schema, Struct } from 'effect';
import { API_VERSION, DEFAULT_NAMESPACE, ObjectMeta, describedNumber, listOf } from './meta.ts';
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
export const CARD_KEYS = ['workflow', 'repo', 'queued', 'gate', 'model', 'factory', 'from', 'after', 'labels', 'files'] as const;

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
    'the time `nemia inbox queue` marked the card to start on its own: the tick starts it when a run slot frees, oldest first; unset, a person starts it, or a card trigger of its factory whose labelSelector matches its labels queues it without writing this',
  gate: 'a step of its workflow whose closeout waits for a person — `nemia approve` — before anything after it is filed, in the run it starts: none when unset',
  model:
    "the model a step of its workflow runs on in the run it starts, and in no other run, as `<step>=<model>`, comma-separated: `implement=fable`; its other steps run on their agents' models, and none when unset",
  factory:
    'the factory that processes the card: its run is started in it, on its repository when it has only one; required to start, unless the start names one',
  from: 'runs whose conclusions its run is handed as context, by id, comma-separated: it does not wait on them; none when unset',
  after:
    'the cards it waits on, by name, comma-separated: no trigger queues it and the tick starts none of it until each has succeeded — its own run, or the run of the card its work was passed on to; none when unset',
  labels:
    "a person's labels on the card, a map of a key to its value: what `-l key=value` selects it by, copied to the run it starts; none when unset",
  files:
    'the files the card carries, a map of the name its text and its run find each by to the File it names (`file_…`, uploaded to its factory first): copied into the `inputs/` of every run started from it; none when unset',
};

/** An idea's frontmatter: a block between `---` lines that opens its text. */
const FRONTMATTER = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** A `factory:` line of a frontmatter, its value bare or quoted. */
const FACTORY_LINE = /^factory:[ \t]*(["']?)([^\s"'#]+)\1[ \t]*(?:#.*)?$/m;

/**
 * The namespace a client files the idea `body` in: `factory` where one is given, else the factory the idea's own frontmatter names on its
 * `factory:` line, else `default`. A light read, for a client choosing where to upload a card's files and file the card; the api refuses
 * an idea whose `factory:` is not the namespace it is sent to, in its own reading of the card.
 * @param body The idea's text, its frontmatter first where it has one.
 * @param factory The factory given beside it (`--factory`, a picker), which wins; none or empty for none.
 */
export function filedNamespace(body: string, factory?: string) {
  if (factory !== undefined && factory !== '') return factory;
  const block = FRONTMATTER.exec(body)?.[1];
  return (block === undefined ? undefined : FACTORY_LINE.exec(block)?.[2]) ?? DEFAULT_NAMESPACE;
}

/** A field of the card's spec, described by its key's meaning. */
const described = <S extends Schema.Top>(schema: S, key: CardKey) => schema.annotate({ description: CARD_KEY_MEANINGS[key] });

/** One file a card carries: the name its text and its run find it by, and the File it names. */
export const CardFileNamed = Schema.Struct({
  name: Schema.String.annotate({
    description: "The file's name in the card: what its text names it by, and its run's `inputs/` keeps it as.",
  }),
  file: Schema.String.annotate({ description: "The id of the File it names, file_…, kept in the card's namespace." }),
}).annotate({ description: 'One file a card carries: its name in the card and the File it names.' });
export type CardFileNamed = typeof CardFileNamed.Type;

/**
 * A file named to a card as it is filed or attached: the File by its id, uploaded to the card's namespace first, and the name it takes in
 * the card, absent for the File's own name.
 */
/**
 * The identifier of a card's file reference in a JSON Schema's definitions (`$defs`), by which a reader of a tool's input finds each key
 * that names Files: the MCP port, which takes a file's bytes inline there besides an id.
 */
export const CARD_FILE_REF = 'CardFileRef';

export const CardFileRef = Schema.Struct({
  name: Schema.optionalKey(
    Schema.String.annotate({ description: "The name it takes in the card, no folder in it; absent, the File's own name." }),
  ),
  file: Schema.String.annotate({ description: "The id of a File uploaded to the card's namespace, file_…." }),
}).annotate({
  identifier: CARD_FILE_REF,
  description: 'A file named to a card: a File uploaded first, by its id, and the name it takes in the card.',
});
export type CardFileRef = typeof CardFileRef.Type;

/** A file a card carries, as Nemia read it: its name and File, what the File is, whether the text names it, and whether it is kept. */
export const CardFileStatus = Schema.Struct({
  name: Schema.String.annotate({ description: "The file's name in the card." }),
  file: Schema.String.annotate({ description: 'The id of the File it names.' }),
  mediaType: Schema.optionalKey(Schema.String.annotate({ description: "The File's media type; absent where it is not kept." })),
  size: Schema.optionalKey(describedNumber("The File's size in bytes; absent where it is not kept.")),
  inText: Schema.Boolean.annotate({
    description: "Whether the card's text names it as an image or a link target (`name` or `./name`), where it is shown.",
  }),
  kept: Schema.Boolean.annotate({
    description: 'Whether its namespace still keeps the File: a run started from the card takes it only then.',
  }),
}).annotate({ description: 'A file a card carries, as Nemia read it.' });
export type CardFileStatus = typeof CardFileStatus.Type;

/** What a person wrote on the card: each key absent where the card does not set it; `body` absent on an entry that does not read. */
export const CardSpec = Schema.Struct({
  workflow: Schema.optionalKey(described(Schema.String, 'workflow')),
  repo: Schema.optionalKey(described(Schema.String, 'repo')),
  gate: Schema.optionalKey(described(Schema.String, 'gate')),
  model: Schema.optionalKey(described(Schema.Record(Schema.String, Schema.String), 'model')),
  from: Schema.optionalKey(described(Schema.Array(Schema.String), 'from')),
  after: Schema.optionalKey(described(Schema.Array(Schema.String), 'after')),
  queued: Schema.optionalKey(described(Schema.String, 'queued')),
  files: Schema.optionalKey(described(Schema.Array(CardFileNamed), 'files')),
  body: Schema.optionalKey(
    Schema.String.annotate({ description: "the card's idea, in markdown, under its frontmatter: its first line is its title" }),
  ),
});
export type CardSpec = typeof CardSpec.Type;

/** The tick's last start of a queued card that did not happen: when, on which repository, why, and whether it was a refusal. */
export const CardLastStart = Schema.Struct({
  at: Schema.String.annotate({ description: 'When the tick tried to start the card, as an ISO 8601 time.' }),
  repo: Schema.String.annotate({ description: 'The repository the start was on.' }),
  why: Schema.String.annotate({ description: 'Why the start did not happen.' }),
  refused: Schema.Boolean.annotate({ description: 'Whether the start was a refusal, rather than a miss.' }),
});
export type CardLastStart = typeof CardLastStart.Type;

/** A label key a card was filed without, since the runs of its `from:` disagree on it: each run with its value. */
export const CardLabelLeftOut = Schema.Struct({
  key: Schema.String.annotate({ description: 'The label key the card was filed without.' }),
  values: Schema.Array(
    Schema.Struct({
      run: Schema.String.annotate({ description: 'The id of a run of its `from:`.' }),
      value: Schema.String.annotate({ description: "That run's value of the label." }),
    }),
  ).annotate({ description: 'Each run of its `from:` with its value of the label.' }),
});
export type CardLabelLeftOut = typeof CardLabelLeftOut.Type;

/**
 * What a wait of a card is, closed: `waiting`, on a named card whose work has not succeeded yet, standing at a card (`at`); `missing`, on a
 * name the store knows nothing of; `cycle`, on a card whose `after:` leads back to this one.
 */
export const CARD_WAIT_KINDS = ['waiting', 'missing', 'cycle'] as const;
export type CardWaitKind = (typeof CARD_WAIT_KINDS)[number];

/**
 * One card a card waits on that has not succeeded: the card named, the kind of the wait, the card its work stands at and that card's state,
 * the route of a cycle, and whether only a person can release it (`stalled`).
 */
export const CardWait = Schema.Struct({
  card: Schema.String.annotate({ description: "The card named in the card's `after:`, by name." }),
  kind: Schema.Literals(CARD_WAIT_KINDS).annotate({
    description:
      'What the wait is: waiting, on a named card whose work has not succeeded; missing, on a name the store knows nothing of; cycle, on a card whose after: leads back to this one.',
  }),
  at: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "The card where the named card's work stands now, where it is another: the card its run passed the work on to. Absent where it is the named card itself.",
    }),
  ),
  state: Schema.optionalKey(
    Schema.Literals(CARD_STATES).annotate({
      description: 'The state of the card the work stands at, as the inbox lists it; absent where it was not read.',
    }),
  ),
  cycle: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: 'On a cycle only: the route of `after:` lines from this card back to itself, by name, the card first and last.',
    }),
  ),
  stalled: Schema.Boolean.annotate({
    description:
      'Whether the wait will never be released without a person: a missing card, a cycle, or a card whose run ended without succeeding or whose start was refused. Fix it with nemia inbox resend <card>, nemia release <the run of that card>, nemia inbox edit <this card> to change after:, or nemia start <this card>.',
  }),
}).annotate({ description: 'One card a card waits on that has not succeeded, and where its work stands.' });
export type CardWait = typeof CardWait.Type;

/**
 * What Nemia read of the card: its `state`, the runs it was started as (`runs`), the tick's last missed start (`lastStart`), the first
 * line of its body (`title`, absent where it has none), and why the entry does not read as a card (`error`, absent on a card).
 */
export const CardStatus = Schema.Struct({
  state: Schema.Literals(CARD_STATES).annotate({
    description: "Where the card is in its life: its own word until it starts, and its run's phase from then on.",
  }),
  runs: Schema.Array(Schema.String).annotate({ description: 'The ids of the runs the card was started as.' }),
  lastStart: Schema.optionalKey(CardLastStart.annotate({ description: "The tick's last start of the card that did not happen." })),
  title: Schema.optionalKey(Schema.String.annotate({ description: "The first line of the card's body; absent where it has none." })),
  error: Schema.optionalKey(Schema.String.annotate({ description: 'Why the entry does not read as a card; absent on a card.' })),
  files: Schema.optionalKey(
    Schema.Array(CardFileStatus).annotate({ description: 'The files the card carries, as Nemia read them; absent where it carries none.' }),
  ),
  inPlay: Schema.Boolean.annotate({
    description: 'Whether the card is still in play: not started, or its run not ended. `nemia inbox` and the board list these by default.',
  }),
  place: Schema.optionalKey(
    describedNumber(
      "A queued card's place in the order the tick starts cards in, from 1, among every card queued and not started, every factory's.",
    ),
  ),
  file: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "The entry's file in the inbox: `<name>.md` for a card, and for a stray entry that is no card its own file, which is its name, its `error` saying why it is no card.",
    }),
  ),
  source: Schema.optionalKey(
    Schema.String.annotate({
      description: "The card's file as written, frontmatter and body: on a read of one card alone, never on a list's items.",
    }),
  ),
  labelsLeftOut: Schema.optionalKey(
    Schema.Array(CardLabelLeftOut).annotate({
      description:
        'The label keys the card was filed without, as the runs of its `from:` disagree on them: on the answer of a filing alone.',
    }),
  ),
  queuedBy: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description:
        'The card triggers of its factory that queue it, by name, where its labels are selected and it is not queued by hand: read on every pass, never written on the card.',
    }),
  ),
  clash: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description:
        'The card triggers of its factory that would send it, naming no workflow, to two workflows: it waits until a labelSelector of theirs or its labels change.',
    }),
  ),
  waitingOn: Schema.optionalKey(
    Schema.Array(CardWait).annotate({
      description:
        'The cards of its after: that have not succeeded, each with where its work stands: no trigger queues it and the tick starts none of it while any is listed. Read on every pass, never written on the card; absent where it waits on none.',
    }),
  ),
  queueLength: Schema.optionalKey(
    describedNumber("How many cards are queued and not started, every factory's, the card among them: on the answer of a queue alone."),
  ),
  factoryRepo: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "The repository a queued card starts on, the one its factory's wiring names for its workflow, else its factory's only one: on the answer of a queue alone, where it has one.",
    }),
  ),
}).annotate({
  description:
    'What Nemia read of the card: its state, the runs it was started as, the last start that did not happen, its title, its place in the queue, and why it does not read as a card.',
});
export type CardStatus = typeof CardStatus.Type;

/** An inbox card, as an object. */
export const Card = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Card').annotate({
    description: 'What the object is: a Card, a piece of work filed in the inbox, which a run is started as.',
  }),
  metadata: ObjectMeta,
  spec: CardSpec.annotate({
    description:
      'What a person wrote on the card: the workflow that runs it, its gate, its models, the runs whose conclusions it is handed, when it was queued, and its body.',
  }),
  status: CardStatus,
});
export type Card = typeof Card.Type;

/** A card as a list serves it: its object without its idea's markdown or its file's text, its title kept as data. */
const CardListed = Schema.Struct({
  ...Card.fields,
  spec: CardSpec.mapFields(Struct.omit(['body'])).annotate({
    description:
      'What a person wrote on the card, without its body, which a read of the card answers: the workflow that runs it, its gate, its models, the runs whose conclusions it is handed and when it was queued.',
  }),
  status: CardStatus.mapFields(Struct.omit(['source'])).annotate({
    description: "What Nemia read of the card, its title among it, without its file's text, which a read of the card answers.",
  }),
}).annotate({ description: "A card as a list serves it, without its files' content (LISTED_WITHOUT)." });
type CardListed = typeof CardListed.Type;

/** A page of the inbox's cards, each without its body. */
export const CardList = listOf('Card', CardListed);
export type CardList = typeof CardList.Type;

/**
 * A card filed (create): its body, the workflow that runs it by name, the factory it is filed in, and its labels as `key=value`. `from`
 * is retired, read and ignored: the factory finds the workflow. `repo` is retired and refused: the factory places the card's run
 * (`nemia factory attach <factory> <workflow> --repo <name>`).
 */
export const CardFile = Schema.Struct({
  body: Schema.String.annotate({ description: "The card's idea, in markdown: its first line is its title." }),
  workflow: Schema.optionalKey(Schema.String.annotate({ description: 'The workflow that runs the card, by name.' })),
  from: Schema.optionalKey(
    Schema.Literals(['repo', 'yours', 'user']).annotate({ description: 'Retired, read and ignored: the factory finds the workflow.' }),
  ),
  repo: Schema.optionalKey(Schema.String.annotate({ description: "Retired and refused: the factory places the card's run." })),
  factory: Schema.optionalKey(Schema.String.annotate({ description: 'The factory the card is filed in.' })),
  label: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({ description: 'The labels the card is filed with, each as `key=value`.' }),
  ),
  after: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: 'The cards it waits on, by name: it is queued and started only once each has succeeded.',
    }),
  ),
  files: Schema.optionalKey(
    Schema.Array(CardFileRef).annotate({
      description: "The files the card carries, each a File uploaded to the card's namespace first, by its id.",
    }),
  ),
});
export type CardFile = typeof CardFile.Type;

/** Files attached to a card not yet started (attach): each a File uploaded to the card's namespace first, by its id. */
export const CardAttach = Schema.Struct({
  files: Schema.Array(CardFileRef).annotate({
    description: "The files to attach, each a File uploaded to the card's namespace first, by its id, and the name it takes in the card.",
  }),
});
export type CardAttach = typeof CardAttach.Type;

/**
 * A card started: the workflow its run is started on, by name — the card's own `workflow:` when it names none, as `nemia start <card>`
 * takes it, `from` being retired, read and ignored, since the factory finds the workflow and places the run — the runs it waits on
 * (`after`) and reads as context (`context`), the brief given in place of the card's body, the labels it is started with
 * (`key=value`, `key-`), the inbox cards it is handed (`cards`), and what a start of a brief takes beside (`startExtras`: models, gates,
 * no worktree, inputs).
 */
export const CardStart = Schema.Struct({
  workflow: Schema.optionalKey(
    Schema.String.annotate({ description: "The workflow its run is started on, by name; the card's own `workflow:` when it names none." }),
  ),
  from: Schema.optionalKey(
    Schema.Literals(['repo', 'yours', 'user']).annotate({ description: 'Retired, read and ignored: the factory finds the workflow.' }),
  ),
  after: Schema.optionalKey(Schema.Array(Schema.String).annotate({ description: 'The runs its first steps wait on to succeed, by id.' })),
  context: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: 'The runs whose conclusions it is handed as context, by id; it does not wait on them.',
    }),
  ),
  brief: Schema.optionalKey(Schema.String.annotate({ description: "The brief given in place of the card's body." })),
  label: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: 'The labels the run is started with, each as `key=value` or `key-` to take one off.',
    }),
  ),
  cards: Schema.optionalKey(Schema.Array(Schema.String).annotate({ description: 'The inbox cards it is handed, by name.' })),
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
    resourceVersion: Schema.optionalKey(
      Schema.String.annotate({ description: 'The version the card was read at; the write is refused where the card has changed since.' }),
    ),
    labels: Schema.optionalKey(
      Schema.Record(Schema.String, Schema.String).annotate({
        description: "The card's labels as they are to be; absent leaves them, `{}` takes them all off.",
      }),
    ),
  }).annotate({ description: "The card's labels, and the version it was read at." }),
  spec: CardSpec.annotate({ description: 'The spec of the card as it is to be, `queued` as the card has it.' }),
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
  resourceVersion: Schema.optionalKey(
    Schema.String.annotate({ description: 'The version the card was read at; the write is refused where the card has changed since.' }),
  ),
});
export type CardEdit = typeof CardEdit.Type;

/**
 * A card queued (queue), in its query: the workflow it starts on, by its name, written over the card's own; absent, the card's own
 * `workflow:`. A workflow is named, never sent as a path: the daemon finds it where a start of the card would. In the query, so a queue
 * sent with no body, or a body the api does not read, queues as it did before the key.
 */
export const CardQueue = Schema.Struct({
  workflow: Schema.optionalKey(
    Schema.String.annotate({
      description: "The workflow the card starts on, by name, written over the card's own; absent, the card's own.",
    }),
  ),
});
export type CardQueue = typeof CardQueue.Type;

/**
 * A started card sent on (resend): the workflow its new card is queued on, by its name; absent, the new card names none and is left
 * unqueued, for its factory's card triggers to take. In the body, as a filing takes one.
 */
export const CardResend = Schema.Struct({
  workflow: Schema.optionalKey(
    Schema.String.annotate({
      description: "The workflow the card sent on is queued on, by name; absent, it names none, for its factory's card triggers.",
    }),
  ),
});
export type CardResend = typeof CardResend.Type;

/**
 * What a started card sent on answers (resend): the card filed, the card and the run it was sent on from, and the run cancelled, or why
 * it was not, when that run waited on a person.
 */
export const CardResent = Schema.Struct({
  card: Card.annotate({ description: 'The card filed, `<run>-resent`, in the namespace of the card it was sent on from.' }),
  from: Schema.Struct({
    card: Schema.String.annotate({ description: 'The card sent on, by name.' }),
    run: Schema.String.annotate({ description: 'The run it was sent on from, by id: what the card filed is named after.' }),
  }).annotate({ description: 'The card sent on, and the run it was sent on from.' }),
  cancelled: Schema.optionalKey(
    Schema.String.annotate({ description: 'The run it was sent on from, by id, cancelled since it waited on a person.' }),
  ),
  cancelLeft: Schema.optionalKey(
    Schema.String.annotate({
      description: 'Why the run it was sent on from, which waited on a person, was not cancelled, and the command that cancels it.',
    }),
  ),
}).annotate({ identifier: 'CardResent' });
export type CardResent = typeof CardResent.Type;
