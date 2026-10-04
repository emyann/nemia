/**
 * The store's cordon, as `kubectl cordon` marks a node: while it stands no pass starts new work — no step, try, round or check filed, no
 * queued task admitted, no queued card started — and what runs finishes. Its words, as `wf ls`, `wf feed`, `wf start`, `wf up` and the
 * board say it. Pure: its file is `cordon.store.ts`'s, and the gates that honour it are `assess` and the tick's `pass`.
 */

/**
 * A person's cordon on the store, as its file says it: when it was put, who put it, and the person's words for why (`why`, absent when none
 * were given), each one line. A file that does not read gives each field empty, and still cordons.
 */
export type Cordon = { at: string; by: string; why?: string };

/**
 * A landing the cordon holds with its merge staged: the ending of `run`, `step`, whose session staged the merge in `repo`'s own checkout
 * and whose check is not filed until the lift, so MERGE_HEAD stays there meanwhile.
 */
export type CordonStaged = { run: string; step: string; repo: string };

/** What a reader of the whole store is told of the cordon: the cordon, or null, and each landing it holds with its merge staged. */
export type Cordoned = { cordon: Cordon | null; staged: CordonStaged[] };

/** How `wf cordon` and `wf uncordon` are typed, as every line that offers them says them. */
export const UNCORDON = 'wf uncordon';

/** The cordon in one line: since when, by whom and why, what it stops, and the verb that lifts it. */
export const cordonWords = ({ at, by, why }: Cordon): string =>
  `the store is cordoned since ${at || 'a time its file no longer says'} by ${by || 'someone its file no longer names'}${why ? `: ${why}` : ''} — nothing new starts, and what runs finishes; ${UNCORDON} lifts it`;

/** A landing the cordon holds, in one line: its run, and the checkout its merge is staged in until the lift. */
export const stagedWords = ({ run, step, repo }: CordonStaged): string =>
  `${run}'s ${step} has its merge staged in ${repo} (MERGE_HEAD), and its check waits on ${UNCORDON}`;

/** Every line said of the cordon: none when the store is not cordoned, else the cordon, then each landing it holds, indented. */
export const cordonLines = ({ cordon, staged }: Cordoned): string[] =>
  cordon ? [cordonWords(cordon), ...staged.map((s) => `   ${stagedWords(s)}`)] : [];

/** What `wf up` says once the cordon it said is lifted. */
export const UNCORDONED = 'the store is uncordoned — the next pass files what waits';
