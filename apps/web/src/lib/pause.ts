/**
 * The words of the pause of all factories on the board (`PauseButton`): whether they run, are Pausing while what runs finishes, or are
 * Paused once nothing does, as the package says it (`pausedWords`), read off `GET /api/pause` on each poll and never kept. Pure: the time
 * is handed in.
 */
import type { Finishing, Interrupt, Pause, Paused, PauseHeld, PauseStaged } from './api';
import { clockWord } from './quota.ts';

/** What the button shows: all factories run, a pause stands while tasks still finish, or nothing runs under it; or nothing is read yet. */
export type PauseState = 'running' | 'pausing' | 'paused' | 'reading';

/**
 * The pause in words: its `state`; `text`, the button's short form (`Pausing · 2`, `Paused`, none while all factories run); `label`, the
 * button's name; `line`, the whole sentence, its `title` and the popover's first line; and each task finishing, landing staged and other
 * check held, a sentence each.
 */
export type PauseWords = {
  state: PauseState;
  text: string | null;
  label: string;
  line: string;
  finishing: string[];
  staged: string[];
  held: string[];
};

/** Since when, by whom and why: `since 4:40 PM by ann: merging by hand`, and what the file no longer says, said so. */
export function pauseSince(pause: Pause, now: Date): string {
  const at = Number.isNaN(Date.parse(pause.at)) ? 'a time its file no longer says' : clockWord(new Date(pause.at), now);
  return `since ${at} by ${pause.by || 'someone its file no longer names'}${pause.why ? `: ${pause.why}` : ''}`;
}

/**
 * A task still finishing under the pause, in a sentence: its run, its step, and what of it is at work; or, once asked to stop, that it is
 * stopping, and tried again on the resume only where a pause at once's ask names it (`resumed`).
 */
export const finishingSentence = ({ run, step, kind, stopping, resumed }: Finishing): string =>
  stopping
    ? `${run}'s ${step} is stopping: its ${kind === 'session' ? 'session' : 'check'} was asked to stop${resumed ? ', and is tried again on the resume' : ''}`
    : `${run}'s ${step} is finishing: ${kind === 'session' ? 'its session is at work' : kind === 'check' ? 'its check runs' : 'the check of its landing runs'}`;

/** A task a pause at once would stop, in a few words: its run, then its step's session or check. */
export const interruptSentence = ({ run, step, kind }: Interrupt): string => `${run}: ${step}'s ${kind}`;

/** A landing the pause holds with its merge staged, in a sentence: whose, where, and that its check waits on the resume. */
export const stagedSentence = ({ run, step, repo }: PauseStaged): string =>
  `${run}'s ${step} has its merge staged in ${repo} (MERGE_HEAD), and its check waits on the resume`;

/** A check the pause holds whose merge is not staged, in a sentence: whose, and that its check waits on the resume. */
export const heldSentence = ({ run, step }: PauseHeld): string => `${run}'s ${step} has signed off, and its check waits on the resume`;

/** How many checks the pause holds back, staged landings among them: `, 2 checks held`, or nothing for none. */
const heldCount = ({ staged, held }: Paused): string => {
  const n = staged.length + held.length;
  return n ? `, ${n} check${n === 1 ? '' : 's'} held` : '';
};

/**
 * The pause as `paused` says it at `now`: Pausing with how many tasks still finish, Paused once none does, each with how many checks it
 * holds back, when any; all factories running where no pause stands, and reading while nothing is read; a read that failed says why.
 */
export function pauseWords(paused: Paused | undefined, error: Error | null, now: Date): PauseWords {
  const lists = {
    finishing: (paused?.finishing ?? []).map(finishingSentence),
    staged: (paused?.staged ?? []).map(stagedSentence),
    held: (paused?.held ?? []).map(heldSentence),
  };
  if (!paused) {
    const line = error
      ? `Whether all factories are paused could not be read: ${error.message}`
      : 'Reading whether all factories are paused.';
    return { state: 'reading', text: null, label: 'The pause of all factories, not read', line, ...lists };
  }
  if (!paused.pause) {
    const line = 'Pause all factories: nothing new starts, and what runs finishes.';
    return { state: 'running', text: null, label: 'Pause all factories', line, ...lists };
  }
  const since = pauseSince(paused.pause, now);
  const count = paused.finishing.length;
  if (count > 0) {
    const line = `Pausing: ${count} finishing${heldCount(paused)} — paused ${since}. Nothing new starts, and what runs finishes.`;
    return { state: 'pausing', text: `Pausing · ${count}`, label: `Pausing, ${count} finishing`, line, ...lists };
  }
  const line = `Paused ${since}. Nothing runs and nothing new starts${heldCount(paused)}.`;
  return { state: 'paused', text: 'Paused', label: 'Paused: resume all factories', line, ...lists };
}
