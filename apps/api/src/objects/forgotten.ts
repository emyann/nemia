/**
 * What a removal answers of what `nemia rm` did with a run (`RM`'s `forgot`, the package's `Forgot`), as data the client words: its
 * worktrees removed, handed off and already gone, the files removed, each branch's fate, its base branch and repository, whether it cut
 * worktrees, whether it was a folder run, and why its unfrozen workflow did not read. A key it has nothing for is left out.
 */
import type { Forgot } from 'agent-orchestrator';
import type { RunRemoved } from 'objects';

/** The keys of `objects`' `RunRemoved` that say what was done with the run, off what `forgetRun` answered. */
export const forgottenOf = (f: Forgot): Omit<RunRemoved, 'id' | 'removed' | 'engine'> => ({
  worktrees: [...f.removed],
  handedOff: f.handedOff.map((h) => ({ step: h.step, ...(h.branch !== undefined ? { branch: h.branch } : {}), commit: h.commit })),
  gone: [...f.gone],
  files: [...f.files],
  branches: f.branches.map((b) => ({ branch: b.branch, deleted: b.deleted, why: b.why })),
  ...(f.base !== undefined ? { base: f.base } : {}),
  ...(f.repo !== undefined ? { repo: f.repo } : {}),
  ...(f.isolate !== undefined ? { isolate: f.isolate } : {}),
  ...(f.folder ? { folder: true as const } : {}),
  ...(f.unfrozen !== undefined ? { unfrozen: f.unfrozen } : {}),
});
