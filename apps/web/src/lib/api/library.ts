/**
 * What the library's reads share — an agent's card entry, a skill's place and cost and a skill an agent gives, a schema pasted for a step,
 * every key of a step, and a key's row on a card's or a step's page — each type with the schema `get` decodes it with.
 */
import { Schema, Struct } from 'effect';
import { DEFINITION_ORIGINS, STEP_KEYS, StepKeys, type CardSkill, type DefinitionOrigin } from 'objects';
import { decodes } from './decodes.ts';

/** One thing an agent says it can do, in the A2A protocol's words: `objects`' `CardSkill`. */
export type AgentSkill = CardSkill;

/**
 * Where a skill is (an origin of `objects`): the factory's own tree, your library (the store's `workflows/skills/`), the repository the
 * board serves, or what is built into Nemia.
 */
export type SkillSource = DefinitionOrigin;

/**
 * The word the api reads — on a step's page, a start, a card's `from:` — for where a workflow is from: `yours`, or `repo` for any
 * other origin, the factory's own tree among them, which those routes read under `repo`.
 */
export const sourceOf = (from: string): Extract<DefinitionOrigin, 'repo' | 'yours'> => (from === 'yours' ? 'yours' : 'repo');

/** A card entry as an object says it, its lists copied into the board's plain type. */
export const cardEntryOf = (entry: {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly examples?: readonly string[];
  readonly inputModes?: readonly string[];
  readonly outputModes?: readonly string[];
}): AgentSkill => ({
  id: entry.id,
  name: entry.name,
  description: entry.description,
  tags: [...entry.tags],
  ...(entry.examples ? { examples: [...entry.examples] } : {}),
  ...(entry.inputModes ? { inputModes: [...entry.inputModes] } : {}),
  ...(entry.outputModes ? { outputModes: [...entry.outputModes] } : {}),
});

/** The origin a page's address names (its `$from`), as the api reads `?origin=`: one of its words, else none, the one it serves. */
export const originWord = (from: string): DefinitionOrigin | undefined => DEFINITION_ORIGINS.find((origin) => origin === from);

/**
 * Mirrors `SkillCost` in the package: what a skill costs a turn, about, at four characters a token. Named, a turn carries its listing (its
 * name and description); preloaded, its body too.
 */
export type SkillCost = { preload: boolean; listed: number; body: number; perTurn: number };

/**
 * A skill an agent gives, as its Agent object's `status.given` says it: named as its line writes it, where a start finds it and what it
 * costs — or why none is found. `from` is the place whose page it has; where it is null, `foundIn` is where this repository has it, as a
 * skill named with its folder, and null too for one found nowhere.
 */
export type GivenSkill = {
  name: string;
  from: SkillSource | null;
  foundIn: string | null;
  entry: AgentSkill | null;
  error: string | null;
  preload: boolean;
  cost: SkillCost | null;
};

/** A schema pasted for a step's `output:`, written beside the steps by the save that carries it; an agent's, beside the agent. */
export type SchemaFile = { file: string; text: string };

/** Every key a step of a workflow sets, before any run froze it, each resolved: `objects`' `StepKeys`, every key required. */
export type WorkflowStepSpec = typeof WorkflowStepSpecSchema.Type;

/** A key of a step, as the package's `STEP_KEYS` names it. */
export type { StepKey } from 'objects';

/** Decodes a `StepKey`: `objects`' `STEP_KEYS`, in their order. */
export const StepKeySchema = Schema.Literals(STEP_KEYS);

/**
 * Decodes a `WorkflowStepSpec`: `objects`' `StepKeys`, every key required, since a workflow's status resolves every key a step sets
 * (`null` where it is unset) and the board reads each.
 */
export const WorkflowStepSpecSchema = Schema.Struct(Struct.map(StepKeys.schema.fields, Schema.requiredKey));

/** Decodes the keys a step takes from an agent, each only where the agent sets it (`KeyForm.agents`). */
export const StepSpecPartSchema = decodes<Partial<WorkflowStepSpec>>()(WorkflowStepSpecSchema.mapFields(Struct.map(Schema.optionalKey)));

/** One key of a card or a step, as its page lays them out: `objects`' `KeyRow`. */
export type { KeyRow } from 'objects';
