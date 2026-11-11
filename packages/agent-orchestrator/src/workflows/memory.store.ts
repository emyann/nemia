/**
 * The Workflow door's memory stand-in: a fresh layer of `WorkflowDoor` per call, its workflows held in a map by folder, built by
 * `workflowDoorOver` as the files layer is, so the writes are checked the one way on both. A test gives it its program —
 * `Effect.provide(program, workflowDoorMemory())` — where it needs a workflow to exist and nothing of the disk; the walks of
 * `test/workflow-walks.ts` hold it to what the files answer. Its folders are under `MEMORY_ROOT`, named as the files name them under the
 * store's root: yours are `<MEMORY_ROOT>/workflows/<name>`.
 *
 * A draft is held as its steps render (`renderStep`) and read back as a folder on disk is (`parseFolder`), against the agents and skills
 * the door found through the Agent and Skill doors (`defs`, else those the program is given), in the places given or beside the folder
 * alone: a step naming an agent is resolved as the files resolve it, so a test gives `agentDoorMemory()`'s door beside it. Its files are
 * rendered today, so it holds no former spelling and gives no hint. The files a draft carries are held beside its steps, read where an
 * `output:` names one, and kept until carried again, as the files leave one the draft does not carry; but a draft carrying the `whole`
 * set drops each held one that is text (`textIn`) and not carried, listed in `removed`, as the files remove it.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Layer } from 'effect';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { renderStep } from '../workflow/index.ts';
import { hiredLineOut, parseFolder, textIn, workflowInUse } from '../folder/folder.ts';
import { WorkflowDoor, workflowDoorOver, type WorkflowDefs, type WorkflowDraft, type WorkflowLayer } from './workflows.store.ts';
import type { Fills, Found } from '../folder/folder.ts';

/** Where the stand-in says a workflow's folder is: the root its paths are named under, as the files' are under the store's root. */
export const MEMORY_ROOT = '/memory';

/** Yours, under the stand-in's root: the folder a workflow of yours is directly in, as `<home>/workflows` is on disk. */
export const MEMORY_WORKFLOWS = path.posix.join(MEMORY_ROOT, 'workflows');

/**
 * A workflow held: each step's file, by its name, its README where one was written, and the other files its drafts carried, by name in
 * the folder (`carried`), each kept until a draft carries it again.
 */
type Held = { readonly files: ReadonlyMap<string, string>; readonly readme?: string; readonly carried?: ReadonlyMap<string, string> };

/** The version of what is held: a digest of every file, as `workflowVersion` digests a folder's. */
const versionOf = (held: Held): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        ...[held.files, held.carried ?? new Map()].map((m) => [...m].sort(([a], [b]) => (a < b ? -1 : 1))),
        held.readme ?? null,
      ]),
    )
    .digest('hex')
    .slice(0, 12);

/**
 * A fresh Workflow door over a map: no workflow held. Its agents and skills found through `defs`, the Agent and Skill doors given, else
 * through those the program is given.
 */
export function workflowDoorMemory(defs?: WorkflowDefs): Layer.Layer<never> {
  const workflows = new Map<string, Held>();
  const read = (dir: string, found: Found, fills?: Fills) =>
    parseFolder(
      [...(workflows.get(dir)?.files ?? new Map<string, string>())],
      (file) => (file === 'README.md' ? workflows.get(dir)?.readme : workflows.get(dir)?.carried?.get(file)),
      found.agents,
      found.skills,
      fills,
    );
  const layer: WorkflowLayer = {
    workflows: {
      list: (holder) =>
        [...workflows.keys()]
          .filter((dir) => path.posix.dirname(dir) === holder)
          .map((dir) => path.posix.basename(dir))
          .sort(),
      around: (_dir, places) => places ?? {},
      read: (dir, found, fills) => {
        if (!workflows.has(dir)) throw new Invalid({ message: `no workflow folder at ${dir}: write it first, or name one that is there.` });
        return read(dir, found, fills);
      },
      named: () => ({ agents: [], added: [] }),
      there: (dir) => {
        const held = workflows.get(dir);
        return held === undefined ? { kind: 'none' } : { kind: 'folder', version: versionOf(held) };
      },
      write: (dir, draft: WorkflowDraft, found, _places, fills) => {
        const files = new Map(draft.steps.map((step) => [step.name, hiredLineOut(step.name, renderStep(step), fills)] as const));
        const before = workflows.get(dir);
        const given = new Map((draft.files ?? []).map((f) => [f.path, f.text] as const));
        const dropped = draft.whole
          ? [...(before?.carried ?? [])]
              .filter(([file, text]) => !given.has(file) && textIn(new TextEncoder().encode(text)) !== null)
              .map(([file]) => file)
          : [];
        const carried = new Map([...(before?.carried ?? [])].filter(([file]) => !dropped.includes(file)));
        for (const [file, text] of given) carried.set(file, text);
        const steps = parseFolder([...files], (file) => carried.get(file), found.agents, found.skills, fills);
        const readme = draft.readme ?? before?.readme;
        const held: Held = { files, carried, ...(readme !== undefined && { readme }) };
        const carriedKept = (draft.files ?? []).filter((f) => before?.carried?.get(f.path) === f.text).map((f) => f.path);
        const carriedWritten = (draft.files ?? []).map((f) => f.path).filter((file) => !carriedKept.includes(file));
        workflows.set(dir, held);
        const names = (m: ReadonlyMap<string, string> | undefined) => [...(m?.keys() ?? [])].map((name) => `${name}.md`);
        const now = new Set(names(files));
        const kept = names(files).filter((file) => before?.files.get(file.slice(0, -3)) === files.get(file.slice(0, -3)));
        return {
          dir,
          steps,
          written: [
            ...names(files).filter((file) => !kept.includes(file)),
            ...carriedWritten,
            ...(draft.readme !== undefined ? ['README.md'] : []),
          ].sort(),
          kept: [...kept, ...carriedKept].sort(),
          removed: [...names(before?.files).filter((file) => !now.has(file)), ...dropped].sort(),
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
          removed: [
            ...[...held.files.keys()].map((name) => `${name}.md`),
            ...(held.carried?.keys() ?? []),
            ...(held.readme !== undefined ? ['README.md'] : []),
          ].sort(),
        };
      },
      hints: () => [],
    },
  };
  return Layer.succeed(WorkflowDoor)(workflowDoorOver(layer, defs));
}
