/**
 * The lifecycle's corpus, shared: every journal shape `decide.test.ts` walks, under every deadline and every time a pass
 * can read it, crossed with the sightings a test hands in. `lifecycle.test.ts` hands in the sightings a harness gives in
 * A2A's names; `session-state.test.ts` hands in the same sightings in the runtime's former words, translated, and holds each
 * case to the answer of `decide` that `fixtures/decide-corpus.json` records.
 */
import { fold, nameFor, type Ended, type Event, type Sighting } from '../src/core/domain.ts';

export const T0 = new Date('2026-01-01T00:00:00Z');
export const at = (ms: number) => new Date(T0.getTime() + ms).toISOString();
export const TASK = 't-1';
export const S = 1_000;

export const filed = (extra: object = {}): Event => ({ kind: 'filed', at: at(0), brief: 'b', cwd: '/r', queued: false, ...extra });
export const starting = (n: number, ms = 0, extra: object = {}): Event => ({ kind: 'starting', at: at(ms), attempt: n, ...extra });
export const spawned = (n: number, ms = S): Event => ({ kind: 'spawned', at: at(ms), attempt: n });
export const ended = (
  n: number,
  observed: Ended,
  reason: 'harness' | 'lost' | 'unstartable' | 'operator' | 'deadline' | 'unsigned' = 'harness',
  nativeId?: string,
): Event => ({ kind: 'ended', at: at(2 * S), attempt: n, sessionId: `s${n}`, observed, reason, ...(nativeId ? { nativeId } : {}) });
export const signed = (n: number) => ended(n, 'done', 'harness', `native-${n}`);

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
  'ended unsigned, before stage 4a': [filed(), starting(1), spawned(1), ended(1, 'done', 'unsigned')],
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
    ended(1, 'done'),
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
};

/** When the pass reads it: in the grace window and before a deadline of 40 s, or past both. */
export const TIMES = { 'in grace': 2 * S, 'past grace': 45 * S } as const;
export const DEADLINES = { 'no deadline': undefined, 'deadline 40 s': 40 } as const;

/** The corpus's name for a pass that could not read the last attempt's harness. */
const UNREAD = 'unread';

export type Case = {
  name: string;
  events: Event[];
  observed: Map<string, Sighting>;
  now: { at: Date; graceMs: number; unread?: ReadonlySet<string> };
};

/**
 * Every journal shape, under every deadline, sighting and time: `SIGHTINGS` keyed by the name a case takes. With `unread`, one
 * sighting more, `unread`: the last attempt's name on none, its harness not read this pass (`Now.unread`). Asked
 * for by `lifecycle.test.ts` alone, so the corpus `session-state.test.ts` holds to its recording stays the one recorded.
 */
export const corpusOf = (SIGHTINGS: Record<string, Omit<Sighting, 'sessionId'> | undefined>, options: { unread?: boolean } = {}): Case[] =>
  Object.entries(JOURNALS).flatMap(([j, base]) =>
    Object.entries(DEADLINES).flatMap(([d, deadlineSeconds]) =>
      [...Object.entries(SIGHTINGS), ...(options.unread ? [[UNREAD, undefined] as const] : [])].flatMap(([s, sighting]) =>
        Object.entries(TIMES).map(([t, ms]) => {
          const events = base.map((e) => (e.kind === 'filed' && deadlineSeconds !== undefined ? { ...e, deadlineSeconds } : e));
          const last = fold(TASK, events).attempts.at(-1);
          const observed = new Map(sighting && last ? [[nameFor(TASK, last.n), { sessionId: `seen-${last.n}`, ...sighting }]] : []);
          const unread = s === UNREAD && last ? { unread: new Set([nameFor(TASK, last.n)]) } : {};
          return {
            name: `${j} · ${d} · ${s} · ${t}`,
            events,
            observed,
            now: { at: new Date(T0.getTime() + ms), graceMs: 30_000, ...unread },
          };
        }),
      ),
    ),
  );
