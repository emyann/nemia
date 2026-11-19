/**
 * A proposal made (`proposeProgram`), and an undo proposed (`undoProgram`): the objects a caller proposes for a factory, judged whole
 * before a byte is written — the caller may propose there (`mayPropose`); each object of a kind a proposal carries, its spec as that kind's
 * spec says it (objects' `WorkflowSpec`, `AgentSpec` with the result schema its `output` carries, `SkillSpec` with the folder's other
 * text files its `files` carry, `HireSpec`, `McpServerSpec`, and the Factory's attached workflows, rules and instruction), never the
 * person's settings nor an agent's custom instructions; each at the version it was read at, still the one served — then its changes,
 * what each does to access (`accessOf`, `accessChange`) and whether the whole widens it, written as a proposal that waits, named by the
 * machinery and proposed by the caller, never by the body.
 */
import { randomBytes } from 'node:crypto';
import { Effect, Result, Schema } from 'effect';
import {
  AgentSpec,
  API_VERSION,
  HireSpec,
  LibraryAddSpec,
  McpServerSpec,
  ProposalSpec,
  RESOURCE_PLURALS,
  SkillSpec,
  WorkflowSpec,
  type ChangeVerb,
  type Proposal,
  type ProposalChange,
  type ProposedObject,
  type WorkflowStep,
  DEFAULT_NAMESPACE,
} from 'objects';
import { Conflict, Forbidden, Invalid, Missing } from '../refusal/refusal.ts';
import { brokenBy } from '../door/door.store.ts';
import { mayPropose } from '../approval/index.ts';
import { accessChange, accessOf } from './access.ts';
import { readmeComposed } from '../folder/folder.ts';
import { currentOf, workflowStepsWritten, type ProposalPlace } from './current.verb.ts';
import { ProposalDoor } from '../proposal/proposal.store.ts';
import { proposerOf, type ProposalCaller } from '../caller/index.ts';
import { skillFilesRefusal } from '../skills/skills.ts';

/** What a proposal of the Factory may change: its attached workflows, its rules and its instruction. */
const FactoryProposed = Schema.Struct({
  workflows: Schema.optionalKey(Schema.Array(Schema.String)),
  rules: Schema.optionalKey(Schema.String),
  instruction: Schema.optionalKey(Schema.String),
});

/** Each kind's spec as a proposal carries it. */
const SPECS = {
  Workflow: WorkflowSpec,
  Agent: AgentSpec,
  Skill: SkillSpec,
  Hire: HireSpec,
  McpServer: McpServerSpec,
  Factory: FactoryProposed,
  LibraryAdd: LibraryAddSpec,
} as const;

/** The person's own settings of a Factory, each with what the person types to change it: no proposal carries one. */
const PERSONS_SETTINGS: Readonly<Record<string, string>> = {
  volumes: 'nemia factory volume add, nemia factory volume set and nemia factory volume rm',
  harnessSettings: 'nemia factory setting set and nemia factory setting rm',
  costLines: 'nemia factory cost-line set and nemia factory cost-line rm',
  revisions: 'nemia factory revisions <factory> <policy>',
  template: 'nemia factory upgrade <factory>',
  level: 'nemia level <level> --factory <factory>',
  hires: 'a Hire object, named <workflow>.<step>, in the proposal',
};

/**
 * The verb an object is proposed with: as given, else `create` where it carries no version and `update` where it carries one.
 * @param object The object proposed.
 */
export const verbOf = (object: ProposedObject) => object.verb ?? (object.metadata.resourceVersion === undefined ? 'create' : 'update');

/** An object's label in a refusal: `Workflow build`. */
const labelOf = (object: ProposedObject) => `${object.kind} ${object.metadata.name}`;

/**
 * Why a Factory or an Agent `object` carries what is the person's, or undefined where it carries none: settings, custom instructions. An
 * Agent's result schema (`output`) is not one: it grants no access, and is written beside the agent with it.
 */
function personsRefusal(object: ProposedObject, label: string, verb: ChangeVerb) {
  const spec = typeof object.spec === 'object' && object.spec !== null ? (object.spec as Record<string, unknown>) : undefined;
  if (object.kind === 'Factory') {
    const setting = spec === undefined ? undefined : Object.keys(spec).find((key) => PERSONS_SETTINGS[key] !== undefined);
    if (setting !== undefined)
      return `${label}: ${setting} is the person's setting, and no proposal carries it: the person changes it with ${PERSONS_SETTINGS[setting]}.`;
    if (verb !== 'update')
      return `${label}: a proposal changes a factory's wiring, rules and instruction, never makes or removes the factory: say verb update.`;
  }
  if (object.kind === 'Agent' && spec !== undefined && 'custom' in spec)
    return `${label}: an agent's custom instructions are the person's, and no proposal carries them: the person writes them with nemia agents custom ${object.metadata.name} --file <path>.`;
  return undefined;
}

/** Why `object`'s verb does not go with what it carries, or undefined where it does: a spec, a version, a Skill removed. */
function verbRefusal(object: ProposedObject, label: string, verb: ChangeVerb, factory: string) {
  if (object.kind === 'Skill' && verb === 'delete')
    return `${label}: a skill of the factory's tree is changed by a proposal, never removed: take it off the agents that name it instead.`;
  if (verb === 'delete' && object.spec !== undefined) return `${label}: a removal carries no spec: leave spec out.`;
  if (verb !== 'delete' && object.spec === undefined) return `${label}: a ${verb} carries the object's spec: give it.`;
  if (verb === 'create' && object.metadata.resourceVersion !== undefined)
    return `${label}: a creation carries no resourceVersion, since nothing is there to have read: leave it out, or say verb update.`;
  if (verb !== 'create' && object.metadata.resourceVersion === undefined)
    return `${label}: a ${verb} carries the resourceVersion the object was read at: read it with nemia get ${RESOURCE_PLURALS[object.kind]} ${object.metadata.name} -n ${factory}.`;
  return undefined;
}

/**
 * Why a Workflow's spec is not its files' form, or undefined where it is: one that still carries `needs` or `description` apart, which its
 * README's frontmatter and first paragraph say and the read serves under `status`, so that a proposal sending them loses none unsaid.
 */
function workflowSpecRefusal(object: ProposedObject, label: string) {
  const spec = recordOf(object.spec);
  const apart = ['needs', 'description'].filter((key) => spec !== undefined && key in spec);
  if (apart.length === 0) return undefined;
  return (
    `${label}: its spec carries ${apart.join(' and ')}, which a Workflow's files say in its README (spec.readme, frontmatter and all) and ` +
    `its read serves under status: read it as its files hold it (nemia get workflows ${object.metadata.name}) and propose that spec, ` +
    "with the needs in the README's frontmatter."
  );
}

/**
 * Why `object`'s spec is not its kind's, or undefined where it is: the kind's schema, a Skill's file at a path out of its folder or given
 * twice (`skillFilesRefusal`), a Workflow's needs or description apart (`workflowSpecRefusal`), and a Hire named after its step.
 */
function specRefusal(object: ProposedObject, label: string) {
  const broken = brokenBy(SPECS[object.kind], object.spec);
  if (broken !== null) return `${label}: its spec ${broken}: write it as nemia explain ${RESOURCE_PLURALS[object.kind]}.spec says.`;
  if (object.kind === 'Workflow') return workflowSpecRefusal(object, label);
  if (object.kind === 'Skill') {
    const files = skillFilesRefusal((object.spec as SkillSpec).files);
    return files === undefined ? undefined : `${label}: ${files}`;
  }
  if (object.kind !== 'Hire') return undefined;
  const spec = object.spec as HireSpec;
  return `${spec.workflow}.${spec.step}` === object.metadata.name
    ? undefined
    : `${label}: a Hire is named <workflow>.<step>, and its spec says ${spec.workflow}.${spec.step}: name it so.`;
}

/**
 * Why `object` is no object a proposal of `factory` carries, or undefined where it is one: another namespace, a setting of the person's,
 * a verb that does not go with what it carries, a spec its kind does not read. Pure.
 * @param object The object proposed.
 * @param factory The factory the proposal is in.
 */
export function objectRefusal(object: ProposedObject, factory: string) {
  const label = labelOf(object);
  const verb = verbOf(object);
  if (object.metadata.namespace !== undefined && object.metadata.namespace !== factory)
    return `${label} names the namespace ${object.metadata.namespace}, and this proposal is ${factory}'s: propose it in its own factory, -n ${object.metadata.namespace}.`;
  return (
    personsRefusal(object, label, verb) ??
    verbRefusal(object, label, verb, factory) ??
    (verb === 'delete' ? undefined : specRefusal(object, label))
  );
}

/** The objects of a proposal, each named once per kind; refused (`Invalid`) where one is no object a proposal carries. */
const objectsChecked = (objects: readonly ProposedObject[], factory: string) => {
  if (objects.length === 0)
    return Effect.fail(new Invalid({ message: 'a proposal carries one object at least: give its objects as spec.objects.' }));
  const seen = new Set<string>();
  for (const object of objects) {
    const why = objectRefusal(object, factory);
    if (why !== undefined) return Effect.fail(new Invalid({ message: why }));
    const key = `${object.kind}/${object.metadata.name}`;
    if (seen.has(key)) return Effect.fail(new Invalid({ message: `${labelOf(object)} is given twice: give each object once.` }));
    seen.add(key);
  }
  return Effect.void;
};

/**
 * A proposal's name: its proposer and five lowercase letters or digits.
 * @param proposer Who proposes, as the name's first part.
 */
export const proposalNameOf = (proposer: string) => {
  const letters = randomBytes(5)
    .reduce((word, byte) => word + (byte % 36).toString(36), '')
    .slice(0, 5);
  return `${proposer}-${letters}`;
};

/**
 * The change `object` makes, read against what is there now: its resource, name, verb and access. Refused: a creation where something is
 * there already (`Conflict`), a change or removal of nothing (`Missing`), and one read at a version no longer served (`Conflict`).
 */
const changeOf = (place: ProposalPlace, factory: string, object: ProposedObject) =>
  Effect.gen(function* () {
    const verb = verbOf(object);
    const label = labelOf(object);
    const now = yield* currentOf(place, factory, object.kind, object.metadata.name);
    if (verb === 'create' && now.version !== null)
      return yield* Effect.fail(
        new Conflict({
          message: `${label} is there already, at ${now.version}: propose an update at that resourceVersion (nemia get ${RESOURCE_PLURALS[object.kind]} ${object.metadata.name} -n ${factory}).`,
        }),
      );
    if (verb !== 'create' && now.version === null)
      return yield* Effect.fail(
        new Missing({
          message: `${label} is not there to ${verb}: propose it with verb create, or list what is there (nemia get ${RESOURCE_PLURALS[object.kind]} -n ${factory}).`,
        }),
      );
    if (verb !== 'create' && now.version !== object.metadata.resourceVersion)
      return yield* Effect.fail(
        new Conflict({
          message: `${label} was read at ${object.metadata.resourceVersion ?? 'none'} and is now at ${now.version}: read it again as its files hold it (nemia get ${RESOURCE_PLURALS[object.kind]} ${object.metadata.name} -n ${factory}) and propose its spec as it reads.`,
        }),
      );
    const before = accessOf(object.kind, object.metadata.name, now.spec);
    const merged = verb === 'delete' ? undefined : mergedSpec(object, now.spec);
    const after = accessOf(object.kind, object.metadata.name, yield* folderShaped(place, factory, object, merged));
    const change: ProposalChange = {
      resource: RESOURCE_PLURALS[object.kind],
      name: object.metadata.name,
      verb,
      access: accessChange(before, after),
    };
    return change;
  });

/**
 * The spec `merged` an object will hold once written, in the shape `currentOf` reads what is there now, so `accessOf` reads both sides
 * alike: a Workflow's steps as its folder would read them once written (`workflowStepsWritten`), each step's keys its file's own, never
 * those its agent gives it or the agent its factory hires into it, which the api serves on each step; its steps as given where one does
 * not render, or where it gives none. Any other kind's spec as it is.
 */
const folderShaped = (place: ProposalPlace, factory: string, object: ProposedObject, merged: unknown) => {
  const spec = recordOf(merged);
  if (object.kind !== 'Workflow' || spec === undefined || !Array.isArray(spec.steps)) return Effect.succeed(merged);
  return Effect.map(workflowStepsWritten(place, factory, object.metadata.name, spec.steps as readonly WorkflowStep[]), (steps) =>
    steps === undefined ? merged : { ...spec, steps },
  );
};

/** `value` as a record, or none where it is not an object. */
const recordOf = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/**
 * A Workflow's `spec` as its apply writes it over `now`, the spec its folder holds (`currentOf`), in `now`'s shape: its `readme` the
 * README the write writes (`readmeComposed`), as given where it opens with a frontmatter of its own, under `now`'s frontmatter where it
 * does not, `now`'s own where none is given.
 */
const workflowAsWritten = (spec: Readonly<Record<string, unknown>>, now: Readonly<Record<string, unknown>> | undefined) => {
  const was = typeof now?.readme === 'string' ? now.readme : undefined;
  const body = typeof spec.readme === 'string' ? spec.readme : undefined;
  const readme = readmeComposed(was ?? '', body) ?? was;
  const { readme: _readme, ...rest } = spec;
  return readme === undefined ? rest : { ...rest, readme };
};

/**
 * The spec an object will hold once written: a Factory's parts it names over what it holds; a Workflow's README as its apply
 * writes them (`workflowAsWritten`); any other kind's spec whole.
 * @param object The object proposed.
 * @param now The spec the object holds now; undefined where nothing is there.
 */
export const mergedSpec = (object: ProposedObject, now: unknown) => {
  const spec = recordOf(object.spec);
  const was = recordOf(now);
  if (spec === undefined) return object.spec;
  if (object.kind === 'Workflow') return workflowAsWritten(spec, was);
  return object.kind === 'Factory' && was !== undefined ? { ...was, ...spec } : object.spec;
};

/** A spec read for a proposal, refused (`Invalid`) where it is no proposal's: the body as `ProposalSpec` decodes it. */
const specRead = (body: unknown) => {
  const read = Schema.decodeUnknownResult(ProposalSpec)(body);
  return Result.isSuccess(read)
    ? Effect.succeed(read.success)
    : Effect.fail(
        new Invalid({
          message: `the proposal ${brokenBy(ProposalSpec, body) ?? 'does not read'}: send { "objects": [...], "applyAt"?, "why"? }.`,
        }),
      );
};

/**
 * The proposal `body` of `caller` in the factory `factory`, judged whole and written, waiting: what it answers. Refused: a caller that may
 * not propose there (`Forbidden`, `other-factory`), the default namespace (`Invalid`), an object no proposal carries (`Invalid`), and each
 * object as `changeOf` refuses it.
 */
export const proposeProgram = Effect.fn('proposeProgram')(function* (
  caller: ProposalCaller,
  factory: string,
  body: unknown,
  place: ProposalPlace,
) {
  if (!mayPropose(caller, factory))
    return yield* Effect.fail(
      new Forbidden({
        reason: 'other-factory',
        message: `a session of ${caller.kind === 'agent' ? (caller.factory ?? 'the store') : 'the person'} proposes in its own factory, not ${factory}: propose there, or ask the person.`,
      }),
    );
  if (factory === DEFAULT_NAMESPACE)
    return yield* Effect.fail(
      new Invalid({
        message: 'the default namespace holds your own library, which you write yourself: propose in a factory, -n <factory>.',
      }),
    );
  const spec = yield* specRead(body);
  yield* objectsChecked(spec.objects, factory);
  const changes: ProposalChange[] = [];
  for (const object of spec.objects) changes.push(yield* changeOf(place, factory, object));
  const proposer = proposerOf(caller);
  const proposal: Proposal = {
    apiVersion: API_VERSION,
    kind: 'Proposal',
    metadata: { name: proposalNameOf(proposer), namespace: factory, creationTimestamp: new Date().toISOString(), resourceVersion: '' },
    spec,
    status: {
      phase: 'waiting',
      proposedBy:
        caller.kind === 'agent'
          ? { agent: caller.agent, ...(caller.run != null && { run: caller.run }), ...(caller.step != null && { step: caller.step }) }
          : {},
      changes,
      widens: changes.some((c) => c.access === 'widens'),
    },
  };
  return yield* (yield* ProposalDoor).proposals.create(proposal);
});

/**
 * The undo of the proposal `name` of `factory`, proposed by `caller` as a new proposal: each object it changed put back as `before` holds
 * it, at the version it is served at now, and each object it made removed. Refused: a proposal not applied (`Conflict`), and as
 * `proposeProgram` refuses the undo.
 */
export const undoProgram = Effect.fn('undoProgram')(function* (
  caller: ProposalCaller,
  factory: string,
  name: string,
  place: ProposalPlace,
) {
  const door = (yield* ProposalDoor).proposals;
  const applied = yield* door.read(factory, name);
  if (applied === undefined)
    return yield* Effect.fail(
      new Missing({ message: `${factory} has no proposal ${name}: list them with nemia get proposals -n ${factory}.` }),
    );
  if (applied.status.phase !== 'applied' || applied.status.before === undefined)
    return yield* Effect.fail(
      new Conflict({ message: `${name} is ${applied.status.phase}, not applied: only what was applied is undone.` }),
    );
  const before = applied.status.before;
  const objects: ProposedObject[] = [];
  for (const object of applied.spec.objects) {
    const now = yield* currentOf(place, factory, object.kind, object.metadata.name);
    const was = before.find((b) => b.kind === object.kind && b.metadata.name === object.metadata.name);
    const meta = { name: object.metadata.name, ...(now.version !== null && { resourceVersion: now.version }) };
    if (was === undefined) {
      if (now.version !== null) objects.push({ kind: object.kind, metadata: meta, verb: 'delete' });
    } else objects.push({ kind: object.kind, metadata: meta, spec: was.spec, verb: now.version === null ? 'create' : 'update' });
  }
  return yield* proposeProgram(caller, factory, { objects, why: `undo ${name}` }, place);
});
