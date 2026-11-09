/**
 * How the stand-in (`testEngine`) picks the harness of a verb only some harnesses answer: by the same declarations and the same road as
 * the engine (`verbHarnessIn`), refused in the same words, in a file of its own: `test-engine.ts` is at its length.
 */
import { Effect } from 'effect';
import { CAPABILITIES, HARNESS_DECLARATIONS, type Capability, type HarnessDeclared } from '../harness/declaration.ts';
import { McpStateRefused, noMcpHarness } from './mcp-state.ts';
import { McpSignInRefused, noSignInHarness } from './mcp-sign-in.ts';
import { quotaRefusalOf, QuotaRefused, type EngineShape } from './engine.ts';
import { mcpStateRefusal } from './options.ts';
import { verbHarnessIn } from './verb-harness.ts';

/** The harness a task filed on the stand-in with none named runs on, which declares every capability. */
export const TEST_HARNESS = 'test';

/** The harnesses a stand-in has unless a test names its own: `test`, which declares everything, then each the runtime declares. */
export const testHarnesses = (): HarnessDeclared[] => [
  { name: TEST_HARNESS, can: CAPABILITIES },
  ...Object.entries(HARNESS_DECLARATIONS).map(([name, d]) => ({ name, can: d.can })),
];

/** The stand-in's harnesses, `declared`, as its verbs ask them: the one a task runs on, and whether it takes a verb. */
export type TestHarnesses = {
  readonly declared: readonly HarnessDeclared[];
  /** The harness a task filed on `harness` runs on: that one where the stand-in has it, else its first, as the engine falls back. */
  readonly runsOn: (harness: string | undefined) => string;
  /** Whether the harness `name` declares `verb`. */
  readonly takes: (verb: Capability, name: string) => boolean;
};

/** `declared` as a stand-in's verbs ask it (`TestHarnesses`). */
export const testHarnessesOf = (declared: readonly HarnessDeclared[]): TestHarnesses => {
  const fallback = declared[0]?.name ?? TEST_HARNESS;
  return {
    declared,
    runsOn: (harness) => (harness !== undefined && declared.some((h) => h.name === harness) ? harness : fallback),
    takes: (verb, name) => verbHarnessIn(verb, name, declared, fallback).kind === 'taken',
  };
};

/** A verb the stand-in does not keep: a test that reaches it has outgrown the stand-in. */
export const unkept = (verb: string) => () =>
  Effect.die(
    new Error(`the test engine keeps no \`${verb}\`: add it to src/service/test-engine.ts, with its walk in test/engine-walks.ts`),
  );

/** The verbs the stand-in does not keep, each dying naming itself (`unkept`). */
export const unkeptVerbs = (): Pick<
  EngineShape,
  'tick' | 'admit' | 'follow' | 'path' | 'close' | 'watch' | 'tallied' | 'up' | 'sweep' | 'removeBody' | 'compact'
> => ({
  tick: unkept('tick'),
  admit: unkept('admit'),
  follow: unkept('follow'),
  path: unkept('path'),
  close: unkept('close'),
  watch: unkept('watch'),
  tallied: unkept('tallied'),
  up: unkept('up'),
  sweep: unkept('sweep'),
  removeBody: unkept('removeBody'),
  compact: unkept('compact'),
});

/**
 * The verbs of the stand-in that go to a harness by what it declares, each refused as the engine refuses it where none takes the verb
 * (`quotaRefusalOf`, `noMcpHarness`, `noSignInHarness`), else `kept`'s: `quota`, which the stand-in asks of no harness,
 * dies naming itself once a harness takes it.
 */
export const declaredVerbsOf = (
  harnesses: TestHarnesses,
  kept: Pick<EngineShape, 'mcpState' | 'mcpSignIn' | 'mcpSignInState' | 'mcpSignOut'>,
): Pick<EngineShape, 'quota' | 'mcpState' | 'mcpSignIn' | 'mcpSignInState' | 'mcpSignOut'> => {
  const { declared } = harnesses;
  const fallback = harnesses.runsOn(undefined);
  const mcp = verbHarnessIn('mcp', undefined, declared, fallback).kind === 'taken';
  const signIn = <A>(asked: () => Effect.Effect<A, McpSignInRefused>, recordRefused: string | undefined) =>
    recordRefused === undefined && !mcp ? Effect.fail(new McpSignInRefused({ message: noSignInHarness(declared), held: false })) : asked();
  return {
    quota: (harness) => {
      const taken = verbHarnessIn('quota', harness, declared, fallback);
      if (taken.kind === 'refused')
        return Effect.fail(new QuotaRefused({ message: quotaRefusalOf(taken.reason, harness ?? fallback, declared) }));
      return unkept('quota')();
    },
    mcpState: (servers) =>
      mcpStateRefusal(servers) === undefined && !mcp
        ? Effect.fail(new McpStateRefused({ message: noMcpHarness(declared) }))
        : kept.mcpState(servers),
    mcpSignIn: (name, server, secret) => signIn(() => kept.mcpSignIn(name, server, secret), mcpStateRefusal({ [name]: server })),
    mcpSignInState: kept.mcpSignInState,
    mcpSignOut: (name, server) => signIn(() => kept.mcpSignOut(name, server), mcpStateRefusal({ [name]: server })),
  };
};
