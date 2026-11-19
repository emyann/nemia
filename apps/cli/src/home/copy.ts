/**
 * The client's copies of factories' homes: under its own cache folder, `${XDG_CACHE_HOME:-~/.cache}/nemia/homes/<context>/<factory>/`,
 * beside its config and never in the store, each copy named by the home's digest (`renderedCopy`), as a run names its copy. A copy is
 * written into a sibling folder first and renamed into place, so a reader never sees half of one; each file's write bits are cleared and
 * the folders' kept, so the copy can be removed; a copy of that digest already there is kept as it is. The copies of earlier versions of
 * the same home are removed once a new one is rendered (`prunedCopies`, by `staleCopiesOf`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FactoryHome } from 'objects';
import { Refused } from '../refused.ts';
import { staleCopiesOf } from './own-session.ts';

/**
 * The folder of the copies of `factory`'s home under the context `context`, in the client's cache.
 * @param env The environment read for `XDG_CACHE_HOME` and `HOME`.
 * @param context The context the home was read through, by its name.
 * @param factory The factory, by its name.
 */
export const homeCopiesDir = (env: NodeJS.ProcessEnv, context: string, factory: string): string => {
  const xdg = env.XDG_CACHE_HOME;
  const home = env.HOME !== undefined && env.HOME !== '' ? env.HOME : os.homedir();
  return path.join(xdg !== undefined && xdg !== '' ? xdg : path.join(home, '.cache'), 'nemia', 'homes', context, factory);
};

/** A file's path from the home as the api sent it, refused where it would land outside the copy. */
function pathIn(copy: string, sent: string): string {
  const parts = sent.split('/');
  if (sent.startsWith('/') || parts.some((p) => p === '' || p === '.' || p === '..'))
    throw new Refused(
      `the home sent a file at ${sent}, a path outside its folder: nothing was rendered. Ask the daemon's keeper to check the factory's tree, then run nemia factory home again.`,
      1,
    );
  return path.join(copy, ...parts);
}

/**
 * The copy of `home` in `dir`, named by its digest: written whole where none is there, kept where one is. Answers its absolute path.
 * @param dir The folder of the home's copies (`homeCopiesDir`).
 * @param home The home as the api served it.
 */
export function renderedCopy(dir: string, home: FactoryHome): string {
  const copy = path.join(dir, home.digest);
  if (fs.existsSync(copy)) return copy;
  fs.mkdirSync(dir, { recursive: true });
  const staged = fs.mkdtempSync(path.join(dir, `.${home.digest.slice(0, 12)}-`));
  try {
    fs.chmodSync(staged, 0o755);
    for (const file of home.files) {
      const at = pathIn(staged, file.path);
      fs.mkdirSync(path.dirname(at), { recursive: true, mode: 0o755 });
      fs.writeFileSync(at, Buffer.from(file.content, 'base64'));
      fs.chmodSync(at, file.mode & 0o555);
    }
    if (fs.existsSync(copy)) fs.rmSync(staged, { recursive: true, force: true });
    else fs.renameSync(staged, copy);
  } catch (err) {
    fs.rmSync(staged, { recursive: true, force: true });
    throw err;
  }
  return copy;
}

/**
 * Removes every earlier copy in `dir` but `current` and a render still being written (`staleCopiesOf`). Answers the names removed.
 * @param dir The folder of the home's copies.
 * @param current The digest of the copy just rendered.
 */
export function prunedCopies(dir: string, current: string): readonly string[] {
  const stale = staleCopiesOf(fs.readdirSync(dir), current);
  for (const name of stale) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  return stale;
}
