/**
 * The words of the store's pause on the board (`PauseButton`): whether it runs, is Pausing while what runs finishes, or is Paused once
 * nothing does, as the package says it (`pausedWords`), read off `GET /api/pause` on each poll and never kept. Pure: the time is handed in.
 */
import type { Finishing, Pause, Paused, PauseStaged } from './api';
import { clockWord } from './quota.ts';

/** What the button shows: the store runs, a pause stands while tasks still finish, or nothing runs under it; or nothing is read yet. */
export type PauseState = 'running' | 'pausing' | 'paused' | 'reading';

/**
 * The pause in words: its `state`; `text`, the button's short form (`Pausing · 2`, `Paused`, none while the store runs); `label`, the
 * button's name; `line`, the whole sentence, its `title` and the popover's first line; and each task finishing and landing held, a
 * sentence each.
 */
export type PauseWords = {
  state: PauseState;
  text: string | null;
  label: string;
  line: string;
  finishing: string[];
  staged: string[];
};

/** Since when, by whom and why: `since 16:40 by ann: merging by hand`, and what the file no longer says, said so. */
export function pauseSince(pause: Pause, now: Date): string {
  const at = Number.isNaN(Date.parse(pause.at)) ? 'a time its file no longer says' : clockWord(new Date(pause.at), now);
  return `since ${at} by ${pause.by || 'someone its file no longer names'}${pause.why ? `: ${pause.why}` : ''}`;
}

/** A task still finishing under the pause, in a sentence: its run, its step, and what of it is at work. */
export const finishingSentence = ({ run, step, kind }: Finishing): string =>
  `${run}'s ${step} is finishing: ${kind === 'session' ? 'its session is at work' : kind === 'check' ? 'its check runs' : 'the check of its landing runs'}`;

/** A landing the pause holds with its merge staged, in a sentence: whose, where, and that its check waits on the resume. */
export const stagedSentence = ({ run, step, repo }: PauseStaged): string =>
  `${run}'s ${step} has its merge staged in ${repo} (MERGE_HEAD), and its check waits on the resume`;

/**
 * The pause as `paused` says it at `now`: Pausing with how many tasks still finish, Paused once none does, the store running where no
 * pause stands, and reading while nothing is read; a read that failed says why.
 */
export function pauseWords(paused: Paused | undefined, error: Error | null, now: Date): PauseWords {
  const lists = { finishing: (paused?.finishing ?? []).map(finishingSentence), staged: (paused?.staged ?? []).map(stagedSentence) };
  if (!paused) {
    const line = error ? `Whether the store is paused could not be read: ${error.message}` : 'Reading whether the store is paused.';
    return { state: 'reading', text: null, label: 'The store’s pause, not read', line, ...lists };
  }
  if (!paused.pause) {
    const line = 'The store runs: pause it, and nothing new starts while what runs finishes.';
    return { state: 'running', text: null, label: 'Pause the store', line, ...lists };
  }
  const since = pauseSince(paused.pause, now);
  const count = paused.finishing.length;
  if (count > 0) {
    const line = `Pausing: ${count} finishing — paused ${since}. Nothing new starts, and what runs finishes.`;
    return { state: 'pausing', text: `Pausing · ${count}`, label: `Pausing, ${count} finishing`, line, ...lists };
  }
  const line = `Paused ${since}. Nothing runs and nothing new starts.`;
  return { state: 'paused', text: 'Paused', label: 'Paused: resume the store', line, ...lists };
}
