/**
 * The Factory: a factory served as an object, which no namespace holds (it is the namespace its parts are in). Its `spec` is what its
 * file says — the repositories it works on, the workflows it offers, its hires by `<workflow>/<step>`, its volumes, its harness settings,
 * whether its runs follow merged revisions, the template it was applied from and its own level — and its `status` what the controller
 * last observed of it: the generation it read, its conditions, the template's version its base holds, an upgrade waiting, its places a
 * harness does not trust now, and why its file does not read. Its `metadata.generation` counts the changes to its spec.
 *
 * Beside it, its sub-resources: its rules (`FactoryRules`), its instruction (`FactoryInstruction`) and the lines a person types for it
 * (`FactoryCommands`), with the bodies their writes are sent. The rules and the instruction share the Factory's `resourceVersion`, as a
 * Kubernetes subresource shares its object's: a write of either moves it, as a change of its spec or its status does. Plain Schemas of
 * JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import {
  FACTORY_CONDITION_REASONS,
  FACTORY_CONDITION_STATUSES,
  FACTORY_CONDITION_TYPES,
  LEVELS,
  PROPOSAL_PHASES,
  REVISIONS_POLICIES,
} from './words.ts';

/** A folder of the person's machine the factory mounts for every local step: its stored name, its path, and whether steps only read it. */
export const FactoryVolume = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  path: Schema.String,
  readOnly: Schema.Boolean,
});
export type FactoryVolume = typeof FactoryVolume.Type;

/** The template a factory was applied from: its source (a path, or a builtin template's name), the version wanted, its parameters. */
export const FactoryTemplate = Schema.Struct({
  source: Schema.String,
  version: Schema.String,
  params: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
});
export type FactoryTemplate = typeof FactoryTemplate.Type;

/** A factory's harness settings, by harness, each a record of the settings its file names, as the file holds them. */
export const HarnessSettings = Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown));
export type HarnessSettings = typeof HarnessSettings.Type;

/**
 * What a factory's file says: its repositories; the workflows it offers, absent on the default factory, which offers every workflow
 * found; its hires, `<workflow>/<step>` to an agent's name; its volumes; and, where its file names them, its harness settings, its
 * revisions policy, the template it was applied from, its own level (absent where it follows the store's), and its cost line per
 * workflow: the dollars a run of that workflow should stay under, all tries and rounds included (absent where it sets none).
 */
export const FactorySpec = Schema.Struct({
  repos: Schema.Array(Schema.String),
  workflows: Schema.optionalKey(Schema.Array(Schema.String)),
  hires: Schema.Record(Schema.String, Schema.String),
  volumes: Schema.Array(FactoryVolume),
  harnessSettings: Schema.optionalKey(HarnessSettings),
  revisions: Schema.optionalKey(Schema.Literals(REVISIONS_POLICIES)),
  template: Schema.optionalKey(FactoryTemplate),
  level: Schema.optionalKey(Schema.Literals(LEVELS)),
  costLines: Schema.optionalKey(Schema.Record(Schema.String, Schema.Finite)),
});
export type FactorySpec = typeof FactorySpec.Type;

/**
 * A condition of a templated factory, as Kubernetes words one: its type, `True` or `False`, a reason in one word, a sentence, and when
 * its status last changed (absent on a status written before it was kept).
 */
export const FactoryCondition = Schema.Struct({
  type: Schema.Literals(FACTORY_CONDITION_TYPES),
  status: Schema.Literals(FACTORY_CONDITION_STATUSES),
  reason: Schema.Literals(FACTORY_CONDITION_REASONS),
  message: Schema.String,
  lastTransitionTime: Schema.optionalKey(Schema.String),
});
export type FactoryCondition = typeof FactoryCondition.Type;

/** A side of an upgrade's conflict: its text, cut, or null where that side has none. */
const Side = Schema.NullOr(Schema.String);

/**
 * The proposal a conflict's resolution waits on, where a proposal resolves it (a text file directly in a workflow's folder): its name and
 * its phase now, null where the store holds it no more.
 */
const ConflictProposal = Schema.Struct({ name: Schema.String, phase: Schema.NullOr(Schema.Literals(PROPOSAL_PHASES)) });

/**
 * An upgrade waiting on the person: the version it is from and to, and each conflict still without a choice, its sides cut, with the
 * proposal its resolution waits on where one was made.
 */
export const FactoryUpgrade = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  conflicts: Schema.Array(
    Schema.Struct({ at: Schema.String, base: Side, ours: Side, theirs: Side, proposal: Schema.optionalKey(ConflictProposal) }),
  ),
});
export type FactoryUpgrade = typeof FactoryUpgrade.Type;

/**
 * A place of the factory a harness does not trust now: the place, the harness by the name a person reads, what is withheld from the
 * place's own settings meanwhile, and why no trust can be kept for it, where none can.
 */
export const FactoryUntrusted = Schema.Struct({
  place: Schema.String,
  harness: Schema.String,
  withheld: Schema.String,
  never: Schema.optionalKey(Schema.String),
});
export type FactoryUntrusted = typeof FactoryUntrusted.Type;

/**
 * What the controller last observed of the factory: the generation of its spec it read (`observedGeneration`), its conditions (none on a
 * factory filed by hand, and before its first render), the template's version its base holds (`applied`), the upgrade waiting on the
 * person, its places a harness does not trust now, and why its file does not read (`error`, absent on a factory that reads).
 */
export const FactoryStatus = Schema.Struct({
  observedGeneration: Schema.optionalKey(Schema.Number),
  conditions: Schema.Array(FactoryCondition),
  applied: Schema.optionalKey(Schema.String),
  upgrade: Schema.optionalKey(FactoryUpgrade),
  untrusted: Schema.Array(FactoryUntrusted),
  error: Schema.optionalKey(Schema.String),
});
export type FactoryStatus = typeof FactoryStatus.Type;

/** A factory, as an object. */
export const Factory = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Factory'),
  metadata: ObjectMeta,
  spec: FactorySpec,
  status: FactoryStatus,
});
export type Factory = typeof Factory.Type;

/** A page of the factories, the default one first. */
export const FactoryList = listOf('Factory', Factory);
export type FactoryList = typeof FactoryList.Type;

/**
 * A factory's rules: the factory, the file they are kept in, their words (null where none are kept), why that file does not read (null
 * where it does), whether a delete removed them, and the revision of them a run resolves, where one is kept.
 */
export const FactoryRules = Schema.Struct({
  name: Schema.String,
  file: Schema.String,
  words: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  removed: Schema.optionalKey(Schema.Boolean),
  revision: Schema.optionalKey(Schema.String),
});
export type FactoryRules = typeof FactoryRules.Type;

/** A factory's rules written (`PUT …/rules`): what every agent hired into it is told. */
export const FactoryRulesWrite = Schema.Struct({ words: Schema.String });
export type FactoryRulesWrite = typeof FactoryRulesWrite.Type;

/** What a person writes of a factory's cost line for one workflow: its dollars. */
export const FactoryCostLineWrite = Schema.Struct({ usd: Schema.Finite });
export type FactoryCostLineWrite = typeof FactoryCostLineWrite.Type;

/**
 * A factory's instruction: the factory, the path its file names (null for none), whether the store keeps it, the file it is read from,
 * its words (null where none), why the file there does not read (null where it does), and whether the store keeps text for it.
 */
export const FactoryInstruction = Schema.Struct({
  name: Schema.String,
  path: Schema.NullOr(Schema.String),
  store: Schema.Boolean,
  file: Schema.String,
  words: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  stored: Schema.Boolean,
});
export type FactoryInstruction = typeof FactoryInstruction.Type;

/** Where a factory's instruction is kept (`PUT …/instruction`): a file in its first folder, by its path, or the store. */
export const FactoryInstructionWrite = Schema.Union([
  Schema.Struct({ path: Schema.String }),
  Schema.Struct({ store: Schema.Literal(true) }),
]);
export type FactoryInstructionWrite = typeof FactoryInstructionWrite.Type;

/** The text the store keeps for a factory's instruction (`PUT …/instruction/words`). */
export const FactoryInstructionWords = Schema.Struct({ words: Schema.String });
export type FactoryInstructionWords = typeof FactoryInstructionWords.Type;

/**
 * The lines a person types for a factory, built off the command table: a workflow attached, its file removed and filed again, a workflow
 * scheduled, its places trusted again, a volume mounted; and, by name, the line that takes back each schedule (by its workflow) and each
 * volume (by its stored name).
 */
export const FactoryCommands = Schema.Struct({
  attach: Schema.String,
  rm: Schema.String,
  add: Schema.String,
  schedule: Schema.String,
  trust: Schema.String,
  volume: Schema.String,
  unschedule: Schema.Record(Schema.String, Schema.String),
  volumeRm: Schema.Record(Schema.String, Schema.String),
});
export type FactoryCommands = typeof FactoryCommands.Type;
