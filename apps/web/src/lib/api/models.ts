/** The models each harness lists (`GET /api/models`), read through the objects' client as `objects` says it (`HarnessModels`). */
import { queryOptions, useQuery } from '@tanstack/react-query';
import { modelIdsOf } from '../agents.ts';
import { keyFormQuery } from './builder.ts';
import { HarnessModels } from 'objects';
import { call, read } from './objects.ts';

export type { HarnessModels };

/** The models each harness lists, as the daemon last recorded them. */
export const modelsQuery = queryOptions({
  queryKey: ['models'],
  queryFn: () => call((c) => c.server.models(), read(HarnessModels)),
});

/**
 * Whether a harness's models are not checked, its list being unrecorded (`modelIdsOf`): undefined while the lists and the default harness
 * are read, so no card says it before it knows.
 */
export function useUnchecked() {
  const { data: models } = useQuery(modelsQuery);
  const { data: form } = useQuery(keyFormQuery);
  return models === undefined || form === undefined
    ? undefined
    : (harness: string | null | undefined) => modelIdsOf(models, harness ?? '', form.defaultHarness) === undefined;
}
