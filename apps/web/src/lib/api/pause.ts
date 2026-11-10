/**
 * The store's pause (`GET`, `POST` and `DELETE /api/pause`, the package's `paused`, `pause` and `resume`), and what a pause at once would
 * stop (`GET /api/pause/now`, the package's `pause now`), read through the objects' client as `objects` says them (`Paused`, `Pause`,
 * `Interrupt`, `PauseNowRead`, `PauseAnswer`, `Resumed`).
 */
import { queryOptions } from '@tanstack/react-query';
import { PauseAnswer, PauseNowRead, Paused, Resumed } from 'objects';
import { pace } from '../feed.ts';
import { call, read, write } from './objects.ts';

export type { Interrupt, Pause, PauseAnswer, Paused, PauseNowRead } from 'objects';

/** A task still at work under the pause: a session, a check, or a landing's check; `stopping`, `resumed` and `calling` as it is. */
export type Finishing = Paused['finishing'][number];

/** A session the pause has parked at a tool call's end, `after` its call or with its call `cut`. */
export type Parked = Paused['parked'][number];

/** A run whose ending has its merge staged in `repo`'s checkout, its check held by the pause. */
export type PauseStaged = Paused['staged'][number];

/** A run whose step signed off, its check held by the pause, its merge not staged. */
export type PauseHeld = Paused['held'][number];

/**
 * Whether the store is paused, and what finishes under it: read again on the feed's `store` event, the pause put or lifted (`keysOf`), and
 * polled at `pace` besides, since the feed says nothing of what finishes under it.
 */
export const pauseQuery = queryOptions({
  queryKey: ['pause'],
  queryFn: () => call((c) => c.server.paused(), read(Paused)),
  refetchInterval: () => pace(5_000),
});

/**
 * What a pause at once would stop now, read when a person asks for it and never polled: the api reads every run's tasks to answer it.
 * Kept by no cache, so each confirm reads it afresh.
 */
export const pauseNowQuery = queryOptions({
  queryKey: ['pause', 'now'],
  queryFn: (): Promise<PauseNowRead> => call((c) => c.server.pauseNow(), read(PauseNowRead)),
  gcTime: 0,
});

/**
 * Pauses the store, as the package's `pause` does, saying `why` when given: from the next pass nothing new starts, and each working session
 * stops when its current tool call ends, cut once the store's timeout passes. With `now`, a pause at once, as the package's `pauseNow`:
 * what runs is asked to stop too, each step tried again on the resume, and a pause that stands is kept as it was. Rejects with the api's
 * refusal in full — the package's words for a store already paused — or its own about the request.
 */
export const putPause = (why?: string, now?: boolean): Promise<PauseAnswer> =>
  call(
    (c) => c.server.pause({ payload: { ...(why ? { why } : {}), ...(now ? { now: true } : {}) } }),
    write(
      PauseAnswer,
      now
        ? 'The store may be paused and what ran asked to stop: read the board again before pausing it again.'
        : 'The store may be paused: read the board again before pausing it again.',
    ),
  );

/**
 * Resumes the store, as the package's `resume` does: the next pass files what waits. Rejects as `putPause` does, for a store none stands
 * on.
 */
export const resumePause = (): Promise<Resumed> =>
  call((c) => c.server.resume(), write(Resumed, 'The store may be resumed: read the board again before resuming it again.'));
