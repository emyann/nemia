/**
 * A person's custom instructions, read: where the file of an agent's is in their store, and its words or the refusal of them. A store
 * file at the bottom of the tree beneath the controllers: it imports no other (`test/boundary.test.ts`), so the load
 * (`folder/folder.store.ts`) and the one writer of the folder (`custom.store.ts`) both read through it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { WorkflowError } from '../step/step.ts';
import { linkRefusal } from '../folder/folder.ts';
import { CUSTOM_INSTRUCTIONS_FOLDER, customInstructionsRefusal } from './agents.ts';

/** The file of a person's custom instructions for the agent `name`, in the store `home`: `<home>/custom-instructions/<name>.md`. */
export const customInstructionsFile = (home: string, name: string): string =>
  path.join(path.resolve(home), CUSTOM_INSTRUCTIONS_FOLDER, `${name}.md`);

/** Why `file`, the custom instructions of the agent `name`, is refused when it is there but no file nor link, and the fix: the clear. */
export const notAFileRefusal = (file: string, name: string): string =>
  `${file} is not a file: custom instructions are one file per agent. Remove it: nemia agents custom ${name} --clear.`;

/**
 * A person's custom instructions for the agent `name`, read from the store `home` (`customInstructionsFile`): the words, or `undefined`
 * when there are none or the file is blank. Refused as a `WorkflowError` naming the file and the fix: a link, whose words would change
 * with what it points at, anything else not a file (`notAFileRefusal`), and a frontmatter block (`customInstructionsRefusal`).
 */
export function readCustomInstructions(home: string, name: string): string | undefined {
  const file = customInstructionsFile(home, name);
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return undefined;
  if (stat.isSymbolicLink())
    throw new WorkflowError(
      linkRefusal(file, `custom instructions are a person's own words: read through a link, they would change with what it points at.`),
    );
  if (!stat.isFile()) throw new WorkflowError(notAFileRefusal(file, name));
  const text = fs.readFileSync(file, 'utf8');
  const refused = customInstructionsRefusal(file, text);
  if (refused !== undefined) throw new WorkflowError(`${refused} Or remove them: nemia agents custom ${name} --clear.`);
  return text.trim() || undefined;
}
