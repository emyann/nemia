/**
 * The models each harness lists, as the daemon last recorded them: the store's `models.json`, `{ "<harness>": { "at": "<time>", "models":
 * [...] } }`, each harness's answer to `Engine.models` replacing that harness's entry whole. The daemon is its one writer (`recordModels`,
 * asked from `nemia up`'s pass); every load, start and retry reads it (`recordedModels`) to judge the models it names (`modelJudged`).
 * A harness with no entry is one whose list was never recorded — a store its daemon has not asked, a harness that lists none — and a model
 * named for it is not judged. A store file at the bottom of the tree: it imports no other store file.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ListedModel } from 'agent-runtime/vocabulary';

/** The file, in the store's root (`$WF_ROOT`). */
const MODELS_FILE = 'models.json';

/** What the daemon recorded of one harness: when it asked, and the models the harness listed. */
export type RecordedModels = { readonly at: string; readonly models: readonly ListedModel[] };

/** Every harness the daemon recorded a list for, by its name. */
export type ModelRecord = Readonly<Record<string, RecordedModels>>;

/**
 * Where the file is, in the store at `home`.
 * @param home The store's home folder.
 */
export const modelsFile = (home: string) => path.join(home, MODELS_FILE);

/** Whether `value` is a model as the file holds it: an id, its aliases, a name and what the harness said of auto mode and efforts. */
const isListed = (value: unknown): value is ListedModel => {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    Array.isArray(m.aliases) &&
    m.aliases.every((a) => typeof a === 'string') &&
    (m.keepsAuto === undefined || m.keepsAuto === null || typeof m.keepsAuto === 'boolean') &&
    (m.efforts === undefined || m.efforts === null || (Array.isArray(m.efforts) && m.efforts.every((e) => typeof e === 'string')))
  );
};

/**
 * The record of the store at `home`: each harness's entry that reads as one. A store with no file, a file that is not JSON, and an entry
 * that is malformed record nothing for it: a load never fails on the record, and the daemon's next ask writes it again.
 * @param home The store's home folder.
 */
export function recordedModels(home: string) {
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(modelsFile(home), 'utf8'));
  } catch {
    return {} satisfies ModelRecord as ModelRecord;
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return {} satisfies ModelRecord as ModelRecord;
  return Object.fromEntries(
    Object.entries(json).flatMap(([harness, entry]) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const { at, models } = entry as Record<string, unknown>;
      if (typeof at !== 'string' || !Array.isArray(models) || !models.every(isListed)) return [];
      return [
        [
          harness,
          {
            at,
            models: models.map((m) => ({ ...m, keepsAuto: m.keepsAuto ?? undefined, efforts: m.efforts ?? undefined })),
          },
        ],
      ];
    }),
  ) satisfies ModelRecord;
}

/**
 * The models of each recorded harness, by its name: what a judgement of a model reads (`modelJudged`). A harness with no entry has none.
 * @param home The store's home folder.
 */
export const listedModels = (home: string) =>
  Object.fromEntries(Object.entries(recordedModels(home)).map(([harness, { models }]) => [harness, models])) satisfies Readonly<
    Record<string, readonly ListedModel[]>
  >;

/**
 * Record `models` as what `harness` lists, asked at `at`, replacing that harness's entry whole and keeping the others'. The daemon's, and
 * nobody else's: written through a temporary file and renamed, so a reader sees the old record or the new, never half.
 * @param home The store's home folder.
 * @param harness The harness asked.
 * @param models What it listed.
 * @param at When it was asked, as an ISO time.
 */
export function recordModels(home: string, harness: string, models: readonly ListedModel[], at: string) {
  const next: ModelRecord = { ...recordedModels(home), [harness]: { at, models } };
  const file = modelsFile(home);
  const temporary = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(temporary, file);
}
