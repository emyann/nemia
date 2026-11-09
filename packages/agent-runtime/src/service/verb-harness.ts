/**
 * Which harness an Engine verb that only some harnesses answer goes to, read off what each declares (`verbHarnessOf`): the engine's and
 * the stand-in's one road, so neither picks a harness by its name.
 */
import { DEFAULT_HARNESS, verbHarnessOf, type Capability, type HarnessDeclared, type VerbHarness } from '../harness/declaration.ts';
import type { RunnerOps } from '../harness/seam.ts';
import { declarationOf, type HarnessConfig } from './options.ts';

/** The verbs a runner of the consumer's answers through an op of its own, and that op: what it declares, having no declaration. */
const RUNNER_VERBS: readonly (readonly [Capability, keyof RunnerOps])[] = [
  ['interrupt', 'interrupt'],
  ['answerAsk', 'answer'],
  ['quota', 'quota'],
];

/**
 * What the harness `config` declares it answers: its declaration's `can` (`declarationOf`), or, for a runner of the consumer's, which
 * has none, the verbs it has an op for — a runner is never asked a verb it cannot answer, and never refused one it can.
 */
export const canOf = (config: HarnessConfig): readonly Capability[] => {
  const declared = declarationOf(config);
  if (declared !== undefined) return declared.can;
  if (typeof config !== 'object' || !('spawn' in config)) return [];
  return RUNNER_VERBS.filter(([, op]) => config[op] !== undefined).map(([verb]) => verb);
};

/** Each harness of `harnesses`, in the engine's order, with what it declares (`canOf`). */
export const declaredOf = (harnesses: Record<string, HarnessConfig>): HarnessDeclared[] =>
  Object.entries(harnesses).map(([name, config]) => ({ name, can: canOf(config) }));

/** The harness a task that names none runs on: `defaultHarness`, else the first configured, else the runtime's default. */
export const fallbackOf = (harnesses: Record<string, HarnessConfig>, defaultHarness: string | undefined): string =>
  defaultHarness ?? Object.keys(harnesses)[0] ?? DEFAULT_HARNESS;

/**
 * The harness `verb` goes to: the one `name`d, or with none named the default harness where it declares the verb, else the first
 * that does — or why none: a name not among `declared`, one that does not declare the verb, or none that does.
 */
export const verbHarnessIn = (
  verb: Capability,
  name: string | undefined,
  declared: readonly HarnessDeclared[],
  fallback: string,
): VerbHarness =>
  verbHarnessOf(
    verb,
    name,
    name === undefined ? [...declared.filter((h) => h.name === fallback), ...declared.filter((h) => h.name !== fallback)] : declared,
  );
