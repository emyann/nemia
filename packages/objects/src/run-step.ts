/**
 * What a run's step is made of beside its codes (`run.ts`): the check and its verdict, the attempts and the release a session ran on,
 * what a try consumed and what sessions cost, the tries on the clock, what the engine filed a try with, the files a step holds, its gate
 * with the budgets it proposes, the words said to it and its cap. Cut from `run.ts`, whose `RunStepStatus` and `RunStatus` hold them.
 */
import { Schema } from 'effect';
import { Actor } from './token.ts';
import { ChatSpeaker } from './nemia.ts';
import {
  ARTIFACT_KINDS,
  ATTEMPT_ENDS,
  CHECK_RESULTS,
  ENGINE_OUTCOMES,
  GATE_BUDGETS_FROM,
  OUTPUT_STREAMS,
  PEAK_MARKS,
  RUNS_IN_BY,
  SAID_AFTER,
  SPAN_AT,
  WRITTEN_CONDITION_STATUSES,
} from './words.ts';

/** An array as the package's types hold one, mutable, so a page built off the object keeps their types. */
const List = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item));
const Strings = List(Schema.String);
const NullString = Schema.NullOr(Schema.String);
const NullNumber = Schema.NullOr(Schema.Finite);

/** A check's verdict as codes (`CheckVerdict`, check.ts). */
export const CheckVerdict = Schema.Struct({
  result: Schema.Literals(CHECK_RESULTS).annotate({
    description: 'How the check went: passed, failed, unfinished (no verdict on the work), running, or unknown.',
  }),
  exit: NullNumber.annotate({ description: "The check command's exit code; null where it has none." }),
});

/** One task on the clock (`TaskSpan`, timeline.ts). */
const TaskSpanSchema = Schema.Struct({
  taskId: Schema.String.annotate({ description: "The task's id." }),
  at: Schema.Literals(SPAN_AT).annotate({
    description:
      'Where the task stands: unknown to the engine, queued (filed, no attempt yet), starting (a slot taken, not spawned), running, ended, or unspawned (settled before it ever spawned).',
  }),
  filedAt: NullString.annotate({ description: 'When the task was filed, an ISO 8601 time; null where the engine has no filing of it.' }),
  spawnedAt: NullString.annotate({ description: 'When its first attempt was spawned; null before it was.' }),
  endedAt: NullString.annotate({ description: 'When its last attempt ended, once the task settled; null before.' }),
  attempts: Schema.Finite.annotate({ description: 'How many attempts the task made.' }),
  queuedMs: NullNumber.annotate({
    description: 'The milliseconds from its filing to its spawn, the slot wait included; null where it cannot be measured.',
  }),
  ranMs: NullNumber.annotate({ description: 'The milliseconds from its spawn to its end; null where it cannot be measured.' }),
  queued: Schema.String.annotate({ description: 'The time it queued, in words: a duration, or why there is none.' }),
  ran: Schema.String.annotate({ description: 'The time it ran, in words: a duration, or why there is none.' }),
});

const count = (description: string) => Schema.optionalKey(Schema.Finite.annotate({ description }));

/** What a session consumed (`Consumed`, status.ts): each count where it was measured. */
const Consumed = Schema.Struct({
  responses: count('How many responses the model gave; absent where not measured.'),
  toolCalls: count('How many tool calls the session made; absent where not measured.'),
  inputTokens: count('The input tokens the session read; absent where not measured.'),
  outputTokens: count('The output tokens the session wrote; absent where not measured.'),
  costUsd: count("What the session cost in dollars, the harness's own figure; absent where not measured."),
  apiMs: count('The milliseconds spent waiting on the model; absent where not measured.'),
  toolMs: count('The milliseconds spent running tools; absent where not measured.'),
  cacheReadTokens: count('The input tokens read from the cache; absent where not measured.'),
  cacheWriteTokens: count('The input tokens written to the cache; absent where not measured.'),
  uncachedTokens: count('The input tokens neither read from the cache nor written to it; absent where not measured.'),
  peakContextTokens: count('The largest context one response read, in tokens; absent where not measured.'),
  firstContextTokens: count(
    "The context an attempt's first response read, in tokens; absent where several attempts have no one first response.",
  ),
  firstCacheWriteTokens: count(
    "What of an attempt's first response's context was written to the cache, in tokens; absent where not measured.",
  ),
  compactions: count('How many times its sessions compacted their conversation; absent where none was seen.'),
  rebuiltCaches: count(
    "How many of its attempts were resumed and wrote their parent's conversation to the cache again; absent where none did.",
  ),
});

export const PeakMark = Schema.NullOr(Schema.Literals(PEAK_MARKS));

/** What a step's try consumed, in `nemia decide`'s words, its peak against its `context:` (`StepUsed`, usage.ts). */
export const StepUsed = Schema.Struct({
  usage: Schema.NullOr(Consumed).annotate({
    description:
      'Each count its sessions consumed where it was measured: responses, tool calls, tokens, cost and time; null where none was.',
  }),
  used: Schema.String.annotate({ description: "What was used, in nemia decide's words." }),
  cost: Schema.String.annotate({ description: "What it cost, in nemia decide's words." }),
  costUsd: NullNumber.annotate({ description: 'What it cost in dollars; null where it was not measured.' }),
  apiMs: NullNumber.annotate({ description: "The milliseconds spent waiting on the model's api; null where not measured." }),
  toolMs: NullNumber.annotate({ description: 'The milliseconds spent in tool calls; null where not measured.' }),
  read: NullString.annotate({ description: 'What its sessions read into their context, in words; null where not measured.' }),
  peak: PeakMark.annotate({
    description:
      "Where its largest context stands against the step's cap: cap or large; null where it stands below both or was not measured.",
  }),
  rebuilt: Schema.Finite.annotate({ description: 'How many times a context was rebuilt.' }),
}).annotate({
  identifier: 'StepUsed',
  description: "What a step's tries consumed, in nemia decide's words: tokens, cost, time, and its peak context.",
});
export type StepUsed = typeof StepUsed.Type;

/** What sessions cost together, each once (`Spent`, judged.verb.ts). */
export const Spent = Schema.Struct({
  usd: Schema.Finite.annotate({ description: 'The dollars the measured sessions cost, each counted once.' }),
  measured: Schema.Finite.annotate({ description: 'How many sessions were measured.' }),
  unmeasured: Schema.Finite.annotate({ description: 'How many sessions were not measured, so their cost is not in usd.' }),
  live: Schema.optionalKey(
    Schema.Struct({
      usd: Schema.Finite.annotate({
        description: 'What the sessions at work have spent so far, in dollars: not in usd, which is measured.',
      }),
      at: Schema.String.annotate({ description: 'When their harness last said so, an ISO 8601 time.' }),
    }).annotate({
      description: 'What the sessions still at work have spent so far, as their harness last said it; absent where none said a figure.',
    }),
  ),
  said: Schema.String.annotate({
    description: "The cost in the package's words: with a live figure, the measured and live together, so far.",
  }),
}).annotate({ identifier: 'Spent' });
export type Spent = typeof Spent.Type;

/** One try of a step on the clock (`TimelineTry`, timeline.ts), with what its session used in `nemia decide`'s words (null for none). */
export const TimelineTry = Schema.Struct({
  try: Schema.Finite.annotate({ description: "The try's number, from 1." }),
  round: Schema.Finite.annotate({ description: "The round of the step's loop it was filed in, from 1." }),
  session: Schema.NullOr(TaskSpanSchema).annotate({
    description: "Its session's task on the clock; null on a try a recheck reached, which ran no session of its own.",
  }),
  sessionOf: NullNumber.annotate({
    description: 'The number of the try whose session this try is, on a try that shares one; null on a try that owns its session.',
  }),
  check: Schema.NullOr(TaskSpanSchema).annotate({
    description: "Its check's task on the clock; null for a try whose check was never filed.",
  }),
  used: Schema.NullOr(StepUsed).annotate({ description: "What its session used, in nemia decide's words; null for none." }),
  turn: Schema.optionalKey(
    Schema.Struct({
      asked: Schema.Boolean.annotate({
        description:
          "Whether the turn before signed off blocked, so that this one is a person's answer to it; false for work sent back from a gate.",
      }),
      heldFrom: NullString.annotate({ description: "When the turn before it ended; null where the task's attempts do not say." }),
      spawnedAt: NullString.annotate({
        description: "When this turn's first attempt was spawned; null where the task's attempts do not say.",
      }),
      endedAt: NullString.annotate({ description: "When this turn's last attempt ended; null where the task's attempts do not say." }),
    }).annotate({
      description: "The turn of an earlier try's session this try ran, where it answered it; absent on a try that owns its session.",
    }),
  ),
});

/**
 * The time of several tasks together (`TimelineTotal`, timeline.ts): a round of a loop, or the whole run's, and what the sessions it counts
 * cost (null until a cost was measured or a session at work said what it has spent).
 */
export const TimelineTotal = Schema.Struct({
  loop: NullString.annotate({ description: "The looping step whose loop this is a round of; null for the run's total." }),
  round: NullNumber.annotate({ description: "The round of that loop; null for the run's total." }),
  tasks: Schema.Finite.annotate({ description: 'How many sessions and checks it counts.' }),
  inFlight: Schema.Finite.annotate({ description: 'How many of them have not ended.' }),
  queuedMs: Schema.Finite.annotate({ description: 'The milliseconds its tasks queued, summed over those whose queue time is known.' }),
  ranMs: Schema.Finite.annotate({
    description: 'The milliseconds its tasks ran, summed over those that ended; more than the wall time for a fan-out.',
  }),
  wallMs: NullNumber.annotate({
    description: 'The milliseconds from the first filing to the last end; null while a task is in flight or a filing is not known.',
  }),
  queued: Schema.String.annotate({ description: 'The queue time in words, saying what it leaves out.' }),
  ran: Schema.String.annotate({ description: 'The run time in words, saying what it leaves out.' }),
  wall: Schema.String.annotate({ description: 'The wall time in words, saying what it leaves out.' }),
  cost: Schema.NullOr(Spent).annotate({
    description: 'What the sessions it counts cost; null until a cost was measured or a session at work said what it has spent.',
  }),
});

/**
 * A stream as a person reads it — a check's, a step's session output: its last lines, and whether there were more (`StepLog`,
 * checks.verb.ts).
 */
export const StepLog = Schema.Struct({
  lines: Strings.annotate({ description: 'Its last lines.' }),
  truncated: Schema.Boolean.annotate({ description: 'Whether there were more lines than these.' }),
});
export type StepLog = typeof StepLog.Type;

/**
 * The condition a check of a step waits on, as it stands for the try the step is on: its name, the try, what was written for that try
 * (`status`, null while nothing was), the writer's words and when.
 */
export const StepCondition = Schema.Struct({
  name: Schema.String.annotate({ description: "The condition's name, as the check's condition: says it." }),
  try: Schema.Finite.annotate({ description: 'The try of the step the condition speaks of, from 1: the one the step is on.' }),
  status: Schema.NullOr(Schema.Literals(WRITTEN_CONDITION_STATUSES)).annotate({
    description: 'What was written for this try: True, False or Unknown; null while nothing was.',
  }),
  message: NullString.annotate({ description: "The writer's words with it; null while nothing was written." }),
  writtenAt: NullString.annotate({ description: 'When it was last written; null while nothing was.' }),
  lastTransitionTime: NullString.annotate({ description: 'When its status last changed; null while nothing was written.' }),
}).annotate({
  identifier: 'StepCondition',
  description:
    'The condition a check waits on, as it stands for the try the step is on; present on a check that waits on a condition, absent on one that runs a command.',
});
export type StepCondition = typeof StepCondition.Type;

/** A step's check: its command, its task, its verdict and, refused, what it said (`StepCheck`, checks.verb.ts). */
export const StepCheck = Schema.Struct({
  name: Schema.String.annotate({
    description: "The check's name: check for a step's check: line, else its name in the step's checks: list.",
  }),
  command: Schema.String.annotate({
    description:
      "The check's command, as the step's check: line or its checks: entry's run: says it; `condition: <name>` for one that waits on a condition.",
  }),
  started: NullString.annotate({ description: 'When its latest attempt started; null while it has not.' }),
  ended: NullString.annotate({ description: 'When its latest attempt ended; null while it has not.' }),
  taskId: NullString.annotate({ description: "The check's task; null while none was filed." }),
  verdict: Schema.NullOr(CheckVerdict).annotate({ description: 'Its verdict, a result and the exit; null while it has none.' }),
  refused: Schema.NullOr(
    Schema.Struct({
      exit: Schema.String.annotate({ description: 'How the refused check exited, in words.' }),
      stdout: Schema.NullOr(StepLog).annotate({ description: 'The last lines of its output; null where they could not be read.' }),
      stderr: StepLog.annotate({ description: 'The last lines of its errors.' }),
      unreadable: NullString.annotate({ description: 'Why its output could not be read; null where it was.' }),
    }),
  ).annotate({
    description:
      'What a refused check said: its exit, the last lines of its output and its errors, and why they could not be read; null where it did not refuse.',
  }),
  condition: Schema.optionalKey(StepCondition),
}).annotate({ identifier: 'StepCheck' });
export type StepCheck = typeof StepCheck.Type;

/**
 * A page of what one try's check printed on one stream (`CheckOutput`, agent-orchestrator's check-output.verb.ts): its lines numbered from
 * 1 in the stream, the stream's count of them, those `match` found where it was asked, the line to read on from where any is left, and
 * the line to read back from where any is held before the page. A check still running answers what it printed so far, under the same
 * numbers a later read gives.
 */
export const CheckOutput = Schema.Struct({
  try: Schema.Finite.annotate({ description: 'The try whose check printed it, counted from 1.' }),
  taskId: NullString.annotate({ description: "The check's task; null while none was filed, when no line is answered." }),
  stream: Schema.Literals(OUTPUT_STREAMS).annotate({ description: 'The stream read: stdout, or stderr.' }),
  running: Schema.Boolean.annotate({ description: 'Whether the check still runs, so that its stream may still grow.' }),
  partial: Schema.Boolean.annotate({
    description:
      'Whether the runtime kept no whole stdout for the check, so that the lines are the end of its log, both streams together, and not the whole stream.',
  }),
  lines: List(
    Schema.Struct({
      n: Schema.Finite.annotate({ description: "The line's number in the stream, from 1, kept under a match." }),
      text: Schema.String.annotate({ description: 'The line as it was printed, with no line end.' }),
    }),
  ).annotate({ description: 'The lines of the page, in the order they were printed.' }),
  total: Schema.Finite.annotate({ description: 'How many lines the stream holds.' }),
  matched: Schema.optionalKey(
    Schema.Finite.annotate({ description: 'How many lines match found, where match was asked; absent where it was not.' }),
  ),
  next: Schema.optionalKey(
    Schema.Finite.annotate({
      description: 'The line number to read on from, as from, where lines are left after this page; absent where none is.',
    }),
  ),
  before: Schema.optionalKey(
    Schema.Finite.annotate({
      description:
        'The line number to read the lines before this page before, as before, where lines are held before it; absent where none is.',
    }),
  ),
}).annotate({ identifier: 'CheckOutput' });
export type CheckOutput = typeof CheckOutput.Type;

/** The release a session ran on (`SessionRelease`, release.ts): an install's tag, or a checkout's folder. */
export const SessionReleaseSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('install').annotate({ description: 'An install of the package.' }),
    tag: Schema.String.annotate({ description: 'The release tag the install is of.' }),
  }),
  Schema.Struct({
    kind: Schema.Literal('checkout').annotate({ description: "A checkout of the package's repository." }),
    root: Schema.String.annotate({ description: 'The folder of the checkout.' }),
  }),
]).annotate({
  identifier: 'SessionRelease',
  description: 'The release a session ran on: an install by its tag, or a checkout by its folder.',
});

/** How many attempts a try's task made, and how the latest went (`StepAttempts`, tries.verb.ts). */
export const StepAttempts = Schema.Struct({
  count: Schema.Finite.annotate({ description: "How many attempts the try's task made." }),
  latest: Schema.NullOr(
    Schema.Struct({
      startedAt: Schema.String.annotate({ description: 'When the attempt started, an ISO 8601 time.' }),
      ended: Schema.NullOr(Schema.Literals(ENGINE_OUTCOMES)).annotate({
        description: 'How it ended: succeeded, failed or stopped; null while it runs.',
      }),
      endedAt: NullString.annotate({ description: 'When it ended; null while it runs.' }),
      reason: Schema.NullOr(Schema.Literals(ATTEMPT_ENDS)).annotate({
        description: 'Why it ended, as a code, where the runtime says; null otherwise.',
      }),
      release: Schema.NullOr(SessionReleaseSchema).annotate({ description: 'The release it ran on; null where the runtime did not say.' }),
      harness: Schema.NullOr(
        Schema.Struct({
          name: Schema.String.annotate({ description: 'The name of the harness it ran on.' }),
          version: Schema.String.annotate({ description: 'The version of the harness.' }),
        }),
      ).annotate({ description: 'The harness it ran on; null where it did not say.' }),
      model: NullString.annotate({ description: 'The model its session ran on, as the harness reported it; null where it did not say.' }),
    }),
  ).annotate({
    description:
      'How the latest attempt went: when it started and ended, how and why it ended, the release, the harness and the model it ran on; null before the first.',
  }),
}).annotate({ identifier: 'StepAttempts', description: "How many attempts a try's task made, and how the latest went." });
export type StepAttempts = typeof StepAttempts.Type;

/** What the engine filed a step's current try with (`StepFiled`, told.verb.ts), the fence it was filed with said in this layer's word. */
export const StepFiled = Schema.Struct({
  model: NullString.annotate({ description: "The model the try was filed with; null where it was filed without, the harness's own." }),
  askedModel: NullString.annotate({ description: 'The model a person asked this try for (nemia retry --model); null when nobody asked.' }),
  effort: NullString.annotate({
    description: "How hard the harness was asked to think; null where it was filed without, the harness's own.",
  }),
  contextTokens: NullNumber.annotate({
    description: "The context window the try was filed with, in tokens; null for the model's whole window.",
  }),
  fence: NullString.annotate({ description: "The fence the try was filed with, in this layer's word; null where filed without one." }),
  runsIn: Schema.NullOr(
    Schema.Struct({
      mode: Schema.String.annotate({ description: 'The permission mode the session runs in.' }),
      by: Schema.Literals(RUNS_IN_BY).annotate({
        description:
          "Where that mode came from: filed (the mode filed), default (its harness's, where none was filed) or harness (another than the one filed).",
      }),
    }),
  ).annotate({ description: 'The permission mode the session runs in, as the runtime measured it; null where it measured none.' }),
  remote: Schema.NullOr(
    Schema.Struct({
      name: Schema.String.annotate({ description: 'The name of the remote A2A agent.' }),
      address: NullString.annotate({
        description:
          "The agent's origin and path as the store's a2a-agents.json gives it now; null where the file does not declare it or cannot be read.",
      }),
    }),
  ).annotate({ description: 'The remote A2A agent the try was sent to, for a step on an a2a harness; null for a local harness.' }),
  bridge: Schema.NullOr(
    Schema.Struct({
      url: NullString.annotate({ description: "The session's web link where the bridge is up; null where it is not." }),
      why: NullString.annotate({ description: 'Why the bridge is not up; null where it is.' }),
    }),
  ).annotate({ description: "The web link of a bridged step's session, or why it is not up; null for a step not bridged." }),
  tools: Schema.NullOr(Strings).annotate({
    description: "The only tools its session may have, in the harness's names; null where it was filed without, the harness's own set.",
  }),
  deadlineSeconds: NullNumber.annotate({
    description: 'How many seconds its session may run before it is stopped; null where filed without, which is no limit.',
  }),
  memory: Schema.NullOr(
    Schema.Struct({
      request: NullString.annotate({
        description: "The memory its session asked of the machine, a container's request such as 1Gi; null where it ran under none.",
      }),
      limit: NullString.annotate({
        description: "The most memory its session could use, a container's limit such as 6Gi; null where it ran under none.",
      }),
      askedBytes: NullNumber.annotate({
        description: 'What admission counted its session at, in bytes: its request, else its limit; null where it ran under neither.',
      }),
      peakBytes: NullNumber.annotate({
        description:
          'The most memory its session peaked at, in bytes, over its attempts; null where none was measured, as a peak is kept only under a memory limit.',
      }),
      peakLimitBytes: NullNumber.annotate({
        description: 'The limit in bytes of the attempt that peaked there; null where no peak was measured.',
      }),
    }),
  ).annotate({
    description:
      "What its session asked of the machine's memory, its limit and the peak it reached; null where it ran under no request or limit and no peak was measured.",
  }),
});

/** A file's path from the step's folder that holds it, never the server's: what a client keys, matches and addresses a file by. */
const relativePath = Schema.optionalKey(
  Schema.String.annotate({
    description:
      "The path the file has, or would have, under its step's folder (its artifacts folder, or a folder run's own folder); absent only for a file outside the step's folders.",
  }),
);

/** A file a closeout named, or a step's folder holds (`StepArtifact`, files.store.ts): served, pruned, or only its path. */
export const StepArtifact = Schema.Union([
  Schema.Struct({
    path: Schema.String.annotate({ description: 'The path of the file.' }),
    relativePath,
    name: Schema.String.annotate({
      description:
        "The file's path under its step's folder, its parts split at `/`: its name for a file at the folder's top, `e2e/bar.png` for one in a folder beneath it.",
    }),
    url: Schema.String.annotate({
      description: "Where the api serves the file: its step's file route, its path under the folder encoded whole as the last segment.",
    }),
    kind: Schema.Literals(ARTIFACT_KINDS).annotate({
      description: 'What the board does with it: shows it as an image, as text, or links it.',
    }),
    size: Schema.Finite.annotate({ description: "The file's size in bytes." }),
  }),
  Schema.Struct({
    path: Schema.String.annotate({ description: 'The path of the file.' }),
    relativePath,
    pruned: Schema.String.annotate({ description: 'What a prune of the run said of it, in words.' }),
    prunedAt: Schema.String.annotate({ description: 'When it was pruned, an ISO 8601 time.' }),
  }),
  Schema.Struct({
    path: Schema.String.annotate({ description: 'The path of the file, where nothing more is known of it.' }),
    relativePath,
  }),
]);

/**
 * The budgets a gated step proposes for the steps after it, or the caps its approval set (`GateBudgets`, tries.verb.ts): per step, the
 * amount and its words, why the step proposed it (null where it did not say, or the person gave it), the step's own `budget:` (null
 * where it has none) and whether the amount is above it; then the run's line in a person's words, what it has spent and the most it may
 * cost under these caps; and, where that most passes the cost line the run froze from its factory, the line and its sentence.
 */
const GateBudgets = Schema.Struct({
  from: Schema.Literals(GATE_BUDGETS_FROM).annotate({
    description: 'Whether the budgets are those the step proposed or those the approval set.',
  }),
  steps: List(
    Schema.Struct({
      step: Schema.String.annotate({ description: 'The step the budget is for, by name.' }),
      usd: Schema.Finite.annotate({ description: 'Its budget in dollars.' }),
      said: Schema.String.annotate({ description: 'That amount, in words.' }),
      why: NullString.annotate({ description: 'Why the step proposed it; null where it did not say, or the person gave it.' }),
      workflow: Schema.NullOr(Schema.Finite).annotate({
        description: "The step's own budget: in its workflow, in dollars; null where it has none.",
      }),
      above: Schema.Boolean.annotate({ description: "Whether the amount is above the step's own budget." }),
    }),
  ).annotate({ description: 'The budget of each step after the gate.' }),
  said: Schema.String.annotate({
    description: "The run's line in a person's words: what it has spent and the most it may cost under these caps.",
  }),
  line: Schema.optionalKey(
    Schema.Struct({
      usd: Schema.Finite.annotate({ description: 'The cost line the run froze from its factory, in dollars.' }),
      said: Schema.String.annotate({ description: 'The sentence that says the most it may cost passes that line.' }),
    }).annotate({ description: 'The cost line the run froze from its factory, where the most it may cost passes it; absent otherwise.' }),
  ),
});

/**
 * A step's gate, awaiting approval or approved (`StepGate`, tries.verb.ts) — and a looping step's, once a person approved its try out of
 * rounds as it stands (`nemia approve` of a loop), its approval that acceptance.
 */
export const StepGate = Schema.Struct({
  awaiting: Schema.Boolean.annotate({ description: 'Whether the gate waits for an approval now.' }),
  approval: Schema.NullOr(
    Schema.Struct({
      try: Schema.Finite.annotate({ description: 'The number of the try that was approved.' }),
      at: Schema.String.annotate({ description: 'When it was approved, an ISO 8601 time.' }),
      message: NullString.annotate({ description: 'What the person said with the approval; null where nothing.' }),
      actor: Schema.optionalKey(Actor),
    }),
  ).annotate({ description: 'The approval a person gave; null while the gate waits.' }),
  budgets: Schema.optionalKey(
    GateBudgets.annotate({
      description: 'The budgets the gated step proposes for the steps after it, or the caps its approval set; absent where it names none.',
    }),
  ),
});

/**
 * Words said to a session while it ran (`Said`, say.ts), as the engine journalled them (`text`); where an agent wrote them, which
 * (`from`) and its words without the frame they were said in (`words`). None is the person's.
 */
export const Said = Schema.Struct({
  at: Schema.String.annotate({ description: 'When the words were said, an ISO 8601 time.' }),
  attempt: Schema.Finite.annotate({ description: 'The attempt of the session they were said to.' }),
  text: Schema.String.annotate({ description: 'The words, as the engine journalled them.' }),
  after: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        kind: Schema.Literals(SAID_AFTER).annotate({ description: 'The kind of that last event.' }),
        id: Schema.String.annotate({ description: 'The id of that event.' }),
      }),
    ).annotate({ description: 'What the session said last before the words went to it: its kind and id; null where none is known.' }),
  ),
  from: Schema.optionalKey(ChatSpeaker.annotate({ description: 'Which agent wrote the words, where an agent did.' })),
  words: Schema.optionalKey(
    Schema.String.annotate({ description: 'The words without the frame they were said in, where an agent wrote them.' }),
  ),
});

/** A step's cap, and what its tries have cost of it. */
export const StepBudget = Schema.Struct({
  usd: Schema.Finite.annotate({ description: "The step's cap in dollars." }),
  said: Schema.String.annotate({ description: 'The cap, in words.' }),
  of: NullString.annotate({ description: 'What its tries have cost of the cap, in words; null where none was measured.' }),
  over: Schema.Boolean.annotate({ description: 'Whether its tries have cost more than the cap.' }),
});
