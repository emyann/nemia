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

/**
 * Where every run's markers are, each run's under its id: its cancellation, pruning, hold, assignee, labels, refresh ask and the words
 * said to its
 * steps.
 */
export const RUNMARKS_PREFIX = '/registry/runmarks/';

/**
 * Where the markers `nemia rm` keeps of the runs it forgets are: outside a run's own marks, since they outlive its record
 * (`forget.verb.ts`).
 */
export const FORGETTING_PREFIX = '/registry/forgetting/';

/**
 * The markers a run carries by a key of their own, each the text its file held: called off, pruned, held, who lifted a hold, assigned,
 * how an assignee ended, labelled,
 * asked to refresh.
 */
export const RUN_MARKERS = ['cancelled', 'pruned', 'hold', 'unheld', 'assignee', 'unassigned', 'labels', 'refresh'] as const;

/** One of a run's markers. */
export type RunMarker = (typeof RUN_MARKERS)[number];

/**
 * Where a run's markers are.
 * @param id The run's id.
 */
export const runMarksPrefix = (id: string) => `${RUNMARKS_PREFIX}${id}/`;

/**
 * The key of one of a run's markers.
 * @param id The run's id.
 * @param marker Which marker.
 */
export const runMarkKey = (id: string, marker: RunMarker) => `${runMarksPrefix(id)}${marker}`;

/**
 * Where the words said to a run's steps before each was filed are, one record each.
 * @param id The run's id.
 */
export const saidPrefix = (id: string) => `${runMarksPrefix(id)}said/`;

/**
 * The key of the `n`th word said to a run's steps before it was filed.
 * @param id The run's id.
 * @param n The word's number, from 1 in the order kept.
 */
export const saidKey = (id: string, n: number) => `${saidPrefix(id)}${n}`;

/**
 * The key of the marker `nemia rm` wrote for a run it forgets.
 * @param id The run's id.
 */
export const forgettingKey = (id: string) => `${FORGETTING_PREFIX}${id}`;
