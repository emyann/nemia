/** Your store, as the api reads it (`GET /api/store`, apps/api/src/workflows/yours.ts). */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { get } from './read.ts';

/**
 * Mirrors `YourStore` in apps/api/src/workflows/yours.ts: the folders your workflows, agents and skills are written to, each absolute,
 * `fileFactory`, the line that files a factory in your store, and `turnOnNemia`, the line that turns Nemia on, as the board's switch does.
 */
export type YourStore = { workflows: string; agents: string; skills: string; fileFactory: string; turnOnNemia: string };

/** Decodes a `YourStore`. */
const YourStoreSchema = decodes<YourStore>()(
  Schema.Struct({
    workflows: Schema.String,
    agents: Schema.String,
    skills: Schema.String,
    fileFactory: Schema.String,
    turnOnNemia: Schema.String,
  }),
);

/** Your store, read once a page: it moves only when the api restarts on another root. */
export const storeQuery = queryOptions({
  queryKey: ['store'],
  queryFn: () => get('/api/store', YourStoreSchema),
  staleTime: Number.POSITIVE_INFINITY,
});
