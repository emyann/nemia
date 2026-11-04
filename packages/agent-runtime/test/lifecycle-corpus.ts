/**
 * The lifecycle's corpus, shared: every journal shape `decide.test.ts` walks, under every deadline and every time a pass
 * can read it, crossed with the sightings a test hands in. `lifecycle.test.ts` hands in the sightings a harness gives in
 * A2A's names; `session-state.test.ts` hands in the same sightings in the runtime's former words, translated, and holds each
 * case to the answer of `decide` that `fixtures/decide-corpus.json` records.
 */
import { fold, nameFor, type Event, type Sighting } from '../src/core/domain.ts';
import type { Outcome } from '../src/core/session.ts';

export const T0 = new Date('2026-01-01T00:00:00Z');
export const at = (ms: number) => new Date(T0.getTime() + ms).toISOString();
export const TASK = 't-1';
export const S = 1_000;

export const filed = (extra: object = {}): Event => ({ kind: 'filed', at: at(0), brief: 'b', cwd: '/r', queued: false, ...extra });
export const starting = (n: number, ms = 0, extra: object = {}): Event => ({ kind: 'starting', at: at(ms), attempt: n, ...extra });
export const spawned = (n: number, ms = S): Event => ({ kind: 'spawned', at: at(ms), attempt: n });
export const ended = (
  n: number,
  observed: Outcome,
  reason: 'harness' | 'lost' | 'unstartable' | 'operator' | 'deadline' = 'harness',
  nativeId?: string,
): Event => ({ kind: 'ended', at: at(2 * S), attempt: n, sessionId: `s${n}`, observed, reason, ...(nativeId ? { nativeId } : {}) });
export const signed = (n: number) => ended(n, 'succeeded', 'harness', `native-${n}`);
/** A long-lived attempt's session first listed with no process, its harness respawning it. */
export const gap = (n: number, ms = S): Event => ({ kind: 'gap', at: at(ms), attempt: n });
/** A long-lived attempt's session listed held in process `pid`. */
export const held = (n: number, pid: number, ms = S): Event => ({ kind: 'process', at: at(ms), attempt: n, pid });

/** Journal shapes, by name: what a task's record can say. */
export const JOURNALS: Record<string, Event[]> = {
  filed: [filed()],
  'filed, queued': [filed({ queued: true })],
  'filed, queued, admitted': [filed({ queued: true }), { kind: 'admitted', at: at(0) }],
  'filed against a session': [filed({ resumeFrom: 'native-0' })],
  'filed with a statement asked': [filed({ closeoutSchema: { type: 'object' } })],
  'intent, no spawn': [filed(), starting(1)],
  'intent, no spawn, asked a statement': [filed({ closeoutSchema: { type: 'object' } }), starting(1)],
  spawned: [filed(), starting(1), spawned(1)],
  'ended done': [filed(), starting(1), spawned(1), signed(1)],
  'ended failed': [filed(), starting(1), spawned(1), ended(1, 'failed')],
  'ended stopped': [filed(), starting(1), spawned(1), ended(1, 'stopped')],
  'ended lost': [filed(), starting(1), spawned(1), ended(1, 'failed', 'lost')],
  'ended unstartable': [filed(), starting(1), ended(1, 'failed', 'unstartable')],
  'ended at the deadline': [filed(), starting(1), spawned(1), ended(1, 'failed', 'deadline')],
  'held open, filed': [filed({ holdOpen: true })],
  'held open, intent, no spawn': [filed({ holdOpen: true }), starting(1)],
  'held open, in flight': [filed({ holdOpen: true }), starting(1), spawned(1)],
  'held open, signed': [filed({ holdOpen: true }), starting(1), spawned(1), signed(1)],
  'held open, failed': [filed({ holdOpen: true }), starting(1), spawned(1), ended(1, 'failed')],
  'held open, answered': [filed({ holdOpen: true }), starting(1), spawned(1), signed(1), { kind: 'input', at: at(3 * S), text: 'go on' }],
  'held open, answered, no session recorded': [
    filed({ holdOpen: true }),
    starting(1),
    spawned(1),
    ended(1, 'succeeded'),
    { kind: 'input', at: at(3 * S), text: 'go on' },
  ],
  'held open, second turn in flight': [
    filed({ holdOpen: true }),
    starting(1),
    spawned(1),
    signed(1),
    { kind: 'input', at: at(3 * S), text: 'go on' },
    starting(2, 4 * S, { resumeFrom: 'native-1' }),
    spawned(2, 5 * S),
  ],
  'held open, closed after signing': [filed({ holdOpen: true }), starting(1), spawned(1), signed(1), { kind: 'closed', at: at(3 * S) }],
  'held open, closed after failing': [
    filed({ holdOpen: true }),
    starting(1),
    spawned(1),
    ended(1, 'failed'),
    { kind: 'closed', at: at(3 * S) },
  ],
  'held open, closed before any attempt': [filed({ holdOpen: true }), { kind: 'closed', at: at(0) }],
  'held open, closed in flight': [filed({ holdOpen: true }), starting(1), spawned(1), { kind: 'closed', at: at(2 * S) }],
  'stop asked, nothing started': [filed(), { kind: 'stop-requested', at: at(0) }],
  'stop asked, intent, no spawn': [filed(), starting(1), { kind: 'stop-requested', at: at(S) }],
  'stop asked, spawned': [filed(), starting(1), spawned(1), { kind: 'stop-requested', at: at(2 * S) }],
  'stop asked, ended': [filed(), starting(1), spawned(1), ended(1, 'stopped', 'operator'), { kind: 'stop-requested', at: at(2 * S) }],
  settled: [filed(), starting(1), spawned(1), signed(1), { kind: 'settled', at: at(3 * S), outcome: 'succeeded' }],
  'long-lived, intent, no spawn': [filed({ restartPolicy: 'Always' }), starting(1)],
  'long-lived, in flight': [filed({ restartPolicy: 'Always' }), starting(1), spawned(1)],
  'long-lived, stop asked in flight': [
    filed({ restartPolicy: 'Always' }),
    starting(1),
    spawned(1),
    { kind: 'stop-requested', at: at(2 * S) },
  ],
  'long-lived, ended with no stop': [filed({ restartPolicy: 'Always' }), starting(1), spawned(1), signed(1)],
  'long-lived, ended on a stop': [
    filed({ restartPolicy: 'Always' }),
    starting(1),
    spawned(1),
    { kind: 'stop-requested', at: at(2 * S) },
    ended(1, 'stopped', 'operator'),
  ],
  'long-lived, intent, no spawn, gap open': [filed({ restartPolicy: 'Always' }), starting(1), gap(1)],
  'long-lived, gap open': [filed({ restartPolicy: 'Always' }), starting(1), spawned(1), held(1, 100), gap(1)],
  'long-lived, gap closed by a respawn': [
    filed({ restartPolicy: 'Always' }),
    starting(1),
    spawned(1),
    held(1, 100),
    gap(1),
    held(1, 200, 2 * S),
  ],
  'long-lived, stopped at its harness': [
    filed({ restartPolicy: 'Always' }),
    starting(1),
    spawned(1),
    ended(1, 'stopped', 'harness', 'native-1'),
  ],
  'long-lived, lost cold': [filed({ restartPolicy: 'Always' }), starting(1), spawned(1), ended(1, 'failed', 'lost')],
};

/** A job parked under a sessions' drain, its end saying so (`Attempt.parked`): in a call, or between two. */
const parkedEnd = (n: number, calling?: boolean): Event => ({
  kind: 'ended',
  at: at(2 * S),
  attempt: n,
  sessionId: `s${n}`,
  observed: 'failed',
  reason: 'harness',
  nativeId: `native-${n}`,
  parked: calling ? { calling: { tool: 'Bash', since: at(S) } } : {},
});
/** Journal shapes of a parked job, asked for by `lifecycle.test.ts` alone (`parked`), as `unread` is. */
const PARKED: Record<string, Event[]> = {
  'job, parked in a call': [filed(), starting(1), spawned(1), parkedEnd(1, true)],
  'job, parked between calls': [filed(), starting(1), spawned(1), parkedEnd(1)],
  'job, parked, stop asked': [filed(), starting(1), spawned(1), parkedEnd(1), { kind: 'stop-requested', at: at(2 * S) }],
};

/** When the pass reads it: in the grace window and before a deadline of 40 s, or past both. */
export const TIMES = { 'in grace': 2 * S, 'past grace': 45 * S } as const;
/** A time more, `late`: past a respawn's gap (`RESPAWN_GAP_MS`) opened at 1 s. Asked for by `lifecycle.test.ts` alone, as `unread` is. */
const LATE = { late: 125 * S } as const;
export const DEADLINES = { 'no deadline': undefined, 'deadline 40 s': 40 } as const;

/** The corpus's name for a pass that could not read the last attempt's harness. */
const UNREAD = 'unread';

export type Case = {
  name: string;
  events: Event[];
  observed: Map<string, Sighting>;
  now: { at: Date; graceMs: number; unread?: ReadonlySet<string>; drained?: boolean };
};

/**
 * Every journal shape, under every deadline, sighting and time: `SIGHTINGS` keyed by the name a case takes. With `unread`, one
 * sighting more, `unread`: the last attempt's name on none, its harness not read this pass (`Now.unread`). Asked
 * for by `lifecycle.test.ts` alone, so the corpus `session-state.test.ts` holds to its recording stays the one recorded. With
 * `late`, one time more (`LATE`), on the same terms. With `parked`, the journals of a parked job (`PARKED`), and every case read
 * twice more, under a sessions' drain (`Now.drained`), on the same terms.
 */
export const corpusOf = (
  SIGHTINGS: Record<string, Omit<Sighting, 'sessionId'> | undefined>,
  options: { unread?: boolean; late?: boolean; parked?: boolean } = {},
): Case[] =>
  Object.entries({ ...JOURNALS, ...(options.parked ? PARKED : {}) }).flatMap(([j, base]) =>
    Object.entries(DEADLINES).flatMap(([d, deadlineSeconds]) =>
      [...Object.entries(SIGHTINGS), ...(options.unread ? [[UNREAD, undefined] as const] : [])].flatMap(([s, sighting]) =>
        Object.entries({ ...TIMES, ...(options.late ? LATE : {}) }).flatMap(([t, ms]) => {
          const events = base.map((e) => (e.kind === 'filed' && deadlineSeconds !== undefined ? { ...e, deadlineSeconds } : e));
          const last = fold(TASK, events).attempts.at(-1);
          const observed = new Map(sighting && last ? [[nameFor(TASK, last.n), { sessionId: `seen-${last.n}`, ...sighting }]] : []);
          const unread = s === UNREAD && last ? { unread: new Set([nameFor(TASK, last.n)]) } : {};
          const now = { at: new Date(T0.getTime() + ms), graceMs: 30_000, ...unread };
          const name = `${j} · ${d} · ${s} · ${t}`;
          return [
            { name, events, observed, now },
            ...(options.parked ? [{ name: `${name} · drained`, events, observed, now: { ...now, drained: true } }] : []),
          ];
        }),
      ),
    ),
  );
