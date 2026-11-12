/**
 * The person's files, read on the client's machine as text (the api-consumer intent's Q8): the client sends them to the api's
 * review-style reads (`POST /api/{workflows|agents|skills}/read`), which read them into the kind's spec; it parses none of them itself.
 * A file that cannot be read, a folder that is not one and a link in a draft folder are refused, exit 2, naming the file and what to do.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { WorkflowFile } from 'objects';
import { Refused } from '../refused.ts';

/** The text of `file`, for the command `command` names; refused, naming the file, where it cannot be read. */
export function textOf(file: string, command: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new Refused(
      `nemia ${command} cannot read ${path.resolve(file)}: ${err instanceof Error ? err.message : String(err)}. Name a file that is there.`,
    );
  }
}

/**
 * The files of the draft folder `folder`, by their names and with their text: every regular file directly in it, sorted by name. A
 * subfolder is not read; a link is refused by name, since what it points at is not the draft's own. Refused where `folder` is no folder.
 */
export function folderFiles(folder: string, command: string): WorkflowFile[] {
  if (!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory())
    throw new Refused(`nemia ${command} reads the folder ${path.resolve(folder)}, and it is not one. Name the draft folder.`);
  const entries = fs.readdirSync(folder, { withFileTypes: true });
  const linked = entries.find((entry) => entry.isSymbolicLink());
  if (linked !== undefined)
    throw new Refused(
      `nemia ${command} reads the draft folder's own files, and ${path.resolve(folder, linked.name)} is a link. Copy the file it points at into the draft folder, or remove the link.`,
    );
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({ path: name, text: textOf(path.join(folder, name), command) }));
}

/**
 * An agent's files: its file `file` first, by its name, then each `*.json` file beside it, sorted by name, where the result schema its
 * `output:` names is found by the api.
 */
export function agentFiles(file: string, command: string): WorkflowFile[] {
  const text = textOf(file, command);
  const dir = path.dirname(file);
  const own = path.basename(file);
  const beside = fs
    .readdirSync(dir)
    .filter((name) => name !== own && name.endsWith('.json') && fs.statSync(path.join(dir, name), { throwIfNoEntry: false })?.isFile())
    .sort();
  return [{ path: own, text }, ...beside.map((name) => ({ path: name, text: textOf(path.join(dir, name), command) }))];
}
