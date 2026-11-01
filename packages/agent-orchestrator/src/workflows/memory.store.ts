/**
 * The Workflow door's memory stand-in: a fresh layer of `WorkflowDoor` per call, its workflows held in a map by folder, built by
 * `workflowDoorOver` as the files layer is, so the writes are checked the one way on both. A test gives it its program —
 * `Effect.provide(program, workflowDoorMemory())` — where it needs a workflow to exist and nothing of the disk; the walks of
 * `test/workflow-walks.ts` hold it to what the files answer. Its folders are under `MEMORY_ROOT`, named as the files name them under the
 * store's root: yours are `<MEMORY_ROOT>/workflows/<name>`.
 *
 * A draft is held as its steps render (`renderStep`) and read back as a folder on disk is (`parseFolder`), with no agents nor skills
 * beside it: a step that names an agent is the files layer's to read. Its files are rendered today, so it holds no former spelling and
 * gives no hint.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Layer } from 'effect';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { renderStep } from '../workflow/index.ts';
import { parseFolder, workflowInUse } from '../folder/folder.ts';
import { WorkflowDoor, workflowDoorOver, type WorkflowDraft, type WorkflowLayer } from './workflows.store.ts';

/** Where the stand-in says a workflow's folder is: the root its paths are named under, as the files' are under the store's root. */
export const MEMORY_ROOT = '/memory';

/** Yours, under the stand-in's root: the folder a workflow of yours is directly in, as `<home>/workflows` is on disk. */
export const MEMORY_WORKFLOWS = path.posix.join(MEMORY_ROOT, 'workflows');

/** A workflow held: each step's file, by its name, and its README where one was written. */
type Held = { readonly files: ReadonlyMap<string, string>; readonly readme?: string };

/** The version of what is held: a digest of every file, as `workflowVersion` digests a folder's. */
const versionOf = (held: Held): string =>
  createHash('sha256')
    .update(JSON.stringify([[...held.files].sort(([a], [b]) => (a < b ? -1 : 1)), held.readme ?? null]))
    .digest('hex')
    .slice(0, 12);

/** A fresh Workflow door over a map: no workflow held. */
export function workflowDoorMemory(): Layer.Layer<never> {
  const workflows = new Map<string, Held>();
  const read = (dir: string) =>
    parseFolder([...(workflows.get(dir)?.files ?? new Map<string, string>())], (file) =>
      file === 'README.md' ? workflows.get(dir)?.readme : undefined,
    );
  const layer: WorkflowLayer = {
    workflows: {
      list: (holder) =>
        [...workflows.keys()]
          .filter((dir) => path.posix.dirname(dir) === holder)
          .map((dir) => path.posix.basename(dir))
          .sort(),
      read: (dir) => {
        if (!workflows.has(dir)) throw new Invalid({ message: `no workflow folder at ${dir}: write it first, or name one that is there.` });
        return read(dir);
      },
      there: (dir) => {
        const held = workflows.get(dir);
        return held === undefined ? { kind: 'none' } : { kind: 'folder', version: versionOf(held) };
      },
      write: (dir, draft: WorkflowDraft) => {
        const files = new Map(draft.steps.map((step) => [step.name, renderStep(step)] as const));
        const steps = parseFolder([...files]);
        const before = workflows.get(dir);
        const readme = draft.readme ?? before?.readme;
        const held: Held = readme === undefined ? { files } : { files, readme };
        workflows.set(dir, held);
        const names = (m: ReadonlyMap<string, string> | undefined) => [...(m?.keys() ?? [])].map((name) => `${name}.md`);
        const now = new Set(names(files));
        const kept = names(files).filter((file) => before?.files.get(file.slice(0, -3)) === files.get(file.slice(0, -3)));
        return {
          dir,
          steps,
          written: [...names(files).filter((file) => !kept.includes(file)), ...(draft.readme !== undefined ? ['README.md'] : [])].sort(),
          kept: kept.sort(),
          removed: names(before?.files)
            .filter((file) => !now.has(file))
            .sort(),
          version: versionOf(held),
        };
      },
      remove: (dir, users) => {
        if (path.posix.dirname(dir) !== MEMORY_WORKFLOWS)
          throw new Invalid({ message: `${dir} is not a workflow of yours (${MEMORY_WORKFLOWS}/<name>): only yours are removed here.` });
        const held = workflows.get(dir);
        if (held === undefined) throw new Missing({ message: `${dir} is not there: it was removed already.` });
        if (users.length) throw new Conflict({ message: workflowInUse(dir, users) });
        workflows.delete(dir);
        return {
          dir,
          removed: [...[...held.files.keys()].map((name) => `${name}.md`), ...(held.readme !== undefined ? ['README.md'] : [])].sort(),
        };
      },
      hints: () => [],
    },
  };
  return Layer.succeed(WorkflowDoor)(workflowDoorOver(layer));
}
