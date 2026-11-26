/**
 * The Factory: a factory served as an object, which no namespace holds (it is the namespace its parts are in). Its `spec` is what its
 * record says — its volumes, the writable ones those it works on, the workflows it offers, its hires by `<workflow>/<step>`, its harness
 * settings,
 * whether its runs follow merged revisions, the template it was applied from and its own level — and its `status` what the controller
 * last observed of it: the generation it read, its conditions, the template's version its base holds, an upgrade waiting, its places a
 * harness does not trust now, and why its record does not read. Its `metadata.generation` counts the changes to its spec.
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
 * `nemia template pack` packs it; a volume's path names a folder of the machine the api runs on, and a volume may be a git URL instead,
 * which that machine clones under its store. Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, describedNumber, describedOne, listOf } from './meta.ts';
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

/**
 * A folder or repository of the person's machine the factory reaches: its stored name, its path, whether steps only read it, and the git
 * URL it was cloned from where it was given by one. A writable volume is one the factory works on, a git repository its runs work in.
 */
export const FactoryVolume = Schema.Struct({
  name: Schema.optionalKey(Schema.String.annotate({ description: "The volume's stored name; absent where it was mounted without one." })),
  path: Schema.String.annotate({ description: 'The folder of the machine it mounts, by its whole path.' }),
  readOnly: Schema.Boolean.annotate({
    description: 'Whether steps only read the folder (:ro); a writable one (:rw) is a repository the factory works on.',
  }),
  origin: Schema.optionalKey(
    Schema.String.annotate({ description: 'The git URL the folder was cloned from; absent where it was given by its path.' }),
  ),
  claudeMd: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: "Whether the volume's CLAUDE.md files reach the factory's sessions; absent is off.",
    }),
  ),
  skills: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: "Whether the skills of the volume's .claude/skills are offered to the factory's sessions; absent is on.",
    }),
  ),
});
export type FactoryVolume = typeof FactoryVolume.Type;

/** The template a factory was applied from: its source (a path, or a builtin template's name), the version wanted, its parameters. */
export const FactoryTemplate = Schema.Struct({
  source: Schema.String.annotate({ description: "The template's source: a path, or a builtin template's name." }),
  version: Schema.String.annotate({ description: 'The version of the template wanted.' }),
  params: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])).annotate({
    description: "The template's parameters, each a name to its string, number or boolean value.",
  }),
});
export type FactoryTemplate = typeof FactoryTemplate.Type;

/** A factory's harness settings, by harness, each a record of the settings its record names, as the record holds them. */
export const HarnessSettings = Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown));
export type HarnessSettings = typeof HarnessSettings.Type;

/**
 * What a factory's record says: its volumes, the folders and repositories it reaches, its writable ones those it works on; the workflows it
 * offers, absent on the default factory, which offers every workflow
 * found; its hires, `<workflow>/<step>` to an agent's name; and, where its record names them, its harness settings, its
 * revisions policy, the template it was applied from, its own level (absent where it follows the store's), and its cost line per
 * workflow: the dollars a run of that workflow should stay under, all tries and rounds included (absent where it sets none); and the
 * repository each workflow it attaches works on, by the workflow's name to the repository's folder name (`nemia factory attach <factory>
 * <workflow>
 * --repo <name>`), absent where it names none: a workflow it names none for works on its only repository; and the values each label key
 * it names takes (`labelValues`), absent where it names none: a label of such a key, written with another value, is refused.
 */
export const FactorySpec = Schema.Struct({
  workflows: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: 'The workflows it offers, by name; absent on the default factory, which offers every workflow found.',
    }),
  ),
  hires: Schema.Record(Schema.String, Schema.String).annotate({
    description: 'Its hires, each a `<workflow>/<step>` to the name of the agent hired for it.',
  }),
  volumes: Schema.Array(FactoryVolume).annotate({
    description: 'The folders and repositories it reaches, each read-only or writable: a writable one is a repository it works on.',
  }),
  harnessSettings: Schema.optionalKey(
    HarnessSettings.annotate({
      description: 'Its harness settings, by harness, each a record of the settings its record names; absent where its record names none.',
    }),
  ),
  revisions: Schema.optionalKey(
    Schema.Literals(REVISIONS_POLICIES).annotate({
      description: 'Whether its runs follow merged revisions or keep the ones they started on; absent where its record names none.',
    }),
  ),
  template: Schema.optionalKey(
    FactoryTemplate.annotate({ description: 'The template it was applied from; absent on a hand-made factory.' }),
  ),
  level: Schema.optionalKey(Schema.Literals(LEVELS).annotate({ description: "Its own level; absent where it follows the store's." })),
  costLines: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Finite).annotate({
      description:
        "The dollars a run of each workflow should stay under, all tries and rounds included, by the workflow's name; absent where it sets none.",
    }),
  ),
  workflowRepos: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String).annotate({
      description:
        "The repository each workflow it attaches works on, by the workflow's name to the repository's folder name; absent where it names none.",
    }),
  ),
  labelValues: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Array(Schema.String)).annotate({
      description:
        'The values each label key it names takes on its cards and runs: a label of such a key given another value is refused where it is written; absent where it names none.',
    }),
  ),
}).annotate({
  description: "What the factory's record says: its volumes, workflows, hires, settings, template, level and cost lines.",
});
export type FactorySpec = typeof FactorySpec.Type;

/**
 * A condition of a templated factory, as Kubernetes words one: its type, `True` or `False`, a reason in one word, a sentence, and when
 * its status last changed (absent on a status written before it was kept).
 */
export const FactoryCondition = Schema.Struct({
  type: Schema.Literals(FACTORY_CONDITION_TYPES).annotate({ description: 'What the condition is about.' }),
  status: Schema.Literals(FACTORY_CONDITION_STATUSES).annotate({ description: 'Whether it holds: True or False.' }),
  reason: Schema.Literals(FACTORY_CONDITION_REASONS).annotate({ description: 'Why it has this status, in one word.' }),
  message: Schema.String.annotate({ description: 'A sentence saying it in words.' }),
  lastTransitionTime: Schema.optionalKey(
    Schema.String.annotate({
      description: 'When its status last changed, as an ISO 8601 time; absent on a status written before it was kept.',
    }),
  ),
});
export type FactoryCondition = typeof FactoryCondition.Type;

/** A side of an upgrade's conflict: its text, cut, or null where that side has none. */
const Side = Schema.NullOr(Schema.String);

/**
 * The proposal a conflict's resolution waits on, where a proposal resolves it (a text file directly in a workflow's folder): its name and
 * its phase now, null where the store holds it no more.
 */
const ConflictProposal = Schema.Struct({
  name: Schema.String.annotate({ description: "The proposal's name." }),
  phase: Schema.NullOr(Schema.Literals(PROPOSAL_PHASES)).annotate({ description: 'Its phase now; null where the store holds it no more.' }),
});

/**
 * An upgrade waiting on the person: the version it is from and to, and each conflict still without a choice, its sides cut, with the
 * proposal its resolution waits on where one was made.
 */
export const FactoryUpgrade = Schema.Struct({
  from: Schema.String.annotate({ description: 'The version the factory is upgrading from.' }),
  to: Schema.String.annotate({ description: 'The version it is upgrading to.' }),
  conflicts: Schema.Array(
    Schema.Struct({
      at: Schema.String.annotate({ description: 'The address of the conflicting file.' }),
      base: Side.annotate({ description: 'The text of the common base, cut; null where it has none.' }),
      ours: Side.annotate({ description: "The text of the factory's side, cut; null where it has none." }),
      theirs: Side.annotate({ description: "The text of the template's side, cut; null where it has none." }),
      proposal: Schema.optionalKey(
        ConflictProposal.annotate({ description: 'The proposal its resolution waits on; absent where none was made.' }),
      ),
    }),
  ).annotate({ description: 'Each conflict still without a choice, its sides cut.' }),
});
export type FactoryUpgrade = typeof FactoryUpgrade.Type;

/**
 * A place of the factory a harness does not trust now: the place, the harness by the name a person reads, what is withheld from the
 * place's own settings meanwhile, and why no trust can be kept for it, where none can.
 */
export const FactoryUntrusted = Schema.Struct({
  place: Schema.String.annotate({ description: 'The place of the factory that is not trusted.' }),
  harness: Schema.String.annotate({ description: 'The harness, by the name a person reads.' }),
  withheld: Schema.String.annotate({ description: "What is withheld from the place's own settings meanwhile." }),
  never: Schema.optionalKey(Schema.String.annotate({ description: 'Why no trust can be kept for the place; absent where one can.' })),
});
export type FactoryUntrusted = typeof FactoryUntrusted.Type;

/**
 * What the controller last observed of the factory: the generation of its spec it read (`observedGeneration`), its conditions (none on a
 * factory filed by hand, and before its first render), the template's version its base holds (`applied`), the upgrade waiting on the
 * person, its places a harness does not trust now, and why its record does not read (`error`, absent on a factory that reads).
 */
export const FactoryStatus = Schema.Struct({
  observedGeneration: Schema.optionalKey(describedNumber('The generation of the spec the controller last read.')),
  conditions: Schema.Array(FactoryCondition).annotate({
    description: 'Its conditions; none on a factory filed by hand and before its first render.',
  }),
  applied: Schema.optionalKey(Schema.String.annotate({ description: "The template's version its base holds." })),
  upgrade: Schema.optionalKey(FactoryUpgrade.annotate({ description: 'The upgrade waiting on the person.' })),
  untrusted: Schema.Array(FactoryUntrusted).annotate({ description: 'Its places a harness does not trust now.' }),
  error: Schema.optionalKey(Schema.String.annotate({ description: 'Why its record does not read; absent on a factory that reads.' })),
}).annotate({
  description:
    'What the controller last observed of the factory: its conditions, the template version applied, an upgrade waiting, its untrusted places, and why its record does not read.',
});
export type FactoryStatus = typeof FactoryStatus.Type;

/** A factory, as an object; a write's answer says what it wrote (`written`). */
export const Factory = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Factory').annotate({
    description: 'What the object is: a Factory, a team of workflows working on its repositories.',
  }),
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
  name: Schema.String.annotate({ description: 'The factory.' }),
  file: Schema.String.annotate({ description: 'The file its rules are kept in.' }),
  words: Schema.NullOr(Schema.String).annotate({ description: 'The rules, as text; null where none are kept.' }),
  error: Schema.NullOr(Schema.String).annotate({ description: 'Why that file does not read; null where it does.' }),
  removed: Schema.optionalKey(
    Schema.Boolean.annotate({ description: 'Whether a delete removed the rules; present on the answer of a delete.' }),
  ),
  revision: Schema.optionalKey(
    Schema.String.annotate({ description: 'The revision of the rules a run resolves; absent where none is kept.' }),
  ),
});
export type FactoryRules = typeof FactoryRules.Type;

/**
 * A workflow attached to a factory (`nemia factory attach <factory> <workflow> [--repo <name>]`): the folder name of the repository of
 * the factory its
 * runs work on, required where the factory has several, absent to keep what its wiring names. An empty body attaches as before.
 */
export const FactoryAttachWrite = Schema.Struct({
  repo: Schema.optionalKey(
    Schema.String.annotate({
      description:
        'The folder name of the repository of the factory its runs work on, required where the factory has several; absent to keep what its wiring names.',
    }),
  ),
});
export type FactoryAttachWrite = typeof FactoryAttachWrite.Type;

/** A factory's rules written (`PUT …/rules`): what every agent hired into it is told. */
export const FactoryRulesWrite = Schema.Struct({
  words: Schema.String.annotate({ description: 'What every agent hired into the factory is told.' }),
});
export type FactoryRulesWrite = typeof FactoryRulesWrite.Type;

/** What a person writes of a factory's cost line for one workflow: its dollars. */
export const FactoryCostLineWrite = Schema.Struct({
  usd: describedOne(Schema.Finite, 'The dollars a run of the workflow should stay under.'),
});
export type FactoryCostLineWrite = typeof FactoryCostLineWrite.Type;

/** What a person writes of a factory's revisions policy (`PUT …/revisions`): whether its runs follow merged revisions or keep them. */
export const FactoryRevisionsWrite = Schema.Struct({
  revisions: Schema.Literals(REVISIONS_POLICIES).annotate({
    description: "Whether the factory's runs follow merged revisions or keep them.",
  }),
});
export type FactoryRevisionsWrite = typeof FactoryRevisionsWrite.Type;

/**
 * What a person writes of one harness setting of a factory (`PUT …/settings/<harness>.<key>`): its value as JSON text, as the command
 * line takes it (`'{"commit":"","pr":""}'`, `'"french"'`, `false`), so a JSON string value is told from the text of another.
 */
export const FactorySettingWrite = Schema.Struct({
  value: Schema.String.annotate({ description: "The setting's value as JSON text, as the command line takes it." }),
});
export type FactorySettingWrite = typeof FactorySettingWrite.Type;

/**
 * What was asked for one place of a factory as its trust was asked again: the harness by the name a person reads, the folder the harness
 * keeps its trust under, what the trust grants, how to take it back, whether it was written now and why it could not be (null where it
 * was or where it was given already); or that the place was not asked at all, and why (`unasked`).
 */
export const FactoryPlaceTrust = Schema.Union([
  Schema.Struct({
    place: Schema.String.annotate({ description: 'The place of the factory the trust was asked for.' }),
    harness: Schema.String.annotate({ description: 'The harness, by the name a person reads.' }),
    folder: Schema.String.annotate({ description: 'The folder the harness keeps its trust under.' }),
    grants: Schema.String.annotate({ description: 'What the trust grants.' }),
    back: Schema.String.annotate({ description: 'How to take the trust back.' }),
    wrote: Schema.Boolean.annotate({ description: 'Whether the trust was written now.' }),
    refused: Schema.NullOr(Schema.String).annotate({
      description: 'Why the trust could not be written; null where it was, or where it was given already.',
    }),
  }),
  Schema.Struct({
    place: Schema.String.annotate({ description: 'The place of the factory that was not asked.' }),
    unasked: Schema.String.annotate({ description: 'Why the place was not asked at all.' }),
  }),
]);
export type FactoryPlaceTrust = typeof FactoryPlaceTrust.Type;

/** A factory's places trusted again (`POST …/trust`): the factory, and what was asked for each place, one a harness that keeps a trust. */
export const FactoryTrusted = Schema.Struct({
  name: Schema.String.annotate({ description: 'The factory whose places were trusted again (nemia factory trust).' }),
  trusts: Schema.Array(FactoryPlaceTrust).annotate({
    description:
      'What was asked for each place of the factory: the harness, the folder its trust is kept under, what it grants and how to take it back, or why the place was not asked.',
  }),
});
export type FactoryTrusted = typeof FactoryTrusted.Type;

/**
 * A factory removed (`DELETE /api/factories/<name>`): the factory, its record removed, and the folder of the instruction and the rules the
 * store kept for it, removed whole (null where it kept none). A trust given to its places is left.
 */
export const FactoryRemoved = Schema.Struct({
  name: Schema.String.annotate({ description: 'The factory removed.' }),
  file: Schema.String.annotate({ description: "The key of the factory's record that was removed." }),
  instruction: Schema.NullOr(Schema.String).annotate({
    description: 'The folder of the instruction and rules the store kept for it, removed whole; null where it kept none.',
  }),
});
export type FactoryRemoved = typeof FactoryRemoved.Type;

/**
 * A factory's instruction: the factory, the path its file names (null for none), whether the store keeps it, the file it is read from,
 * its words (null where none), why the file there does not read (null where it does), whether the store keeps text for it, and, on the
 * answer of a delete of that text alone, whether there was any to take off (`removed`).
 */
export const FactoryInstruction = Schema.Struct({
  name: Schema.String.annotate({ description: 'The factory.' }),
  path: Schema.NullOr(Schema.String).annotate({ description: 'The path its file names for the instruction; null for none.' }),
  store: Schema.Boolean.annotate({ description: 'Whether the store keeps the instruction.' }),
  file: Schema.String.annotate({ description: 'The file it is read from.' }),
  words: Schema.NullOr(Schema.String).annotate({ description: 'The instruction, as text; null where none.' }),
  error: Schema.NullOr(Schema.String).annotate({ description: 'Why the file there does not read; null where it does.' }),
  stored: Schema.Boolean.annotate({ description: 'Whether the store keeps text for it.' }),
  removed: Schema.optionalKey(
    Schema.Boolean.annotate({ description: 'Whether a delete of the stored text alone had any to take off; present on that answer.' }),
  ),
});
export type FactoryInstruction = typeof FactoryInstruction.Type;

/** Where a factory's instruction is kept (`PUT …/instruction`): a file in its first folder, by its path, or the store. */
export const FactoryInstructionWrite = Schema.Union([
  Schema.Struct({
    path: Schema.String.annotate({ description: "The path of a file in the factory's first folder that holds the instruction." }),
  }),
  Schema.Struct({ store: Schema.Literal(true).annotate({ description: 'True: the store keeps the instruction.' }) }),
]);
export type FactoryInstructionWrite = typeof FactoryInstructionWrite.Type;

/** The text the store keeps for a factory's instruction (`PUT …/instruction/words`). */
export const FactoryInstructionWords = Schema.Struct({
  words: Schema.String.annotate({ description: "The text the store keeps for the factory's instruction." }),
});
export type FactoryInstructionWords = typeof FactoryInstructionWords.Type;

/**
 * The lines a person types for a factory, built off the command table: a workflow attached, its file removed and filed again, a workflow
 * scheduled, its places trusted again, a volume mounted, a card trigger written; and, by name, the line that takes back each schedule (by
 * its workflow) and each volume (by its stored name).
 */
export const FactoryCommands = Schema.Struct({
  attach: Schema.String.annotate({ description: 'The line that attaches a workflow to the factory.' }),
  rm: Schema.String.annotate({ description: "The line that removes the factory's record." }),
  add: Schema.String.annotate({ description: 'The line that files the factory again.' }),
  schedule: Schema.String.annotate({ description: 'The line that schedules one of its workflows.' }),
  trust: Schema.String.annotate({ description: "The line that asks its places' trust again." }),
  volume: Schema.String.annotate({ description: 'The line that mounts a volume for its local steps.' }),
  trigger: Schema.String.annotate({ description: 'The line that writes a card trigger of the factory, by its name.' }),
  unschedule: Schema.Record(Schema.String, Schema.String).annotate({
    description: 'The line that takes back each schedule, by its workflow.',
  }),
  volumeRm: Schema.Record(Schema.String, Schema.String).annotate({
    description: 'The line that takes back each volume, by its stored name.',
  }),
  follow: Schema.optionalKey(
    Schema.Struct({
      host: Schema.String.annotate({ description: 'The host the parameter follows, as its template declares it (whenOrigin).' }),
      parameter: Schema.String.annotate({ description: "The template's boolean parameter that follows the host." }),
      line: Schema.String.annotate({
        description: "The line that previews the factory's parameter set true, which prints the line that files it.",
      }),
    }).annotate({
      description:
        "How the factory comes to work as a clone of its template's followed host would: absent where its template declares no parameter that follows one.",
    }),
  ),
  home: Schema.optionalKey(
    Schema.String.annotate({
      description: "The line that opens a person's own session in the factory's home; absent where the factory has no home.",
    }),
  ),
});
export type FactoryCommands = typeof FactoryCommands.Type;

/**
 * A template as a request gives it: a builtin's name (`{ name }`), a folder or archive packed as `nemia template pack` packs one, in
 * base64 (`{ archive }`), or a folder or archive of the api's machine by its whole path, read again on every pass (`{ path }`).
 */
export const TemplateGiven = Schema.Union([
  Schema.Struct({ name: Schema.String.annotate({ description: "A builtin template's name." }) }),
  Schema.Struct({
    archive: Schema.String.annotate({ description: 'A folder or archive packed as `nemia template pack` packs one, in base64.' }),
  }),
  Schema.Struct({
    path: Schema.String.annotate({ description: "A folder or archive of the api's machine, by its whole path, read again on every pass." }),
  }),
]);
export type TemplateGiven = typeof TemplateGiven.Type;

/**
 * A factory filed (`POST /api/factories`): its name, its volumes, none or several, each a folder of the machine the api runs on by its
 * whole path or a git URL that machine clones under its store, marked `:ro` or `:rw` as `nemia factory volume add` spells it, and, with
 * `noTrust`, its writable volumes left untrusted. A volume refused is refused by the verb, in the command line's words.
 */
export const FactoryCreate = Schema.Struct({
  name: Schema.String.annotate({ description: 'The name of the factory to file.' }),
  volumes: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description:
        'Its volumes, each a folder of the machine the api runs on by its whole path, or a git URL that machine clones, marked :ro or :rw.',
    }),
  ),
  noTrust: Schema.optionalKey(Schema.Boolean.annotate({ description: 'Whether to leave its places untrusted.' })),
});
export type FactoryCreate = typeof FactoryCreate.Type;

/** What a filing answers: the factory, its volumes, its record's key, and what was asked for each of its places' trust. */
export const FactoryCreated = Schema.Struct({
  name: Schema.String.annotate({ description: 'The factory filed.' }),
  volumes: Schema.Array(FactoryVolume).annotate({ description: 'Its volumes, none where it was filed with none.' }),
  file: Schema.String.annotate({ description: "Its record's key." }),
  trusts: Schema.Array(FactoryPlaceTrust).annotate({ description: "What was asked for each of its places' trust." }),
});
export type FactoryCreated = typeof FactoryCreated.Type;

/**
 * A volume given to a factory (`POST /api/factories/<factory>/volumes`): a folder of the machine the api runs on by its whole path, or a
 * git URL that machine clones, marked `:ro` or `:rw`, as `nemia factory volume add` spells it; with `noTrust`, a writable one left
 * untrusted.
 */
export const VolumeWrite = Schema.Struct({
  volume: Schema.String.annotate({
    description:
      'The folder of the machine the api runs on, by its whole path, or a git URL it clones, marked :ro or :rw, as `nemia factory volume add` spells it.',
  }),
  noTrust: Schema.optionalKey(Schema.Boolean.annotate({ description: 'Whether to leave a writable volume untrusted.' })),
  claudeMd: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: "Whether the volume's CLAUDE.md files reach the factory's sessions; absent keeps what it had, off for a new one.",
    }),
  ),
  skills: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: "Whether the volume's skills are offered to the factory's sessions; absent keeps what it had, on for a new one.",
    }),
  ),
});
export type VolumeWrite = typeof VolumeWrite.Type;

/**
 * A volume given: the factory's file written, the volume, what a volume of its path was marked before (null for none), and what was asked
 * of its trust, none for a read-only one or under `noTrust`.
 */
export const VolumeAdded = Schema.Struct({
  file: Schema.String.annotate({ description: "The key of the factory's record written." }),
  volume: FactoryVolume.annotate({ description: 'The volume mounted.' }),
  was: Schema.NullOr(Schema.Boolean).annotate({
    description: 'What a volume of its path was marked before: true if read-only, false if writable; null for none.',
  }),
  params: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: "The template's parameters the volume set, each <name>=<value>, as the factory's first writable one: absent for none.",
    }),
  ),
  trusts: Schema.Array(FactoryPlaceTrust).annotate({
    description: "What was asked of the volume's trust: none for a read-only one, or with noTrust.",
  }),
});
export type VolumeAdded = typeof VolumeAdded.Type;

/** A volume taken off (`DELETE /api/factories/<factory>/volumes?path=`): the factory's record written, and the path it mounts no more. */
export const VolumeRemoved = Schema.Struct({
  file: Schema.String.annotate({ description: "The key of the factory's record written." }),
  removed: Schema.String.annotate({ description: 'The path it mounts no more.' }),
});
export type VolumeRemoved = typeof VolumeRemoved.Type;

/**
 * A factory made from a template (`POST /api/factories/<name>/apply`): the template, its volumes, none or several, each a folder of the
 * machine the api runs on or a git URL that machine clones under its store, marked `:ro` or `:rw`, its parameters as `--set` words
 * (`<key>=<value>`), and, with `noTrust`, its places left untrusted. A template left out is refused by the verb, in the command line's
 * words.
 */
export const FactoryApplyWrite = Schema.Struct({
  template: Schema.optionalKey(TemplateGiven.annotate({ description: 'The template to make the factory from.' })),
  volumes: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description:
        'Its volumes, each a folder of the machine the api runs on by its whole path, or a git URL that machine clones, marked :ro or :rw.',
    }),
  ),
  sets: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({ description: "The template's parameters as `--set` words, `<key>=<value>`." }),
  ),
  noTrust: Schema.optionalKey(Schema.Boolean.annotate({ description: 'Whether to leave its places untrusted.' })),
});
export type FactoryApplyWrite = typeof FactoryApplyWrite.Type;

/**
 * What an apply filed: the factory, its volumes, its file, the template it was made from and where that is read, the tree it runs
 * from, and what was asked for each of its places' trust.
 */
export const FactoryApplied = Schema.Struct({
  name: Schema.String.annotate({ description: 'The factory filed.' }),
  volumes: Schema.Array(FactoryVolume).annotate({ description: 'Its volumes, none where it was made with none.' }),
  file: Schema.String.annotate({ description: "Its record's key." }),
  template: FactoryTemplate.annotate({ description: 'The template it was made from.' }),
  place: Schema.String.annotate({ description: 'Where the template is read.' }),
  tree: Schema.String.annotate({ description: 'The tree it runs from.' }),
  trusts: Schema.Array(FactoryPlaceTrust).annotate({ description: "What was asked for each of its places' trust." }),
});
export type FactoryApplied = typeof FactoryApplied.Type;

/**
 * A hand-made factory taken over by a template (`POST /api/factories/<factory>/adopt`): the template, its parameters as `--set` words,
 * and the digest of the plan its preview printed (`plan`); the template or the plan left out refused by the verb, in its words.
 */
export const FactoryAdoptWrite = Schema.Struct({
  template: Schema.optionalKey(TemplateGiven.annotate({ description: 'The template that takes the factory over.' })),
  sets: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({ description: "The template's parameters as `--set` words, `<key>=<value>`." }),
  ),
  plan: Schema.optionalKey(Schema.String.annotate({ description: 'The digest of the plan its preview printed.' })),
});
export type FactoryAdoptWrite = typeof FactoryAdoptWrite.Type;

/** What a takeover wrote: the factory, its record's key, the template it is now made from, and the tree it runs from. */
export const FactoryAdopted = Schema.Struct({
  name: Schema.String.annotate({ description: 'The factory taken over.' }),
  file: Schema.String.annotate({ description: "Its record's key." }),
  template: FactoryTemplate.annotate({ description: 'The template it is now made from.' }),
  tree: Schema.String.annotate({ description: 'The tree it runs from.' }),
});
export type FactoryAdopted = typeof FactoryAdopted.Type;

/**
 * The preview of a factory's change (`POST /api/factories/<factory>/diff`), nothing written: of a templated factory, its upgrade to `to`,
 * from the template it names or another (`template`); of a hand-made one, its takeover by `template`; each with its parameters as `--set`
 * words.
 */
export const FactoryDiffWrite = Schema.Struct({
  to: Schema.optionalKey(Schema.String.annotate({ description: 'The version an upgrade is previewed to.' })),
  template: Schema.optionalKey(TemplateGiven.annotate({ description: 'The template to preview, where another than the factory names.' })),
  sets: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({ description: "The template's parameters as `--set` words, `<key>=<value>`." }),
  ),
});
export type FactoryDiffWrite = typeof FactoryDiffWrite.Type;

/** Which side a cleanly merged file's change came from: the template's, the factory's, or both alike. */
export const MERGED_FROM = ['template', 'factory', 'both'] as const;

/** Whether an upgrade's merge has a common base, or none (a switch onto a template of another name). */
export const MERGE_BASES = ['common', 'none'] as const;

/** How a takeover changes one step's hire: hired by the template only, by the factory only, or by both, apart. */
export const HIRE_CHANGE_KINDS = ['added', 'dropped', 'changed'] as const;

/** A conflict of an upgrade's merge: its address, and each side's text, null where that side has none. */
const MergeConflict = Schema.Struct({
  at: Schema.String.annotate({ description: 'The address of the conflicting file.' }),
  base: Side.annotate({ description: 'The text of the common base; null where it has none.' }),
  ours: Side.annotate({ description: "The text of the factory's side; null where it has none." }),
  theirs: Side.annotate({ description: "The text of the template's side; null where it has none." }),
});

/**
 * The preview of a templated factory's upgrade: the factory, the version its base holds (absent where no status names it) and the one
 * wanted, what merges cleanly and from which side, each conflict, the line that files it with the plan's digest and the parameters it
 * drops, and, onto a template of another name, the switch.
 */
export const FactoryUpgradePlan = Schema.Struct({
  kind: Schema.Literal('upgrade').annotate({ description: 'Which preview this is: the upgrade of a templated factory.' }),
  name: Schema.String.annotate({ description: 'The factory.' }),
  from: Schema.optionalKey(Schema.String.annotate({ description: 'The version its base holds; absent where no status names it.' })),
  to: Schema.String.annotate({ description: 'The version wanted.' }),
  merge: Schema.Struct({
    base: Schema.Literals(MERGE_BASES).annotate({
      description: 'Whether the merge has a common base, or none (a switch onto a template of another name).',
    }),
    merged: Schema.Array(
      Schema.Struct({
        at: Schema.String.annotate({ description: 'The address of the file merged cleanly.' }),
        from: Schema.Literals(MERGED_FROM).annotate({
          description: "Which side the file's change came from: the template's, the factory's, or both alike.",
        }),
      }),
    ).annotate({ description: 'The files that merge cleanly, each with the side its change came from.' }),
    conflicts: Schema.Array(MergeConflict).annotate({ description: 'Each conflict of the merge.' }),
  }).annotate({ description: "What the merge of the template's files and the factory's does." }),
  next: Schema.Struct({
    line: Schema.String.annotate({ description: "The line that files the upgrade, with the plan's digest." }),
    digest: Schema.String.annotate({ description: "The plan's digest." }),
    dropped: Schema.Array(Schema.String).annotate({ description: 'The parameters the upgrade drops.' }),
  }).annotate({ description: 'The line that files this upgrade, the plan it holds to and the parameters it drops.' }),
  switched: Schema.optionalKey(
    Schema.Struct({
      from: Schema.String.annotate({ description: 'The name of the template the factory is made from.' }),
      to: Schema.String.annotate({ description: 'The name of the template it switches onto.' }),
    }).annotate({ description: 'The switch onto a template of another name; absent where the template stays.' }),
  ),
});
export type FactoryUpgradePlan = typeof FactoryUpgradePlan.Type;

/**
 * The preview of a hand-made factory's takeover by a template: what it keeps, the workflows added, dropped and kept, each hire changed,
 * the revisions policy before and after, the store's rules no longer read (their file, null where they hold no words), its runs waiting
 * or in flight and the policy they follow after, and each card and schedule it would strand; with the plan's digest and the adopt line.
 */
export const FactoryAdoptPlan = Schema.Struct({
  kind: Schema.Literal('adopt').annotate({ description: 'Which preview this is: the takeover of a hand-made factory.' }),
  plan: Schema.Struct({
    factory: Schema.String.annotate({ description: 'The factory.' }),
    kept: Schema.Struct({
      schedules: Schema.Array(Schema.String).annotate({ description: 'The schedules it keeps.' }),
      instruction: Schema.Boolean.annotate({ description: 'Whether it keeps its instruction.' }),
      volumes: Schema.Array(Schema.String).annotate({ description: 'The volumes it keeps.' }),
      settings: Schema.Array(Schema.String).annotate({ description: 'The harness settings it keeps.' }),
    }).annotate({ description: 'What the factory keeps through the takeover.' }),
    workflows: Schema.Struct({
      added: Schema.Array(Schema.String).annotate({ description: 'The workflows the takeover adds.' }),
      dropped: Schema.Array(Schema.String).annotate({ description: 'The workflows the takeover drops.' }),
      kept: Schema.Array(Schema.String).annotate({ description: 'The workflows it keeps.' }),
    }).annotate({ description: 'The workflows the takeover adds, drops and keeps.' }),
    hires: Schema.Array(
      Schema.Struct({
        step: Schema.String.annotate({ description: 'The step whose hire changes, as `<workflow>/<step>`.' }),
        kind: Schema.Literals(HIRE_CHANGE_KINDS).annotate({
          description: 'How the hire changes: hired by the template only, by the factory only, or by both, apart.',
        }),
        was: Schema.optionalKey(
          Schema.String.annotate({ description: 'The agent the factory hired for the step before; absent where it hired none.' }),
        ),
        now: Schema.optionalKey(
          Schema.String.annotate({ description: 'The agent the template hires for the step; absent where it hires none.' }),
        ),
      }),
    ).annotate({ description: "Each step's hire the takeover changes." }),
    revisions: Schema.Struct({
      was: Schema.Literals(REVISIONS_POLICIES).annotate({ description: 'The revisions policy before the takeover.' }),
      now: Schema.Literals(REVISIONS_POLICIES).annotate({ description: 'The revisions policy after it.' }),
    }).annotate({ description: 'The revisions policy before and after the takeover.' }),
    rules: Schema.NullOr(Schema.String).annotate({
      description: "The file of the store's rules that are no longer read; null where they hold no words.",
    }),
    runs: Schema.Struct({
      ids: Schema.Array(Schema.String).annotate({ description: 'The ids of the runs waiting or in flight.' }),
      policy: Schema.Literals(REVISIONS_POLICIES).annotate({ description: 'The revisions policy they follow after the takeover.' }),
    }).annotate({ description: 'The runs waiting or in flight, and the policy they follow after the takeover.' }),
    stranded: Schema.Struct({
      cards: Schema.Array(
        Schema.Struct({
          name: Schema.String.annotate({ description: "The card's name." }),
          workflow: Schema.NullOr(Schema.String).annotate({ description: 'The workflow the card names; null where it names none.' }),
          started: Schema.Boolean.annotate({ description: 'Whether a run started from the card.' }),
        }),
      ).annotate({ description: 'The cards the takeover would strand.' }),
      schedules: Schema.Array(Schema.String).annotate({ description: 'The schedules the takeover would strand.' }),
    }).annotate({ description: 'The cards and schedules the takeover would strand.' }),
  }).annotate({ description: 'What the takeover changes of the factory.' }),
  digest: Schema.String.annotate({ description: "The plan's digest." }),
  line: Schema.String.annotate({ description: "The line that adopts the factory, with the plan's digest." }),
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
  to: Schema.optionalKey(Schema.String.annotate({ description: 'The version wanted.' })),
  template: Schema.optionalKey(
    TemplateGiven.annotate({ description: 'The template to read it from, where another than the factory names.' }),
  ),
  sets: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({ description: "The template's parameters as `--set` words, `<key>=<value>`." }),
  ),
  plan: Schema.optionalKey(Schema.String.annotate({ description: 'The digest of the plan its preview printed.' })),
  downgrade: Schema.optionalKey(Schema.Boolean.annotate({ description: 'Whether to go to a version below the one applied.' })),
});
export type FactoryUpgradeWrite = typeof FactoryUpgradeWrite.Type;

/**
 * What an upgrade filed: the factory, the version its base holds (absent where no status names it) and the one wanted, its file, the
 * parameters it drops, and how many conflicts wait for a choice.
 */
export const FactoryUpgraded = Schema.Struct({
  name: Schema.String.annotate({ description: 'The factory.' }),
  from: Schema.optionalKey(Schema.String.annotate({ description: 'The version its base holds; absent where no status names it.' })),
  to: Schema.String.annotate({ description: 'The version wanted.' }),
  file: Schema.String.annotate({ description: "Its record's key." }),
  dropped: Schema.Array(Schema.String).annotate({ description: 'The parameters the upgrade drops.' }),
  conflicts: describedNumber('How many conflicts wait for a choice.'),
});
export type FactoryUpgraded = typeof FactoryUpgraded.Type;

/**
 * The person's choice for one conflict of an upgrade (`POST /api/factories/<factory>/resolve`): the conflict, as the preview names it,
 * and one of `ours`, `theirs` and `text`, the words it becomes — the text of a file, never its path.
 */
export const FactoryResolveWrite = Schema.Struct({
  conflict: Schema.String.annotate({ description: 'The conflict, as the preview names it.' }),
  ours: Schema.optionalKey(Schema.Boolean.annotate({ description: "Whether to keep the factory's side." })),
  theirs: Schema.optionalKey(Schema.Boolean.annotate({ description: "Whether to take the template's side." })),
  text: Schema.optionalKey(Schema.String.annotate({ description: 'The words the conflict becomes: the text of a file, never its path.' })),
});
export type FactoryResolveWrite = typeof FactoryResolveWrite.Type;

/**
 * What a choice wrote: the factory, the conflict, the version, the file the choices are kept in, the conflicts still without one, the
 * object proposed as the choices of its conflicts compose it where one was (its kind, name and proposal), and the proposals the merge
 * waits on.
 */
export const FactoryResolved = Schema.Struct({
  name: Schema.String.annotate({ description: 'The factory.' }),
  at: Schema.String.annotate({ description: 'The conflict the choice was for.' }),
  to: Schema.String.annotate({ description: 'The version of the upgrade.' }),
  file: Schema.String.annotate({ description: 'The file the choices are kept in.' }),
  left: Schema.Array(Schema.String).annotate({ description: 'The conflicts still without a choice.' }),
  proposed: Schema.optionalKey(
    Schema.Struct({
      kind: Schema.Literals(PROPOSABLE_KINDS).annotate({ description: 'The kind of the object proposed.' }),
      name: Schema.String.annotate({ description: 'The name of the object proposed.' }),
      proposal: Schema.String.annotate({ description: 'The proposal made of it.' }),
    }).annotate({ description: 'The object proposed as the choices of its conflicts compose it; absent where none was.' }),
  ),
  waits: Schema.Array(Schema.String).annotate({ description: 'The proposals the merge waits on.' }),
});
export type FactoryResolved = typeof FactoryResolved.Type;
