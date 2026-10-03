/**
 * A person's custom instructions, written: one file per agent name in their store (`customInstructionsFile`), what they add to an agent
 * they use without rewriting it. Read by the load (`readCustomInstructions`), which a run does once, at `wf start`: a write or a clear
 * reaches only the runs started after it. The one writer of the folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import { customInstructionsRefusal } from './agents.ts';
import { customInstructionsFile } from '../folder/folder.store.ts';
import { Invalid } from '../refusal/refusal.ts';

/**
 * Write `text` as the custom instructions for the agent `name` in the store `home`, and the file written. Refused, writing nothing: blank
 * text, and a frontmatter block (`customInstructionsRefusal`). A link at the file is replaced, never written through.
 */
export function writeCustomInstructions(home: string, name: string, text: string): string {
  const file = customInstructionsFile(home, name);
  if (!text.trim())
    throw new Invalid({
      message: `the custom instructions for ${name} are blank. Write the words the agent is to be told, or remove them: wf agents custom ${name} --clear.`,
    });
  const refused = customInstructionsRefusal(file, text);
  if (refused !== undefined) throw new Invalid({ message: refused });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.rmSync(file, { force: true });
  fs.writeFileSync(file, text.trim() + '\n');
  return file;
}

/** Remove the custom instructions for the agent `name` from the store `home`: whether there were any. */
export function clearCustomInstructions(home: string, name: string): boolean {
  const file = customInstructionsFile(home, name);
  if (!fs.lstatSync(file, { throwIfNoEntry: false })) return false;
  fs.rmSync(file, { recursive: true, force: true });
  return true;
}
