/**
 * An agent's try folder in the store: `tries/<agent>/try.md`, beside `workflows/`, a hidden one-step folder team a try writes and
 * starts. The store writes its step file; what the file says is `tryText`'s.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Invalid } from '../refusal/refusal.ts';
import { triesDir, tryDir, tryFence, tryText, type FencedKeys } from './try.ts';

export { triesDir, tryDir };

/** The step a try's folder has, and so the one step of its run. */
export const TRY_STEP = 'try';

/**
 * Writes the try folder of the agent `name` in the store `home`, its step file `text`, when the file does not read or says otherwise,
 * and leaves it as it is when it says `text`; answers the folder. Refuses (`Invalid`) a `tries/`, a folder or a step file that is a link:
 * written through, it would change whatever it points at.
 * @param name The agent's name, which names its try folder.
 * @param text The step file's text.
 * @param home The store's root folder.
 */
export function writeTryFolder(name: string, text: string, home: string) {
  const dir = tryDir(name, home);
  const file = path.join(dir, `${TRY_STEP}.md`);
  for (const at of [triesDir(home), dir, file]) {
    if (fs.lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Invalid({
        message: `${at} is a link, and a try's folder is written by the store: make it a folder of its own, or remove it.`,
      });
    }
  }
  let was: string | undefined;
  try {
    was = fs.readFileSync(file, 'utf8');
  } catch {}
  if (was === text) return dir;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, text);
  return dir;
}

/**
 * The try folder of an agent whose keys are `keys`, written (`writeTryFolder`) with its step file (`tryText`) at the agent's `version`;
 * answers the folder. Refuses (`Invalid`) an agent the try cannot fence (`tryFence`), and a folder or a step file that is a link.
 * @param name The agent's name.
 * @param version The agent's version the step file records.
 * @param keys The agent's keys that say its fence: its mode and its allow rules.
 * @param home The store's root folder.
 */
export function tryFolder(name: string, version: string, keys: FencedKeys, home: string) {
  const fence = tryFence(name, keys);
  if (typeof fence === 'string') throw new Invalid({ message: fence });
  return writeTryFolder(name, tryText(name, version, fence), home);
}
