/**
 * The reads beside the floor of an agent's standing token (`floorOf`, floor.ts), as `admit.verb.ts` reads them beside admission: for a
 * request the api takes under a token the person minted for an agent, the class of the command its endpoint serves for an agent
 * (`agentClassOf`), the factory it acts in and that factory's level, whether it answers what waits on the person (admission's `askedOf`)
 * and whether a rule the person confirmed for the agent lets it through at `auto` (admission's `policyAllows`), each read afresh on each
 * request; then the floor's answer (`tokenFloor`). The person's tokens and a session's are never judged here.
 */
import { Effect, Result } from 'effect';
import type { ProposalCaller } from '../caller/index.ts';
import { StoreRoot } from '../config/root.store.ts';
import { levelOfFactory, runFactory } from '../level/levels.verb.ts';
import { NEMIA_FLOOR } from '../nemia/nemia.ts';
import { askedOf, policyAllows, type AdmissionEntry, type Typed } from './admission.ts';
import { policyReadOf, waitRead } from './admit.verb.ts';
import { agentClassOf } from './class.ts';
import { floorOf, type FloorAnswer, type FloorCall } from './floor.ts';

/**
 * A request as the floor reads it: its HTTP method, and the parts its endpoint decoded — its path's `params`, its `query` and its
 * `payload` — of which the floor reads a run (`runId`, or a run's `name` under `/runs/`, `run` naming the endpoint's group), a step
 * (`step`), a factory (`namespace`, `?factory=`, or a factory's `name` under `factories`) and a retry's or an approval's raise and round.
 */
export type FloorRequest = {
  readonly method: string;
  readonly group: string;
  readonly params?: unknown;
  readonly query?: unknown;
  readonly payload?: unknown;
};

/**
 * The level an agent's call through a standing token must find the factory it acts in at, as Nemia's own session, which acts store-wide,
 * is admitted at (`NEMIA_FLOOR`, its hook's `--at-least`): a factory below it is left alone.
 */
export const TOKEN_LEAST = NEMIA_FLOOR;

/** `value` as a record of its keys, or an empty one where it is none. */
const keysOf = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : {};

/** The text under `key` of `record`, or undefined where it holds none. */
const textAt = (record: Readonly<Record<string, unknown>>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

/** The run, the step and the factory `request` names, as its endpoint's parts carry them. */
function namedBy(request: FloorRequest): { run?: string; step?: string; factory?: string } {
  const params = keysOf(request.params);
  const query = keysOf(request.query);
  const run = textAt(params, 'runId') ?? (request.group === 'runs' ? textAt(params, 'name') : undefined);
  const step = textAt(params, 'step');
  const factory =
    textAt(params, 'namespace') ?? textAt(query, 'factory') ?? (request.group === 'factories' ? textAt(params, 'name') : undefined);
  return {
    ...(run === undefined ? {} : { run }),
    ...(step === undefined ? {} : { step }),
    ...(factory === undefined ? {} : { factory }),
  };
}

/**
 * The words an answer's body says as the command line says them, which admission reads: a retry's `--round` and a raise of a cap
 * (`--budget`), a retry's own or an approval's of a step after its gate.
 */
function wordsOf(payload: unknown): string[] {
  const body = keysOf(payload);
  const budgets = Array.isArray(body.budgets) ? body.budgets.map(keysOf) : [];
  return [
    ...(body.round === true ? ['--round'] : []),
    ...(typeof body.budget === 'number' ? ['--budget', String(body.budget)] : []),
    ...budgets.flatMap((b) => ['--budget', `${String(b.step)}=${String(b.usd)}`]),
  ];
}

/** The class of `entry` for an agent's call by `method`: out of reach where an agent never types it, and a setter's bare read for a GET. */
const classFor = (entry: AdmissionEntry, method: string): FloorCall['class'] => {
  const c = agentClassOf(entry);
  return typeof c !== 'object' ? c : method === 'GET' ? c.bare : c.sets;
};

/** The level of the factory `factory`, or `manual` where it does not read: what admission reads of a factory it cannot. */
const levelRead = (factory: string) =>
  Effect.map(Effect.result(levelOfFactory(factory)), (level) => (Result.isSuccess(level) ? level.success : ('manual' as const)));

/**
 * The floor's answer for `request`, served as the command `entry` (the strictest of the table's entries that link its endpoint, or one
 * classed by its method where none does), under `caller`'s token: `undefined` for a caller that is no agent presenting a standing token —
 * the person, or a session, judged elsewhere. The factory it acts in is its run's where it names one that reads, else the one it names;
 * a store-wide token takes every factory at the level Nemia's session does (`TOKEN_LEAST`). An answer naming no run and step waits on the
 * person, as admission asks of one; every read is made on this request, none kept.
 */
export const tokenFloor = Effect.fnUntraced(function* (caller: ProposalCaller, entry: AdmissionEntry, request: FloorRequest) {
  if (caller.kind !== 'agent' || !caller.token) return undefined;
  const named = namedBy(request);
  const ran = named.run === undefined ? undefined : yield* Effect.result(runFactory(named.run));
  const factory = ran !== undefined && Result.isSuccess(ran) ? ran.success : (named.factory ?? null);
  const level = factory === null ? null : yield* levelRead(factory);
  const resolved = classFor(entry, request.method);
  const typed: Typed = {
    name: entry.name,
    class: resolved,
    args: [...(named.run === undefined ? [] : [named.run]), ...(named.step === undefined ? [] : [named.step]), ...wordsOf(request.payload)],
  };
  let waits = false;
  let ruled = false;
  if (resolved === 'answer') {
    const wait = named.run === undefined || named.step === undefined ? undefined : yield* Effect.result(waitRead(named.run, named.step));
    const waitOf = (): string | undefined =>
      wait === undefined ? undefined : Result.isSuccess(wait) ? wait.success : `is not there: ${wait.failure.message}`;
    waits = askedOf(typed, waitOf) !== undefined;
    ruled = waits && policyAllows(typed, [entry], yield* policyReadOf([typed], [entry], caller.agent, yield* StoreRoot));
  }
  const call: FloorCall = { class: resolved, factory, level, least: TOKEN_LEAST, waits, ruled };
  return floorOf(call, { factory: caller.factory, narrowed: caller.narrowed ?? null }) satisfies FloorAnswer;
});
