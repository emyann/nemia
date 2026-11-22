/**
 * The Agent: an agent definition a factory resolves, served as an object in the factory's namespace. Its `spec` is what its file says:
 * its role, its description, its harness keys, the skills and MCP servers it names, its `output:` schema and its instructions. Its
 * `status` is what Nemia reads of it: where it was found, the steps that name it and those it fills in the factory, the factories it
 * fills a step in, each skill it gives as a start finds it, where it was copied from, why it cannot be tried, its card's entries, why it
 * does not read, and its revision.
 *
 * Beside it, the bodies a write is sent (`AgentWrite`, `AgentTry`) and what a try and a card answer. Plain Schemas of JSON.
 */
import { Schema, Struct } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { CardSkill, SkillCost, WriteMeta, definitionStatus } from './definition.ts';
import { AGENT_SOURCE_PLACES, DEFINITION_ORIGINS } from './words.ts';

const Text = Schema.NullOr(Schema.String);

/** Where an agent of a step is, by the place a start reads it from. */
const AgentPlace = Schema.Literals(['repo', 'user']);

/** Where a step an agent fills is read from: either place an agent is, or the tree of a factory made from a template (`factory`). */
const FillPlace = Schema.Literals(['factory', 'repo', 'user']);

/**
 * An agent as its file says it: `role:`, `description:`, its harness keys (`keys`, each line as written), `skills:` and `mcp:` as their
 * lines write them, `harnessPrompt:`, the schema its `output:` names (its file and text) and its instructions (`instructions`, the body).
 */
export const AgentSpec = Schema.Struct({
  role: Schema.optionalKey(Text.annotate({ description: "The agent's `role:` line; null where it has none." })),
  description: Schema.optionalKey(
    Text.annotate({ description: "The agent's `description:` line, what it says it is for; null where it has none." }),
  ),
  keys: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.NullOr(Schema.String)).annotate({
      description: "The agent's harness keys, each line as written by its key; null for a key with no value.",
    }),
  ),
  skills: Schema.optionalKey(Text.annotate({ description: "The agent's `skills:` line as written; null where it has none." })),
  harnessPrompt: Schema.optionalKey(
    Text.annotate({ description: "The agent's `harnessPrompt:` line as written; null where it has none." }),
  ),
  mcp: Schema.optionalKey(Text.annotate({ description: "The agent's `mcp:` line as written; null where it has none." })),
  output: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        file: Schema.String.annotate({ description: 'The file of the schema its `output:` line names.' }),
        text: Schema.String.annotate({ description: 'The text of that schema.' }),
      }),
    ).annotate({ description: 'The schema its `output:` line names, with its file and text; null where it names none.' }),
  ),
  instructions: Schema.optionalKey(Schema.String.annotate({ description: "The agent's instructions, the body of its file." })),
}).annotate({
  description: 'The agent as its file says it: its role, description, harness keys, skills, MCP servers, output schema and instructions.',
});
export type AgentSpec = typeof AgentSpec.Type;

/** A step that names the agent (`usedBy`), and one it fills in the factory, hired or by its own `agent:` line (`fills`). */
export const AgentUser = Schema.Struct({
  from: AgentPlace.annotate({ description: 'The place the step reads the agent from: the repository or the user library (`user`).' }),
  workflow: Schema.String.annotate({ description: 'The workflow the step is in.' }),
  step: Schema.String.annotate({ description: "The step's name." }),
});
export const AgentFill = Schema.Struct({
  from: FillPlace.annotate({
    description:
      'Where the step is read from: the repository, the user library (`user`), or the tree of a factory made from a template (`factory`).',
  }),
  workflow: Schema.String.annotate({ description: 'The workflow the step is in.' }),
  step: Schema.String.annotate({ description: "The step's name." }),
  hired: Schema.Boolean.annotate({ description: 'Whether the agent is hired to the step, rather than named by its own `agent:` line.' }),
});

/**
 * A skill the agent gives, as its line names it: the origin a start finds it in (null where none, `foundIn` then the folder the repository
 * has it in, or null too), its card entry or why it has none, and what it costs a turn.
 */
export const GivenSkill = Schema.Struct({
  name: Schema.String.annotate({ description: "The skill's name, as the agent's line names it." }),
  from: Schema.NullOr(Schema.Literals(DEFINITION_ORIGINS)).annotate({
    description: 'The origin a start finds the skill in; null where none.',
  }),
  foundIn: Text.annotate({
    description: 'The folder the repository has the skill in, where a start finds none; null too where it has none.',
  }),
  entry: Schema.NullOr(CardSkill).annotate({ description: 'Its card entry; null where it has none.' }),
  error: Text.annotate({ description: 'Why it has no card entry; null where it has one.' }),
  preload: Schema.Boolean.annotate({ description: 'Whether the skill is loaded whole at the start of a session.' }),
  cost: Schema.NullOr(SkillCost).annotate({ description: 'What the skill costs a turn, about; null where it is not known.' }),
});
export type GivenSkill = typeof GivenSkill.Type;

/** What Nemia reads of an agent; see the file's head. */
export const AgentStatus = Schema.Struct({
  ...definitionStatus,
  dir: Schema.String.annotate({ description: 'The folder the agent was found in.' }),
  file: Schema.String.annotate({ description: "The agent's file." }),
  source: Schema.String.annotate({ description: "The text of the agent's file." }),
  usedBy: Schema.Array(AgentUser).annotate({ description: 'The steps that name the agent.' }),
  fills: Schema.Array(AgentFill).annotate({ description: 'The steps it fills in the factory, hired or by their own `agent:` line.' }),
  factories: Schema.Array(Schema.String).annotate({ description: 'The factories it fills a step in.' }),
  given: Schema.Array(GivenSkill).annotate({ description: 'Each skill the agent gives, as its line names it.' }),
  copied: Schema.NullOr(
    Schema.Struct({
      source: Schema.String.annotate({ description: 'The file it was copied from.' }),
      version: Schema.String.annotate({ description: 'The version the copy recorded.' }),
      now: Schema.Literals(['same', 'changed', 'gone']).annotate({
        description: 'Whether the file it was copied from is the same version now, changed, or gone.',
      }),
    }),
  ).annotate({ description: 'Where the agent was copied from; null where it was not copied.' }),
  untried: Schema.NullOr(
    Schema.Struct({
      why: Schema.String.annotate({ description: 'Why the agent cannot be tried.' }),
      copy: Text.annotate({
        description: 'The command that copies it to the user library, to make it one that can be tried; null where a copy does not.',
      }),
    }),
  ).annotate({ description: 'Why the agent cannot be tried; null where nothing refuses it.' }),
  card: Schema.NullOr(Schema.Array(CardSkill)).annotate({ description: "The agent's card entries; null where its file does not read." }),
  cardError: Text.annotate({ description: 'Why it has no card; null where it has one.' }),
  error: Text.annotate({ description: 'Why the agent does not read; null where it reads.' }),
  custom: Schema.optionalKey(
    Text.annotate({
      description:
        "The file of a person's custom instructions for it (`nemia agents custom`); null where they wrote none; absent from an older api.",
    }),
  ),
  removed: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: "The files a removal took, on that answer alone: the agent's file and a schema no other agent names.",
    }),
  ),
}).annotate({
  description:
    'What Nemia reads of the agent: where it was found, the steps that name it and those it fills, the skills it gives, where it was copied from, why it does not read, and its revision.',
});
export type AgentStatus = typeof AgentStatus.Type;

/** An agent, as an object. */
export const Agent = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Agent').annotate({ description: 'What the object is: an Agent, a definition a step is filled by.' }),
  metadata: ObjectMeta,
  spec: AgentSpec,
  status: AgentStatus,
});
export type Agent = typeof Agent.Type;

/** An agent as a list serves it: its object without its files' content — its instructions, its output schema's text, its file's text. */
export const AgentListed = Schema.Struct({
  ...Agent.fields,
  spec: AgentSpec.mapFields((fields) => ({
    ...Struct.omit(fields, ['instructions']),
    output: Schema.optionalKey(
      Schema.NullOr(
        Schema.Struct({ file: Schema.String.annotate({ description: 'The file of the schema its `output:` line names.' }) }),
      ).annotate({
        description: 'The file of the schema its `output:` line names, its text read with the agent; null where it names none.',
      }),
    ),
  })).annotate({
    description: "The agent as its file says it, without its instructions or its output schema's text, which a read of the agent answers.",
  }),
  status: AgentStatus.mapFields(Struct.omit(['source'])).annotate({
    description: "What Nemia reads of the agent, without its file's text, which a read of the agent answers.",
  }),
}).annotate({ description: "An agent as a list serves it, without its files' content (LISTED_WITHOUT)." });
export type AgentListed = typeof AgentListed.Type;

/** A page of a namespace's agents, each without its files' content. */
export const AgentList = listOf('Agent', AgentListed);
export type AgentList = typeof AgentList.Type;

/**
 * An agent of the person's library made (`POST …/agents`, `metadata.name` its name) or written (`PUT …/agents/<name>`,
 * `metadata.resourceVersion` the version it was read at; a `metadata.name` other than the path's renames it).
 */
export const AgentWrite = Schema.Struct({ metadata: WriteMeta, spec: AgentSpec });
export type AgentWrite = typeof AgentWrite.Type;

/** An agent's files read into its spec (`POST /api/agents/read`): the name it is read under, and what its files say. */
export const AgentDrafted = Schema.Struct({
  metadata: Schema.Struct({ name: Schema.String.annotate({ description: 'The name the files are read under.' }) }).annotate({
    description: 'The name the agent is read under.',
  }),
  spec: AgentSpec,
});
export type AgentDrafted = typeof AgentDrafted.Type;

/** A try of an agent (`POST …/agents/<name>/try`): what it is asked to do. */
export const AgentTry = Schema.Struct({ brief: Schema.String.annotate({ description: 'What the agent is asked to do.' }) });
export type AgentTry = typeof AgentTry.Type;

/** What a try answers: the run it started. */
export const AgentTried = Schema.Struct({ id: Schema.String.annotate({ description: 'The id of the run the try started.' }) });
export type AgentTried = typeof AgentTried.Type;

/**
 * An agent as an A2A Agent Card (`GET …/agents/<name>/card`), and the truth about it: `servedOverA2A` is always false, and `why` says what
 * the shape leaves out.
 */
export const AgentCard = Schema.Struct({
  card: Schema.Struct({
    name: Schema.String.annotate({ description: "The agent's name." }),
    description: Schema.String.annotate({ description: 'What the agent says it is for.' }),
    version: Schema.String.annotate({ description: "The agent's version." }),
    capabilities: Schema.Struct({
      streaming: Schema.Boolean.annotate({ description: 'Whether the agent streams its answers.' }),
      pushNotifications: Schema.Boolean.annotate({ description: 'Whether the agent sends push notifications.' }),
      extendedAgentCard: Schema.Boolean.annotate({ description: 'Whether the agent has an extended card.' }),
    }).annotate({ description: 'What the agent can do as an A2A server.' }),
    defaultInputModes: Schema.Array(Schema.String).annotate({ description: 'The media types the agent takes by default.' }),
    defaultOutputModes: Schema.Array(Schema.String).annotate({ description: 'The media types the agent answers in by default.' }),
    skills: Schema.Array(CardSkill).annotate({ description: 'What the agent can do, a skill to an entry.' }),
  }).annotate({ description: 'The agent as an A2A Agent Card.' }),
  servedOverA2A: Schema.Literal(false).annotate({ description: 'Whether the agent is served over A2A: always false.' }),
  why: Schema.String.annotate({ description: 'What the card shape leaves out of the agent.' }),
  from: Schema.optionalKey(
    AgentPlace.annotate({
      description: 'The place the agent was read from, which `nemia agents card` says beside the card; absent from an older api.',
    }),
  ),
});
export type AgentCard = typeof AgentCard.Type;

/**
 * One agent file the store knows of (`GET /api/agent-sources`): where it was found (`place`, and `repo` for a repository's), its folder
 * and file, its name, what it says it is for, its version (what a copy records), and, for one that does not read, why.
 */
export const AgentSource = Schema.Struct({
  place: Schema.Literals(AGENT_SOURCE_PLACES).annotate({ description: 'Where the file was found.' }),
  repo: Text.annotate({ description: "The repository the file was found in, for a repository's; null otherwise." }),
  dir: Schema.String.annotate({ description: 'The folder of the file.' }),
  file: Schema.String.annotate({ description: 'The file.' }),
  name: Schema.String.annotate({ description: "The agent's name." }),
  description: Text.annotate({ description: 'What the agent says it is for; null where it does not read or says none.' }),
  version: Text.annotate({ description: 'The version of the file, which a copy records; null where it does not read.' }),
  error: Text.annotate({ description: 'Why the file does not read; null where it reads.' }),
});
export type AgentSource = typeof AgentSource.Type;

/** Every agent file the store knows of, each a file `POST …/agents/copy` takes. */
export const AgentSources = Schema.Struct({
  sources: Schema.Array(AgentSource).annotate({
    description:
      'Every agent file the store knows of, each with where it was found, its folder, file, name, description and version, or why it does not read.',
  }),
}).annotate({ identifier: 'AgentSources' });
export type AgentSources = typeof AgentSources.Type;

/**
 * An agent file copied into your library (`POST /api/namespaces/default/agents/copy`), as `nemia agents copy` copies it: the file, the
 * name it takes there (`as`, its own where left out), and each skill or schema of the copy whose library's version stays (`keep`).
 */
export const AgentCopy = Schema.Struct({
  file: Schema.String.annotate({ description: 'The agent file to copy into your library, by its path as the sources list it.' }),
  as: Schema.optionalKey(Schema.String.annotate({ description: 'The name it takes in your library; left out, its own.' })),
  keep: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({ description: "Each skill or schema of the copy whose library's version stays, by name." }),
  ),
}).annotate({ identifier: 'AgentCopy' });
export type AgentCopy = typeof AgentCopy.Type;

/** What a copy did: the agent's name in your library, the parts it wrote and those it reused, by name, and the record's file. */
export const AgentCopied = Schema.Struct({
  name: Schema.String.annotate({ description: "The agent's name in your library." }),
  copied: Schema.Array(Schema.String).annotate({ description: 'The parts the copy wrote, by name.' }),
  reused: Schema.Array(Schema.String).annotate({ description: 'The parts already in your library that the copy reused, by name.' }),
  record: Schema.String.annotate({ description: "The file of the copy's record: where it came from and its version." }),
}).annotate({ identifier: 'AgentCopied' });
export type AgentCopied = typeof AgentCopied.Type;

/**
 * A person's custom instructions for an agent (`…/agents/<name>/instructions`), one record per agent name: the file they are kept in, the
 * words (null for none), and `error`, why a file there does not read — a link, a frontmatter block, not a file — which stops every run
 * naming the agent until it is cleared or written again.
 */
export const AgentInstructions = Schema.Struct({
  name: Schema.String.annotate({ description: 'The agent the instructions are for.' }),
  file: Schema.String.annotate({ description: 'The file they are kept in.' }),
  words: Text.annotate({
    description: 'What the agent is told after its own instructions (nemia agents custom); null where none are written.',
  }),
  error: Text.annotate({
    description:
      'Why a file there does not read, which stops every run naming the agent until it is cleared or written again; null where it reads.',
  }),
}).annotate({ identifier: 'AgentInstructions' });
export type AgentInstructions = typeof AgentInstructions.Type;

/** Custom instructions written (`PUT …/instructions`): what the agent is told after its instructions. The last write wins. */
export const AgentInstructionsWrite = Schema.Struct({
  words: Schema.String.annotate({ description: 'What the agent is told after its own instructions; the last write wins.' }),
}).annotate({ identifier: 'AgentInstructionsWrite' });
export type AgentInstructionsWrite = typeof AgentInstructionsWrite.Type;

/** Custom instructions cleared (`DELETE …/instructions`): the file looked at, and whether there were words to remove. */
export const AgentInstructionsCleared = Schema.Struct({
  name: Schema.String.annotate({ description: 'The agent whose instructions were cleared.' }),
  file: Schema.String.annotate({ description: 'The file looked at.' }),
  removed: Schema.Boolean.annotate({ description: 'Whether there were words to remove.' }),
}).annotate({ identifier: 'AgentInstructionsCleared' });
export type AgentInstructionsCleared = typeof AgentInstructionsCleared.Type;
