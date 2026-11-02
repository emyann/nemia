/**
 * Every file of `src` that still reads the store's root as it loads, with how many lines of it do (`root-given.test.ts`,
 * `globalRoots`). A debt, and nothing else: the root is a service a program is given where it is composed (`StoreRoot`,
 * `src/config/root.store.ts`), and a store function takes it as a required `home: string` so a caller that forgets it does not
 * compile.
 *
 * The count is lines, not bindings: a module-level `const HOME = wfRoot()`, a parameter defaulted to one, and every line of a body
 * that reads such a root by name, which is the shape most of the debt is in and the worst of it — the function takes no root at all,
 * so a caller cannot name one even when it wants to. `record/record.store.ts` binds the `HOME` that 40 files of `src` import; the
 * lines counted against each of them are the lines that have to change for it to take its root as a parameter, so the total is the
 * work left and not the bindings alone.
 *
 * It only shrinks: a file threaded takes its line away, a count cut is lowered here, and a file this does not name may hold none at
 * all — the sweep refuses a new one by name. The card that opened it — the store's root is an injected service — is done when this is
 * empty, and only then can the suite's files share a process with nothing to lose.
 */

/** Each file by its path from the package, and the lines of it that read a root the module holds. */
export const GLOBAL_ROOTS: Readonly<Record<string, number>> = {
  'src/admission/admit.verb.ts': 1,
  'src/agents/library.verb.ts': 1,
  'src/applied/applied.store.ts': 1,
  'src/auto/auto.verb.ts': 4,
  'src/chat/chat.verb.ts': 1,
  'src/check/check.store.ts': 1,
  'src/cli/main.ts': 3,
  'src/cli/runs.ts': 4,
  'src/cli/writers.ts': 2,
  'src/command/pages.verb.ts': 2,
  'src/daemon/daemon.store.ts': 15,
  'src/daemon/up.verb.ts': 1,
  'src/disk/disk.store.ts': 4,
  'src/factory/factory.store.ts': 1,
  'src/factory/instruction.store.ts': 1,
  'src/feed/feed.store.ts': 1,
  'src/folder/lookup.store.ts': 1,
  'src/workflows/workflows.verb.ts': 2,
  'src/folder/write.store.ts': 1,
  'src/forget/forget.verb.ts': 4,
  'src/inbox/inbox.store.ts': 1,
  'src/level/level.store.ts': 1,
  'src/nemia/level.store.ts': 5,
  'src/pause/pause.store.ts': 3,
  'src/prune/free.verb.ts': 2,
  'src/prune/prune.verb.ts': 1,
  'src/question/asked.verb.ts': 1,
  'src/record/files.store.ts': 4,
  'src/record/record.store.ts': 2,
  'src/record/steps.store.ts': 1,
  'src/release/release.store.ts': 6,
  'src/revisions/revisions.store.ts': 2,
  'src/roster/roster.store.ts': 6,
  'src/rules/rules.store.ts': 1,
  'src/runtime-client.ts': 2,
  'src/schedule/schedule.store.ts': 1,
  'src/series/series.store.ts': 1,
  'src/service/service.store.ts': 1,
  'src/sources/copy.verb.ts': 2,
  'src/sources/sources.store.ts': 1,
  'src/standing/standing.store.ts': 3,
  'src/start/start.verb.ts': 2,
  'src/subscription/subscription.store.ts': 2,
  'src/workspace/worktree.store.ts': 1,
};
