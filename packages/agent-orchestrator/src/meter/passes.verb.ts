/**
 * `nemia passes`, and `GET /api/passes`: what the recent passes of the tick cost (`PassesRead`), read off the store's `tick-recent.json`
 * (`recentPasses`), so the command line and the api answer the same, whichever process ticks. A controller: an entry of the command table.
 */
import { LAST_TAKES, PASSES_WORDS } from 'objects';
import { Effect, Schema } from 'effect';
import { tried } from '../runtime-client.ts';
import { recentPasses } from '../daemon/daemon.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import type { Args } from '../command/command.ts';
import type { Served } from '../command/entry.verb.ts';
import { passesRead, type PassesRead } from './meter.ts';
import { StoreRoot } from '../config/root.store.ts';

/** A text argument's value, or undefined where it was not given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * How many of the recent passes `args` asks for: every one kept with no `--last`. Refuses as `Invalid` a `--last` that is not a whole
 * number from 1.
 */
export const lastOf = (args: Args): number => {
  const last = textOf(args, 'last');
  if (last === undefined) return Infinity;
  const n = /^\d+$/.test(last) ? Number(last) : 0;
  if (n < 1) throw new Invalid({ message: `${LAST_TAKES}, not ${JSON.stringify(last)}.` });
  return n;
};

/** The recent passes `args` asks for, oldest first, and of them the histogram, the parts and the summary. */
export const passesOf = (home: string, args: Args): PassesRead => {
  const n = lastOf(args);
  const recent = recentPasses(home);
  return passesRead(Number.isFinite(n) ? recent.slice(-n) : recent);
};

/** What `nemia passes`' handler takes: `--last`, as the text given; `--json` is the client's, which the api never reads. */
export const PassesInput = Schema.Struct({ last: Schema.optionalKey(Schema.String), json: Schema.optionalKey(Schema.Boolean) });
export type PassesInput = typeof PassesInput.Type;

/** `nemia passes`: the recent passes of the tick, a histogram of their times and where it went, phase by phase. */
export const PASSES: Served<PassesRead, PassesInput> = {
  ...PASSES_WORDS,
  input: PassesInput,
  handler: (input) => Effect.flatMap(StoreRoot, (home) => tried(() => passesOf(home, input))),
};
