/**
 * The Factory: a factory served as an object, which no namespace holds (it is the namespace its parts are in). Its `spec` is what its
 * file says — the repositories it works on, the workflows it offers, its hires by `<workflow>/<step>`, its volumes, its harness settings,
 * whether its runs follow merged revisions, the template it was applied from and its own level — and its `status` what the controller
 * last observed of it: the generation it read, its conditions, the template's version its base holds, an upgrade waiting, its places a
 * harness does not trust now, and why its file does not read. Its `metadata.generation` counts the changes to its spec.
 *
 * Beside it, its sub-resources: its rules (`FactoryRules`), its instruction (`FactoryInstruction`) and the lines a person types for it
 * (`FactoryCommands`), with the bodies their writes are sent; and what its other writes are sent and answer: its revisions policy, a
 * harness setting, its places trusted again (`FactoryTrusted`) and its removal (`FactoryRemoved`). The rules and the instruction share
 * the Factory's `resourceVersion`, as a Kubernetes subresource shares its object's: a write of either moves it, as a change of its spec
 * or its status does.
 *
 * And the writes that name a template or a folder, with what each answers: a factory filed (`FactoryCreate`, `FactoryCreated`), a volume
 * mounted and taken off (`VolumeWrite`, `VolumeAdded`, `VolumeRemoved`), a factory made from a template (`FactoryApplyWrite`,
 * `FactoryApplied`), a hand-made one taken over by one (`FactoryAdoptWrite`, `FactoryAdopted`), the preview of either change
 * (`FactoryDiffWrite`, `FactoryPlan`), an upgrade filed (`FactoryUpgradeWrite`, `FactoryUpgraded`) and a conflict's choice
 * (`FactoryResolveWrite`, `FactoryResolved`). A template travels as `TemplateGiven`: a builtin template by its name, any other packed as
 * `nemia template pack` packs it; a repository's or a volume's path names a folder of the machine the api runs on, and a repository may
 * be a git URL instead, which that machine clones under its store. Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { FactoryWritten } from './written.ts';
import {
  FACTORY_CONDITION_REASONS,
  FACTORY_CONDITION_STATUSES,
  FACTORY_CONDITION_TYPES,
  LEVELS,
  PROPOSABLE_KINDS,
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
 * workflow: the dollars a run of that workflow should stay under, all tries and rounds included (absent where it sets none); and the
 * git URL each of its repositories named by one is cloned from, by the repository's folder (absent where it was given none); and the
 * repository each workflow it attaches works on, by the workflow's name to the repository's folder name (`nemia factory attach <factory>
 * <workflow>
 * --repo <name>`), absent where it names none: a workflow it names none for works on its only repository.
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
  origins: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  workflowRepos: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
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

/** A factory, as an object; a write's answer says what it wrote (`written`). */
export const Factory = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Factory'),
  metadata: ObjectMeta,
  spec: FactorySpec,
  status: FactoryStatus,
  written: Schema.optionalKey(FactoryWritten),
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

/**
 * A workflow attached to a factory (`nemia factory attach <factory> <workflow> [--repo <name>]`): the folder name of the repository of
 * the factory its
 * runs work on, required where the factory has several, absent to keep what its wiring names. An empty body attaches as before.
 */
export const FactoryAttachWrite = Schema.Struct({ repo: Schema.optionalKey(Schema.String) });
export type FactoryAttachWrite = typeof FactoryAttachWrite.Type;

/** A factory's rules written (`PUT …/rules`): what every agent hired into it is told. */
export const FactoryRulesWrite = Schema.Struct({ words: Schema.String });
export type FactoryRulesWrite = typeof FactoryRulesWrite.Type;

/** What a person writes of a factory's cost line for one workflow: its dollars. */
export const FactoryCostLineWrite = Schema.Struct({ usd: Schema.Finite });
export type FactoryCostLineWrite = typeof FactoryCostLineWrite.Type;

/** What a person writes of a factory's revisions policy (`PUT …/revisions`): whether its runs follow merged revisions or keep them. */
export const FactoryRevisionsWrite = Schema.Struct({ revisions: Schema.Literals(REVISIONS_POLICIES) });
export type FactoryRevisionsWrite = typeof FactoryRevisionsWrite.Type;

/**
 * What a person writes of one harness setting of a factory (`PUT …/settings/<harness>.<key>`): its value as JSON text, as the command
 * line takes it (`'{"commit":"","pr":""}'`, `'"french"'`, `false`), so a JSON string value is told from the text of another.
 */
export const FactorySettingWrite = Schema.Struct({ value: Schema.String });
export type FactorySettingWrite = typeof FactorySettingWrite.Type;

/**
 * What was asked for one place of a factory as its trust was asked again: the harness by the name a person reads, the folder the harness
 * keeps its trust under, what the trust grants, how to take it back, whether it was written now and why it could not be (null where it
 * was or where it was given already); or that the place was not asked at all, and why (`unasked`).
 */
export const FactoryPlaceTrust = Schema.Union([
  Schema.Struct({
    place: Schema.String,
    harness: Schema.String,
    folder: Schema.String,
    grants: Schema.String,
    back: Schema.String,
    wrote: Schema.Boolean,
    refused: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({ place: Schema.String, unasked: Schema.String }),
]);
export type FactoryPlaceTrust = typeof FactoryPlaceTrust.Type;

/** A factory's places trusted again (`POST …/trust`): the factory, and what was asked for each place, one a harness that keeps a trust. */
export const FactoryTrusted = Schema.Struct({ name: Schema.String, trusts: Schema.Array(FactoryPlaceTrust) });
export type FactoryTrusted = typeof FactoryTrusted.Type;

/**
 * A factory removed (`DELETE /api/factories/<name>`): the factory, the file removed, and the folder of the instruction and the rules the
 * store kept for it, removed whole (null where it kept none). A trust given to its places is left.
 */
export const FactoryRemoved = Schema.Struct({ name: Schema.String, file: Schema.String, instruction: Schema.NullOr(Schema.String) });
export type FactoryRemoved = typeof FactoryRemoved.Type;

/**
 * A factory's instruction: the factory, the path its file names (null for none), whether the store keeps it, the file it is read from,
 * its words (null where none), why the file there does not read (null where it does), whether the store keeps text for it, and, on the
 * answer of a delete of that text alone, whether there was any to take off (`removed`).
 */
export const FactoryInstruction = Schema.Struct({
  name: Schema.String,
  path: Schema.NullOr(Schema.String),
  store: Schema.Boolean,
  file: Schema.String,
  words: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  stored: Schema.Boolean,
  removed: Schema.optionalKey(Schema.Boolean),
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

/**
 * A template as a request gives it: a builtin's name (`{ name }`), a folder or archive packed as `nemia template pack` packs one, in
 * base64 (`{ archive }`), or a folder or archive of the api's machine by its whole path, read again on every pass (`{ path }`).
 */
export const TemplateGiven = Schema.Union([
  Schema.Struct({ name: Schema.String }),
  Schema.Struct({ archive: Schema.String }),
  Schema.Struct({ path: Schema.String }),
]);
export type TemplateGiven = typeof TemplateGiven.Type;

/**
 * A factory filed (`POST /api/factories`): its name, its repositories, each a folder of the machine the api runs on by its whole path
 * or a git URL that machine clones under its store, and, with `noTrust`, its places left untrusted. A key left out is refused by the
 * verb, in the command line's words.
 */
export const FactoryCreate = Schema.Struct({
  name: Schema.String,
  repos: Schema.optionalKey(Schema.Array(Schema.String)),
  noTrust: Schema.optionalKey(Schema.Boolean),
});
export type FactoryCreate = typeof FactoryCreate.Type;

/** What a filing answers: the factory, its repositories, its file, and what was asked for each of its places' trust. */
export const FactoryCreated = Schema.Struct({
  name: Schema.String,
  repos: Schema.Array(Schema.String),
  file: Schema.String,
  trusts: Schema.Array(FactoryPlaceTrust),
});
export type FactoryCreated = typeof FactoryCreated.Type;

/**
 * A volume mounted for a factory's runs (`POST /api/factories/<factory>/volumes`): a folder of the machine the api runs on by its whole
 * path, marked `:ro` or `:rw`, as `nemia factory volume add` spells it.
 */
export const VolumeWrite = Schema.Struct({ volume: Schema.String });
export type VolumeWrite = typeof VolumeWrite.Type;

/** A volume mounted: the factory's file written, the volume, and what a volume of its path was marked before (null for none). */
export const VolumeAdded = Schema.Struct({ file: Schema.String, volume: FactoryVolume, was: Schema.NullOr(Schema.Boolean) });
export type VolumeAdded = typeof VolumeAdded.Type;

/** A volume taken off (`DELETE /api/factories/<factory>/volumes?path=`): the factory's file written, and the path it mounts no more. */
export const VolumeRemoved = Schema.Struct({ file: Schema.String, removed: Schema.String });
export type VolumeRemoved = typeof VolumeRemoved.Type;

/**
 * A factory made from a template (`POST /api/factories/<name>/apply`): the template, its repositories, each a folder of the machine the api
 * runs on or a git URL that machine clones under its store, its parameters as `--set` words (`<key>=<value>`), and, with `noTrust`, its
 * places left untrusted. A template or the repositories left out are refused by the verb, in the command line's words.
 */
export const FactoryApplyWrite = Schema.Struct({
  template: Schema.optionalKey(TemplateGiven),
  repos: Schema.optionalKey(Schema.Array(Schema.String)),
  sets: Schema.optionalKey(Schema.Array(Schema.String)),
  noTrust: Schema.optionalKey(Schema.Boolean),
});
export type FactoryApplyWrite = typeof FactoryApplyWrite.Type;

/**
 * What an apply filed: the factory, its repositories, its file, the template it was made from and where that is read, the tree it runs
 * from, and what was asked for each of its places' trust.
 */
export const FactoryApplied = Schema.Struct({
  name: Schema.String,
  repos: Schema.Array(Schema.String),
  file: Schema.String,
  template: FactoryTemplate,
  place: Schema.String,
  tree: Schema.String,
  trusts: Schema.Array(FactoryPlaceTrust),
});
export type FactoryApplied = typeof FactoryApplied.Type;

/**
 * A hand-made factory taken over by a template (`POST /api/factories/<factory>/adopt`): the template, its parameters as `--set` words,
 * and the digest of the plan its preview printed (`plan`); the template or the plan left out refused by the verb, in its words.
 */
export const FactoryAdoptWrite = Schema.Struct({
  template: Schema.optionalKey(TemplateGiven),
  sets: Schema.optionalKey(Schema.Array(Schema.String)),
  plan: Schema.optionalKey(Schema.String),
});
export type FactoryAdoptWrite = typeof FactoryAdoptWrite.Type;

/** What a takeover wrote: the factory, its file, the template it is now made from, and the tree it runs from. */
export const FactoryAdopted = Schema.Struct({
  name: Schema.String,
  file: Schema.String,
  template: FactoryTemplate,
  tree: Schema.String,
});
export type FactoryAdopted = typeof FactoryAdopted.Type;

/**
 * The preview of a factory's change (`POST /api/factories/<factory>/diff`), nothing written: of a templated factory, its upgrade to `to`,
 * from the template it names or another (`template`); of a hand-made one, its takeover by `template`; each with its parameters as `--set`
 * words.
 */
export const FactoryDiffWrite = Schema.Struct({
  to: Schema.optionalKey(Schema.String),
  template: Schema.optionalKey(TemplateGiven),
  sets: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type FactoryDiffWrite = typeof FactoryDiffWrite.Type;

/** Which side a cleanly merged file's change came from: the template's, the factory's, or both alike. */
export const MERGED_FROM = ['template', 'factory', 'both'] as const;

/** Whether an upgrade's merge has a common base, or none (a switch onto a template of another name). */
export const MERGE_BASES = ['common', 'none'] as const;

/** How a takeover changes one step's hire: hired by the template only, by the factory only, or by both, apart. */
export const HIRE_CHANGE_KINDS = ['added', 'dropped', 'changed'] as const;

/** A conflict of an upgrade's merge: its address, and each side's text, null where that side has none. */
const MergeConflict = Schema.Struct({ at: Schema.String, base: Side, ours: Side, theirs: Side });

/**
 * The preview of a templated factory's upgrade: the factory, the version its base holds (absent where no status names it) and the one
 * wanted, what merges cleanly and from which side, each conflict, the line that files it with the plan's digest and the parameters it
 * drops, and, onto a template of another name, the switch.
 */
export const FactoryUpgradePlan = Schema.Struct({
  kind: Schema.Literal('upgrade'),
  name: Schema.String,
  from: Schema.optionalKey(Schema.String),
  to: Schema.String,
  merge: Schema.Struct({
    base: Schema.Literals(MERGE_BASES),
    merged: Schema.Array(Schema.Struct({ at: Schema.String, from: Schema.Literals(MERGED_FROM) })),
    conflicts: Schema.Array(MergeConflict),
  }),
  next: Schema.Struct({ line: Schema.String, digest: Schema.String, dropped: Schema.Array(Schema.String) }),
  switched: Schema.optionalKey(Schema.Struct({ from: Schema.String, to: Schema.String })),
});
export type FactoryUpgradePlan = typeof FactoryUpgradePlan.Type;

/**
 * The preview of a hand-made factory's takeover by a template: what it keeps, the workflows added, dropped and kept, each hire changed,
 * the revisions policy before and after, the store's rules no longer read (their file, null where they hold no words), its runs waiting
 * or in flight and the policy they follow after, and each card and schedule it would strand; with the plan's digest and the adopt line.
 */
export const FactoryAdoptPlan = Schema.Struct({
  kind: Schema.Literal('adopt'),
  plan: Schema.Struct({
    factory: Schema.String,
    kept: Schema.Struct({
      repos: Schema.Array(Schema.String),
      schedules: Schema.Array(Schema.String),
      instruction: Schema.Boolean,
      volumes: Schema.Array(Schema.String),
      settings: Schema.Array(Schema.String),
    }),
    workflows: Schema.Struct({
      added: Schema.Array(Schema.String),
      dropped: Schema.Array(Schema.String),
      kept: Schema.Array(Schema.String),
    }),
    hires: Schema.Array(
      Schema.Struct({
        step: Schema.String,
        kind: Schema.Literals(HIRE_CHANGE_KINDS),
        was: Schema.optionalKey(Schema.String),
        now: Schema.optionalKey(Schema.String),
      }),
    ),
    revisions: Schema.Struct({ was: Schema.Literals(REVISIONS_POLICIES), now: Schema.Literals(REVISIONS_POLICIES) }),
    rules: Schema.NullOr(Schema.String),
    runs: Schema.Struct({ ids: Schema.Array(Schema.String), policy: Schema.Literals(REVISIONS_POLICIES) }),
    stranded: Schema.Struct({
      cards: Schema.Array(Schema.Struct({ name: Schema.String, workflow: Schema.NullOr(Schema.String), started: Schema.Boolean })),
      schedules: Schema.Array(Schema.String),
    }),
  }),
  digest: Schema.String,
  line: Schema.String,
});
export type FactoryAdoptPlan = typeof FactoryAdoptPlan.Type;

/** What a preview answers: a templated factory's upgrade, or a hand-made one's takeover, told apart by `kind`. */
export const FactoryPlan = Schema.Union([FactoryUpgradePlan, FactoryAdoptPlan]);
export type FactoryPlan = typeof FactoryPlan.Type;

/**
 * An upgrade filed (`POST /api/factories/<factory>/upgrade`): the version wanted, the template where it is read from another, the
 * parameters as `--set` words, the digest of the plan its preview printed (`plan`), and, for a version below the one applied, `downgrade`.
 */
export const FactoryUpgradeWrite = Schema.Struct({
  to: Schema.optionalKey(Schema.String),
  template: Schema.optionalKey(TemplateGiven),
  sets: Schema.optionalKey(Schema.Array(Schema.String)),
  plan: Schema.optionalKey(Schema.String),
  downgrade: Schema.optionalKey(Schema.Boolean),
});
export type FactoryUpgradeWrite = typeof FactoryUpgradeWrite.Type;

/**
 * What an upgrade filed: the factory, the version its base holds (absent where no status names it) and the one wanted, its file, the
 * parameters it drops, and how many conflicts wait for a choice.
 */
export const FactoryUpgraded = Schema.Struct({
  name: Schema.String,
  from: Schema.optionalKey(Schema.String),
  to: Schema.String,
  file: Schema.String,
  dropped: Schema.Array(Schema.String),
  conflicts: Schema.Number,
});
export type FactoryUpgraded = typeof FactoryUpgraded.Type;

/**
 * The person's choice for one conflict of an upgrade (`POST /api/factories/<factory>/resolve`): the conflict, as the preview names it,
 * and one of `ours`, `theirs` and `text`, the words it becomes — the text of a file, never its path.
 */
export const FactoryResolveWrite = Schema.Struct({
  conflict: Schema.String,
  ours: Schema.optionalKey(Schema.Boolean),
  theirs: Schema.optionalKey(Schema.Boolean),
  text: Schema.optionalKey(Schema.String),
});
export type FactoryResolveWrite = typeof FactoryResolveWrite.Type;

/**
 * What a choice wrote: the factory, the conflict, the version, the file the choices are kept in, the conflicts still without one, the
 * object proposed as the choices of its conflicts compose it where one was (its kind, name and proposal), and the proposals the merge
 * waits on.
 */
export const FactoryResolved = Schema.Struct({
  name: Schema.String,
  at: Schema.String,
  to: Schema.String,
  file: Schema.String,
  left: Schema.Array(Schema.String),
  proposed: Schema.optionalKey(Schema.Struct({ kind: Schema.Literals(PROPOSABLE_KINDS), name: Schema.String, proposal: Schema.String })),
  waits: Schema.Array(Schema.String),
});
export type FactoryResolved = typeof FactoryResolved.Type;
