/**
 * What `nemia ls` says beside the server's table of the runs, of what is no run: the pause first (`pausedLines`: the pause in one line, as
 * `nemia watch` says it, then each task finishing under it, each session it parked and each check it holds), and after the table a line
 * per schedule of each factory (`scheduleLines`, read off the `Schedule` objects); the daemon's last line is the server's own
 * (`Daemon.line`). Ported word for word from the orchestrator's `pausedLines` (`pause/pause.ts`) and `scheduleLines`
 * (`factory/schedule/schedule.ts`), as the client printed them before the runs were a table. Pure: `now` is handed in.
 */
import type { Paused, Schedule } from 'objects';
import { pausedWords } from '../watch/lines.ts';

/** The command that lifts the pause. */
const RESUME_LINE = 'nemia resume';

/** A duration for a person: `58s`, `19m42s`, `1h05m`, `2d03h`. */
function durationWord(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${two(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${two(m % 60)}m`;
  return `${Math.floor(h / 24)}d${two(h % 24)}h`;
}

type Finishing = Paused['finishing'][number];

const atWorkWords = (kind: Finishing['kind'], calling: string | undefined): string => {
  if (kind === 'session') return calling ? `its call to ${calling} runs` : 'its session is at work';
  return kind === 'check' ? 'its check runs' : 'the check of its landing runs';
};

const finishingWords = ({ run, step, kind, stopping, resumed, calling }: Finishing): string =>
  stopping
    ? `${run}'s ${step} is stopping: its ${kind === 'session' ? 'session' : 'check'} was asked to stop${resumed ? `, and is tried again on ${RESUME_LINE}` : ''}`
    : `${run}'s ${step} is finishing: ${atWorkWords(kind, calling)}`;

/** Every line said of the pause: none when the store is not paused, else the pause, each task finishing and each check it holds. */
export const pausedLines = (paused: Paused, now: Date = new Date()): string[] => {
  const line = pausedWords(paused, now);
  if (line === null) return [];
  return [
    line,
    ...paused.finishing.map((f) => `   ${finishingWords(f)}`),
    ...paused.parked.map(
      ({ run, step, after, cut }) =>
        `   ${run}'s ${step} is paused${after ? ` after its call to ${after}` : cut ? `, its call to ${cut} cut` : ''}`,
    ),
    ...paused.staged.map(
      ({ run, step, repo }) => `   ${run}'s ${step} has its merge staged in ${repo} (MERGE_HEAD), and its check waits on ${RESUME_LINE}`,
    ),
    ...paused.held.map(({ run, step }) => `   ${run}'s ${step} has signed off, and its check waits on ${RESUME_LINE}`),
  ];
};

/** When a schedule fires or fired, and how far that is from `now`. */
const fireWord = (iso: string, now: number): string => {
  const ms = Date.parse(iso) - now;
  return `${iso}, ${ms >= 0 ? `in ${durationWord(ms)}` : `${durationWord(-ms)} ago`}`;
};

/** A factory's schedules, by the factory's name. */
export type FactorySchedules = { readonly factory: string; readonly schedules: readonly Schedule[] };

/** A line per schedule, factories by name and workflows by name, its refusal under it where its latest fire was refused. */
export const scheduleLines = (factories: readonly FactorySchedules[], now: number): string[] =>
  [...factories]
    .sort((a, b) => a.factory.localeCompare(b.factory))
    .flatMap(({ factory, schedules }) =>
      [...schedules]
        .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : a.metadata.name > b.metadata.name ? 1 : 0))
        .flatMap(({ metadata, spec, status }) => [
          `scheduled  ${factory}/${metadata.name}  ${spec.cron}${spec.tz ? ` (${spec.tz})` : ''}  next ${status.next ? fireWord(status.next, now) : 'never'}  last ${status.last ? `${status.last.run} (${fireWord(status.last.at, now)})` : 'none'}`,
          ...(status.refused ? [`  refused: ${status.refused}`] : []),
        ]),
    );
