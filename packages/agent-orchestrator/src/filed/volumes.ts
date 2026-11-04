/**
 * What a step is filed of its factory's volumes (`Run.volumes`, frozen at start), kept apart from the filing's module so that the brief,
 * which names them (`mountsLine`), loads none of the filing. Pure.
 */
import type { Mount } from '../record/record.ts';
import { writesNothing, type Fenced } from '../workflow/index.ts';
import { isRemoteHarness } from '../harness/harness.ts';

/**
 * The volumes `step` is filed with, of those its run mounts (`volumes`): each read-only as it was marked, and a writable one writable only
 * where the step's fence writes (`writesNothing`), since a volume widens where a step's writes reach, never what it may do. None for a
 * step on a remote agent, filed no local field. `writable:` never names one: it names a repository of the factory, by its folder's name.
 */
export const volumeMounts = (step: Fenced, volumes: readonly Mount[] | undefined): Mount[] => {
  if (!volumes?.length || isRemoteHarness(step.harness)) return [];
  const unwriting = writesNothing(step);
  return volumes.map((v) => ({ path: v.path, readOnly: v.readOnly || unwriting }));
};
