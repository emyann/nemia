/**
 * The trust of a run's home, the copy of its factory's home frozen under `runs/<id>/home/<hex>/` that its local sessions start in: a
 * harness drops the allow rules of a folder's own settings until it trusts that folder, and trusting a parent does not count, so the
 * copy is trusted by its own record before its first session (`trustRunHome`: at `nemia start`, and again at each filing that finds it
 * untrusted), and every record at or under the run's `home/` is taken back when the run is removed (`untrustRunHome`), so the
 * harness's file does not grow with every run. Which steps start there is the filing's own decision (`startOf`); the trust is the
 * runtime's (`trustFolder`, `untrustFolder`).
 */
import fs from 'node:fs';
import { homeFilesDir } from '../frozen/frozen.store.ts';
import { startOf } from '../filed/filed.ts';
import { DEFAULT_HARNESS, HARNESSES } from '../harness/harness.ts';
import type { Run } from '../record/record.ts';
import { trustFolder, untrustFolder } from '../runtime-client.ts';
import type { StepSpec } from '../workflow.ts';
import { homeTrustRefused, homeUntrustRefused } from './trust.ts';

/** The words of what a write threw. */
const threwWords = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** `dir` as the harness's session sees its own folder, its links resolved, where it is there; else as given. */
const realOf = (dir: string) => {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
};

/**
 * Trusts the run's home for the harness of each of `steps` whose session starts there, each harness once: a home already trusted is
 * left as it is. Answers why it could not, in words that name the harness's file and the fix (`homeTrustRefused`), or undefined where
 * every such harness trusts it now, and where the run froze no home.
 * @param home The store's root.
 * @param run The run: its id and the digest of its frozen home.
 * @param steps The steps whose sessions are about to be filed.
 */
export function trustRunHome(home: string, run: Pick<Run, 'id' | 'homeFiles'>, steps: readonly StepSpec[]) {
  if (run.homeFiles === undefined) return undefined;
  const dir = homeFilesDir(home, run, run.homeFiles);
  const startsThere = steps.filter((step) => startOf(step, '/', { home: dir, mcp: false, skills: {} }).cwd === dir);
  const folder = realOf(dir);
  for (const harness of new Set(startsThere.map((step) => step.harness ?? DEFAULT_HARNESS))) {
    try {
      const given = trustFolder(harness, folder);
      if (given !== undefined && !given.trusted) return homeTrustRefused(given);
    } catch (err) {
      return homeTrustRefused({ harness, folder, file: "the harness's own file", never: null, refused: null }, threwWords(err));
    }
  }
  return undefined;
}

/**
 * Takes back every record each harness keeps at or under the run's `home/`, its own trust of each copy and what the harness kept of
 * each folder a session started in, by the path as written and as its links resolve. Answers why some stayed, or undefined where none
 * is left.
 * @param home The store's root.
 * @param id The run's id.
 */
export function untrustRunHome(home: string, id: string) {
  const dir = homeFilesDir(home, { id });
  const folders = [...new Set([dir, realOf(dir)])];
  const left: string[] = [];
  for (const harness of HARNESSES)
    for (const folder of folders) {
      try {
        const taken = untrustFolder(harness, folder);
        if (taken !== undefined && taken.refused !== null) left.push(homeUntrustRefused(taken.harness, folder, taken.refused));
      } catch (err) {
        left.push(homeUntrustRefused(harness, folder, threwWords(err)));
      }
    }
  return left.length ? left.join('; ') : undefined;
}
