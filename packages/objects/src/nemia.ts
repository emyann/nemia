/**
 * What Nemia's routes take and answer (`NemiaGroup`, nemia-api.ts): where she is (`NemiaLevel`) and the write of her level and each
 * factory's (`NemiaLevelSet`); the facts she keeps (`NemiaMemory`); an agent's rules for auto (`PolicyList`), a rule confirmed as the
 * person read it (`PolicyRuleConfirm`), the agent's proposal (`PolicyProposal`) and what its rules reach (`PolicyReach`); her chat — a
 * page of it (`ChatHistory`), each event (`ChatEvent`), what is sent, answered, read and stopped, the stream's frames
 * (`ChatStreamEvent`), and the names an agent may speak under (`ChatSpeakers`); and her custom instructions (`NemiaInstructions`).
 *
 * The orchestrator's verbs answer these shapes, its types assignable to each: a key the verb answers and the Schema does not say would be
 * dropped from the wire, so each says every key.
 */
import { Schema } from 'effect';
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
export const LevelRaise = Schema.Struct({ level: LevelWord, until: Schema.String });

/**
 * A factory's level as Nemia reads it: the level now, its own default (`default`, the store's where it has none of its own), its own
 * (`own`, null where it follows the store's), and the raise in force (`raise`, null for none).
 */
export const FactoryLevel = Schema.Struct({
  factory: Schema.String,
  level: LevelWord,
  default: LevelWord,
  own: Schema.NullOr(LevelWord),
  raise: Schema.NullOr(LevelRaise),
});

/**
 * Where Nemia is, as `nemia level --json` prints it: the store's level and since when, her task, its phase and its session where one is
 * filed, how a person reaches her session (`reach`), its web link (`bridge`, null where not bridged), whether it was stopped from
 * outside, what her ended sessions cost (`spend`), what a person allowed her at a prompt (`allows`), each factory's level, the default
 * factory first, and the command a person runs once to trust her folder (`trust`, null where it is trusted).
 */
export const NemiaLevel = Schema.Struct({
  level: LevelWord,
  since: Schema.NullOr(Schema.String),
  task: Schema.NullOr(Schema.String),
  phase: Schema.NullOr(Schema.Literals(ENGINE_PHASES)),
  sessionId: Schema.NullOr(Schema.String),
  reach: Schema.Array(Schema.String),
  bridge: Schema.NullOr(Schema.Struct({ url: Schema.NullOr(Schema.String), why: Schema.NullOr(Schema.String) })),
  stopped: Schema.Boolean,
  spend: Schema.NullOr(Schema.Struct({ usd: Schema.Number, measured: Schema.Number, unmeasured: Schema.Number })),
  allows: Schema.Array(Schema.String),
  factories: Schema.Array(FactoryLevel),
  trust: Schema.NullOr(Schema.String),
});

/**
 * A write of a level, as `nemia level` takes it: the store's `level`; or with `factory` that factory's default, raised for a stretch
 * (`for`, like `2h`) or its raise ended (`end`). Nothing given reads where she is.
 */
export const NemiaLevelSet = Schema.Struct({
  level: Schema.optionalKey(LevelWord),
  factory: Schema.optionalKey(Schema.String),
  for: Schema.optionalKey(Schema.String),
  end: Schema.optionalKey(Schema.Boolean),
});

/** The facts Nemia keeps: the folder they are in, their names, and the words of the one asked (`fact`, null where none was). */
export const NemiaMemory = Schema.Struct({
  dir: Schema.String,
  facts: Schema.Array(Schema.String),
  fact: Schema.NullOr(Schema.Struct({ name: Schema.String, text: Schema.String })),
});

/**
 * A rule at a gate with its words, as the person reads it: its id, the answer it gives unasked, the steps it covers (every step where
 * absent), the conditions it needs (each a word of the orchestrator's `CONDITIONS`, a fact admission reads of a run), a dollar line the
 * run's spend stays under (none where absent), and where it came from.
 */
const gateRuleBareFields = {
  id: Schema.String,
  answer: Schema.Literals(RULE_ANSWERS),
  steps: Schema.optional(Schema.Array(Schema.String)),
  when: Schema.Array(Schema.String),
  under: Schema.optional(Schema.Number),
  from: Schema.optional(Schema.Literals(RULE_ORIGINS)),
};

/** A rule at a gate with its words. */
const gateRuleFields = { ...gateRuleBareFields, words: Schema.String };

/** A rule at a gate with its words. */
export const PolicyRule = Schema.Struct(gateRuleFields);

/**
 * A rule under which the agent approves a proposal of one factory unasked, with its words: what it covers, as a delegation's grant does,
 * whether it takes a proposal that widens access, and the agents whose proposals it takes (every agent where empty).
 */
const proposalRuleBareFields = {
  id: Schema.String,
  answer: Schema.Literal('approve-proposal'),
  factory: Schema.String,
  resources: Schema.Array(Schema.String),
  resourceNames: Schema.Array(Schema.String),
  verbs: Schema.Array(Schema.Literals(CHANGE_VERBS)),
  widens: Schema.Boolean,
  proposedBy: Schema.Array(Schema.String),
  from: Schema.optional(Schema.Literal('proposed')),
};

/** A rule for approving proposals with its words. */
const proposalRuleFields = { ...proposalRuleBareFields, words: Schema.String };

/** A rule for approving proposals, with its words. */
export const ProposalPolicyRule = Schema.Struct(proposalRuleFields);

/**
 * An agent's rules for auto: the agent, the file of the person's list, whether the builtin rule is in force for want of one, the rules
 * in force (a gate's, and the proposals' apart), what the agent proposed (each rule saying whether it is in force, the words it keeps as
 * guidance, and whether its custom instruction changed since, `stale`; null for nothing proposed), the custom instruction (null for
 * none), and the builtin rule, to be confirmed again.
 */
export const PolicyList = Schema.Struct({
  agent: Schema.String,
  file: Schema.String,
  isDefault: Schema.Boolean,
  rules: Schema.Array(PolicyRule),
  proposalRules: Schema.Array(ProposalPolicyRule),
  proposed: Schema.NullOr(
    Schema.Struct({
      file: Schema.String,
      at: Schema.String,
      rules: Schema.Array(Schema.Struct({ ...gateRuleFields, confirmed: Schema.Boolean })),
      proposalRules: Schema.Array(Schema.Struct({ ...proposalRuleFields, confirmed: Schema.Boolean })),
      guidance: Schema.Array(Schema.String),
      stale: Schema.Boolean,
    }),
  ),
  instruction: Schema.NullOr(Schema.String),
  builtin: PolicyRule,
});

/** A confirm of a rule: its words as the person read them, so what is confirmed is what they read. */
export const PolicyRuleConfirm = Schema.Struct({ words: Schema.String });

/**
 * An agent's proposal, as `nemia policy propose` reads it from `--file`: `words`, its JSON text, `{ "rules": [...], "guidance": [...] }`,
 * the rules it proposes from its custom instruction and the words the machinery cannot hold, kept as guidance.
 */
export const PolicyProposal = Schema.Struct({ words: Schema.String });

/** Whose steps at their gate `GET /api/policy/:name/reach` reads: one factory's (`factory`) or one run's (`run`), exactly one of them. */
export const PolicyReachQuery = { factory: Schema.optionalKey(Schema.String), run: Schema.optionalKey(Schema.String) };

/** A step at its gate, as reach reads it: its workflow, its name, whether it is approved before it runs, and whether it has a check. */
const gateSiteFields = {
  workflow: Schema.String,
  step: Schema.String,
  approvedFirst: Schema.Boolean,
  hasCheck: Schema.Boolean,
};

/**
 * Why a rule in force can never approve at a gate, its first reason, with its words: it only tries a step again (`answers-retry`), it
 * covers other steps (`other-steps`), or it needs a condition (`condition`, a word of the orchestrator's `CONDITIONS`, as a rule's `when`)
 * that never holds there (`never-holds`), and why (`because`).
 */
export const RuleMiss = Schema.Union([
  Schema.Struct({ rule: Schema.String, why: Schema.Literal('answers-retry'), words: Schema.String }),
  Schema.Struct({ rule: Schema.String, why: Schema.Literal('other-steps'), words: Schema.String }),
  Schema.Struct({
    rule: Schema.String,
    why: Schema.Literal('never-holds'),
    condition: Schema.String,
    because: Schema.Literals(NEVER_HOLDS),
    words: Schema.String,
  }),
]);

/**
 * A step at its gate and what reaches it: the rules in force that could approve it (`reachedBy`), the proposed rules not in force that
 * could (`proposedBy`), each rule in force that cannot with its first reason (`misses`), and, of a run, each rule that reaches it with
 * what keeps it from approving now — the conditions that do not hold and whether the run is over its dollar line (`now`).
 */
export const GateReach = Schema.Struct({
  ...gateSiteFields,
  reachedBy: Schema.Array(Schema.String),
  proposedBy: Schema.Array(Schema.String),
  misses: Schema.Array(RuleMiss),
  now: Schema.optional(
    Schema.Array(
      Schema.Struct({
        rule: Schema.String,
        unmet: Schema.Struct({ conditions: Schema.Array(Schema.String), overLine: Schema.Boolean }),
        words: Schema.String,
      }),
    ),
  ),
});

/**
 * What an agent's rules reach, as `nemia policy reach --json` prints it: the agent; the factory read, and the run where one was named
 * (null where none); the factory's level now; how many of the steps at their gate the rules in force reach (`reach`); a row for each such
 * step (`gates`); the rules suggested for the steps no rule reaches, each with its words; the whole proposal to propose them by
 * (`proposal`, what the agent proposed already with the suggestions added, for `PUT /api/policy/:name/proposal`); and each workflow
 * attached to the factory that does not load, with why.
 */
export const PolicyReach = Schema.Struct({
  agent: Schema.String,
  factory: Schema.String,
  run: Schema.NullOr(Schema.String),
  level: LevelWord,
  reach: Schema.Literals(POLICY_REACHES),
  gates: Schema.Array(GateReach),
  suggested: Schema.Array(Schema.Union([PolicyRule, ProposalPolicyRule])),
  proposal: Schema.Struct({
    rules: Schema.Array(Schema.Union([Schema.Struct(gateRuleBareFields), Schema.Struct(proposalRuleBareFields)])),
    guidance: Schema.Array(Schema.String),
  }),
  unloaded: Schema.Array(Schema.Struct({ workflow: Schema.String, message: Schema.String })),
});
export type PolicyReach = typeof PolicyReach.Type;

/** The names the person allowed an agent to speak under in her chat, as `nemia chat speakers` lists them and each write answers. */
export const ChatSpeakers = Schema.Struct({ allowed: Schema.Array(Schema.String) });
export type ChatSpeakers = typeof ChatSpeakers.Type;

/** One choice of a question: what it reads as, what it means, and whether she recommended it. */
export const AskOption = Schema.Struct({ label: Schema.String, description: Schema.String, recommended: Schema.Boolean });

/** One question of an ask: what it asks, the short word it is labelled by, its choices, and whether the person may pick several. */
export const AskQuestion = Schema.Struct({
  question: Schema.String,
  header: Schema.String,
  options: Schema.Array(AskOption),
  multiSelect: Schema.Boolean,
});

/**
 * An ask of hers in her chat: its id, when she asked it, the call an answer is filed against, the first question's words, every
 * question, and the person's answer once given (`chose`, by each question's words, at `choseAt`); `cutAt` where the call that asked it
 * stopped waiting with nothing answered.
 */
const askFields = {
  id: Schema.String,
  at: Schema.String,
  call: Schema.String,
  text: Schema.String,
  questions: Schema.Array(AskQuestion),
  chose: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  choseAt: Schema.optional(Schema.String),
  cutAt: Schema.optional(Schema.String),
};

/**
 * What a permission ask carries beside its one question: the tool, a shell call's command as typed, the harness's words for the call,
 * whether `Always allow` is offered, and whether the person is started on `Deny`.
 */
export const PermissionFacts = Schema.Struct({
  tool: Schema.String,
  command: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  displayName: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  decisionReason: Schema.optional(Schema.String),
  blockedPath: Schema.optional(Schema.String),
  always: Schema.Boolean,
  defaultToNo: Schema.Boolean,
});

/**
 * One event of her chat, unique by its id: a `message` (the person's or a peer's carrying when it was delivered, null while it waits;
 * a peer's its `name`), a tool `call`, a `session` line where one attempt ended and the next began, a `question` or a `proposal` of hers,
 * or a `permission`, a call of her session's that would prompt a person, with its facts.
 */
export const ChatEvent = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('message'),
    id: Schema.String,
    at: Schema.String,
    from: Schema.Literals(CHAT_FROM),
    text: Schema.String,
    delivered: Schema.optional(Schema.NullOr(Schema.String)),
    name: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal('call'),
    id: Schema.String,
    at: Schema.String,
    tool: Schema.String,
    sentence: Schema.String,
    fact: Schema.optional(Schema.String),
    state: Schema.Literals(CALL_STATES),
  }),
  Schema.Struct({ kind: Schema.Literal('session'), id: Schema.String, at: Schema.String, attempt: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal('question'), ...askFields }),
  Schema.Struct({ kind: Schema.Literal('proposal'), ...askFields }),
  Schema.Struct({ kind: Schema.Literal('permission'), ...askFields, permission: PermissionFacts }),
]);

/**
 * Where her task is: her session live (`up`), a turn in progress (`answering`), what waits on the person (`waitsOnYou`), and her messages
 * after the person's read mark (`unread`).
 */
export const ChatPresence = Schema.Struct({
  up: Schema.Boolean,
  answering: Schema.Boolean,
  waitsOnYou: Schema.Number,
  unread: Schema.Number,
});

/**
 * A page of her chat, oldest first: its events, the id to ask for the page older (null at the first), the cursor a stream resumes from,
 * and where she is.
 */
export const ChatHistory = Schema.Struct({
  events: Schema.Array(ChatEvent),
  before: Schema.NullOr(Schema.String),
  cursor: Schema.String,
  presence: ChatPresence,
});

/** The query of a page: the last `limit` events (50 where none is asked, at most 200) before the event `before`. */
export const ChatHistoryQuery = {
  before: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(Schema.String),
};

/** Who wrote words to her: the person, from the board, or an agent under a name the person allowed. */
export const ChatSpeaker = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('person') }),
  Schema.Struct({ kind: Schema.Literal('agent'), name: Schema.String }),
]);

/** Words sent to her: the words, and who wrote them (none is the person). */
export const ChatSend = Schema.Struct({ text: Schema.String, from: Schema.optionalKey(ChatSpeaker) });

/** Words as her outbox keeps them: its id, when, the words, and the agent that wrote them where one did. */
export const ChatSent = Schema.Struct({
  id: Schema.String,
  at: Schema.String,
  text: Schema.String,
  from: Schema.optional(ChatSpeaker),
});

/** A turn of hers stopped: when, and the attempt she was in. */
export const ChatStop = Schema.Struct({ at: Schema.String, attempt: Schema.Number });

/** The person's pick for one question of an ask: the question by its words, and the labels chosen or words of their own. */
export const AskPick = Schema.Struct({
  question: Schema.String,
  labels: Schema.optionalKey(Schema.Array(Schema.String)),
  words: Schema.optionalKey(Schema.String),
});

/** An answer to an ask of hers: its id, and the person's pick for each of its questions. */
export const ChatAnswerWrite = Schema.Struct({ id: Schema.String, picks: Schema.Array(AskPick) });

/** An answer as her chat keeps it: which ask, when, and each question's answer by its words. */
export const ChatAnswer = Schema.Struct({ id: Schema.String, at: Schema.String, answers: Schema.Record(Schema.String, Schema.String) });

/** The person's read mark moved: the last event they saw. */
export const ChatReadWrite = Schema.Struct({ through: Schema.String });

/** The person's read mark: the last event they saw, and when they marked it. */
export const ChatReadMark = Schema.Struct({ through: Schema.String, at: Schema.String });

/** Why a read under an open stream failed, and that the next look reads again. */
export const ChatUnreadable = Schema.Struct({ error: Schema.String, retrying: Schema.Boolean });

/**
 * One frame of her chat's stream, named by its `event`, its data the JSON of what it says: `presence` where she is, first and once it
 * changes; `chat`, an event new or changed, the cursor a stream resumes from the `id` of each read's last; `unreadable`, a read that failed
 * with the stream open; `readable`, the first that worked after one, its data `{}`.
 */
export const ChatStreamEvent = Schema.Union([
  Schema.Struct({ event: Schema.Literal('presence'), id: Schema.optionalKey(Schema.String), data: Schema.fromJsonString(ChatPresence) }),
  Schema.Struct({ event: Schema.Literal('chat'), id: Schema.optionalKey(Schema.String), data: Schema.fromJsonString(ChatEvent) }),
  Schema.Struct({ event: Schema.Literal('unreadable'), data: Schema.fromJsonString(ChatUnreadable) }),
  Schema.Struct({ event: Schema.Literal('readable'), data: Schema.fromJsonString(Schema.Struct({})) }),
]);

/** The stream's query: the cursor it resumes from where no Last-Event-ID is sent. */
export const ChatStreamQuery = { after: Schema.optionalKey(Schema.String) };

/** The stream's headers: the id of the last event an EventSource was sent, which it resumes from when it reconnects. */
export const ChatStreamHeaders = { 'last-event-id': Schema.optionalKey(Schema.String) };

/**
 * Nemia's custom instructions: the file they are kept in, the words (null for none), and `error`, the refusal of a file there that does
 * not read, null where it reads.
 */
export const NemiaInstructions = Schema.Struct({
  name: Schema.String,
  file: Schema.String,
  words: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
});

/** Nemia's custom instructions written: the words she is told after her instructions. */
export const NemiaInstructionsWrite = Schema.Struct({ words: Schema.String });

/** Nemia's custom instructions cleared: the file looked at, and whether there were words to remove. */
export const NemiaInstructionsCleared = Schema.Struct({ name: Schema.String, file: Schema.String, removed: Schema.Boolean });
