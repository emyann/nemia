/**
 * The keys of a run's records in the keyspace, laid out as Kubernetes' registry lays out its resources: a run's record at
 * `/registry/runs/<id>`, the claim of the card a run was started from at `/registry/claims/<card>`, and a person's asks of a run under
 * `/registry/asks/<id>/`, each at the name its file had (`retry-<step>-<n>`, `round-…`, `approve-…`, `accept-…`, `merge-…`, `route-…`), a
 * spent one under `done/` there. Named here so a pure reader — a refusal's words, `forgetRefusal` — names an ask's key without the door.
 * Pure.
 */
import type { AskKey, AskOf } from '../record/record.ts';

/** Where every run's record is: a run's key is its id beneath it. */
export const RUNS_PREFIX = '/registry/runs/';

/** Where every card's claim is: a claim's key is its card's name beneath it. */
const CLAIMS_PREFIX = '/registry/claims/';

/** Where every run's asks are, each run's under its id. */
export const ASKS_PREFIX = '/registry/asks/';

/**
 * The key of a run's record.
 * @param id The run's id.
 */
export const runKey = (id: string) => `${RUNS_PREFIX}${id}`;

/**
 * The key of the claim a run holds on the card it was started from.
 * @param card The card's name.
 */
export const claimKey = (card: string) => `${CLAIMS_PREFIX}${card}`;

/**
 * Where a run's asks are, waiting and spent.
 * @param id The run's id.
 */
export const asksPrefix = (id: string) => `${ASKS_PREFIX}${id}/`;

/**
 * The key of a run's waiting ask.
 * @param id The run's id.
 * @param name The ask's name, as its file was named.
 */
export const askKeyOf = (id: string, name: string) => `${asksPrefix(id)}${name}`;

/**
 * The key of a run's spent ask, under `done/`.
 * @param id The run's id.
 * @param name The ask's name there, a `.<k>` after it where one spent before holds the plain name.
 */
export const askDoneKey = (id: string, name: string) => `${asksPrefix(id)}done/${name}`;

/** Each kind of ask by the word its name begins with, as its file was named. */
export const ASK_WORDS: Record<AskOf, string> = { try: 'retry', round: 'round', gate: 'approve', loop: 'accept', base: 'merge' };

/** The name of an ask, given which it is: its kind's word, its step and its number. */
export const askName = ({ of, step, n }: AskKey) => `${ASK_WORDS[of]}-${step}-${n}`;

/**
 * The key of a run's waiting ask, by which it is.
 * @param id The run's id.
 * @param key Which ask: its kind, its step and its number.
 */
export const askKey = (id: string, key: AskKey) => askKeyOf(id, askName(key));
