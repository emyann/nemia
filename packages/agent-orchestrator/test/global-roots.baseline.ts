/**
 * Every file of `src` that still reads the store's root as it loads, or defaults a parameter to one read that way, with how many such
 * roots it holds (`root-given.test.ts`, `globalRoots`). A debt, and nothing else: the root is a service a program is given where it is
 * composed (`StoreRoot`, `src/config/root.store.ts`), and a store function takes it as a required `home: string` so a caller that
 * forgets it does not compile.
 *
 * `record/record.store.ts`'s `HOME`, which 61 files import, is one of them. It only shrinks: a file
 * threaded takes its line away, a count cut is lowered here, and a file this does not name may hold none at all — the sweep refuses a
 * new one by name. The card that opened it — the store's root is an injected service — is done when this is empty, and only then can
 * the suite's files share a process with nothing to lose.
 */

/** Each file by its path from the package, and the roots it still holds as it loads. */
export const GLOBAL_ROOTS: Readonly<Record<string, number>> = {
  'src/admission/admit.verb.ts': 1,
  'src/agents/custom.verb.ts': 1,
  'src/agents/library.verb.ts': 3,
  'src/auto/auto.verb.ts': 4,
  'src/folder/workflows.verb.ts': 2,
  'src/folder/write.store.ts': 1,
  'src/nemia/level.store.ts': 4,
  'src/pause/pause.store.ts': 1,
  'src/question/asked.verb.ts': 1,
  'src/record/record.store.ts': 1,
  'src/record/steps.store.ts': 1,
  'src/release/release.store.ts': 6,
  'src/revisions/revisions.store.ts': 1,
  'src/roster/roster.store.ts': 6,
  'src/service/service.store.ts': 1,
  'src/skills/skills.verb.ts': 1,
  'src/sources/copy.verb.ts': 2,
  'src/sources/sources.store.ts': 1,
  'src/subscription/subscription.store.ts': 1,
};
