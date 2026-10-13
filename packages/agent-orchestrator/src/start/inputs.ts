/**
 * The files `nemia start --input` gives a run: why they are refused (`inputRefusal`), and how a step's brief and `nemia decide` name them
 * (`inputsLine`, `inputsNote`); what a step's brief says of the folders its run mounts (`mountsLine`); and where a run came from
 * (`fromNote`). Pure.
 */
import path from 'node:path';
import { GIVEN } from '../workspace/workspace.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import type { Workflow } from '../step/step.ts';
import type { Mount, Run } from '../record/record.ts';
import { stepMounts } from '../factory/factory.ts';
import type { FiledFolders } from '../filed/filed.ts';
import type { HandedFiles } from '../artifacts/artifacts.ts';

/**
 * A file `nemia start --input` was given, as start.verb.ts found it: the path as typed, where it resolves, and what is there. What
 * `inputRefusal` judges; start.verb.ts looks, and this file does not.
 */
export type InputFile = { given: string; resolved: string; kind: 'file' | 'directory' | 'missing' | 'other' };

/**
 * Why `nemia start --input` will not copy these files into the run, in words that name the fix — or null. Pure, and asked before anything
 * is written: a file that is not there, a directory, anything else that is not a regular file, and two inputs that would take one name in
 * the run's `inputs/` — one file given twice, or two files of the same name.
 */
export function inputRefusal(inputs: readonly InputFile[]): string | null {
  for (const f of inputs) {
    if (f.kind === 'missing')
      return `--input ${f.given}: there is no file at ${f.resolved}. Give the path to a file to hand the run's steps, from where nemia start is typed or absolute.`;
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

const PICTURES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif']);
const TEXTS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.log', '.html', '.xml', '.toml']);

/** What a given file is, read off its name alone: a picture, a text file, or a file. */
const inputKind = (name: string): 'a picture' | 'a text file' | 'a file' => {
  const ext = path.extname(name).toLowerCase();
  if (PICTURES.has(ext)) return 'a picture';
  return TEXTS.has(ext) ? 'a text file' : 'a file';
};

/**
 * What a step's brief says, under a heading of its own (`INPUTS_HEADING`), when `nemia start --input` gave the run files: what they are,
 * part of what was asked; each by name with what it is (`inputKind`); then where they are and what the step may do with them. It obliges
 * no step to open one. Undefined for a run given none, or with no directory to name.
 *
 * `inFolder` for a step of a folder run, which is fenced to its own folder (`validateFolderMode` in workflow/validate.ts): the run's own
 * `inputs/` sits beside that folder, outside the fence, and named it the session would be denied the read with no prompt and no way to say
 * so. The run copies them in instead (`givenPlan`, `folderPlace.make`), and the line names the copy, by its path from the folder.
 *
 * `folders`, the folders the step is filed with (`filedFolders` in filed.ts): where they hold the run's inputs folder, mounted read-only
 * (`inputsMounts`), the line names it by the mount's path, to read and never write. Without it, the folder is named as it is on disk: a
 * harness fenced by a sandbox reads it there, and the board's preview composes without folders.
 */
export const inputsLine = (
  dir: string | undefined,
  names: readonly string[] | undefined,
  inFolder = false,
  folders?: Pick<FiledFolders, 'inputs'>,
): string | undefined => {
  if (!dir || !names?.length) return undefined;
  const files = names.map((n) => `\`${n}\`, ${inputKind(n)}`).join('; ');
  const said = `The person gave these files with what was asked for (\`nemia start --input\`). They are part of what was asked, there for you to build your understanding of the task: ${files}.`;
  const mounted = inFolder ? undefined : folders?.inputs[0];
  if (mounted)
    return `${said} You may read them and must not write them, in \`${mounted.path}\`. The folder is mounted read-only; read them with Read, Grep and Glob.`;
  return `${said} They are ${inFolder ? `copied into \`${GIVEN}/inputs\` in this folder` : `in \`${dir}\``}.`;
};

/** The heading a brief gives the files handed with what was asked for, over `inputsLine`: a section of its own, beside the request. */
export const INPUTS_HEADING = '## Files given with it';

/** Folders by their absolute paths, each in backticks. */
const pathsOf = (mounts: readonly Mount[]): string => mounts.map((m) => `\`${m.path}\``).join(', ');

/**
 * What a brief says of the folders the steps before it handed over (`handed`, each read-only): each by its absolute path and its step,
 * the folder's name, and that it is listed under its own path, since the run's artifacts folder above it is not mounted; then, of the
 * files each of those steps named, those that are there (`namedWords`, off `named`).
 */
const handedLine = (handed: readonly Mount[], named: FiledFolders['named'] = {}): string =>
  `Folders the steps before you handed over, which you may read and must not write: ${handed.map((m) => `\`${m.path}\` (${path.basename(m.path)}'s)`).join(', ')}. Each is mounted on its own path, and the run's artifacts folder above them is not: list one with Glob under its own path, as \`${handed[0].path}/**\`.${handed.map((m) => namedWords(path.basename(m.path), named[m.path])).join('')}`;

/**
 * What a brief says of the files a step before it named in its closeout (`HandedFiles`): each that is there now, by absolute path, and how
 * many it named that are not — counted and never named, so the step is handed no name with no file behind it. Nothing for a step that
 * named none, or whose files nobody read.
 */
function namedWords(step: string, files: HandedFiles | undefined): string {
  if (!files || !(files.there.length + files.gone)) return '';
  const gone =
    files.gone === 1 ? '1 file it named is not there, and is not listed' : `${files.gone} files it named are not there, and are not listed`;
  if (!files.there.length) return ` Of the files ${step} named, none is there: ${gone}.`;
  return ` The files ${step} named that are there: ${files.there.map((file) => `\`${file}\``).join(', ')}.${files.gone ? ` ${gone[0].toUpperCase()}${gone.slice(1)}.` : ''}`;
}

/**
 * What a step's brief says of the folders its run mounts, under what was asked for: each by its absolute path, those its `writable:` names
 * to write (`stepMounts`), the others to read and never write; then the folders it is filed with beyond them (`folders`, as `filedFolders`
 * in filed.ts files them), to read and never write: the artifacts folders of the steps before it (`handed`), each with how to list it, and
 * the store's folders its `reads:` names (`store`); a blank line before them. Nothing for a run that mounts none and a step given no other
 * folder, and for a step on a remote agent, which is filed none.
 */
export const mountsLine = (
  step: Pick<Workflow, 'harness' | 'writable'>,
  run: Pick<Run, 'mounts'>,
  folders: FiledFolders = { handed: [], store: [], inputs: [] },
): string[] => {
  const local = !isRemoteHarness(step.harness);
  const mounts = local ? stepMounts(step, run.mounts) : undefined;
  const { handed, store } = local ? folders : { handed: [], store: [] };
  if (!mounts?.length && !handed.length && !store.length) return [];
  const writes = (mounts ?? []).filter((m) => !m.readOnly);
  const reads = (mounts ?? []).filter((m) => m.readOnly);
  return [
    '',
    ...(writes.length
      ? [
          `Folders of this factory you may write, as this step's \`writable:\` names them: ${pathsOf(writes)}. Each is mounted writable for this step alone; every other step of the run only reads it.`,
        ]
      : []),
    ...(reads.length
      ? [
          `Folders of this factory you may read, and must not write: ${pathsOf(reads)}. Each is mounted read-only; your own work stays in your workspace.`,
        ]
      : []),
    ...(handed.length ? [handedLine(handed, folders.named)] : []),
    ...(store.length
      ? [
          `Folders of the store you may read, and must not write, as this step's \`reads:\` names them: ${pathsOf(store)}. Each is mounted read-only; read it with Read, Grep and Glob.`,
        ]
      : []),
  ];
};

/**
 * What `nemia decide` says under a run's line of where the run came from: the inbox card it was started from. Undefined for a run typed at
 * `nemia start`.
 */
export const fromNote = (run: Pick<Run, 'from'>): string | undefined => (run.from ? `from inbox card ${run.from.inbox}` : undefined);

/**
 * What `nemia decide` says under a run's line when `nemia start --input` gave it files: each by name, and where they are. Undefined for a
 * run given none.
 */
export const inputsNote = (dir: string, names: readonly string[] | undefined): string | undefined =>
  names?.length ? `inputs  ${names.join(', ')}  —  in ${dir}` : undefined;
