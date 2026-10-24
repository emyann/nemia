/**
 * A person's custom instructions, written: one file per agent name in their store (`customInstructionsFile`), what they add to an agent
 * they use without rewriting it. Read beside it (`agents/read.store.ts`) by the load (`readCustomInstructions`), which a run does once,
 * at `nemia start`: a write or a clear reaches only the runs started after it, but for the store's own agent, whose keeper tells her open
 * session at its next beat (`nemia/keep.verb.ts`). The one writer of the folder, and its reader for a person's command and the board alike:
 * a name no place has is refused here, read, written or cleared, so both refuse it in the same words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { customInstructionsRefusal } from './agents.ts';
import { agentsFor, customInstructionsFile, notAFileRefusal, readCustomInstructions } from './read.store.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';

/** The store's own agent, Nemia, whom no place names: she is built into this package, and her custom instruction is the person's. */
const STORE_AGENT = 'nemia';

/** Whether `name` is the store's own agent (`STORE_AGENT`), whose open session is told her custom instructions, never frozen at a start. */
export const isStoreAgent = (name: string): boolean => name === STORE_AGENT;

/**
 * Refuse, as `Missing`, an agent `name` a run on `repo` could not name: none of the repository's places for agents has it, nor yours in the
 * store `home` (`agentsFor`), and it is not the store's own agent (`STORE_AGENT`). The refusal lists the names there are. A name whose
 * file does not read is one all the same.
 */
function refuseNoAgent(home: string, name: string, repo: string): void {
  if (isStoreAgent(name)) return;
  const at = path.resolve(repo);
  const names = [...agentsFor(path.join(at, 'workflows', '_'), { repo: at, home }).keys()].sort();
  if (names.includes(name)) return;
  throw new Missing({
    message: `no agent named ${name} where a run on ${at} looks for one, nor in yours (${path.join(home, 'workflows', 'agents')}). ${names.length ? `The agents there: ${names.join(', ')}.` : 'There are none.'} Name one of them, or the repository it is in.`,
  });
}

/**
 * The custom instructions for the agent `name` in the store `home`, as `readCustomInstructions` reads them, for a person's command and the
 * board alike. Refused, reading nothing: a name a run on `repo` could not name (`Missing`).
 */
export function customInstructionsFor(home: string, name: string, repo: string): string | undefined {
  refuseNoAgent(home, name, repo);
  return readCustomInstructions(home, name);
}

/**
 * Write `text` as the custom instructions for the agent `name` in the store `home`, and the file written. Refused, writing nothing: a name
 * a run on `repo` could not name (`Missing`), blank text, a frontmatter block (`customInstructionsRefusal`), and anything at the file
 * that is neither a file nor a link (`notAFileRefusal`), which the read refuses too. A link at the file is replaced, never written through.
 */
export function writeCustomInstructions(home: string, name: string, text: string, repo: string): string {
  refuseNoAgent(home, name, repo);
  const file = customInstructionsFile(home, name);
  if (!text.trim())
    throw new Invalid({
      message: `the custom instructions for ${name} are blank. Write the words the agent is to be told, or remove them: nemia agents custom ${name} --clear.`,
    });
  const refused = customInstructionsRefusal(file, text);
  if (refused !== undefined) throw new Invalid({ message: refused });
  const there = fs.lstatSync(file, { throwIfNoEntry: false });
  if (there && !there.isFile() && !there.isSymbolicLink()) throw new Invalid({ message: notAFileRefusal(file, name) });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.rmSync(file, { force: true });
  fs.writeFileSync(file, text.trim() + '\n');
  return file;
}

/**
 * Remove the custom instructions for the agent `name` from the store `home`: whether there were any. Refused, removing nothing, for a name
 * a run on `repo` could not name (`Missing`).
 */
export function clearCustomInstructions(home: string, name: string, repo: string): boolean {
  refuseNoAgent(home, name, repo);
  const file = customInstructionsFile(home, name);
  if (!fs.lstatSync(file, { throwIfNoEntry: false })) return false;
  fs.rmSync(file, { recursive: true, force: true });
  return true;
}
