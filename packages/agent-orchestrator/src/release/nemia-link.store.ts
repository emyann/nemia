/**
 * The tools folder's `nemia` (`<tools>/bin/nemia`): a link to the launcher of the release the store's pointer names
 * (`<home>/releases/current/bin/nemia`), so a step's session, whose PATH starts with the tools folder, runs the `nemia` its settings
 * allow on a server whose own PATH has none, and the link follows every switch of the pointer with nothing more to do. Made by the
 * installer and by `nemia doctor carry`, which an upgrade runs (`linkNemia`); read by the readiness read's `tools` piece, and put back by
 * `nemia doctor fix tools` (`toolsNeed`). A store with no pointer — one a checkout runs, whose person has their own `nemia` — gets none.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Need } from 'objects';
import { toolsBinDir } from '../config/root.store.ts';
import { CURRENT } from './release.ts';
import { releasesDir } from './release.store.ts';

/** The tools folder's `nemia` of the store at `home`. */
export const toolsNemia = (home: string): string => path.join(toolsBinDir(home), 'nemia');

/** What the link names: the launcher under the store's pointer, never a release's own folder, so it follows every upgrade. */
export const currentNemia = (home: string): string => path.join(releasesDir(home), CURRENT, 'bin', 'nemia');

/** `text` as one word of `sh`. */
const shellWord = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

/**
 * Links the tools folder's `nemia` of the store at `home` to `currentNemia`, where the pointer's release holds a launcher there; a link
 * that names it already is left, any other file there replaced through a link made beside it and renamed over it. Answers whether it
 * linked one now. A store with no pointer, or whose release holds no `bin/nemia`, is left as it is.
 */
export function linkNemia(home: string): boolean {
  const target = currentNemia(home);
  if (!fs.existsSync(target)) return false;
  const link = toolsNemia(home);
  const named = (() => {
    try {
      return fs.readlinkSync(link);
    } catch {
      return undefined;
    }
  })();
  if (named === target) return false;
  fs.mkdirSync(toolsBinDir(home), { recursive: true });
  const beside = `${link}.${process.pid}.partial`;
  fs.rmSync(beside, { force: true });
  fs.symlinkSync(target, beside);
  fs.renameSync(beside, link);
  return true;
}

/**
 * The store's own need of the store at `home` that `nemia doctor fix tools` starts: the tools folder's `nemia` linked to `currentNemia`,
 * its fix refused (exit 1) where the pointer's release holds no launcher, as on a store a checkout runs.
 */
export const toolsNeed = (home: string): Need => {
  const target = shellWord(currentNemia(home));
  return {
    name: 'tools',
    message: "the tools folder holds nemia, a link to the launcher under releases/current, so a step's session runs it",
    check: `test -x ${shellWord(toolsNemia(home))}`,
    fixes: [
      {
        message: "link the release's nemia into the tools folder",
        command: `test -x ${target} || { echo "${CURRENT} names no release holding bin/nemia: install a release first"; exit 1; }; mkdir -p ${shellWord(toolsBinDir(home))} && ln -sfn ${target} ${shellWord(toolsNemia(home))}`,
      },
    ],
  };
};
