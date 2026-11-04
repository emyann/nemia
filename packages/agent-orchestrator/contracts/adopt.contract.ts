/**
 * A hand-made factory taken over by a template, judged (agent-orchestrator, src/adopt/adopt.ts): why a takeover is refused
 * (`adoptRefusal`), and the factory after one it accepts (`adopted`). The refusal's laws are what a takeover must not break: a factory
 * made from a template already is upgraded, not taken over; a card filed and not started, or a schedule, must still find its workflow
 * in the template's wiring; and a base or tree already on disk is the render's own (a takeover that stopped half way) or it is refused.
 * The words of each refusal are nobody's law, only that they are a sentence.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import type { Factory, FactoryTemplate } from '../src/factory/factory.ts';
import {
  leftoverRefusal,
  strandedCardRefusal,
  strandedScheduleRefusal,
  templatedAdoptRefusal,
  type Adoption,
  type AdoptRefused,
  type Wiring,
} from '../src/adopt/adopt.ts';

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
      description: "It keeps its volumes: they are the person's folders, never the template's",
      condition: ({ input: [factory], output }) =>
        (output.volumes ?? []).length === (factory.volumes ?? []).length &&
        (output.volumes ?? []).every(
          (v, i) => v.path === factory.volumes?.[i]?.path && v.readOnly === factory.volumes?.[i]?.readOnly,
        ),
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
  },
});
export type Adopted = Implementation<typeof adoptedSpec>;
