/**
 * What a harness declares it can do, read by every check that used to name a harness: whether a task asks of its harness something the
 * harness does not declare (`misplacedOf`), which harnesses of an engine take a capability, to name in a refusal's fix (`takersOf`), and
 * which harness an Engine verb that is not a task's goes to (`verbHarnessOf`): `quota`, the MCP verbs, `hold`, the drains.
 *
 * A harness's declaration is one list of the words below (`HarnessDeclaration.can`, agent-runtime, src/harness/declaration.ts), one per
 * harness, Claude Code's included: a new harness is its declaration and its driver. A runner a consumer brings as its own declares
 * nothing (`can: undefined`) and is asked nothing, as `harnessRefusalOf` asks it nothing today.
 *
 * The three types below are declared here because no `src` file holds them yet: implement moves them into
 * `src/harness/declaration.ts`, which changes no law.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * A word a harness's declaration lists: a key of a task's config it takes, a kind of session it keeps, or an Engine verb it answers.
 *
 * - `contextTokens`, `claudeFlags` (a task's `config.claude`, carried whole), `codexArgs` (`config.codex`), `commandArgs` (`command`,
 *   `niceness`, `terminationMessagePath`), `env`, `readOnlyMount`, `writableMount`, `callAdmission`, `projectMcp`, `enabledSkills`,
 *   `memoryLimit`, `bridge` (a session bridged to a remote control): a task's config it takes;
 * - `keepsOpen`: a session kept open until stopped (`restartPolicy: 'Always'`); `holdsCalls`: a call held open for a person (`mayAsk`);
 * - `interrupt`, `answerAsk`, `quota`, `mcp` (`mcpState`, `mcpSignIn`, `mcpSignInState`, `mcpSignOut`), `hold`, `drain` (its sessions'
 *   calls held, and their deadlines paused, while the store's drain stands): an Engine verb it answers.
 */
export type Capability =
  | 'contextTokens'
  | 'claudeFlags'
  | 'codexArgs'
  | 'commandArgs'
  | 'env'
  | 'readOnlyMount'
  | 'writableMount'
  | 'callAdmission'
  | 'projectMcp'
  | 'enabledSkills'
  | 'memoryLimit'
  | 'bridge'
  | 'keepsOpen'
  | 'holdsCalls'
  | 'interrupt'
  | 'answerAsk'
  | 'quota'
  | 'mcp'
  | 'hold'
  | 'drain';

/** One harness of an engine, by the name it is configured under, and what it declares: `undefined` for a runner of the consumer's. */
export type HarnessDeclared = { readonly name: string; readonly can: readonly Capability[] | undefined };

/** The harness an Engine verb goes to, or why none: a name the engine has not, one that does not declare the verb, or none that does. */
export type VerbHarness =
  | { readonly kind: 'taken'; readonly name: string }
  | { readonly kind: 'refused'; readonly reason: 'unknown' | 'undeclared' | 'none' };

/** Whether `harness` declares `capability`: a runner of the consumer's declares nothing. */
const declares = (harness: HarnessDeclared, capability: Capability): boolean => harness.can !== undefined && harness.can.includes(capability);

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
        output === undefined || can === undefined || asked.slice(0, asked.indexOf(output)).every((capability) => lists(can, capability)),
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
