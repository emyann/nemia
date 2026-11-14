/**
 * A hand-made factory taken over by a template, judged (agent-orchestrator, src/adopt/adopt.ts): why a takeover is refused
 * (`adoptRefusal`), and the factory after one it accepts (`adopted`). The refusal's laws are what a takeover must not break: a factory
 * made from a template already is upgraded, not taken over; a card filed and not started, or a schedule, must still find its workflow
 * in the template's wiring; and a base or tree already on disk is the render's own (a takeover that stopped half way) or it is refused.
 * The words of each refusal are nobody's law, only that they are a sentence.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import type { Factory, FactoryTemplate, Hires, RevisionsPolicy } from '../src/factory/factory.ts';
import { leftoverRefusal, strandedCardRefusal, strandedScheduleRefusal, templatedAdoptRefusal } from '../src/adopt/adopt-refusals.ts';
import type { AdoptedCard } from '../src/adopt/adopt-refusals.ts';

/** The wiring a template's render holds in its `factory.json`: its workflows, its hires, and its revisions policy where it says one. */
export type Wiring = { readonly workflows: readonly string[]; readonly hires: Hires; readonly revisions?: RevisionsPolicy };

/**
 * What a takeover is judged against, read off the disk: the render's wiring, the cards filed for the factory, the digest of the base and
 * of the tree already there (null where there is none), and the digest of the render.
 */
export type Adoption = {
  readonly wiring: Wiring;
  readonly cards: readonly AdoptedCard[];
  readonly leftovers: { readonly base: string | null; readonly tree: string | null };
  readonly render: string;
};

/**
 * What a takeover is refused as: a factory made from a template already (`Templated`), a filed card or a schedule its workflow would be
 * gone from (`Stranded`), and a base or tree already there that is not the render (`Leftover`).
 */
export type AdoptRefused = { readonly kind: 'Templated' | 'Stranded' | 'Leftover'; readonly message: string };

/** The words of each refusal: what they say is nobody's law, only that they are a sentence. */
export const words = [
  assume(templatedAdoptRefusal, { pure: true }),
  assume(strandedCardRefusal, { pure: true }),
  assume(strandedScheduleRefusal, { pure: true }),
  assume(leftoverRefusal, { pure: true }),
];

/** Whether a card filed and not yet started names a workflow the template's wiring does not offer. */
const strandsACard = (adoption: Adoption): boolean =>
  adoption.cards.some((c) => !c.started && c.workflow !== null && !adoption.wiring.workflows.includes(c.workflow));

/** Whether the factory schedules a workflow the template's wiring does not offer. */
const strandsASchedule = (factory: Factory, adoption: Adoption): boolean =>
  Object.keys(factory.schedules).some((w) => !adoption.wiring.workflows.includes(w));

/** Whether a base or a tree is on disk already with other content than the render. */
const leavesAForeignFolder = (adoption: Adoption): boolean =>
  (adoption.leftovers.base !== null && adoption.leftovers.base !== adoption.render) ||
  (adoption.leftovers.tree !== null && adoption.leftovers.tree !== adoption.render);

/** Whether two values are the same, a NaN the same as a NaN. */
const same = (a: string | number | boolean | undefined, b: string | number | boolean | undefined): boolean =>
  a === b || (a !== a && b !== b);

/**
 * Whether `a` and `b` name the same keys, in the same order: what `keepsItsHarnessSettings` says of a factory's harness settings. Their
 * values are what its file holds, unjudged (`unknown`, so that a hand-edited key still reads and `nemia factory setting rm` can take it
 * off), which the verifier compares by no means: that `adopted` carries each value is held by `src/adopt/adopt.test.ts`, which runs it.
 */
const sameKeys = (a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>): boolean => {
  const was = Object.keys(a);
  const now = Object.keys(b);
  return now.length === was.length && now.every((key, i) => was.at(i) === key);
};

/** Whether two dictionaries hold the same entries, in the same order, a NaN the same as a NaN. */
const sameDict = (
  a: Readonly<Record<string, string | number | boolean>>,
  b: Readonly<Record<string, string | number | boolean>>,
): boolean => {
  const was = Object.entries(a);
  const now = Object.entries(b);
  return now.length === was.length && now.every(([key, value], i) => was.at(i)?.[0] === key && same(was.at(i)?.[1], value));
};

/** Whether two places of an instruction say the same: none, the store, or the same path. */
const sameInstruction = (a: Factory['instruction'], b: Factory['instruction']): boolean => {
  if (a === undefined) return b === undefined;
  if (b === undefined) return false;
  if ('path' in a) return 'path' in b && a.path === b.path;
  return !('path' in b);
};

/** Whether the factory is made from a template already. */
const templated = (factory: Factory): boolean => factory.template !== undefined;

const adoptRefusalSpec = spec<(factory: Factory, adoption: Adoption) => AdoptRefused | null>({
  ensures: {
    templatedRefused: {
      description: 'A factory made from a template already is refused as Templated: it is upgraded, not taken over',
      condition: ({ input: [factory], output }) => !templated(factory) || output?.kind === 'Templated',
    },
    strandedCardRefused: {
      description: 'A card filed and not started, naming a workflow the template does not offer, is refused',
      condition: ({ input: [, adoption], output }) => !strandsACard(adoption) || output !== null,
    },
    strandedScheduleRefused: {
      description: 'A schedule of a workflow the template does not offer is refused',
      condition: ({ input: [factory, adoption], output }) => !strandsASchedule(factory, adoption) || output !== null,
    },
    foreignLeftoverRefused: {
      description: 'A base or a tree already there with other content than the render is refused',
      condition: ({ input: [, adoption], output }) => !leavesAForeignFolder(adoption) || output !== null,
    },
    acceptedOtherwise: {
      description:
        "Anything else is taken over: a started card, a card naming no workflow, and a stopped takeover's own base and tree never refuse",
      condition: ({ input: [factory, adoption], output }) =>
        templated(factory) ||
        strandsACard(adoption) ||
        strandsASchedule(factory, adoption) ||
        leavesAForeignFolder(adoption) ||
        output === null,
    },
    strandedBeforeLeftover: {
      description: 'A takeover that would strand a card or a schedule is refused as Stranded, whatever folder is left over',
      condition: ({ input: [factory, adoption], output }) =>
        templated(factory) || !(strandsACard(adoption) || strandsASchedule(factory, adoption)) || output?.kind === 'Stranded',
    },
    templatedOnlyOfATemplated: {
      description: 'Templated is said only of a factory made from a template already',
      condition: ({ input: [factory], output }) => output?.kind !== 'Templated' || templated(factory),
    },
    strandedOnlyOfAStranding: {
      description: 'Stranded is said only of a takeover that would strand a card or a schedule',
      condition: ({ input: [factory, adoption], output }) =>
        output?.kind !== 'Stranded' || strandsACard(adoption) || strandsASchedule(factory, adoption),
    },
    leftoverOnlyOfAFolder: {
      description: 'Leftover is said only of a base or a tree already there with other content',
      condition: ({ input: [, adoption], output }) => output?.kind !== 'Leftover' || leavesAForeignFolder(adoption),
    },
  },
});
export type AdoptRefusal = Implementation<typeof adoptRefusalSpec>;

const adoptedSpec = spec<(factory: Factory, wiring: Wiring, template: FactoryTemplate, tree: string) => Factory>({
  ensures: {
    keepsItsName: {
      description: 'The factory taken over keeps its name',
      condition: ({ input: [factory], output }) => output.name === factory.name,
    },
    keepsItsRepos: {
      description: 'It keeps its repositories',
      condition: ({ input: [factory], output }) =>
        output.repos.length === factory.repos.length && output.repos.every((repo, i) => repo === factory.repos[i]),
    },
    keepsItsSchedules: {
      description: 'It keeps its schedules',
      condition: ({ input: [factory], output }) =>
        Object.keys(factory.schedules).every((w) => Object.hasOwn(output.schedules, w)) &&
        Object.keys(output.schedules).every((w) => Object.hasOwn(factory.schedules, w)),
    },
    keepsItsInstruction: {
      description: 'It keeps where its instruction is kept',
      condition: ({ input: [factory], output }) => sameInstruction(output.instruction, factory.instruction),
    },
    keepsItsVolumes: {
      description: "It keeps its volumes, none where it had none: they are the person's folders, never the template's",
      condition: ({ input: [factory], output }) =>
        (output.volumes === undefined) === (factory.volumes === undefined) &&
        (output.volumes ?? []).length === (factory.volumes ?? []).length &&
        (output.volumes ?? []).every(
          (v, i) => v.path === (factory.volumes ?? []).at(i)?.path && v.readOnly === (factory.volumes ?? []).at(i)?.readOnly,
        ),
    },
    keepsItsHarnessSettings: {
      description: "It keeps its harness settings, the same ones, none where it had none: they are the person's, never the template's",
      condition: ({ input: [factory], output }) =>
        (output.harnessSettings === undefined) === (factory.harnessSettings === undefined) &&
        sameKeys(output.harnessSettings ?? {}, factory.harnessSettings ?? {}),
    },
    keepsItsCostLines: {
      description: "It keeps its cost lines, for the same workflows, none where it had none: they are the person's, never the template's",
      condition: ({ input: [factory], output }) =>
        (output.costLines === undefined) === (factory.costLines === undefined) && sameKeys(output.costLines ?? {}, factory.costLines ?? {}),
    },
    offersTheTemplates: {
      description: "Its workflows are the template's wiring's",
      condition: ({ input: [, wiring], output }) =>
        output.workflows.length === wiring.workflows.length && output.workflows.every((w, i) => w === wiring.workflows[i]),
    },
    hiresTheTemplates: {
      description: "Its hires are the template's wiring's",
      condition: ({ input: [, wiring], output }) => sameDict(wiring.hires, output.hires),
    },
    followsTheTemplates: {
      description: "Its revisions policy is the template's wiring's, none where the wiring says none",
      condition: ({ input: [, wiring], output }) => output.revisions === wiring.revisions,
    },
    recordsItsTemplate: {
      description: 'It records the template it was taken over by, and the tree it runs from',
      condition: ({ input: [, , template, tree], output }) =>
        output.template !== undefined &&
        output.template.source === template.source &&
        output.template.version === template.version &&
        sameDict(output.template.params, template.params) &&
        output.tree === tree,
    },
    leavesItsGenerationToTheDoor: {
      description:
        "It carries no generation of its own: the count of changes to a factory's spec is the door's to write (`generationWritten`), never a caller's",
      condition: ({ output }) => output.generation === undefined,
    },
  },
});
export type Adopted = Implementation<typeof adoptedSpec>;
