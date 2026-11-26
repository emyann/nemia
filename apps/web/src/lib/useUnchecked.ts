import { useQuery } from '@tanstack/react-query';
import { modelIdsOf } from './agents.ts';
import { keyFormQuery } from './api/builder.ts';
import { modelsQuery } from './api/models.ts';

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
