/**
 * How many story files the stories' Vitest runs at once: the storybook project's `maxWorkers` (`vitest.config.ts`), said by the pinned
 * place's runner before it starts them (`test/e2e/stories/pinned.ts`). Proved by `contracts/stories-workers.contract.ts`.
 */
import type { StoriesWorkersOf } from '../contracts/stories-workers.contract.ts';
import { askedCount } from './asked.ts';

/** The variable a person sets to ask for as many story files at once. */
export const STORIES_WORKERS = 'STORIES_WORKERS';

/**
 * The bound: as many as `STORIES_WORKERS` asks, else one a core under CI, else one at a time; an ask that is no whole number of one or
 * more is refused, naming what to set.
 * @param asked Whether this runs under CI, what `STORIES_WORKERS` holds, and the machine's cores.
 */
export const storiesWorkersOf: StoriesWorkersOf = (asked) => {
  if (asked.asked === undefined || asked.asked === '') return { kind: 'workers', workers: asked.ci ? asked.cores : 1 };
  const count = askedCount(asked.asked);
  if (count !== undefined) return { kind: 'workers', workers: count };
  return {
    kind: 'refused',
    message: `${STORIES_WORKERS}=${asked.asked} is no whole number of one or more: set it to how many story files to run at once (${STORIES_WORKERS}=2), or unset it`,
  };
};
