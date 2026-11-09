/**
 * The words of the pause of all factories on the board (`PauseButton`): whether they run, are Pausing while each working session stops at
 * its current tool call's end, or are Paused once nothing does, as the package says it (`pausedWords`), read off `GET /api/pause` on each
 * poll and never kept. Pure: the time is handed in. The board neither shows nor sets a pause's timeout: it pauses with the store's, and
 * says only when what finishes is cut.
 */
import type { Finishing, Interrupt, Parked, Pause, Paused, PauseHeld, PauseStaged } from './api';
import { durationWords } from './duration.ts';
import { clockWord } from './quota.ts';

/** What a timed pause does, the package's words: each working session stops at its call's end, cut once the timeout passes. */
export const PAUSE_PARKS =
  'nothing new starts, and each working session stops when its current tool call ends, cut once the timeout passes';

/** What a pause at once does (its timeout 0, the board's Stop now), the package's words: each working session is cut at once and parks. */
const PAUSE_CUTS = 'nothing new starts, and each working session is cut at once and parks';

/** What a pause with no timeout does (a restart's take-over), the package's words: each working session runs on. */
const PAUSE_RUNS_ON = 'nothing new starts, and each working session runs on to its end';

/**
 * What `pause` does, as the package says it: `PAUSE_CUTS` under a timeout of 0, `PAUSE_PARKS` under another,
 * `PAUSE_RUNS_ON` under none.
 */
const pauseDoes = ({ timeoutMs }: Pause): string => (timeoutMs === 0 ? PAUSE_CUTS : timeoutMs !== undefined ? PAUSE_PARKS : PAUSE_RUNS_ON);

/** The same words opening a sentence. */
const opening = (words: string): string => `${words.charAt(0).toUpperCase()}${words.slice(1)}`;

/** What the button shows: all factories run, a pause stands while tasks still finish, or nothing runs under it; or nothing is read yet. */
export type PauseState = 'running' | 'pausing' | 'paused' | 'reading';

/**
 * The pause in words: its `state`; `text`, the button's short form (`Pausing · 2`, `Paused`, none while all factories run); `label`, the
 * button's name; `line`, the whole sentence, its `title` and the popover's first line; and each task finishing, session parked, landing
 * staged and other check held, a sentence each.
 */
export type PauseWords = {
  state: PauseState;
  text: string | null;
  label: string;
  line: string;
  finishing: string[];
  parked: string[];
  staged: string[];
  held: string[];
};

/** Since when, by whom and why: `since 4:40 PM by ann: merging by hand`, and what the file no longer says, said so. */
function pauseSince(pause: Pause, now: Date): string {
  const at = Number.isNaN(Date.parse(pause.at)) ? 'a time its file no longer says' : clockWord(new Date(pause.at), now);
  return `since ${at} by ${pause.by || 'someone its file no longer names'}${pause.why ? `: ${pause.why}` : ''}`;
}

/**
 * A task still finishing under the pause, in a sentence: its run, its step, and what of it is at work; or, once asked to stop, that it is
 * stopping, and tried again on the resume only where a pause at once's ask names it (`resumed`); a session in a tool call names the tool.
 */
export const finishingSentence = ({ run, step, kind, stopping, resumed, calling }: Finishing): string =>
  stopping
    ? `${run}'s ${step} is stopping: its ${kind === 'session' ? 'session' : 'check'} was asked to stop${resumed ? ', and is tried again on the resume' : ''}`
    : `${run}'s ${step} is finishing: ${atWork(kind, calling)}`;

/** What of a step is at work, in words: its session, in its call to `calling` where it is in one, its check, or its landing's. */
const atWork = (kind: Finishing['kind'], calling: string | undefined): string => {
  if (kind === 'session') return calling ? `its call to ${calling} runs` : 'its session is at work';
  return kind === 'check' ? 'its check runs' : 'the check of its landing runs';
};

/** A session the pause has parked, in a sentence: its run and step, and the call it stopped after or the call cut (`parkedWords`). */
export const parkedSentence = ({ run, step, after, cut }: Parked): string =>
  `${run}'s ${step} is paused${after ? ` after its call to ${after}` : cut ? `, its call to ${cut} cut` : ''}`;

/**
 * How many sessions still finish a tool call and when what is left is cut, after the package's `pausingWords`: "Pausing: 2 sessions
 * finishing a tool call, cut in 1h 30m", `leftMs` to the minute as every duration is said (`durationWords`); "…, cut now" once none is
 * left.
 */
const pausingLine = (sessions: number, leftMs: number): string =>
  `Pausing: ${sessions} session${sessions === 1 ? '' : 's'} finishing a tool call, cut ${leftMs > 0 ? `in ${durationWords(leftMs, 'minute')}` : 'now'}`;

/**
 * The head of the Pausing line: under a pause with a timeout while sessions finish, how many and when they are cut (`pausingLine`);
 * otherwise how many tasks finish.
 */
const pausingHead = ({ pause, finishing }: Paused & { pause: Pause }, now: Date): string => {
  const sessions = finishing.filter((f) => f.kind === 'session').length;
  return pause.timeoutMs !== undefined && sessions
    ? pausingLine(sessions, Math.min(pause.timeoutMs, Date.parse(pause.at) + pause.timeoutMs - now.getTime()))
    : `Pausing: ${finishing.length} finishing`;
};

/** A task a pause at once would stop, in a few words: its run, then its step's session or check. */
export const interruptSentence = ({ run, step, kind }: Interrupt): string => `${run}: ${step}'s ${kind}`;

/** A landing the pause holds with its merge staged, in a sentence: whose, where, and that its check waits on the resume. */
const stagedSentence = ({ run, step, repo }: PauseStaged): string =>
  `${run}'s ${step} has its merge staged in ${repo} (MERGE_HEAD), and its check waits on the resume`;

/** A check the pause holds whose merge is not staged, in a sentence: whose, and that its check waits on the resume. */
const heldSentence = ({ run, step }: PauseHeld): string => `${run}'s ${step} has signed off, and its check waits on the resume`;

/** How many checks the pause holds back, staged landings among them: `, 2 checks held`, or nothing for none. */
const heldCount = ({ staged, held }: Paused): string => {
  const n = staged.length + held.length;
  return n ? `, ${n} check${n === 1 ? '' : 's'} held` : '';
};

/**
 * The pause as `paused` says it at `now`: Pausing with how many tasks still finish — under a timeout, how many sessions finish a tool call
 * and when what is left is cut (`pausingHead`) — Paused once none does, each with how many checks it holds back, when any, and each
 * session it parked named; all factories running where no pause stands, and reading while nothing is read; a read that failed says why.
 */
export function pauseWords(paused: Paused | undefined, error: Error | null, now: Date): PauseWords {
  const lists = {
    finishing: (paused?.finishing ?? []).map(finishingSentence),
    parked: (paused?.parked ?? []).map(parkedSentence),
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
    const line = `Pause all factories: ${PAUSE_PARKS}.`;
    return { state: 'running', text: null, label: 'Pause all factories', line, ...lists };
  }
  const since = pauseSince(paused.pause, now);
  const count = paused.finishing.length;
  if (count > 0) {
    const head = pausingHead({ ...paused, pause: paused.pause }, now);
    const line = `${head}${heldCount(paused)} — paused ${since}. ${opening(pauseDoes(paused.pause))}.`;
    return { state: 'pausing', text: `Pausing · ${count}`, label: `Pausing, ${count} finishing`, line, ...lists };
  }
  const line = `Paused ${since}. Nothing runs and nothing new starts${heldCount(paused)}.`;
  return { state: 'paused', text: 'Paused', label: 'Paused: resume all factories', line, ...lists };
}
