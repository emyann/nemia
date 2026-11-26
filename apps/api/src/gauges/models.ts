/**
 * The models each harness lists, as the board is given them (`GET /api/models`): the package's record of what the daemon last asked of
 * each harness (`recordedModels`), read and never written — the file is the daemon's alone.
 */
import { recordedModels } from 'agent-orchestrator';
import type { HarnessModels } from 'objects';

/**
 * The record of the store at `home`, each harness's list as the api serves it: its models with the words a harness left unsaid as null.
 * @param home The store's home folder.
 */
export const modelsOf = (home: string) =>
  ({
    harnesses: Object.entries(recordedModels(home)).map(([harness, { at, models }]) => ({
      harness,
      at,
      models: models.map((m) => ({
        id: m.id,
        aliases: [...m.aliases],
        name: m.name,
        keepsAuto: m.keepsAuto ?? null,
        efforts: m.efforts === undefined ? null : [...m.efforts],
      })),
    })),
  }) satisfies HarnessModels;
