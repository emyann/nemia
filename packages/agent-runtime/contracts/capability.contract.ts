/**
 * What a harness declares it can do, read by every check that used to name a harness: whether a task asks of its harness something the
 * harness does not declare (`misplacedOf`), which harnesses of an engine take a capability, to name in a refusal's fix (`takersOf`), and
 * which harness an Engine verb that is not a task's goes to (`verbHarnessOf`): `quota`, the MCP verbs, `hold`, the drains.
 *
 * A harness's declaration is one list of the words below (`HarnessDeclaration.can`, agent-runtime, src/harness/declaration.ts), one per
 * harness, Claude Code's included: a new harness is its declaration and its driver. A runner a consumer brings as its own declares
 * nothing (`can: undefined`) and is asked nothing, as `harnessRefusalOf` asks it nothing today.
 *
 * The three types (`Capability`, `HarnessDeclared`, `VerbHarness`) are `src/harness/declaration.ts`'s.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Capability, HarnessDeclared, VerbHarness } from '../src/harness/declaration.ts';

/** Whether `harness` declares `capability`: a runner of the consumer's declares nothing. */
const declares = (harness: HarnessDeclared, capability: Capability): boolean =>
  harness.can !== undefined && harness.can.includes(capability);

/** Whether a declaration lists `capability`. */
const lists = (can: readonly Capability[], capability: Capability): boolean => can.includes(capability);

const misplacedSpec = spec<(asked: readonly Capability[], can: readonly Capability[] | undefined) => Capability | undefined>({
  ensures: {
    aRunnerOfItsOwnIsAskedNothing: {
      description: 'A runner the consumer brought as its own declares nothing, and is refused nothing here',
      condition: ({ input: [, can], output }) => (can === undefined ? output === undefined : true),
    },
    refusesOnlyWhatItLacks: {
      description: 'What is refused is something the task asked for and the harness does not declare',
      condition: ({ input: [asked, can], output }) =>
        output === undefined || (asked.includes(output) && can !== undefined && !lists(can, output)),
    },
    takesWhatItDeclares: {
      description: 'A harness with a declaration refuses nothing exactly when it declares everything the task asked for',
      condition: ({ input: [asked, can], output }) =>
        can === undefined || (output === undefined) === asked.every((capability) => lists(can, capability)),
    },
    theFirstAskedIsSaid: {
      description: 'The capability refused is the first the task asked for that the harness lacks, so one task always reads one refusal',
      condition: ({ input: [asked, can], output }) =>
        output === undefined || can === undefined || asked.find((capability) => !lists(can, capability)) === output,
    },
  },
});
/** The first capability a task asks of its harness that the harness's declaration does not list, or `undefined`. */
export type MisplacedOf = Implementation<typeof misplacedSpec>;

const takersSpec = spec<(capability: Capability, harnesses: readonly HarnessDeclared[]) => string[]>({
  ensures: {
    everyTakerDeclaresIt: {
      description: 'Every harness a refusal names as taking the capability declares it',
      condition: ({ input: [capability, harnesses], output }) =>
        output.every((name) => harnesses.some((h) => h.name === name && declares(h, capability))),
    },
    noTakerIsLeftOut: {
      description: 'Every harness of the engine that declares the capability is named',
      condition: ({ input: [capability, harnesses], output }) =>
        harnesses.every((h) => !declares(h, capability) || output.includes(h.name)),
    },
    eachNamedOnce: {
      description: 'No harness is named more often than the engine configures it',
      condition: ({ input: [, harnesses], output }) => output.length <= harnesses.length,
    },
  },
});
/** The names of the harnesses that declare `capability`, in the engine's order: the fix a refusal offers. */
export type TakersOf = Implementation<typeof takersSpec>;

/** The harness configured under `name`, the first where two are: what the engine's own lookup finds. */
const named = (harnesses: readonly HarnessDeclared[], name: string): HarnessDeclared | undefined => harnesses.find((h) => h.name === name);

/** The first harness that declares `verb`, in the engine's order. */
const firstDeclaring = (harnesses: readonly HarnessDeclared[], verb: Capability): HarnessDeclared | undefined =>
  harnesses.find((h) => declares(h, verb));

const verbHarnessSpec = spec<(verb: Capability, name: string | undefined, harnesses: readonly HarnessDeclared[]) => VerbHarness>({
  ensures: {
    aNamedHarnessAnswersItsOwn: {
      description: 'A verb asked of a harness by name goes to that harness when it declares the verb',
      condition: ({ input: [verb, name, harnesses], output }) => {
        const h = name === undefined ? undefined : named(harnesses, name);
        return h === undefined || !declares(h, verb) || (output.kind === 'taken' && output.name === h.name);
      },
    },
    aNamedHarnessThatLacksItIsRefused: {
      description: 'A verb asked of a harness that does not declare it is refused as undeclared, never sent to another',
      condition: ({ input: [verb, name, harnesses], output }) => {
        const h = name === undefined ? undefined : named(harnesses, name);
        return h === undefined || declares(h, verb) || (output.kind === 'refused' && output.reason === 'undeclared');
      },
    },
    anUnknownNameIsRefused: {
      description: 'A verb asked of a name the engine does not configure is refused as unknown',
      condition: ({ input: [, name, harnesses], output }) =>
        name === undefined || named(harnesses, name) !== undefined || (output.kind === 'refused' && output.reason === 'unknown'),
    },
    unnamedGoesToTheFirstThatDeclares: {
      description: 'A verb asked of no harness goes to the first of the engine that declares it',
      condition: ({ input: [verb, name, harnesses], output }) => {
        const first = firstDeclaring(harnesses, verb);
        return name !== undefined || first === undefined || (output.kind === 'taken' && output.name === first.name);
      },
    },
    noneDeclaresIt: {
      description: 'A verb asked of no harness, where none of the engine declares it, is refused as none',
      condition: ({ input: [verb, name, harnesses], output }) =>
        name !== undefined || firstDeclaring(harnesses, verb) !== undefined || (output.kind === 'refused' && output.reason === 'none'),
    },
    whatIsTakenDeclaresIt: {
      description: 'A verb only ever goes to a harness that declares it',
      condition: ({ input: [verb, , harnesses], output }) =>
        output.kind !== 'taken' || harnesses.some((h) => h.name === output.name && declares(h, verb)),
    },
  },
});
/** The harness an Engine verb goes to, read off the declarations: the one named, or the first that declares it; or why none. */
export type VerbHarnessOf = Implementation<typeof verbHarnessSpec>;
