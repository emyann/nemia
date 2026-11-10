/**
 * Nemia, the store's own agent (`GET` and `PUT /api/level`, `GET /api/nemia/memory` and `GET /api/nemia/memory/:fact`), read through the
 * objects' client as `objects` says it (`NemiaLevel`, `NemiaMemory`): her level, her session, and the facts she keeps, read and never
 * written.
 */
import { queryOptions } from '@tanstack/react-query';
import { NemiaLevel as NemiaLevelAnswer, NemiaMemory as NemiaMemoryAnswer, type NemiaLevelSet } from 'objects';
import { pace } from '../feed.ts';
import { retryUnlessGone } from './gone.ts';
import { call, read, write } from './objects.ts';

export type { Level } from 'objects';

/** Where Nemia is: her level, her session, what she cost and each factory's level (`objects`' `NemiaLevel`). */
export type NemiaLevel = typeof NemiaLevelAnswer.Type;

/** The facts she keeps, and the words of the one asked (`objects`' `NemiaMemory`). */
export type NemiaMemory = typeof NemiaMemoryAnswer.Type;

/** What her ended sessions cost: dollars, and how many were measured and not. */
export type Spend = NonNullable<NemiaLevel['spend']>;

/** A factory's level: the level now, its own default, its own, and the raise in force. */
export type FactoryLevel = NemiaLevel['factories'][number];

/** Where Nemia is: polled at `pace`, the keeper's beat, since the feed says nothing of her session. */
export const levelQuery = queryOptions({
  queryKey: ['nemia', 'level'],
  queryFn: () => call((c) => c.nemia.level(), read(NemiaLevelAnswer)),
  refetchInterval: () => pace(5_000),
});

/** The facts she keeps, by name: polled slowly, since only her session writes them. */
export const nemiaMemoryQuery = queryOptions({
  queryKey: ['nemia', 'memory'],
  queryFn: () => call((c) => c.nemia.memory(), read(NemiaMemoryAnswer)),
  refetchInterval: () => pace(30_000),
});

/** One fact's words, read when a person opens it, never polled: a fact she no longer keeps is said at once (`retryUnlessGone`). */
export const nemiaFactQuery = (name: string) =>
  queryOptions({
    queryKey: ['nemia', 'memory', name],
    queryFn: () => call((c) => c.nemia.fact({ params: { fact: name } }), read(NemiaMemoryAnswer)),
    retry: retryUnlessGone,
  });

/**
 * A write of a level, as the package's level command takes it: the store's `level` alone; a factory's default (`level` and `factory`); a
 * raise of a factory to `level` for the stretch `for` (`2h`); or its raise ended (`factory` and `end`).
 */
export type LevelAsk = typeof NemiaLevelSet.Type;

/**
 * Sets a level, as the package's level command does: some factory put above Manual files her a session at the keeper's next beat, none
 * left above it stops it, and her folder not trusted holds her session until it is (`trust`). Resolves with where she is after the
 * write; rejects with the api's refusal in full, such as a raise that raises nothing.
 */
export const putLevel = (ask: LevelAsk): Promise<NemiaLevel> =>
  call(
    (c) => c.nemia.setLevel({ payload: ask }),
    write(NemiaLevelAnswer, 'A level may be written: read the levels again before setting it again.'),
  );
