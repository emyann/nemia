/**
 * The namespace a run's named actions are sent in: its factory, `default` for a run of none. Said by the run's own object, which every
 * page, bar and preview that offers an action has read already (`runObjectQuery`), so an action asks for nothing more there; or given by
 * a caller that holds the run's row, as a card on the floor does (`namespaceOf` of its factory).
 */
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Run } from 'objects';
import { runObjectQuery } from './api/run.ts';
import { namespaceOf } from './factories.ts';

/** A run by its name and the namespace its actions are sent in. */
export type RunAt = { id: string; namespace: string };

/** The namespace of a run object: its own, `default` where it names none. */
const namespaceOfRun = (run: Run): string => namespaceOf(run.metadata.namespace);

/** The namespace of the run `id`, off its object in `client`'s cache, read once where it is not. */
export const runNamespace = (client: QueryClient, id: string): Promise<string> =>
  client.ensureQueryData(runObjectQuery(id)).then(namespaceOfRun);

/**
 * What a run's action calls for the namespace to send it in: `given` where the caller holds it, else the run's own (`runNamespace`). A
 * function, called as the action is sent, so a draw reads nothing.
 */
export function useRunNamespace(id: string, given?: string): () => Promise<string> {
  const client = useQueryClient();
  return () => (given === undefined ? runNamespace(client, id) : Promise.resolve(given));
}
