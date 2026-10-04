/**
 * The store's pause, which the runtime calls unschedulable: while it stands no pass starts new work — no step, try, round or check filed, no
 * queued task admitted, no queued card started — and what runs finishes. Its words, as `wf ls`, `wf feed`, `wf start`, `wf up` and the
 * board say it. Pure: its file is `pause.store.ts`'s, and the gates that honour it are `assess` and the tick's `pass`.
 */

/**
 * A person's pause on the store, as its file says it: when it was put, who put it, and the person's words for why (`why`, absent when none
 * were given), each one line. A file that does not read gives each field empty, and still pauses.
 */
export type Pause = { at: string; by: string; why?: string };

/**
 * A landing the pause holds with its merge staged: the ending of `run`, `step`, whose session staged the merge in `repo`'s own checkout
 * and whose check is not filed until the lift, so MERGE_HEAD stays there meanwhile.
 */
export type PauseStaged = { run: string; step: string; repo: string };

/** What a reader of the whole store is told of the pause: the pause, or null, and each landing it holds with its merge staged. */
export type Paused = { pause: Pause | null; staged: PauseStaged[] };

/** How `wf resume` is typed, as every line that offers it says it. */
export const RESUME_LINE = 'wf resume';

/** The pause in one line: since when, by whom and why, what it stops, and the verb that lifts it. */
export const pauseWords = ({ at, by, why }: Pause): string =>
  `the store is paused since ${at || 'a time its file no longer says'} by ${by || 'someone its file no longer names'}${why ? `: ${why}` : ''} — nothing new starts, and what runs finishes; ${RESUME_LINE} lifts it`;

/** A landing the pause holds, in one line: its run, and the checkout its merge is staged in until the lift. */
export const stagedWords = ({ run, step, repo }: PauseStaged): string =>
  `${run}'s ${step} has its merge staged in ${repo} (MERGE_HEAD), and its check waits on ${RESUME_LINE}`;

/** Every line said of the pause: none when the store is not paused, else the pause, then each landing it holds, indented. */
export const pausedLines = ({ pause, staged }: Paused): string[] =>
  pause ? [pauseWords(pause), ...staged.map((s) => `   ${stagedWords(s)}`)] : [];

/** What `wf up` says once the pause it said is lifted. */
export const RESUMED = 'the store is resumed — the next pass files what waits';
