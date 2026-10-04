/**
 * An agent's try folder in the store: `tries/<agent>/try.md`, beside `workflows/`, a hidden one-step folder team the board writes and
 * starts. The store writes its step file; what the file says is the caller's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Invalid } from '../refusal/refusal.ts';

/** Where every try's folder is: `tries/` in the store `home`, beside `workflows/`. */
export const triesDir = (home: string): string => path.join(home, 'tries');

/** The folder the agent `name`'s try is started from. */
export const tryDir = (name: string, home: string): string => path.join(triesDir(home), name);

/** The step a try's folder has, and so the one step of its run. */
export const TRY_STEP = 'try';

/**
 * Writes the try folder of the agent `name` in the store `home`, its step file `text`, when the file does not read or says otherwise,
 * and leaves it as it is when it says `text`; answers the folder. Refuses (`Invalid`) a `tries/`, a folder or a step file that is a link:
 * written through, it would change whatever it points at.
 */
export function writeTryFolder(name: string, text: string, home: string): string {
  const dir = tryDir(name, home);
  const file = path.join(dir, `${TRY_STEP}.md`);
  for (const at of [triesDir(home), dir, file]) {
    if (fs.lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Invalid({
        message: `${at} is a link, and a try's folder is written by the api: make it a folder of its own, or remove it.`,
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
