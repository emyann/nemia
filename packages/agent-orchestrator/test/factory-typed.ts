/**
 * `nemia` as a story of the factories types it, for a stage to take as its `main` (`staged({ main: factoryTyped, … })`): a `nemia
 * factory` verb, which the client holds, run onto its entry's handler as the api calls it (`typed`); `nemia factory resolve` given the
 * proposer the api gives it (`withResolutionProposer`), since a choice that composes an owner's file proposes it; and a verb the old CLI
 * still runs (`nemia start`, `nemia tick`, `nemia proposals`) by the CLI (`main`). Each answers what its handler answers and prints
 * nothing of a factory's: the client prints, and its tests hold the lines.
 */
import { main } from '../src/cli/main.ts';
import { FACTORY_RESOLVE, Invalid, parseArgv, withResolutionProposer, type Env, type Place } from '../src/runner.ts';
import type { Engine } from '../src/cli/flags.ts';
import { handled, typed } from './typed.ts';

/** `nemia factory resolve`'s words read against its spec and check, then its handler run with the proposer the api gives it. */
async function resolved(rest: readonly string[], e?: Engine, place?: Place, env?: Env): Promise<unknown> {
  const args = parseArgv(FACTORY_RESOLVE.spec, rest);
  if (args === undefined)
    throw new Invalid({ message: `nemia factory resolve was given too little to act on: nemia factory resolve ${FACTORY_RESOLVE.usage}` });
  const wrong = FACTORY_RESOLVE.check?.(args);
  if (wrong) throw new Invalid({ message: wrong });
  const entry = { handler: (input: typeof args) => withResolutionProposer(FACTORY_RESOLVE.handler(input)) };
  return handled(entry, args, { ...(e && { e }), ...(place && { place }), ...(env && { env }) });
}

/** `argv` run as a story of the factories runs it: a factory verb onto its handler, the rest by the old CLI. */
export function factoryTyped(argv: readonly string[], e?: Engine, _demand?: unknown, place?: Place, env?: Env): Promise<unknown> {
  if (argv[0] !== 'factory') return main([...argv], e, undefined, place, env);
  if (argv[1] === 'resolve') return resolved(argv.slice(2), e, place, env);
  return typed(argv, e, undefined, place, env);
}
