/**
 * What `nemia ls` prints of the api's answer (`RunsListed`, `GET /api/listing`): a port of the orchestrator's `lsLines` and its helpers
 * (`list/list.ts`), with the pause it says first (`pausedLines`, `pause/pause.ts`), the daemon's line (`daemonLine`, `daemon/daemon.ts`),
 * the schedules' (`scheduleLines`, `schedule/schedule.ts`) and the words of a wait and a hold
 * (`wait/wait.ts`), word for word. The in-process
 * `nemia ls --local` prints the same lines, which `test/reads.test.ts` holds equal on a seeded store until the in-process reads retire.
 * Pure: `now` is handed in.
 */
import path from 'node:path';
import type { Paused, RunsListed } from '../../../api/src/client/client.ts';
import type { LabelMap } from './labels.ts';
import { LEASE_FILE as DAEMON_FILE } from '../where.ts';

type Row = RunsListed['runs'][number];
type Run = Row['run'];
type Unjudged = Extract<Row['listed'], { said: string }>;
type Listing = Exclude<Row['listed'], Unjudged>;
type Step = Listing['steps'][number];
type Wait = Listing['waiting'][number];
type ToDecide = NonNullable<Listing['toDecide']>;
type DaemonStanding = RunsListed['daemon'];
type Standing = Extract<DaemonStanding, { file: unknown }>;
type DaemonFile = Standing['file'];
type ScheduleListed = NonNullable<RunsListed['schedules']>[number];
type Finishing = Paused['finishing'][number];

/** `text` up to the first `separator`, or the whole of it where there is none. */
const firstPiece = (text: string, separator: string): string => {
  const at = text.indexOf(separator);
  return at === -1 ? text : text.slice(0, at);
};

/** A duration for a person: `58s`, `19m42s`, `1h05m`, `2d03h`. */
export function durationWord(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${two(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${two(m % 60)}m`;
  return `${Math.floor(h / 24)}d${two(h % 24)}h`;
}

const waitName = (w: Wait): string =>
  `${w.run}${w.missing ? ' (no such run)' : w.cancelledAt ? ' (cancelled)' : w.gone?.length ? ` (${w.gone.join(', ')} gone)` : w.unread ? ` (where it stands is unread: ${w.unread})` : ''}`;

const neverLands = (w: Wait): boolean => Boolean(w.missing || w.cancelledAt || w.gone?.length);

function neverWhy(w: Wait, branch: string | undefined): string {
  if (w.missing) return `the store has no run ${w.run}`;
  if (w.cancelledAt) return `${w.run} was cancelled at ${w.cancelledAt}, and a cancelled run never lands`;
  const gone = w.gone ?? [];
  return `${gone.join(', ')} ${gone.length > 1 ? 'are gone, and git cannot find them' : 'is gone, and git cannot find it'} on ${branch}`;
}

function waitAdvice(run: Run, waits: readonly Wait[]): string {
  const never = waits.filter(neverLands);
  if (!never.length) {
    return `nothing of ${run.id} is filed until nemia decide says ${waits.map((w) => w.run).join(' and ')} ${waits.length > 1 ? 'have' : 'has'} landed on ${run.branch}; nothing to decide yet`;
  }
  const why = never.map((w) => neverWhy(w, run.branch));
  return `${why.join('; ')} — yours to resolve: nemia cancel ${run.id}, or start the work again without ${never.map((w) => `--after ${w.run}`).join(' ')}`;
}

const runList = (ids: readonly string[]): string => (ids.length > 1 ? `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}` : (ids[0] ?? ''));

type Said = { why?: string; by?: string };

const saidWord = ({ why, by }: Said): string => {
  const parts = [...(why ? [`why: ${why}`] : []), ...(by ? [`by ${by}`] : [])];
  return parts.length ? ` (${parts.join('; ')})` : '';
};

function holdWord(waits: readonly Wait[], said: Said = {}): string {
  const words = saidWord(said);
  if (!waits.length) return `held, on a hold that names no run${words}`;
  const named = runList(waits.map(waitName));
  const one = waits.length === 1;
  const held = `held until ${named} ${one ? 'lands' : 'land'}${words}`;
  if (waits.every((w) => w.landed)) return `${held} — ${one ? 'it has' : 'they have'} landed, and the next tick lifts the hold`;
  return held;
}

function holdAdvice(run: Run, waits: readonly Wait[]): string {
  const off = `nemia hold ${run.id} --off`;
  if (!waits.length) return `the hold on ${run.id} names no run, so no run's landing lifts it — yours to lift: ${off}`;
  if (waits.every((w) => w.landed)) return `the next tick lifts the hold, and ${run.id} goes on; nothing to decide yet`;
  const never = waits.filter(neverLands);
  if (!never.length) {
    const ids = waits.map((w) => w.run);
    return `nothing of ${run.id} is filed, and nothing is asked of you, until nemia decide says ${runList(ids)} ${ids.length > 1 ? 'have' : 'has'} landed; to go on before then: ${off}`;
  }
  const why = never.map((w) => neverWhy(w, run.branch));
  return `${why.join('; ')} — yours to resolve: ${off}, or nemia cancel ${run.id}`;
}

const toDecideWords = (run: Pick<Run, 'id' | 'branch'>, t: ToDecide): string =>
  t.kind === 'approve'
    ? `${t.says ?? (t.filed ? `${t.step} has signed off at its gate` : `${t.step} has not run: approving runs it`)} — nemia approve ${run.id} ${t.step}`
    : `${t.branches.join(', ')} ${t.branches.length > 1 ? 'are' : 'is'} ahead of ${run.branch}, and nothing has merged ${t.branches.length > 1 ? 'them' : 'it'} — nemia decide ${run.id}`;

const NEEDS_HUMAN = 'needs-human';

const shownStatus = (s: Pick<Step, 'message' | 'waits'>): string =>
  s.waits ? `${NEEDS_HUMAN}: ${s.waits}${s.message.slice(NEEDS_HUMAN.length)}` : s.message;

const shownNote = (s: Pick<Step, 'note' | 'denied' | 'asks' | 'ranOn'>): string | undefined =>
  [s.note, s.asks ? `asks ${s.asks} question${s.asks === 1 ? '' : 's'}` : '', s.ranOn, s.denied].filter(Boolean).join(' · ') || undefined;

const onYouWords = (l: { steps: ReadonlyArray<Pick<Step, 'name' | 'reason'>>; waitingOnYou: readonly string[] }): string[] =>
  l.waitingOnYou.map((name) => (l.steps.find((s) => s.name === name)?.reason === 'AwaitingApproval' ? `approve ${name}` : name));

function asksLines(run: Run, { steps, waitingOnYou, waiting, holding, toDecide }: Listing, result: readonly string[]): string[] {
  const lines: string[] = [];
  if (toDecide) lines.push(`   → to decide: ${toDecideWords(run, toDecide)}`);
  const waitingWords = onYouWords({ steps, waitingOnYou }).filter(
    (said) => !(toDecide?.kind === 'approve' && said === `approve ${toDecide.step}`),
  );
  if (waitingWords.length) lines.push(`   → waiting on you: ${waitingWords.join(', ')}  —  nemia decide ${run.id}`);
  if (waiting.some((w) => w.missing || w.cancelledAt || w.gone?.length)) lines.push(`   → waiting on you: ${waitAdvice(run, waiting)}`);
  if (holding) {
    const never = !holding.length || holding.some((w) => w.missing || w.cancelledAt || w.gone?.length);
    const lifting = holding.length > 0 && holding.every((w) => w.landed);
    lines.push(
      `   → ${holdWord(holding, run.hold)}${never ? `: ${holdAdvice(run, holding)}` : lifting ? '' : `  —  nemia hold ${run.id} --off lifts it`}`,
    );
  }
  if (result.length) lines.push(`   → result: ${result.join(', ')}  —  nemia decide ${run.id}`);
  return lines;
}

function runLines({ run, listed, result }: Row, more: string): string[] {
  const calledOff = `${run.cancelledAt ? '  (cancelled)' : ''}${run.pruned ? '  (pruned)' : ''}`;
  if ('said' in listed) {
    const width = Math.max(20, ...listed.steps.map((s) => s.message.length));
    return [
      `${run.id}  ${firstPiece(run.brief, '\n').slice(0, 56)}${calledOff}${more}`,
      ...listed.steps.map((s) => `   ${s.name.padEnd(14)} ${s.message.padEnd(width)} ${s.branch ?? ''}`),
      `   → unreadable: ${listed.said}`,
    ];
  }
  const { steps, cost } = listed;
  const said = steps.map((s) => ({ s, word: `${shownStatus(s)}${s.cost ? `  ${s.cost}` : ''}` }));
  const width = Math.max(20, ...said.map(({ word }) => word.length));
  return [
    `${run.id}  ${firstPiece(run.brief, '\n').slice(0, 56)}${calledOff}${cost ? `  ${cost}` : ''}${more}`,
    ...said.map(({ s, word }) => {
      const note = shownNote(s);
      return `   ${s.name.padEnd(14)} ${word.padEnd(width)} ${s.branch ?? ''}${note ? `  · ${note}` : ''}`;
    }),
    ...asksLines(run, listed, result),
  ];
}

const STALE_PASSES = 10;
const STALE_FLOOR_MS = 15 * 60_000;
const staleAfterMs = (every: number): number => Math.max(STALE_PASSES * every, STALE_FLOOR_MS);

const holderName = (kind: DaemonFile['by']): string => (kind === 'up' ? 'nemia up' : kind);

const holderWords = (file: Pick<DaemonFile, 'by' | 'pid' | 'url'>): string =>
  file.by === 'api' ? `the api of pid ${file.pid}${file.url ? ` at ${file.url}` : ''}` : `the nemia up of pid ${file.pid}`;

const START_WORDS =
  'start one with npm start in apps/api, or nemia up where no board is served — or any nemia command that files work starts one';

function lastPassWords(file: DaemonFile, now: number): string {
  const ago = (t: string) => `${durationWord(now - Date.parse(t))} ago (${t})`;
  const passed = file.passedAt ? `last pass ${ago(file.passedAt)}` : `no pass completed yet, started ${ago(file.startedAt)}`;
  const since = Date.parse(file.passedAt ?? file.startedAt);
  return file.beatAt && Date.parse(file.beatAt) - since > 2 * file.every
    ? `${passed}, a pass under way since — alive ${ago(file.beatAt)}`
    : passed;
}

const stopWords = ({ file, identity }: Pick<Standing, 'file' | 'identity'>): string =>
  identity === 'same'
    ? `kill ${file.pid} — that pid is the node process that ticks, not an npm wrapper around it, which can be killed and leave it ticking`
    : `its pid, once checked: ${file.pid} could not be confirmed here as the process that wrote ${DAEMON_FILE} (${file.procStart === undefined ? 'the file names no process start' : `no /proc/${file.pid}/stat to compare its start with`}), ` +
      `and a pid is reused once its process ends — if ps -p ${file.pid} -o lstart=,args= shows ${file.by === 'api' ? 'the api' : 'a nemia up'} started at ${file.startedAt}, kill ${file.pid}`;

const unconfirmed = ({ file, identity }: Standing): string =>
  identity === 'same' ? '' : ` (pid ${file.pid} not confirmed here as the process that wrote ${DAEMON_FILE})`;

const at = (file: DaemonFile): string => (file.url ? ` at ${file.url}` : '');

function daemonLine(standing: DaemonStanding, now: number): string {
  switch (standing.kind) {
    case 'none':
      return `daemon: none has held this store — nothing ticks it; ${START_WORDS}`;
    case 'unreadable':
      return `daemon: none known — ${DAEMON_FILE} does not read as a holder, so nothing is known to tick this store; the next daemon takes it over`;
    case 'ticking':
      return `${holderName(standing.file.by)}: ticking, pid ${standing.file.pid}${at(standing.file)}, every ${standing.file.every}ms — ${lastPassWords(standing.file, now)}${unconfirmed(standing)}`;
    case 'stalled':
      return (
        `${holderName(standing.file.by)}: stalled, pid ${standing.file.pid}${at(standing.file)}, every ${standing.file.every}ms — alive, but silent for ${durationWord(standing.quiet)}: ${lastPassWords(standing.file, now)}; ` +
        `the next daemon takes the store over, and ${standing.identity === 'same' ? `kill ${standing.file.pid} stops it` : `stopping it now is by ${stopWords(standing)}`}`
      );
    case 'gone':
      return standing.identity === 'other'
        ? `${holderName(standing.file.by)}: none ticking — ${holderWords(standing.file)} is gone, that pid another process's now; its ${lastPassWords(standing.file, now)}; ${START_WORDS}`
        : `${holderName(standing.file.by)}: none ticking — pid ${standing.file.pid} is gone, its ${lastPassWords(standing.file, now)}; ${START_WORDS}`;
    case 'stopped':
      return `${holderName(standing.file.by)}: none ticking — pid ${standing.file.pid} stopped ${durationWord(now - Date.parse(standing.file.stoppedAt ?? ''))} ago (${standing.file.stoppedAt}), its ${lastPassWords(standing.file, now)}; ${START_WORDS}`;
  }
}

function standingLine(standing: RunsListed['standing'], daemon: DaemonStanding, now: number): string | undefined {
  if ('none' in standing) return 'where branches stand: not read — nemia up reads them';
  const age = now - Date.parse(standing.at);
  if (daemon.kind === 'ticking' && age <= staleAfterMs(daemon.file.every)) return undefined;
  return `where branches stand: read ${durationWord(age)} ago`;
}

function fireWord(iso: string, now: number): string {
  const ms = Date.parse(iso) - now;
  return `${iso}, ${ms >= 0 ? `in ${durationWord(ms)}` : `${durationWord(-ms)} ago`}`;
}

function scheduleLines(schedules: readonly ScheduleListed[], clock: (iso: string) => string): string[] {
  return schedules.flatMap((s) => [
    `scheduled  ${s.factory}/${s.workflow}  ${s.cron}${s.tz ? ` (${s.tz})` : ''}  next ${s.next ? clock(s.next) : 'never'}  last ${s.last ? `${s.last.run} (${clock(s.last.at)})` : 'none'}`,
    ...(s.refused ? [`  refused: ${s.refused}`] : []),
  ]);
}

const RESUME_LINE = 'nemia resume';

const sinceWords = ({ at, by, why }: NonNullable<Paused['pause']>): string =>
  `since ${at || 'a time its file no longer says'} by ${by || 'someone its file no longer names'}${why ? `: ${why}` : ''}`;

const heldCount = ({ staged, held }: Pick<Paused, 'staged' | 'held'>): string => {
  const n = staged.length + held.length;
  return n ? `, ${n} check${n === 1 ? '' : 's'} held` : '';
};

/** The sessions still in a tool call under a timed pause and when they are cut, as the orchestrator's `pausingWords` says it. */
const pausingWords = (sessions: number, leftMs: number): string =>
  `Pausing: ${sessions} session${sessions === 1 ? '' : 's'} finishing a tool call, cut ${leftMs > 0 ? `in ${Math.ceil(leftMs / 60_000)} min` : 'now'}`;

/** What the pause does, as the orchestrator's `pauseDoes` says it: a timed pause parks each session at its call's end; none runs on. */
const pauseDoes = ({ timeoutMs }: NonNullable<Paused['pause']>): string =>
  timeoutMs !== undefined
    ? 'nothing new starts, and each working session stops when its current tool call ends, cut once the timeout passes'
    : 'nothing new starts, and each working session runs on to its end';

const pausedWords = (paused: Paused, now: Date = new Date()): string | null => {
  const { pause, finishing } = paused;
  if (!pause) return null;
  const sessions = finishing.filter((f) => f.kind === 'session').length;
  const head =
    pause.timeoutMs !== undefined && sessions
      ? pausingWords(sessions, Math.min(pause.timeoutMs, Date.parse(pause.at) + pause.timeoutMs - now.getTime()))
      : `Pausing: ${finishing.length} finishing`;
  return finishing.length
    ? `${head}${heldCount(paused)} — the store is paused ${sinceWords(pause)}; ${pauseDoes(pause)}; ${RESUME_LINE} resumes it`
    : `Paused ${sinceWords(pause)} — nothing runs and nothing new starts${heldCount(paused)}; ${RESUME_LINE} resumes it`;
};

const atWorkWords = (kind: Finishing['kind'], calling: string | undefined): string => {
  if (kind === 'session') return calling ? `its call to ${calling} runs` : 'its session is at work';
  return kind === 'check' ? 'its check runs' : 'the check of its landing runs';
};

const finishingWords = ({ run, step, kind, stopping, resumed, calling }: Finishing): string =>
  stopping
    ? `${run}'s ${step} is stopping: its ${kind === 'session' ? 'session' : 'check'} was asked to stop${resumed ? `, and is tried again on ${RESUME_LINE}` : ''}`
    : `${run}'s ${step} is finishing: ${atWorkWords(kind, calling)}`;

const stagedWords = ({ run, step, repo }: Paused['staged'][number]): string =>
  `${run}'s ${step} has its merge staged in ${repo} (MERGE_HEAD), and its check waits on ${RESUME_LINE}`;

const heldWords = ({ run, step }: Paused['held'][number]): string =>
  `${run}'s ${step} has signed off, and its check waits on ${RESUME_LINE}`;

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
    ...paused.staged.map((s) => `   ${stagedWords(s)}`),
    ...paused.held.map((h) => `   ${heldWords(h)}`),
  ];
};

/**
 * The run's whole map, as a selector reads it: the person's keys, `workflow` (its folder's name), and `factory` (`default` for the
 * default one) — the orchestrator's `runLabelMap`.
 */
export const runLabelMap = (run: Pick<Run, 'workflowDir' | 'factory' | 'labels'>): LabelMap => ({
  ...run.labels,
  workflow: path.basename(run.workflowDir),
  factory: run.factory ?? 'default',
});

/**
 * Every line `nemia ls` prints of its answer at `now`: `no runs` for none, each run's lines, how old what it shows of where the branches
 * stand is, the factories' schedules, and last whether a daemon ticks the store. `more` is what each run's head line ends on (the
 * labels' segments, `labelSegments`): nothing by default, so the lines are as they were.
 */
export const lsLines = (
  { runs, daemon, standing, schedules }: RunsListed,
  now: number,
  more: (run: Run) => string = () => '',
): string[] => {
  const stood = standingLine(standing, daemon, now);
  const scheduled = scheduleLines(schedules ?? [], (iso) => fireWord(iso, now));
  return [
    ...(runs.length ? runs.flatMap((row) => runLines(row, more(row.run))) : ['no runs']),
    ...(stood ? [stood] : []),
    ...scheduled,
    daemonLine(daemon, now),
  ];
};
