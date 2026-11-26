/**
 * The run's named actions, as the api is sent them and answers them: a run started (`RunStart`, `RunStarted`), a step tried again or a
 * loop sent round (`RunRetry`, `RunAsked`), a step approved at its gate (`RunApprove`, `RunApproved`), words said to a step's session
 * (`RunSay`, `RunSaid`), the run pinned to new revisions or its loop sent to merge its base (`RunRefresh`, `RunRefreshed`), a hold put
 * and lifted (`RunHold`, `RunHeld`), a condition routed by hand (`RunRoute`, `RunRouted`), a try's run removed (`RunRemoved`) and a
 * finished run pruned (`RunPrune`, `RunPruned`). Each body is what its endpoint decodes (run-api.ts), a 400 naming the key it refuses,
 * and what the orchestrator's typed entry takes beside the path's names (`RetryInput`, `ApproveInput`, …); each answer the keys the
 * entry answers. A run's labels are edited with the card's `LabelEdit`, answered `Labelled` (labels.ts).
 *
 * Plain Schemas of JSON, as every object of this package is: a body's shape is checked here, what it asks of a run by the entry, in its
 * words.
 */
import { Schema } from 'effect';
import { Actor } from './token.ts';
import { describedNumber } from './meta.ts';
import { ChatSpeaker } from './nemia.ts';
import { RunDrift } from './run.ts';
import { Paused } from './server-api.ts';
import { StepCondition } from './run-step.ts';
import { RETRY_MODES, SAID_AFTER, WRITTEN_CONDITION_STATUSES } from './words.ts';

/** Strings, given many times. */
const Strings = Schema.Array(Schema.String);

/** A text that is not blank: a name, an id, a label's edit. */
const NOT_BLANK = Schema.makeFilter((text: string) => text.trim() !== '');
const NotBlank = Schema.String.check(NOT_BLANK);

/** A text that is not blank, saying what it is: its description before its check, which drops one set after it. */
const notBlank = (description: string) => Schema.String.annotate({ description }).check(NOT_BLANK);

/**
 * A person's answers to the questions a step's closeout asks: the question, the options chosen, their own words, and whether none of its
 * options fits (`none`), the way out every question offers, which no agent writes. Its description says
 * what each key is matched against, for a caller that reads the schema alone (the MCP port's tools): the questions as the run's decision
 * lists them (`Decidable`'s `questions`, decide.ts).
 */
const Answers = Schema.Array(
  Schema.Struct({
    question: Schema.String.annotate({ description: "The question's title, word for word, as the run's decision lists it." }),
    chose: Strings.annotate({
      description: 'The labels of the options chosen, never their letters; several only where the question takes several.',
    }),
    own: Schema.optionalKey(Schema.String.annotate({ description: "The person's own words, beside a choice or instead of one." })),
    none: Schema.optionalKey(
      Schema.Boolean.annotate({ description: "True where none of the question's options fits: chose stays empty, own may say why." }),
    ),
  }),
).annotate({
  description:
    "One answer to each question the step asks now, as the run's decision lists them under questions (GET /api/runs/:runId/decision): " +
    "question is the question's title, word for word; chose the labels of the options chosen, never their letters, several only where " +
    'the question takes several (multiple); own your own words, beside a choice or instead of one; none true where none of its ' +
    'options fits, with chose empty and own, if given, saying why.',
});

/**
 * A file handed to a run's steps (`nemia start --input <file>`), read where the start is typed and sent by its name, never its path: the
 * `file` it was uploaded as (`POST /api/namespaces/<namespace>/files`, file.ts), uploaded before the start, each file its own request; or,
 * for a small one inside the start's body, its `text` where its bytes are UTF-8 text, else its bytes in `base64`. One of the three. Its
 * name is a file's own, no folder in it: given with text or base64, and, with a file, the name it was uploaded with where left out.
 */
export const RunInput = Schema.Struct({
  name: Schema.optionalKey(
    notBlank(
      "The file's own name, no folder in it: what the run's steps find it by. Given with text or base64; with a file, its uploaded name where left out.",
    ),
  ),
  file: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "The id of a file uploaded to the same namespace (POST /api/namespaces/:namespace/files, file_…), whose bytes the run's steps are handed; else left out, and text or base64 given.",
    }),
  ),
  text: Schema.optionalKey(
    Schema.String.annotate({ description: 'Its text, where its bytes are UTF-8 text and no file is given; else left out.' }),
  ),
  base64: Schema.optionalKey(
    Schema.String.annotate({ description: 'Its bytes in base64, where they are no text and no file is given; else left out.' }),
  ),
}).annotate({ identifier: 'RunInput' });
export type RunInput = typeof RunInput.Type;

/**
 * What a start takes beside its workflow and brief, a brief's and a card's alike: each step's model for this run alone (`models`, step
 * to model, as `--model <step>=<model>` gives it), the steps gated (`gates`), a run with no worktree of its own (`noWorktree`), and the
 * files handed to its steps (`inputs`).
 */
export const startExtras = {
  models: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String).annotate({
      description: "Each step's model for this run alone, step to model, as `--model <step>=<model>` gives it.",
    }),
  ),
  gates: Schema.optionalKey(
    Schema.Array(NotBlank).annotate({
      description: "The steps gated in this run (--gate): each one's closeout waits for an approval before anything after it is filed.",
    }),
  ),
  noWorktree: Schema.optionalKey(
    Schema.Boolean.annotate({ description: 'Whether the run works with no worktree of its own (--no-worktree).' }),
  ),
  inputs: Schema.optionalKey(
    Schema.Array(RunInput).annotate({ description: 'The files handed to its steps (`--input <file>`), each by its name.' }),
  ),
};

/**
 * A run started, as `nemia start` starts one: the workflow, where it is read from when both the repository and your library have it,
 * the runs it waits on (`after`) and is handed as context (`context`), the inbox cards it is handed by name (`cards`), its brief, the
 * labels it is started with (`key=value`), and what `startExtras` adds.
 * An inbox card is started at its own path (`CardStart`): a `card` sent here is refused, its message naming that path.
 */
export const RunStart = Schema.Struct({
  ...startExtras,
  workflow: notBlank('The workflow to run, by name.'),
  from: Schema.optionalKey(
    Schema.Literals(['repo', 'user']).annotate({
      description: 'Where the workflow is read from when both the repository and the user library have it: repo or user.',
    }),
  ),
  after: Schema.optionalKey(Schema.Array(NotBlank).annotate({ description: 'The runs its first steps wait on to land (--after), by id.' })),
  context: Schema.optionalKey(
    Schema.Array(NotBlank).annotate({
      description: 'The runs whose conclusions it is handed as context (--context), by id; it does not wait on them.',
    }),
  ),
  cards: Schema.optionalKey(Schema.Array(NotBlank).annotate({ description: 'The inbox cards it is handed, by name.' })),
  brief: Schema.optionalKey(Schema.String.annotate({ description: 'What the run is asked to do.' })),
  label: Schema.optionalKey(Schema.Array(NotBlank).annotate({ description: 'The labels it is started with, each key=value.' })),
  card: Schema.optionalKey(
    Schema.Never.annotate({
      description: 'Refused: an inbox card is started at its own path, `POST /api/namespaces/<namespace>/cards/<name>/start`.',
      message: 'a card is started at its own path, POST /api/namespaces/:namespace/cards/:name/start, with the workflow and the brief',
    }),
  ),
}).annotate({ identifier: 'RunStart' });
export type RunStart = typeof RunStart.Type;

/** A folder of a run's factory and the steps that write it: each other local step reads it alone. */
const WrittenBy = Schema.Struct({
  path: Schema.String.annotate({ description: 'The folder, by its path.' }),
  steps: Strings.annotate({ description: 'The steps that write it, by name.' }),
});

/** A folder a run copied files into: the files by name, and the folder. */
const CopiedInto = Schema.Struct({
  names: Strings.annotate({ description: 'The files copied, by name.' }),
  dir: Schema.String.annotate({ description: 'The folder they were copied into.' }),
});

/**
 * A run as it was started, what `nemia start` prints of it: its steps, each with the agent it is filed with; the inbox card it came from
 * (`from`); its factory; its repository, and whether it works in one (`repository`: a folder run's steps work in a folder each); its
 * workflow's name; the factory's folders it mounts read-only (`mounts`) and those some steps write (`writable`); its volumes, read-only
 * (`volumes`) and writable (`writableVolumes`); the harness settings it froze (`settings`); where it works (`workspace`); the inputs and
 * cards it copied, and where its workflow's and carried files were copied; the runs it waits on to land on its `branch` (`after`) and is
 * handed as context (`context`); the steps gated (`gated`) and the endings a person approves first (`ends`); each step's model for it
 * alone (`models`); its labels, and each key it did not inherit since the runs it names disagree on it (`labelsLeftOut`).
 */
export const RunStartedFacts = Schema.Struct({
  steps: Schema.Array(
    Schema.Struct({
      name: Schema.String.annotate({ description: "The step's name." }),
      agent: Schema.optionalKey(Schema.String.annotate({ description: 'The agent it is filed with; absent where none.' })),
    }),
  ).annotate({
    description: 'Its steps, each with the agent it is filed with, absent where none.',
  }),
  from: Schema.optionalKey(Schema.String.annotate({ description: 'The inbox card it came from; absent for a run from no card.' })),
  factory: Schema.optionalKey(Schema.String.annotate({ description: 'The factory it was started in; absent for the default one.' })),
  repo: Schema.String.annotate({ description: "Its repository; empty where the run's record names none, as on a folder run." }),
  repository: Schema.Boolean.annotate({
    description: 'Whether it works in its repository; false for a folder run, whose steps work in a folder each.',
  }),
  workflow: Schema.String.annotate({ description: "Its workflow's name." }),
  mounts: Schema.optionalKey(Strings.annotate({ description: "The factory's folders it mounts read-only." })),
  writable: Schema.optionalKey(
    Schema.Array(WrittenBy).annotate({
      description: "The factory's folders some of its steps write, each with those steps; each other local step reads it alone.",
    }),
  ),
  volumes: Schema.optionalKey(Strings.annotate({ description: "The factory's volumes it mounts read-only." })),
  writableVolumes: Schema.optionalKey(
    Schema.Array(WrittenBy).annotate({ description: 'The volumes some of its steps write, each with those steps.' }),
  ),
  settings: Schema.optionalKey(Strings.annotate({ description: 'The harness settings it froze from its factory.' })),
  workspace: Schema.String.annotate({ description: "Where it works; empty where the run's record names none, as on a folder run." }),
  inputs: Schema.optionalKey(
    CopiedInto.annotate({ description: 'The input files it copied, by name, and the folder they were copied into.' }),
  ),
  cards: Schema.optionalKey(
    CopiedInto.annotate({ description: 'The inbox cards it copied, by name, and the folder they were copied into.' }),
  ),
  workflowFiles: Schema.optionalKey(
    Schema.String.annotate({ description: "Where its workflow's files were copied, which its steps read them from." }),
  ),
  carriedFiles: Schema.optionalKey(
    Schema.String.annotate({ description: 'Where the files its workflow shares with the others beside it were copied.' }),
  ),
  after: Schema.optionalKey(Strings.annotate({ description: 'The runs it waits on to land on its branch.' })),
  branch: Schema.String.annotate({
    description:
      "The base branch its result goes to, which the runs it waits on land on; empty where the run's record names none, as on a folder run.",
  }),
  context: Schema.optionalKey(Strings.annotate({ description: 'The runs it is handed as context.' })),
  gated: Schema.optionalKey(Strings.annotate({ description: 'The steps gated in it.' })),
  ends: Schema.optionalKey(Strings.annotate({ description: 'Its endings a person approves first.' })),
  models: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String).annotate({ description: "Each step's model for this run alone, step to model." }),
  ),
  labels: Schema.optionalKey(Schema.Record(Schema.String, Schema.String).annotate({ description: 'The labels it was started with.' })),
  labelsLeftOut: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        key: Schema.String.annotate({ description: 'The label key left out.' }),
        values: Schema.Array(
          Schema.Struct({
            run: Schema.String.annotate({ description: 'The run, by id.' }),
            value: Schema.String.annotate({ description: 'The value that run holds for the key.' }),
          }),
        ).annotate({ description: 'What each run it names holds for the key.' }),
      }),
    ).annotate({ description: "Each label key it did not inherit, since the runs it names disagree on it, with each run's value." }),
  ),
}).annotate({
  identifier: 'RunStartedFacts',
  description: 'The run as it was started, what nemia start prints of it: its steps, place, mounts, files copied, waits, gates and labels.',
});
export type RunStartedFacts = typeof RunStartedFacts.Type;

/**
 * What a start answers: the run's name; and what `nemia start` prints of it, where the api says it: the run as it was started (`run`),
 * the store's pause as it stood once the run was written (`paused`), the runs handed as context that had landed (`landed`), a line for
 * each file of its folder that still writes a former spelling (`hints`), the factory's repositories and volumes left out of its mounts,
 * being no directory (`notMounted`, `notVolumes`), and the `?repo=` that only found the factory, its wiring placing the run on another
 * (`repoFoundFactory`). Of an inbox card's start, the card, why its `queued:` line is still on it (`queueLeft`), a `repo:` the start
 * did not take (`ignoredRepo`), and the cards of its `after:` that had not landed, which a start by hand goes ahead of (`waitedOn`).
 */
export const RunStarted = Schema.Struct({
  id: Schema.String.annotate({ description: "The new run's id." }),
  card: Schema.optionalKey(Schema.String.annotate({ description: "The inbox card started, on a card's start." })),
  queueLeft: Schema.optionalKey(
    Schema.String.annotate({ description: "Why the card's queued: line is still on it, on a card's start where it is." }),
  ),
  ignoredRepo: Schema.optionalKey(
    Schema.String.annotate({ description: 'A repo: line of the card the start did not take, since the factory places the run.' }),
  ),
  waitedOn: Schema.optionalKey(
    Strings.annotate({
      description:
        "The cards of the card's after: that had not landed, by name, on a card's start by hand: the run was started all the same, from the base as it is now.",
    }),
  ),
  paused: Schema.optionalKey(
    Paused.annotate({ description: "The store's pause as it stood once the run was written; absent where it is not paused." }),
  ),
  landed: Schema.optionalKey(Strings.annotate({ description: 'The runs handed as context that had landed.' })),
  hints: Schema.optionalKey(
    Strings.annotate({ description: 'A line for each file of its workflow folder that still writes a former spelling.' }),
  ),
  notMounted: Schema.optionalKey(
    Strings.annotate({ description: "The factory's repositories left out of its mounts, being no directory." }),
  ),
  notVolumes: Schema.optionalKey(Strings.annotate({ description: "The factory's volumes left out of its mounts, being no directory." })),
  repoFoundFactory: Schema.optionalKey(
    Schema.String.annotate({ description: 'The ?repo= that only found the factory, its wiring placing the run on another repository.' }),
  ),
  run: Schema.optionalKey(RunStartedFacts),
}).annotate({ identifier: 'RunStarted' });
export type RunStarted = typeof RunStarted.Type;

/** What an inbox card's start answers (the Card's `start`): what a start answers (`RunStarted`), the card's name always among it. */
export const CardStarted = Schema.Struct({
  ...RunStarted.fields,
  card: Schema.String.annotate({ description: 'The inbox card started, by name.' }),
}).annotate({ identifier: 'CardStarted' });
export type CardStarted = typeof CardStarted.Type;

/**
 * The ways a try is asked for, and the former spelling the api still takes and answers with a `hint` (`nudge`, now `continue`): the
 * orchestrator's `FORMER_MODES`.
 */
export const RETRY_ASKED_MODES = [...RETRY_MODES, 'nudge'] as const;

/**
 * Another try of a step, as `nemia retry` asks for one: its way (`mode`), the model a fresh one runs on, the words it is told, a raise of
 * its cap (`budget`), a person's `answers` to its questions, the one refused check a recheck runs again (`check`); or, with `round`,
 * another round of the loop it closes.
 */
export const RunRetry = Schema.Struct({
  mode: Schema.optionalKey(
    Schema.Literals(RETRY_ASKED_MODES).annotate({
      description:
        "How the step is tried again: continue its session, start it fresh, or recheck its work; nudge is continue's former spelling. Left out, continue.",
    }),
  ),
  off: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        'Takes back the try asked of the step and not yet filed (--off), or with round the round asked of its loop, setting the ask aside: no model, words, budget, answers or check beside it.',
    }),
  ),
  model: Schema.optionalKey(Schema.String.annotate({ description: "The model a fresh try runs on; left out, the step's own." })),
  round: Schema.optionalKey(
    Schema.Boolean.annotate({ description: 'Whether this asks another round of the loop the step closes (--round), not another try.' }),
  ),
  message: Schema.optionalKey(
    Schema.String.annotate({ description: 'The words the try is told: an answer to its needs, or what to do differently.' }),
  ),
  budget: Schema.optionalKey(
    Schema.Finite.annotate({ description: "A raise of the step's cap in dollars (--budget), above what its tries have cost." }),
  ),
  answers: Schema.optionalKey(Answers),
  check: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "With mode recheck, the one refused check of the step to run again (--check), by its name under checks:, every other check's task kept; left out, every check that did not pass runs again.",
    }),
  ),
}).annotate({ identifier: 'RunRetry' });
export type RunRetry = typeof RunRetry.Type;

/** When and by whom a person took an ask back (`--off`): it is set aside under the run's asks' done/, never deleted. */
const TakenBack = Schema.Struct({
  at: Schema.String.annotate({ description: 'When the ask was taken back.' }),
  actor: Schema.optionalKey(Actor),
});

/**
 * What an ask of a try answers, taken and not yet done: the try asked for, the ask's file and whether the tick stops a blocked session
 * first; or, of a round, the looping step and the round. `hint` names the spelling to send where the body said a former one.
 */
export const RunAsked = Schema.Struct({
  try: Schema.optionalKey(Schema.Finite.annotate({ description: 'The try asked for; absent for a round.' })),
  file: Schema.String.annotate({ description: "The ask's file, which the next pass acts on." }),
  stopFirst: Schema.optionalKey(Schema.Boolean.annotate({ description: 'Whether the tick stops a blocked session first.' })),
  step: Schema.optionalKey(Schema.String.annotate({ description: 'The looping step, for a round.' })),
  round: Schema.optionalKey(Schema.Finite.annotate({ description: 'The round asked for, for a round.' })),
  budget: Schema.optionalKey(Schema.Finite.annotate({ description: 'The raise of the cap the ask carries, in dollars; absent for none.' })),
  hint: Schema.optionalKey(Schema.String.annotate({ description: 'The spelling to send, where the body said a former one (nudge).' })),
  takenBack: Schema.optionalKey(
    TakenBack.annotate({
      description: "Of an ask taken back (--off), when and by whom; its file is then where it was set aside in the run's done/.",
    }),
  ),
  stray: Schema.optionalKey(
    Schema.Literal(true).annotate({
      description: "Of a take-back, true where what was set aside read as no ask: a stray record at the ask's key, kept as it was.",
    }),
  ),
}).annotate({ identifier: 'RunAsked' });
export type RunAsked = typeof RunAsked.Type;

/**
 * An approval of a step at its gate, as `nemia approve` makes one: the words with it, the answers to its questions, the caps it sets. Or,
 * with `off: true` and none of those, the approval of a step that stands approved while nothing it approved has been filed, taken back
 * (`nemia approve <run> <step> --off`).
 */
export const RunApprove = Schema.Struct({
  off: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        'Takes back the approval of a step that stands approved while nothing it approved has been filed (--off), with none of the keys below.',
    }),
  ),
  message: Schema.optionalKey(
    Schema.String.annotate({ description: 'The words given with the approval, which the steps after it are told.' }),
  ),
  answers: Schema.optionalKey(Answers),
  budgets: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        step: Schema.String.annotate({ description: 'The step the cap is set on.' }),
        usd: Schema.Finite.annotate({ description: "The step's cap, in dollars." }),
      }),
    ).annotate({
      description: 'The caps the approval sets on the steps after it, each a step and its dollars.',
    }),
  ),
}).annotate({ identifier: 'RunApprove' });
export type RunApprove = typeof RunApprove.Type;

/**
 * What an approval answers: the step, the try approved, when, the words, and the approval's file; and, as `nemia approve` prints it,
 * whether it ended a loop out of rounds (`loop`), what the next tick files because of it (`next`), and each cap it set (`caps`), above
 * the step's own budget in the workflow or not. Of an approval taken back (`off`), the approval as it was given, its file where it was
 * set aside in the run's `done/`, and when and by whom it was taken back (`takenBack`).
 */
export const RunApproved = Schema.Struct({
  step: Schema.String.annotate({ description: 'The step approved.' }),
  try: Schema.Finite.annotate({ description: 'The try approved.' }),
  at: Schema.String.annotate({ description: 'When it was approved.' }),
  message: Schema.NullOr(Schema.String).annotate({ description: 'The words given with it; null for none.' }),
  file: Schema.String.annotate({ description: "The approval's file; of one taken back, where it was set aside in the run's done/." }),
  actor: Schema.optionalKey(Actor),
  loop: Schema.optionalKey(Schema.Boolean.annotate({ description: 'Whether it ended a loop out of rounds.' })),
  next: Schema.optionalKey(
    Schema.Literals(['step', 'waiting', 'nothing']).annotate({
      description: 'What the next tick files because of it: a step, nothing yet while it waits, or nothing.',
    }),
  ),
  caps: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        step: Schema.String.annotate({ description: 'The step the cap was set on.' }),
        usd: Schema.Finite.annotate({ description: "The step's cap, in dollars." }),
        above: Schema.Boolean.annotate({ description: "Whether the cap is above the step's own budget in the workflow." }),
        workflow: Schema.NullOr(Schema.Finite).annotate({
          description: "The step's own budget in the workflow, in dollars; null where it has none.",
        }),
      }),
    ).annotate({
      description:
        "Each cap it set: the step, its dollars, and whether that is above the step's own budget in the workflow (null where it has none).",
    }),
  ),
  takenBack: Schema.optionalKey(
    TakenBack.annotate({
      description: "When and by whom the approval, or a loop's acceptance, was taken back (--off); absent for one given.",
    }),
  ),
  stray: Schema.optionalKey(
    Schema.Literal(true).annotate({
      description: "Of a take-back, true where what was set aside at the gate's key read as no approval: a stray record, kept as it was.",
    }),
  ),
}).annotate({ identifier: 'RunApproved' });
export type RunApproved = typeof RunApproved.Type;

/**
 * Words said to a step's running session, as `nemia say` says them, and `from`, retired: who wrote them is the caller the request's
 * token says — the person under any token of theirs, an agent by a standing token minted for it or by its session's. A `from` naming an
 * agent is refused (422), naming `nemia token add <name> --agent <agent>`; one naming the person is read no further.
 */
export const RunSay = Schema.Struct({
  text: Schema.String.annotate({ description: "The words said to the step's running session." }),
  from: Schema.optionalKey(
    ChatSpeaker.annotate({
      description:
        'Retired: who wrote the words is the caller the token says. One naming an agent is refused; one naming the person is read no further.',
    }),
  ),
}).annotate({
  identifier: 'RunSay',
});
export type RunSay = typeof RunSay.Type;

/**
 * What the session's harness took and the engine journalled: when, on which attempt, the words as said (`text`, an agent's in its
 * frame), and what they came after; where an agent wrote them, which (`from`) and its words without the frame (`words`). Or, for a step
 * not filed yet, the words kept for its first try and not delivered (`kept: true`): when they were kept, its first attempt, and nothing
 * they came after.
 */
export const RunSaid = Schema.Struct({
  at: Schema.String.annotate({ description: "When the session's harness took the words, or when they were kept." }),
  attempt: Schema.Finite.annotate({ description: 'The attempt of the session that took them; its first, for words kept.' }),
  text: Schema.String.annotate({ description: "The words as said, an agent's in its frame." }),
  after: Schema.NullOr(
    Schema.Struct({
      kind: Schema.Literals(SAID_AFTER).annotate({ description: 'The kind of the event the words came after.' }),
      id: Schema.String.annotate({ description: 'The id of the event the words came after.' }),
    }),
  ).annotate({
    description: 'What the words came after in the conversation; null for none, and for words kept.',
  }),
  kept: Schema.optionalKey(
    Schema.Literal(true).annotate({ description: 'True for a step not filed yet: the words are kept for its first try, not delivered.' }),
  ),
  from: Schema.optionalKey(ChatSpeaker.annotate({ description: 'The agent that wrote the words, where one did.' })),
  words: Schema.optionalKey(Schema.String.annotate({ description: "That agent's words without the frame they were said in." })),
  try: Schema.optionalKey(Schema.Finite.annotate({ description: "The step's try the words were said to." })),
  taskId: Schema.optionalKey(Schema.NullOr(Schema.String).annotate({ description: "That try's task; null for a step not filed yet." })),
}).annotate({ identifier: 'RunSaid' });
export type RunSaid = typeof RunSaid.Type;

/** The run pinned to the new revisions, as `nemia refresh` pins it; with `base`, its loop's work sent to merge its base (`step`). */
export const RunRefresh = Schema.Struct({
  step: Schema.optionalKey(Schema.String.annotate({ description: "With base, the looping step whose loop's work merges its base." })),
  base: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: "Whether the loop's work is sent to merge its base (--base), rather than the run pinned to the new revisions.",
    }),
  ),
  off: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: 'With base, takes back the merge of the base asked of the loop and not yet filed (--off), setting the ask aside.',
    }),
  ),
}).annotate({ identifier: 'RunRefresh' });
export type RunRefresh = typeof RunRefresh.Type;

/**
 * What a refresh answers: the kinds the run was behind (`drift`); or, of a merge of the base, the looping step, the branch merged and onto
 * what, the commit, the round and the ask's file.
 */
export const RunRefreshed = Schema.Struct({
  drift: Schema.optionalKey(
    Schema.Array(RunDrift).annotate({
      description: 'The kinds the run was behind and is now pinned to anew, each with the revision pinned and the one now.',
    }),
  ),
  step: Schema.optionalKey(Schema.String.annotate({ description: 'The looping step, of a merge of the base.' })),
  target: Schema.optionalKey(Schema.String.annotate({ description: "The step that merges, the loop's target, of a merge of the base." })),
  onto: Schema.optionalKey(Schema.String.annotate({ description: 'The base branch merged, of a merge of the base.' })),
  sha: Schema.optionalKey(Schema.String.annotate({ description: "The base branch's commit merged, of a merge of the base." })),
  round: Schema.optionalKey(Schema.Finite.annotate({ description: 'The round the merge is asked in, of a merge of the base.' })),
  file: Schema.optionalKey(Schema.String.annotate({ description: "The ask's file, of a merge of the base." })),
  said: Schema.optionalKey(Schema.String.annotate({ description: 'What the refresh did, in words.' })),
  takenBack: Schema.optionalKey(
    TakenBack.annotate({
      description: "Of a merge taken back (--off), when and by whom; its file is then where it was set aside in the run's done/.",
    }),
  ),
  stray: Schema.optionalKey(
    Schema.Literal(true).annotate({
      description: "Of a take-back, true where what was set aside read as no merge ask: a stray record at the ask's key, kept as it was.",
    }),
  ),
}).annotate({ identifier: 'RunRefreshed' });
export type RunRefreshed = typeof RunRefreshed.Type;

/** A run held until other runs land, as `nemia hold <run> --until <run>…` holds it: the runs, why, and who holds it. */
export const RunHold = Schema.Struct({
  until: Schema.optionalKey(
    Strings.annotate({ description: 'The runs the hold waits on to land (--until); left out, a hold only a person lifts.' }),
  ),
  why: Schema.optionalKey(Schema.String.annotate({ description: "The person's words for why, one line." })),
  by: Schema.optionalKey(Schema.String.annotate({ description: 'Who puts the hold, one line.' })),
}).annotate({ identifier: 'RunHold' });
export type RunHold = typeof RunHold.Type;

/** A person's hold on a run, as written: when, the runs it waits on to land, why and by whom. */
const RunHoldWritten = Schema.Struct({
  at: Schema.String.annotate({ description: 'When the hold was put.' }),
  until: Strings.annotate({ description: 'The runs it waits on to land, in the order they were named.' }),
  why: Schema.optionalKey(Schema.String.annotate({ description: "The person's words for why; absent where none were given." })),
  by: Schema.optionalKey(Schema.String.annotate({ description: 'Who put it; absent on a file older code wrote.' })),
  actor: Schema.optionalKey(Actor),
}).annotate({
  identifier: 'RunHoldWritten',
  description: 'A hold on a run, as written: when, the runs it waits on to land, why and by whom.',
});
type RunHoldWritten = typeof RunHoldWritten.Type;

/** What a hold put or lifted answers: the run, whether it was lifted, and the hold. */
export const RunHeld = Schema.Struct({
  id: Schema.String.annotate({ description: "The run's id." }),
  lifted: Schema.Boolean.annotate({ description: 'Whether the hold was lifted, rather than put.' }),
  hold: RunHoldWritten,
}).annotate({
  identifier: 'RunHeld',
});
export type RunHeld = typeof RunHeld.Type;

/** A run put in someone's hand, as `nemia assign <run>` puts it: who has it, why, and how long an ask may wait on them. */
export const RunAssign = Schema.Struct({
  to: Schema.optionalKey(
    Schema.String.annotate({ description: 'Who has the run in hand, one line; left out, the OS user of the client that asks.' }),
  ),
  why: Schema.optionalKey(Schema.String.annotate({ description: 'The words for why they have it, one line.' })),
  for: Schema.optionalKey(
    Schema.String.annotate({
      description:
        'How long an ask may wait on them before the run is the person’s move again, as 90s, 10m or 2h (1s to 23h); left out, 1h.',
    }),
  ),
}).annotate({ identifier: 'RunAssign' });
export type RunAssign = typeof RunAssign.Type;

/** Who has a run in hand, as written: when, for how long an ask may wait on them, who and why. */
export const RunAssigneeWritten = Schema.Struct({
  at: Schema.String.annotate({ description: 'When the run was assigned.' }),
  forMs: describedNumber('How long, in milliseconds, an ask may wait on them before the run comes back.'),
  name: Schema.optionalKey(Schema.String.annotate({ description: 'Who has it; absent where no name was given or known.' })),
  why: Schema.optionalKey(Schema.String.annotate({ description: 'The words for why; absent where none were given.' })),
  actor: Schema.optionalKey(Actor),
}).annotate({
  identifier: 'RunAssigneeWritten',
  description: 'Who has a run in hand, as written: when, how long an ask may wait on them, who and why.',
});
export type RunAssigneeWritten = typeof RunAssigneeWritten.Type;

/** What an assignee put or given back answers: the run, whether it was given back, and the assignee. */
export const RunAssigned = Schema.Struct({
  id: Schema.String.annotate({ description: "The run's id." }),
  ended: Schema.Boolean.annotate({ description: 'Whether the run was given back, rather than assigned.' }),
  assignee: RunAssigneeWritten,
}).annotate({
  identifier: 'RunAssigned',
});
export type RunAssigned = typeof RunAssigned.Type;

/** A task of a run's that a cancel asked to stop: its step's name and the engine's task. */
const CancelStopped = Schema.Struct({
  name: Schema.String.annotate({ description: "The task's step's name." }),
  taskId: Schema.String.annotate({ description: "The engine's task." }),
});

/**
 * What a cancel did (`CancelPlan`, the orchestrator's): `cancel`, the run cancelled now and what was asked to stop; `already-cancelled`,
 * when it was cancelled before; `finished`, a run already over, whose status it says.
 */
export const RunCancelPlan = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('cancel').annotate({ description: 'The run was cancelled now.' }),
    stop: Schema.Array(CancelStopped).annotate({ description: 'The tasks asked to stop.' }),
  }),
  Schema.Struct({
    kind: Schema.Literal('already-cancelled').annotate({ description: 'The run was cancelled before.' }),
    at: Schema.String.annotate({ description: 'When it was cancelled.' }),
    stop: Schema.Array(CancelStopped).annotate({ description: 'The tasks asked to stop.' }),
  }),
  Schema.Struct({
    kind: Schema.Literal('finished').annotate({ description: 'The run was already over.' }),
    status: Schema.Literals(['succeeded', 'failed']).annotate({ description: 'How it ended.' }),
  }),
]);
export type RunCancelPlan = typeof RunCancelPlan.Type;

/** What a cancel answers: the run and the plan it followed (`nemia cancel`). */
export const RunCancelled = Schema.Struct({
  id: Schema.String.annotate({ description: "The run's id." }),
  plan: RunCancelPlan.annotate({
    description:
      'What the cancel did: cancel, with the tasks asked to stop; already-cancelled, with when; or finished, a run already over, with its status.',
  }),
  actor: Schema.optionalKey(Actor),
}).annotate({
  identifier: 'RunCancelled',
});
export type RunCancelled = typeof RunCancelled.Type;

/** A condition routed by hand, as `nemia route` routes one: the route, one of the condition's `routes:`. */
export const RunRoute = Schema.Struct({
  route: Schema.String.annotate({ description: 'The route the condition takes, one of its routes:.' }),
}).annotate({ identifier: 'RunRoute' });
export type RunRoute = typeof RunRoute.Type;

/**
 * What a route answers: the condition, the try of it the route is for, the route, when it was written and the file it is in. The next
 * pass files the steps whose `when:` names it.
 */
export const RunRouted = Schema.Struct({
  step: Schema.String.annotate({ description: 'The condition routed.' }),
  try: Schema.Finite.annotate({ description: 'The try of it the route is for.' }),
  route: Schema.String.annotate({ description: 'The route; the next pass files the steps whose when: names it.' }),
  at: Schema.String.annotate({ description: 'When it was written.' }),
  file: Schema.String.annotate({ description: 'The file it is in.' }),
}).annotate({ identifier: 'RunRouted' });
export type RunRouted = typeof RunRouted.Type;

/**
 * A condition written for a step: its status, the try of the step it speaks of (a write for any other try is refused, so a verdict for an
 * older push is never read as the new one's) and the writer's words.
 */
export const RunConditionWrite = Schema.Struct({
  status: Schema.Literals(WRITTEN_CONDITION_STATUSES).annotate({
    description: 'True: it holds, the step goes on. False: it does not, the step is refused as a failed check is. Unknown: not decided yet.',
  }),
  try: Schema.Finite.annotate({ description: 'The try of the step the status speaks of, from 1; it must be the one the step is on.' }),
  message: Schema.String.annotate({ description: "The writer's words with the status: what it saw, and what to do where it is False." }),
}).annotate({ identifier: 'RunConditionWrite' });
export type RunConditionWrite = typeof RunConditionWrite.Type;

/** What a condition's write answers: the condition as it stands for the step's try now. */
export const RunConditionWritten = Schema.Struct({
  condition: StepCondition,
}).annotate({ identifier: 'RunConditionWritten' });
export type RunConditionWritten = typeof RunConditionWritten.Type;

/** What the engine forgot of a removed run's tasks, and what waits to be forgotten until it settles (`EngineForgetting`). */
const EngineForgetting = Schema.Struct({
  forgotten: Strings.annotate({ description: 'The ids of the tasks the engine forgot.' }),
  waiting: Strings.annotate({ description: 'The ids of the tasks that wait, not settled yet.' }),
  why: Strings.annotate({ description: "The runtime's words for why tasks wait, each once." }),
  refused: Strings.annotate({ description: 'The ids of the tasks the engine refused by name.' }),
  refusedWhy: Strings.annotate({ description: "The engine's words for why it refused, each once." }),
  left: Strings.annotate({ description: "What the forgotten tasks' harness keeps that the runtime leaves." }),
  refusal: Schema.optionalKey(
    Schema.String.annotate({ description: "The engine's refusal of the whole call, in its words; absent where there was none." }),
  ),
  journalBytes: Schema.Finite.annotate({ description: "The bytes of the forgotten tasks' journals." }),
  feedLines: Schema.Finite.annotate({ description: 'The feed lines of the forgotten tasks.' }),
  marker: Schema.optionalKey(
    Schema.String.annotate({ description: "Where the run's marker keeps their ids, while something is left; absent otherwise." }),
  ),
});

/**
 * Why a run's branch was deleted or kept by its removal: merged into its base, or not and forced, deleted; kept, unasked (`default`), not
 * merged (`unmerged`), git's refusal in its words (`git`), or the place's remove unanswered (`unread`).
 */
export const BranchWhy = Schema.Union([
  Schema.Literals(['merged', 'forced', 'default', 'unmerged']),
  Schema.Struct({ git: Schema.String.annotate({ description: "Git's refusal, in its words." }) }),
  Schema.Struct({ unread: Schema.String.annotate({ description: "Why the place's remove was not read." }) }),
]).annotate({
  description: "Why the branch was deleted or kept: merged, forced, default, unmerged, git's refusal or the place's remove unanswered.",
});
export type BranchWhy = typeof BranchWhy.Type;

/**
 * What a removal answers: the run, that it was removed, what the engine forgot of its tasks (null with none); and what `nemia rm` prints
 * of it: the worktrees removed (`worktrees`), what each held uncommitted, committed first (`handedOff`), those already gone (`gone`), the
 * files removed, the record first (`files`), what became of each branch and why (`branches`), its base branch and repository, whether it
 * cut worktrees (`isolate`), whether it was a folder run (`folder`), and why its unfrozen workflow did not read (`unfrozen`).
 */
export const RunRemoved = Schema.Struct({
  id: Schema.String.annotate({ description: "The run's id." }),
  removed: Schema.Boolean.annotate({ description: 'Whether it was removed.' }),
  engine: Schema.NullOr(EngineForgetting).annotate({
    description: 'What the engine forgot of its tasks, and what waits to be forgotten until it settles; null where it had none.',
  }),
  worktrees: Schema.optionalKey(Strings.annotate({ description: 'The worktrees removed.' })),
  handedOff: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        step: Schema.String.annotate({ description: "The step's name." }),
        branch: Schema.optionalKey(Schema.String.annotate({ description: 'Its branch; absent where it had none.' })),
        commit: Schema.String.annotate({ description: 'The commit the uncommitted work was committed in.' }),
      }),
    ).annotate({
      description: 'What each worktree held uncommitted, committed first: the step, its branch and the commit.',
    }),
  ),
  gone: Schema.optionalKey(Strings.annotate({ description: 'The worktrees already gone.' })),
  files: Schema.optionalKey(Strings.annotate({ description: 'The files removed, the record first.' })),
  branches: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        branch: Schema.String.annotate({ description: "The branch's name." }),
        deleted: Schema.Boolean.annotate({ description: 'Whether it was deleted, rather than kept.' }),
        why: BranchWhy,
      }),
    ).annotate({
      description: 'What became of each branch, deleted or kept, and why.',
    }),
  ),
  base: Schema.optionalKey(Schema.String.annotate({ description: 'Its base branch.' })),
  repo: Schema.optionalKey(Schema.String.annotate({ description: 'Its repository.' })),
  isolate: Schema.optionalKey(Schema.Boolean.annotate({ description: 'Whether it cut worktrees of its own.' })),
  folder: Schema.optionalKey(Schema.Literal(true).annotate({ description: 'True for a folder run.' })),
  unfrozen: Schema.optionalKey(Schema.String.annotate({ description: 'Why its unfrozen workflow did not read.' })),
}).annotate({ identifier: 'RunRemoved' });
export type RunRemoved = typeof RunRemoved.Type;

/**
 * A finished run pruned, as `nemia prune <run> --yes` prunes it: its files with `artifacts`, a run nobody merged with `unmerged`; with
 * `preview`, judged and listed with what it would free, and nothing removed, as `nemia prune` lists it before it asks.
 */
export const RunPrune = Schema.Struct({
  unmerged: Schema.optionalKey(Schema.Boolean.annotate({ description: 'Prunes a run nobody merged (--unmerged).' })),
  artifacts: Schema.optionalKey(Schema.Boolean.annotate({ description: "Prunes its steps' files too (--artifacts)." })),
  preview: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: 'Judges and lists it with what it would free, removing nothing, as nemia prune does before it asks.',
    }),
  ),
}).annotate({ identifier: 'RunPrune' });
export type RunPrune = typeof RunPrune.Type;

/** A folder and the bytes it held. */
const Sized = Schema.Struct({
  path: Schema.String.annotate({ description: 'The folder, by its path.' }),
  bytes: Schema.Finite.annotate({ description: 'The bytes it held.' }),
});

/**
 * What a prune answers: the run, that it was pruned, `nemia prune`'s lines, the worktrees removed, its files where removed (null where
 * not), and what was left, each with why: git's word and its fix, a folder that did not read, or the files a worktree holds; and of a
 * preview, the bytes a prune would free (`bytes`).
 */
export const RunPruned = Schema.Struct({
  id: Schema.String.annotate({ description: "The run's id." }),
  pruned: Schema.Boolean.annotate({ description: 'Whether it was pruned.' }),
  lines: Strings.annotate({ description: "nemia prune's lines about it." }),
  worktrees: Schema.Array(Sized).annotate({ description: 'The worktrees removed, each with the bytes it held.' }),
  artifacts: Schema.NullOr(Sized).annotate({
    description: "Its steps' files directory where it was removed, with the bytes it held; null where it was not.",
  }),
  left: Schema.Array(
    Schema.Union([
      Schema.Struct({
        path: Schema.String.annotate({ description: 'The worktree, by its path.' }),
        git: Schema.String.annotate({ description: "Git's word on why it was left." }),
        fix: Schema.optionalKey(Schema.String.annotate({ description: 'What to type to fix it; absent where git gave none.' })),
      }),
      Schema.Struct({
        path: Schema.String.annotate({ description: 'The folder, by its path.' }),
        unread: Schema.String.annotate({ description: 'Why the folder did not read.' }),
      }),
      Schema.Struct({
        path: Schema.String.annotate({ description: 'The worktree, by its path.' }),
        files: Schema.String.annotate({ description: 'The files it holds that kept it.' }),
      }),
    ]),
  ).annotate({
    description: "What was left, each with why: git's word and its fix, a folder that did not read, or the files a worktree holds.",
  }),
  bytes: Schema.optionalKey(Schema.Finite.annotate({ description: 'The bytes a prune would free, of a preview.' })),
}).annotate({ identifier: 'RunPruned' });
export type RunPruned = typeof RunPruned.Type;
