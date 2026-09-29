/**
 * The files `wf start --input` gives a run: why they are refused (`inputRefusal`), and how a step's brief and `wf decide` name them
 * (`inputsLine`, `inputsNote`); and where a run came from (`fromNote`). Pure.
 */
import path from 'node:path';
import { GIVEN } from '../workspace/workspace.ts';
import type { Run } from '../record/record.ts';

/**
 * A file `wf start --input` was given, as start.ts found it: the path as typed, where it resolves, and what is there. What `inputRefusal`
 * judges; start.ts looks, and this file does not.
 */
export type InputFile = { given: string; resolved: string; kind: 'file' | 'directory' | 'missing' | 'other' };

/**
 * Why `wf start --input` will not copy these files into the run, in words that name the fix — or null. Pure, and asked before anything is
 * written: a file that is not there, a directory, anything else that is not a regular file, and two inputs that would take one name in the
 * run's `inputs/` — one file given twice, or two files of the same name.
 */
export function inputRefusal(inputs: readonly InputFile[]): string | null {
  for (const f of inputs) {
    if (f.kind === 'missing')
      return `--input ${f.given}: there is no file at ${f.resolved}. Give the path to a file to hand the run's steps, from where wf start is typed or absolute.`;
    if (f.kind === 'directory')
      return `--input ${f.given}: ${f.resolved} is a directory, and --input copies one file. Give each file its own --input.`;
    if (f.kind === 'other')
      return `--input ${f.given}: ${f.resolved} is not a regular file, so there is nothing to copy. Give the path to a file.`;
  }
  const named = new Map<string, InputFile>();
  for (const f of inputs) {
    const name = path.basename(f.resolved);
    const other = named.get(name);
    if (other?.resolved === f.resolved) return `--input ${f.given} is given twice. Each file is copied once: give it one --input.`;
    if (other) {
      return `--input ${other.given} and --input ${f.given} are both named ${name}, and the run keeps its inputs by name, in one directory. Rename one of them, or give only one.`;
    }
    named.set(name, f);
  }
  return null;
}

/**
 * The line a step's brief carries under what was asked for when `wf start --input` gave the run files: where they are, and each by name.
 * Undefined for a run given none, or with no directory to name.
 *
 * `inFolder` for a step of a folder run, which is fenced to its own folder (`validateFolderMode` in workflow/validate.ts): the run's own `inputs/`
 * sits beside that folder, outside the fence, and named it the session would be denied the read with no prompt and no way to say so. The
 * run copies them in instead (`givenPlan`, `folderPlace.make`), and the line names the copy, by its path from the folder.
 */
export const inputsLine = (dir: string | undefined, names: readonly string[] | undefined, inFolder = false): string | undefined =>
  dir && names?.length
    ? `Files given with it (\`wf start --input\`), ${inFolder ? `copied into \`${GIVEN}/inputs\` in this folder` : `in \`${dir}\``}: ${names.map((n) => `\`${n}\``).join(', ')}.`
    : undefined;

/** What `wf decide` says under a run's line of where the run came from: the inbox card it was started from. Undefined for a run typed at `wf start`. */
export const fromNote = (run: Pick<Run, 'from'>): string | undefined => (run.from ? `from inbox card ${run.from.inbox}` : undefined);

/** What `wf decide` says under a run's line when `wf start --input` gave it files: each by name, and where they are. Undefined for a run given none. */
export const inputsNote = (dir: string, names: readonly string[] | undefined): string | undefined =>
  names?.length ? `inputs  ${names.join(', ')}  —  in ${dir}` : undefined;
