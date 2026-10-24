/**
 * The lines `ae` prints for a person: a task, an attempt, a journal entry, a usage, and the limits a task was filed with.
 */
import { denialText, type Attempt, type Event, type State, type TaskView, type Usage } from '../index.ts';

/** `text` up to its first line break, or the whole of it where there is none. */
const firstLine = (text: string): string => {
  const at = text.indexOf('\n');
  return at === -1 ? text : text.slice(0, at);
};

/** What `ae show` says of the limits a task was filed with: its spend cap and its context window, each only when it has one. */
export const limitLines = (state: Pick<State, 'config'>): string[] => [
  ...(state.config?.budgetUsd !== undefined ? [`budget: $${state.config.budgetUsd} an attempt`] : []),
  ...(state.config?.contextTokens !== undefined
    ? [`context: ${state.config.contextTokens} tokens a session, compacted past about it`]
    : []),
];

/** A count for a person: 20400 → 20.4k, 1234567 → 1.2M. */
const count = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

/**
 * What an attempt consumed, for a person — and when its runner measured nothing, saying so. A zero
 * would read as "cost nothing"; the truth is "nobody counted".
 */
export const usageLine = (u: Usage | null): string => (u ? `${countsLine(u)} · ${costLine(u)}${readLine(u)}` : 'usage not measured');

/** What an attempt has consumed so far, for a person, with no cost: a long-lived attempt's is written only at its end. */
const runningLine = (u: Usage): string => `${countsLine(u)}${readLine(u)}`;

/** An attempt's turns, tool calls and tokens, for a person, each one its runner could not see named not measured. */
const countsLine = (u: Usage): string => {
  const tokens =
    u.inputTokens !== undefined && u.outputTokens !== undefined
      ? ` · ${count(u.inputTokens)} in · ${count(u.outputTokens)} out`
      : ' · tokens not measured';
  const turns = u.turns !== undefined ? `${u.turns} turns` : 'turns not measured';
  const calls = u.toolCalls !== undefined ? `${u.toolCalls} tool calls` : 'tool calls not measured';
  return `${turns} · ${calls}${tokens}`;
};

/**
 * What an attempt read, by class, and how large its context got — after its cost, since the classes are what the cost is
 * made of: ` · read 21.4M · wrote 412.0k · uncached 1.2k · peak 167.0k`, and how often it compacted, which happens well
 * short of its window, so its peak alone never says it got there. Nothing for an attempt whose runner counted no
 * tokens, which already says so; a class or a peak its runner could not see is named not measured.
 */
const readLine = (u: Usage): string => {
  if (u.inputTokens === undefined) return '';
  const classes =
    u.cacheReadTokens !== undefined && u.cacheWriteTokens !== undefined && u.uncachedTokens !== undefined
      ? `read ${count(u.cacheReadTokens)} · wrote ${count(u.cacheWriteTokens)} · uncached ${count(u.uncachedTokens)}`
      : 'cache not measured';
  const peak = u.peakContextTokens !== undefined ? `peak ${count(u.peakContextTokens)}` : 'peak not measured';
  const compacted = u.compactions ? ` · compacted ${u.compactions === 1 ? 'once' : `${u.compactions} times`}` : '';
  return ` · ${classes} · ${peak}${compacted}`;
};

/** Dollars for a person, to the cent: $3.01. Under a cent is `<$0.01` — `$0.00` would read as free. */
export const usd = (n: number): string => (n > 0 && n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`);

/** What an attempt cost, for a person: dollars, or that nobody measured it — and why, when the harness said. */
const costLine = (u: Usage | null | undefined): string =>
  u?.costUsd !== undefined ? usd(u.costUsd) : u?.unpricedModel ? 'cost not measured (a model without a price)' : 'cost not measured';

/** A length of time for a person: 42s, 4m 59s, 1h 02m. */
const duration = (ms: number): string => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;
};

/**
 * When an attempt ran, read off the record: start → end (how long), in UTC as the journal lines
 * above it are. One still running has no end to print, and a length up to now would need a clock
 * this line is not handed.
 */
const ranLine = (a: Attempt): string =>
  a.endedAt === null
    ? `since ${a.startedAt.slice(11, 19)}`
    : `${a.startedAt.slice(11, 19)} → ${a.endedAt.slice(11, 19)} (${duration(Date.parse(a.endedAt) - Date.parse(a.startedAt))})`;

/**
 * `succeeded (no statement)` for an end whose task asked for a closing statement and was given none (`stated: false`): the fact
 * the runtime records. What it means for the work is the layer above's to say; `ae` says only what happened.
 */
const unstated = (stated: boolean | undefined): string => (stated === false ? ' (no statement)' : '');

/**
 * One attempt, for `ae show`: how it ended, when it ran, how its process exited if it has one, what it consumed. A session
 * its harness ended at its spend cap says so as `failed (budget)`, the limit beside the end; what the harness denied the
 * session is said as the rules a person would write to allow it: the calls it went on without, a running attempt's so far.
 */
export const attemptLine = (a: Attempt): string => {
  const when = ranLine(a);
  const denied = a.denials?.length ? `  denied: ${a.denials.map(denialText).join(', ')}` : '';
  if (a.ended === null) return `attempt ${a.n}  running ${when}${denied}`;
  if (a.reason === 'unstartable')
    return `attempt ${a.n}  ${a.ended} (unstartable)  ${when}  ${a.error === undefined ? '' : firstLine(a.error)}`.trimEnd();
  const how = `${a.ended}${a.reason === 'lost' ? ' (lost)' : a.limit ? ` (${a.limit})` : unstated(a.stated)}`;
  const exit = a.exitCode !== null ? `  exit ${a.exitCode}` : '';
  const failedCall = a.error ? `  — the spawn call failed: ${firstLine(a.error)}` : '';
  return `attempt ${a.n}  ${how}  ${when}${exit}  ${usageLine(a.usage)}${denied}${failedCall}`;
};

/**
 * One task, for `ae ls`: `queued` while it waits for `ae admit`, and its latest attempt's cost beside its turns
 * — `$3.01 · 12t`, or `cost not measured` — once it has an attempt. An attempt still running has none yet: Claude
 * Code writes a session's cost as its process exits. A long-lived attempt's turns are those journalled as it grows, its
 * cost the one recorded at its end. A task held open and answered says which turn it is on — `turn 1`.
 */
export const taskLine = (v: TaskView) => {
  const turn = v.state.inputs.length;
  const tries = turn ? `turn ${turn}` : '';
  const u = v.usage ?? v.state.attempts.at(-1)?.usage ?? undefined;
  const queued = v.admission === 'queued' ? '  queued' : '';
  const meter = v.state.attempts.length ? `  ${[costLine(u), ...(u?.turns !== undefined ? [`${u.turns}t`] : [])].join(' · ')}` : '';
  return `${v.id}  ${(v.state.harness ?? 'claude').padEnd(9)} ${v.phase.padEnd(18)}${tries ? ` ${tries}` : ''}${queued}${meter}  ${firstLine(v.state.brief).slice(0, 44)}`;
};

/** The word each kind of journal entry is printed with. */
const KINDS: Record<string, string> = {
  filed: 'filed',
  starting: 'starting',
  spawned: 'started',
  ended: 'ended',
  measured: 'measured',
  counted: 'counted',
  denied: 'denied',
  settled: 'SETTLED',
  'stop-requested': 'stop asked',
  said: 'said',
  input: 'answered',
  closed: 'closed',
  admitted: 'admitted',
};

/** What follows each kind of journal entry's word, for a person; nothing for a kind not named. */
const EXTRAS: { [K in Event['kind']]?: (event: Extract<Event, { kind: K }>) => string } = {
  settled: (e) => `  ${e.outcome}`,
  measured: (e) => `  attempt ${e.attempt}: ${costLine(e.usage)}`,
  counted: (e) => `  attempt ${e.attempt}: ${runningLine(e.usage)}`,
  denied: (e) => `  attempt ${e.attempt}: ${denialText(e)}`,
  ended: (e) =>
    `  ${e.observed}${e.limit ? ` (${e.limit})` : e.reason === 'harness' ? unstated(e.stated) : ` (${e.reason})`}${e.error ? `: ${firstLine(e.error).slice(0, 160)}` : ''}`,
  spawned: (e) => (e.error ? `  but the call failed: ${firstLine(e.error).slice(0, 160)}` : ''),
  said: (e) => `  to attempt ${e.attempt}: ${firstLine(e.text.trim()).slice(0, 160)}`,
  input: (e) =>
    `  ${firstLine(e.text.trim()).slice(0, 160)}${e.config?.budgetUsd !== undefined ? `  (budget $${e.config.budgetUsd})` : ''}`,
};

/**
 * One journal entry, for a person. Shared by `feed`, `show` and `watch` so the same event does not
 * read three different ways depending on which verb printed it.
 */
export const entryLine = (taskId: string, event: Event) => {
  const extra = (EXTRAS[event.kind] as ((e: Event) => string) | undefined)?.(event) ?? '';
  return `${event.at.slice(11, 19)}  ${taskId.padEnd(34)} ${(KINDS[event.kind] ?? event.kind).padEnd(10)}${extra}`;
};
