/**
 * What Nemia's routes take and answer (`NemiaGroup`, nemia-api.ts): where she is (`NemiaLevel`) and the write of her level and each
 * factory's (`NemiaLevelSet`); the facts she keeps (`NemiaMemory`); an agent's rules for auto (`PolicyList`), a rule confirmed as the
 * person read it (`PolicyRuleConfirm`), the agent's proposal (`PolicyProposal`) and what its rules reach (`PolicyReach`); her chat — a
 * page of it (`ChatHistory`), each event (`ChatEvent`), what is sent, answered, read and stopped, the stream's frames
 * (`ChatStreamEvent`); and her custom instructions (`NemiaInstructions`).
 *
 * The orchestrator's verbs answer these shapes, its types assignable to each: a key the verb answers and the Schema does not say would be
 * dropped from the wire, so each says every key.
 */
import { Schema } from 'effect';
import { describedNumber } from './meta.ts';
import {
  CALL_STATES,
  CHANGE_VERBS,
  CHAT_FROM,
  ENGINE_PHASES,
  LEVELS,
  NEVER_HOLDS,
  POLICY_REACHES,
  RULE_ANSWERS,
  RULE_ORIGINS,
} from './words.ts';

/** A level by its word. */
const LevelWord = Schema.Literals(LEVELS);

/** A raise of a factory's level in force: the level it is raised to, and when it ends. */
export const LevelRaise = Schema.Struct({
  level: LevelWord.annotate({ description: 'The level the factory is raised to.' }),
  until: Schema.String.annotate({ description: 'When the raise ends, as an ISO 8601 time.' }),
});

/**
 * A factory's level as Nemia reads it: the level now, its own default (`default`, the store's where it has none of its own), its own
 * (`own`, null where it follows the store's), and the raise in force (`raise`, null for none).
 */
export const FactoryLevel = Schema.Struct({
  factory: Schema.String.annotate({ description: "The factory's name." }),
  level: LevelWord.annotate({ description: 'The level in force for the factory now.' }),
  default: LevelWord.annotate({ description: "The factory's own default level, or the store's where it has none of its own." }),
  own: Schema.NullOr(LevelWord).annotate({ description: "The factory's own default level; null where it follows the store's." }),
  raise: Schema.NullOr(LevelRaise).annotate({ description: 'The raise of its level in force, with when it ends; null for none.' }),
});

/**
 * Where Nemia is, as `nemia level --json` prints it: the store's level and since when, her task, its phase and its session where one is
 * filed, how a person reaches her session (`reach`), its web link (`bridge`, null where not bridged), whether it ended with no rest
 * (`stopped`), whether no task of hers is open and a message starts one (`rests`), what her ended sessions cost (`spend`), what a person
 * allowed her at a prompt (`allows`), each factory's level, the default factory first, and why the keeper could not trust her folder
 * (`untrusted`, null where it is trusted or the write was not refused).
 */
export const NemiaLevel = Schema.Struct({
  level: LevelWord.annotate({ description: "The store's level (`nemia level <level>`): manual, semi-auto or auto." }),
  since: Schema.NullOr(Schema.String).annotate({ description: 'When the store took its level; null where its level was never set.' }),
  task: Schema.NullOr(Schema.String).annotate({ description: "Her task's id; null where none was ever filed." }),
  phase: Schema.NullOr(Schema.Literals(ENGINE_PHASES)).annotate({
    description: 'The phase of her task as the engine says it; null where it is not filed.',
  }),
  sessionId: Schema.NullOr(Schema.String).annotate({ description: "Her session's id; null where her task is not filed." }),
  reach: Schema.Array(Schema.String).annotate({
    description:
      'How a person reaches her open session: the command that attaches to it here, then its web link, or why that link is not up. Empty where no session is open.',
  }),
  bridge: Schema.NullOr(
    Schema.Struct({
      url: Schema.NullOr(Schema.String).annotate({ description: 'The web link of her open session; null where it is not up.' }),
      why: Schema.NullOr(Schema.String).annotate({ description: 'Why the link is not up; null where it is.' }),
    }),
  ).annotate({
    description: "Her open session's web link where one was asked, or why it is not up; null where none was asked.",
  }),
  stopped: Schema.Boolean.annotate({
    description:
      "Whether her task ended with no rest of the keeper's (stopped from outside, or refused at its start): filed again on the person's next message or level set.",
  }),
  rests: Schema.Boolean.annotate({
    description:
      "Whether no task of hers is open, so a message in her chat starts one; false while the keeper's trust of her folder is refused.",
  }),
  spend: Schema.NullOr(
    Schema.Struct({
      usd: describedNumber('What her sessions cost, in US dollars.'),
      measured: describedNumber('How many of her ended sessions had their cost measured.'),
      unmeasured: describedNumber('How many of her ended sessions had no cost measured.'),
    }),
  ).annotate({
    description:
      'What her sessions cost, counted as each ends: dollars, and how many sessions were measured and not; null where her task is not filed.',
  }),
  allows: Schema.Array(Schema.String).annotate({ description: 'The allow rules a person gave her at a prompt.' }),
  factories: Schema.Array(FactoryLevel).annotate({ description: "Each factory's level, the default factory first." }),
  untrusted: Schema.NullOr(Schema.String).annotate({
    description:
      "Why the keeper could not give her harness's trust to her folder, naming the fix, while her session is not filed for it; null where her folder is trusted, or the keeper's write was not refused: the keeper trusts her folder itself.",
  }),
});

/**
 * A write of a level, as `nemia level` takes it: the store's `level`; or with `factory` that factory's default, raised for a stretch
 * (`for`, like `2h`) or its raise ended (`end`). Nothing given reads where she is.
 */
export const NemiaLevelSet = Schema.Struct({
  level: Schema.optionalKey(
    LevelWord.annotate({ description: "The level to set: the store's, or with `factory` that factory's default." }),
  ),
  factory: Schema.optionalKey(Schema.String.annotate({ description: 'The factory whose level is raised or whose raise is ended.' })),
  for: Schema.optionalKey(Schema.String.annotate({ description: 'How long the raise lasts, as a duration like `2h`.' })),
  end: Schema.optionalKey(Schema.Boolean.annotate({ description: "Whether to end the factory's raise." })),
});

/** The facts Nemia keeps: the folder they are in, their names, and the words of the one asked (`fact`, null where none was). */
export const NemiaMemory = Schema.Struct({
  dir: Schema.String.annotate({ description: 'The folder her facts are kept in.' }),
  facts: Schema.Array(Schema.String).annotate({ description: 'The name of each fact she keeps.' }),
  fact: Schema.NullOr(
    Schema.Struct({
      name: Schema.String.annotate({ description: 'The name of the fact.' }),
      text: Schema.String.annotate({ description: 'The words of the fact.' }),
    }),
  ).annotate({
    description: 'The fact asked (`nemia memory <fact>`), by name with its words; null where none was asked.',
  }),
});

/**
 * A rule at a gate with its words, as the person reads it: its id, the answer it gives unasked, the steps it covers (every step where
 * absent), the conditions it needs (each a word of the orchestrator's `CONDITIONS`, a fact admission reads of a run), a dollar line the
 * run's spend stays under (none where absent), and where it came from.
 */
const gateRuleBareFields = {
  id: Schema.String.annotate({ description: "The rule's id." }),
  answer: Schema.Literals(RULE_ANSWERS).annotate({ description: 'The answer the rule gives at a gate unasked.' }),
  steps: Schema.optional(Schema.Array(Schema.String)).annotate({ description: 'The steps the rule covers; every step where absent.' }),
  when: Schema.Array(Schema.String).annotate({
    description: "The conditions the rule needs, each a word of the orchestrator's `CONDITIONS`, a fact admission reads of a run.",
  }),
  under: Schema.optional(Schema.Number).annotate({ description: "A dollar line the run's spend must stay under; none where absent." }),
  from: Schema.optional(Schema.Literals(RULE_ORIGINS)).annotate({ description: 'Where the rule came from.' }),
};

/** A rule at a gate with its words. */
const gateRuleFields = {
  ...gateRuleBareFields,
  words: Schema.String.annotate({ description: 'The rule in words, as the person reads it.' }),
};

/** A rule at a gate with its words. */
export const PolicyRule = Schema.Struct(gateRuleFields);

/**
 * A rule under which the agent approves a proposal of one factory unasked, with its words: what it covers, as a delegation's grant does,
 * whether it takes a proposal that widens access, and the agents whose proposals it takes (every agent where empty).
 */
const proposalRuleBareFields = {
  id: Schema.String.annotate({ description: "The rule's id." }),
  answer: Schema.Literal('approve-proposal').annotate({ description: 'The answer the rule gives: approve a proposal unasked.' }),
  factory: Schema.String.annotate({ description: 'The factory whose proposals the rule approves.' }),
  resources: Schema.Array(Schema.String).annotate({
    description: 'The kinds of resource the rule covers, as a delegation grant names them.',
  }),
  resourceNames: Schema.Array(Schema.String).annotate({
    description: 'The names of the resources the rule covers, as a delegation grant names them.',
  }),
  verbs: Schema.Array(Schema.Literals(CHANGE_VERBS)).annotate({ description: 'The verbs of a proposal the rule covers.' }),
  widens: Schema.Boolean.annotate({ description: 'Whether the rule takes a proposal that widens access.' }),
  proposedBy: Schema.Array(Schema.String).annotate({ description: 'The agents whose proposals the rule takes; every agent where empty.' }),
  from: Schema.optional(Schema.Literal('proposed')).annotate({ description: 'Where the rule came from: the agent proposed it.' }),
};

/** A rule for approving proposals with its words. */
const proposalRuleFields = {
  ...proposalRuleBareFields,
  words: Schema.String.annotate({ description: 'The rule in words, as the person reads it.' }),
};

/** A rule for approving proposals, with its words. */
export const ProposalPolicyRule = Schema.Struct(proposalRuleFields);

/**
 * An agent's rules for auto: the agent, the file of the person's list, whether the builtin rule is in force for want of one, the rules
 * in force (a gate's, and the proposals' apart), what the agent proposed (each rule saying whether it is in force, the words it keeps as
 * guidance, and whether its custom instruction changed since, `stale`; null for nothing proposed), the custom instruction (null for
 * none), and the builtin rule, to be confirmed again.
 */
export const PolicyList = Schema.Struct({
  agent: Schema.String.annotate({ description: 'The agent whose rules these are.' }),
  file: Schema.String.annotate({ description: "The file of the person's list of its rules." }),
  isDefault: Schema.Boolean.annotate({ description: 'Whether the builtin rule is in force, for want of a list the person confirmed.' }),
  rules: Schema.Array(PolicyRule).annotate({ description: 'The rules in force at a gate, each with its words.' }),
  proposalRules: Schema.Array(ProposalPolicyRule).annotate({
    description: 'The rules in force for approving proposals, each with its words.',
  }),
  proposed: Schema.NullOr(
    Schema.Struct({
      file: Schema.String.annotate({ description: 'The file the proposal is kept in.' }),
      at: Schema.String.annotate({ description: 'When the agent proposed it, as an ISO 8601 time.' }),
      rules: Schema.Array(
        Schema.Struct({
          ...gateRuleFields,
          confirmed: Schema.Boolean.annotate({ description: 'Whether the person confirmed the rule, so it is in force.' }),
        }),
      ).annotate({ description: 'The rules at a gate it proposes, each with whether it is in force.' }),
      proposalRules: Schema.Array(
        Schema.Struct({
          ...proposalRuleFields,
          confirmed: Schema.Boolean.annotate({ description: 'Whether the person confirmed the rule, so it is in force.' }),
        }),
      ).annotate({ description: 'The rules for approving proposals it proposes, each with whether it is in force.' }),
      guidance: Schema.Array(Schema.String).annotate({ description: 'The words the machinery cannot hold, kept as guidance.' }),
      stale: Schema.Boolean.annotate({ description: 'Whether its custom instruction changed since it was proposed.' }),
    }),
  ).annotate({
    description:
      'What the agent proposed (nemia policy propose): its file and when, each rule with whether it is in force, the words kept as guidance, and whether its custom instruction changed since; null where it proposed nothing.',
  }),
  instruction: Schema.NullOr(Schema.String).annotate({
    description: "The agent's custom instruction its proposal is read from; null where it has none.",
  }),
  builtin: PolicyRule.annotate({ description: 'The builtin rule, in force where no list was confirmed, to be confirmed again.' }),
});

/** A confirm of a rule: its words as the person read them, so what is confirmed is what they read. */
export const PolicyRuleConfirm = Schema.Struct({
  words: Schema.String.annotate({ description: 'The rule as the person read it, so what is confirmed is what they read.' }),
});

/**
 * An agent's proposal, as `nemia policy propose` reads it from `--file`: `words`, its JSON text, `{ "rules": [...], "guidance": [...] }`,
 * the rules it proposes from its custom instruction and the words the machinery cannot hold, kept as guidance.
 */
export const PolicyProposal = Schema.Struct({
  words: Schema.String.annotate({
    description:
      'The proposal as JSON text, `{ "rules": [...], "guidance": [...] }`: the rules it proposes and the words kept as guidance.',
  }),
});

/** Whose steps at their gate `GET /api/policy/:name/reach` reads: one factory's (`factory`) or one run's (`run`), exactly one of them. */
export const PolicyReachQuery = {
  factory: Schema.optionalKey(
    Schema.String.annotate({ description: 'The factory whose steps at their gate are read; exactly one of `factory` and `run`.' }),
  ),
  run: Schema.optionalKey(
    Schema.String.annotate({ description: 'The run whose steps at their gate are read; exactly one of `factory` and `run`.' }),
  ),
};

/** A step at its gate, as reach reads it: its workflow, its name, whether it is approved before it runs, and whether it has a check. */
const gateSiteFields = {
  workflow: Schema.String.annotate({ description: 'The workflow the step is in.' }),
  step: Schema.String.annotate({ description: "The step's name." }),
  approvedFirst: Schema.Boolean.annotate({ description: 'Whether the step is approved before it runs.' }),
  hasCheck: Schema.Boolean.annotate({ description: 'Whether the step has a check.' }),
};

const missRule = Schema.String.annotate({ description: 'The id of the rule in force that can never approve at the gate.' });
const whyDescription =
  'Why the rule can never approve: it only tries a step again, it covers other steps, or a condition it needs never holds there.';
const missWords = Schema.String.annotate({ description: 'The reason in words, as the person reads it.' });

/**
 * Why a rule in force can never approve at a gate, its first reason, with its words: it only tries a step again (`answers-retry`), it
 * covers other steps (`other-steps`), or it needs a condition (`condition`, a word of the orchestrator's `CONDITIONS`, as a rule's `when`)
 * that never holds there (`never-holds`), and why (`because`).
 */
export const RuleMiss = Schema.Union([
  Schema.Struct({ rule: missRule, why: Schema.Literal('answers-retry').annotate({ description: whyDescription }), words: missWords }),
  Schema.Struct({ rule: missRule, why: Schema.Literal('other-steps').annotate({ description: whyDescription }), words: missWords }),
  Schema.Struct({
    rule: missRule,
    why: Schema.Literal('never-holds').annotate({ description: whyDescription }),
    condition: Schema.String.annotate({
      description: "The condition the rule needs that never holds there, a word of the orchestrator's `CONDITIONS`.",
    }),
    because: Schema.Literals(NEVER_HOLDS).annotate({ description: 'Why the condition never holds at the gate.' }),
    words: missWords,
  }),
]);

/**
 * A step at its gate and what reaches it: the rules in force that could approve it (`reachedBy`), the proposed rules not in force that
 * could (`proposedBy`), each rule in force that cannot with its first reason (`misses`), and, of a run, each rule that reaches it with
 * what keeps it from approving now — the conditions that do not hold and whether the run is over its dollar line (`now`).
 */
export const GateReach = Schema.Struct({
  ...gateSiteFields,
  reachedBy: Schema.Array(Schema.String).annotate({ description: 'The ids of the rules in force that could approve the step.' }),
  proposedBy: Schema.Array(Schema.String).annotate({
    description: 'The ids of the proposed rules, not in force, that could approve the step.',
  }),
  misses: Schema.Array(RuleMiss).annotate({ description: 'Each rule in force that cannot approve the step, with its first reason.' }),
  now: Schema.optional(
    Schema.Array(
      Schema.Struct({
        rule: Schema.String.annotate({ description: 'The id of a rule that reaches the step.' }),
        unmet: Schema.Struct({
          conditions: Schema.Array(Schema.String).annotate({ description: 'The conditions the rule needs that do not hold now.' }),
          overLine: Schema.Boolean.annotate({ description: "Whether the run's spend is over the rule's dollar line." }),
        }).annotate({ description: 'What keeps the rule from approving now.' }),
        words: Schema.String.annotate({ description: 'What keeps the rule from approving now, in words.' }),
      }),
    ),
  ).annotate({ description: 'Of a run only: each rule that reaches the step, with what keeps it from approving now.' }),
});

/**
 * What an agent's rules reach, as `nemia policy reach --json` prints it: the agent; the factory read, and the run where one was named
 * (null where none); the factory's level now; how many of the steps at their gate the rules in force reach (`reach`); a row for each such
 * step (`gates`); the rules suggested for the steps no rule reaches, each with its words; the whole proposal to propose them by
 * (`proposal`, what the agent proposed already with the suggestions added, for `PUT /api/policy/:name/proposal`); and each workflow
 * attached to the factory that does not load, with why.
 */
export const PolicyReach = Schema.Struct({
  agent: Schema.String.annotate({ description: 'The agent whose rules were read.' }),
  factory: Schema.String.annotate({ description: 'The factory whose steps at their gate were read.' }),
  run: Schema.NullOr(Schema.String).annotate({ description: 'The run read, where one was named (?run=); null where a factory was.' }),
  level: LevelWord.annotate({ description: "The factory's level now." }),
  reach: Schema.Literals(POLICY_REACHES).annotate({
    description: 'How many of the steps at their gate the rules in force reach: all, some or none.',
  }),
  gates: Schema.Array(GateReach).annotate({
    description: 'Each step at its gate, with the rules that reach it, the proposed ones that would, and why each other rule cannot.',
  }),
  suggested: Schema.Array(Schema.Union([PolicyRule, ProposalPolicyRule])).annotate({
    description: 'The rules suggested for the steps no rule reaches, each with its words.',
  }),
  proposal: Schema.Struct({
    rules: Schema.Array(Schema.Union([Schema.Struct(gateRuleBareFields), Schema.Struct(proposalRuleBareFields)])).annotate({
      description: 'The rules the proposal holds: what the agent proposed already, with the suggestions added.',
    }),
    guidance: Schema.Array(Schema.String).annotate({ description: 'The words kept as guidance, which no rule holds.' }),
  }).annotate({
    description:
      'The whole proposal to propose them by: what the agent proposed already with the suggestions added, for `PUT /api/policy/<name>/proposal`.',
  }),
  unloaded: Schema.Array(
    Schema.Struct({
      workflow: Schema.String.annotate({ description: 'The workflow that does not load.' }),
      message: Schema.String.annotate({ description: 'Why it does not load, and what to do.' }),
    }),
  ).annotate({
    description: 'Each workflow attached to the factory that does not load, with why.',
  }),
});
export type PolicyReach = typeof PolicyReach.Type;

/** One choice of a question: what it reads as, what it means, and whether she recommended it. */
export const AskOption = Schema.Struct({
  label: Schema.String.annotate({ description: 'What the choice reads as.' }),
  description: Schema.String.annotate({ description: 'What the choice means.' }),
  recommended: Schema.Boolean.annotate({ description: 'Whether she recommended the choice.' }),
});

/** One question of an ask: what it asks, the short word it is labelled by, its choices, and whether the person may pick several. */
export const AskQuestion = Schema.Struct({
  question: Schema.String.annotate({ description: 'What the question asks.' }),
  header: Schema.String.annotate({ description: 'The short word the question is labelled by.' }),
  options: Schema.Array(AskOption).annotate({ description: 'The choices of the question.' }),
  multiSelect: Schema.Boolean.annotate({ description: 'Whether the person may pick several choices.' }),
});

/**
 * An ask of hers in her chat: its id, when she asked it, the call an answer is filed against, the first question's words, every
 * question, and the person's answer once given (`chose`, by each question's words, at `choseAt`); `cutAt` where the call that asked it
 * stopped waiting with nothing answered.
 */
const askFields = {
  id: Schema.String.annotate({ description: "The ask's id." }),
  at: Schema.String.annotate({ description: 'When she asked it, as an ISO 8601 time.' }),
  call: Schema.String.annotate({ description: 'The call an answer to the ask is filed against.' }),
  text: Schema.String.annotate({ description: "The first question's words." }),
  questions: Schema.Array(AskQuestion).annotate({ description: 'Every question of the ask.' }),
  chose: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({
    description: "The person's answer once given, by each question's words.",
  }),
  choseAt: Schema.optional(Schema.String).annotate({ description: 'When the person answered, as an ISO 8601 time.' }),
  cutAt: Schema.optional(Schema.String).annotate({ description: 'When the call that asked it stopped waiting with nothing answered.' }),
};

/**
 * What a permission ask carries beside its one question: the tool, a shell call's command as typed, the harness's words for the call,
 * whether `Always allow` is offered, and whether the person is started on `Deny`.
 */
export const PermissionFacts = Schema.Struct({
  tool: Schema.String.annotate({ description: 'The tool the call is of.' }),
  command: Schema.optional(Schema.String).annotate({ description: "A shell call's command, as typed." }),
  title: Schema.optional(Schema.String).annotate({ description: "The harness's title for the call." }),
  displayName: Schema.optional(Schema.String).annotate({ description: "The harness's display name for the call." }),
  description: Schema.optional(Schema.String).annotate({ description: "The harness's description of the call." }),
  decisionReason: Schema.optional(Schema.String).annotate({ description: "The harness's reason it asks." }),
  blockedPath: Schema.optional(Schema.String).annotate({ description: 'The path the call would reach.' }),
  always: Schema.Boolean.annotate({ description: 'Whether `Always allow` is offered.' }),
  defaultToNo: Schema.Boolean.annotate({ description: 'Whether the person is started on `Deny`.' }),
});

const eventId = Schema.String.annotate({ description: "The event's id, unique in her chat." });
const eventAt = Schema.String.annotate({ description: 'When it happened, as an ISO 8601 time.' });

/**
 * One event of her chat, unique by its id: a `message` (the person's or a peer's carrying when it was delivered, null while it waits;
 * a peer's its `name`), a tool `call`, a `session` line where one attempt ended and the next began, a `question` or a `proposal` of hers,
 * or a `permission`, a call of her session's that would prompt a person, with its facts.
 */
export const ChatEvent = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('message').annotate({ description: "A message: the person's or a peer's." }),
    id: eventId,
    at: eventAt,
    from: Schema.Literals(CHAT_FROM).annotate({ description: 'Who wrote the message.' }),
    text: Schema.String.annotate({ description: 'The words of the message.' }),
    delivered: Schema.optional(Schema.NullOr(Schema.String)).annotate({
      description: 'When the message was delivered; null while it waits.',
    }),
    name: Schema.optional(Schema.String).annotate({ description: "A peer's name." }),
  }),
  Schema.Struct({
    kind: Schema.Literal('call').annotate({ description: 'A tool call of her session.' }),
    id: eventId,
    at: eventAt,
    tool: Schema.String.annotate({ description: 'The tool the call is of.' }),
    sentence: Schema.String.annotate({ description: 'The call as a sentence.' }),
    fact: Schema.optional(Schema.String).annotate({ description: 'The fact of hers the call reads or writes.' }),
    state: Schema.Literals(CALL_STATES).annotate({ description: 'Where the call stands.' }),
  }),
  Schema.Struct({
    kind: Schema.Literal('session').annotate({ description: 'A line where one attempt of her session ended and the next began.' }),
    id: eventId,
    at: eventAt,
    attempt: describedNumber('The number of the attempt that began.'),
  }),
  Schema.Struct({ kind: Schema.Literal('question').annotate({ description: 'A question of hers.' }), ...askFields }),
  Schema.Struct({ kind: Schema.Literal('proposal').annotate({ description: 'A proposal of hers.' }), ...askFields }),
  Schema.Struct({
    kind: Schema.Literal('permission').annotate({ description: "A call of her session's that would prompt a person." }),
    ...askFields,
    permission: PermissionFacts.annotate({ description: 'The facts of the call that asks.' }),
  }),
]);

/**
 * Where her task is: her session live (`up`), a turn in progress (`answering`), what waits on the person (`waitsOnYou`), her messages
 * after the person's read mark (`unread`), and whether a message starts her session where none is open (`wakes`).
 */
export const ChatPresence = Schema.Struct({
  up: Schema.Boolean.annotate({ description: 'Whether her session is live.' }),
  answering: Schema.Boolean.annotate({ description: 'Whether a turn is in progress.' }),
  waitsOnYou: describedNumber('How many asks wait on the person.'),
  unread: describedNumber("How many of her messages come after the person's read mark."),
  wakes: Schema.Boolean.annotate({ description: 'Whether a message to the chat starts her session where none is open.' }),
});

/**
 * A page of her chat, oldest first: its events, the id to ask for the page older (null at the first), the cursor a stream resumes from,
 * and where she is.
 */
export const ChatHistory = Schema.Struct({
  events: Schema.Array(ChatEvent).annotate({ description: 'The events of this page of her chat, oldest first.' }),
  before: Schema.NullOr(Schema.String).annotate({ description: 'The id to ask for the page older by (?before=); null at the first page.' }),
  cursor: Schema.String.annotate({ description: 'The cursor a stream of her chat resumes from (?after=).' }),
  presence: ChatPresence.annotate({
    description: 'Where her task is: her session up, a turn in progress, what waits on the person, and what is unread.',
  }),
});

/** The query of a page: the last `limit` events (50 where none is asked, at most 200) before the event `before`. */
export const ChatHistoryQuery = {
  before: Schema.optionalKey(Schema.String.annotate({ description: 'The id of the event to read the page before.' })),
  limit: Schema.optionalKey(
    Schema.String.annotate({ description: 'How many events the page holds: 50 where none is asked, at most 200.' }),
  ),
};

/** Who wrote words to her: the person, or an agent under its own name, as the token that sent them says. */
export const ChatSpeaker = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('person').annotate({ description: 'The person.' }) }),
  Schema.Struct({
    kind: Schema.Literal('agent').annotate({ description: 'An agent.' }),
    name: Schema.String.annotate({ description: "The agent's name." }),
  }),
]);

/**
 * Words sent to her: the words, and `from`, retired: who wrote them is the caller the request's token says. A `from` naming an agent is
 * refused (422), naming the token an agent speaks with (`nemia token add <name> --agent <agent>`); one naming the person is read no
 * further.
 */
export const ChatSend = Schema.Struct({
  text: Schema.String.annotate({ description: 'The words sent to her.' }),
  from: Schema.optionalKey(
    ChatSpeaker.annotate({
      description:
        "Retired: who wrote the words is the caller the request's token says; one naming an agent is refused, one naming the person is read no further.",
    }),
  ),
});

/** Words as her outbox keeps them: its id, when, the words, and the agent that wrote them where one did. */
export const ChatSent = Schema.Struct({
  id: Schema.String.annotate({ description: "The words' id in her outbox." }),
  at: Schema.String.annotate({ description: 'When they were put in her outbox, as an ISO 8601 time.' }),
  text: Schema.String.annotate({ description: 'The words.' }),
  from: Schema.optional(ChatSpeaker).annotate({ description: 'The agent that wrote them, where one did.' }),
});

/** A turn of hers stopped: when, the attempt she was in, and of which task of hers. */
export const ChatStop = Schema.Struct({
  at: Schema.String.annotate({ description: 'When the turn was stopped, as an ISO 8601 time.' }),
  attempt: describedNumber('The attempt of her session the stopped turn was in.'),
  task: Schema.optionalKey(Schema.String.annotate({ description: 'The task of hers whose turn was stopped.' })),
});

/** The person's pick for one question of an ask: the question by its words, and the labels chosen or words of their own. */
export const AskPick = Schema.Struct({
  question: Schema.String.annotate({ description: 'The question answered, by its words.' }),
  labels: Schema.optionalKey(Schema.Array(Schema.String).annotate({ description: 'The labels of the choices picked.' })),
  words: Schema.optionalKey(Schema.String.annotate({ description: "The person's own words, where none of the choices fit." })),
});

/** An answer to an ask of hers: its id, and the person's pick for each of its questions. */
export const ChatAnswerWrite = Schema.Struct({
  id: Schema.String.annotate({ description: 'The id of the ask answered.' }),
  picks: Schema.Array(AskPick).annotate({ description: "The person's pick for each question of the ask." }),
});

/** An answer as her chat keeps it: which ask, when, and each question's answer by its words. */
export const ChatAnswer = Schema.Struct({
  id: Schema.String.annotate({ description: 'The id of the ask answered.' }),
  at: Schema.String.annotate({ description: 'When it was answered, as an ISO 8601 time.' }),
  answers: Schema.Record(Schema.String, Schema.String).annotate({ description: "Each question's answer, by the question's words." }),
});

/** The person's read mark moved: the last event they saw. */
export const ChatReadWrite = Schema.Struct({
  through: Schema.String.annotate({ description: 'The id of the last event the person saw.' }),
});

/** The person's read mark: the last event they saw, and when they marked it. */
export const ChatReadMark = Schema.Struct({
  through: Schema.String.annotate({ description: 'The id of the last event the person saw.' }),
  at: Schema.String.annotate({ description: 'When they marked it, as an ISO 8601 time.' }),
});

/** Why a read under an open stream failed, and that the next look reads again. */
export const ChatUnreadable = Schema.Struct({
  error: Schema.String.annotate({ description: 'Why the read failed.' }),
  retrying: Schema.Boolean.annotate({ description: 'Whether the next look reads again.' }),
});

const frameId = Schema.String.annotate({ description: 'The cursor a stream resumes from, the id of the last event of the read.' });

/**
 * One frame of her chat's stream, named by its `event`, its data the JSON of what it says: `presence` where she is, first and once it
 * changes; `chat`, an event new or changed, the cursor a stream resumes from the `id` of each read's last; `unreadable`, a read that failed
 * with the stream open; `readable`, the first that worked after one, its data `{}`.
 */
export const ChatStreamEvent = Schema.Union([
  Schema.Struct({
    event: Schema.Literal('presence').annotate({ description: 'Where she is, sent first and once it changes.' }),
    id: Schema.optionalKey(frameId),
    data: Schema.fromJsonString(ChatPresence).pipe(Schema.annotateEncoded({ description: 'The JSON of her presence.' })),
  }),
  Schema.Struct({
    event: Schema.Literal('chat').annotate({ description: 'An event of her chat, new or changed.' }),
    id: Schema.optionalKey(frameId),
    data: Schema.fromJsonString(ChatEvent).pipe(Schema.annotateEncoded({ description: 'The JSON of the event.' })),
  }),
  Schema.Struct({
    event: Schema.Literal('unreadable').annotate({ description: 'A read that failed with the stream open.' }),
    data: Schema.fromJsonString(ChatUnreadable).pipe(Schema.annotateEncoded({ description: 'The JSON of why it failed.' })),
  }),
  Schema.Struct({
    event: Schema.Literal('readable').annotate({ description: 'The first read that worked after an unreadable one.' }),
    data: Schema.fromJsonString(Schema.Struct({})).pipe(Schema.annotateEncoded({ description: 'The JSON `{}`.' })),
  }),
]);

/** The stream's query: the cursor it resumes from where no Last-Event-ID is sent. */
export const ChatStreamQuery = {
  after: Schema.optionalKey(Schema.String.annotate({ description: 'The cursor the stream resumes from, where no Last-Event-ID is sent.' })),
};

/** The stream's headers: the id of the last event an EventSource was sent, which it resumes from when it reconnects. */
export const ChatStreamHeaders = {
  'last-event-id': Schema.optionalKey(
    Schema.String.annotate({ description: 'The id of the last event an EventSource was sent, which it resumes from.' }),
  ),
};

/**
 * Nemia's custom instructions: the file they are kept in, the words (null for none), and `error`, the refusal of a file there that does
 * not read, null where it reads.
 */
export const NemiaInstructions = Schema.Struct({
  name: Schema.String.annotate({ description: 'The agent the instructions are for: Nemia herself.' }),
  file: Schema.String.annotate({ description: 'The file they are kept in.' }),
  words: Schema.NullOr(Schema.String).annotate({
    description: 'The words she is told after her own instructions; null where none are written.',
  }),
  error: Schema.NullOr(Schema.String).annotate({ description: 'Why the file there does not read, and what to do; null where it reads.' }),
});

/** Nemia's custom instructions written: the words she is told after her instructions. */
export const NemiaInstructionsWrite = Schema.Struct({
  words: Schema.String.annotate({ description: 'The words she is told after her own instructions.' }),
});

/** Nemia's custom instructions cleared: the file looked at, and whether there were words to remove. */
export const NemiaInstructionsCleared = Schema.Struct({
  name: Schema.String.annotate({ description: 'The agent whose instructions were cleared: Nemia herself.' }),
  file: Schema.String.annotate({ description: 'The file looked at.' }),
  removed: Schema.Boolean.annotate({ description: 'Whether there were words to remove.' }),
});
