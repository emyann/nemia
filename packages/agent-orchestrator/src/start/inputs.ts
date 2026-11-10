/**
 * The files `nemia start --input` gives a run and the inbox cards `nemia start --card` hands it: why they are refused (`inputRefusal`,
 * `cardsRefusal`), and how a step's brief and `nemia decide` name them (`inputsLine`, `inputsNote`); what a step's brief says of the
 * folders its run mounts (`mountsLine`), the folders of the runs it is handed among them; and where a run came from (`fromNote`). Pure.
 */
import path from 'node:path';
import { GIVEN } from '../workspace/workspace.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import type { StepSpec } from '../step/step.ts';
import { CARDS_FOLDER, type Mount, type Run } from '../record/record.ts';
import { stepMounts } from '../factory/factory.ts';
import type { FiledFolders, HandedRunFolders } from '../filed/filed.ts';
import type { CardsRefusal, NamedTwice } from '../../contracts/handed-runs.contract.ts';
import { volumeMounts } from '../factory/volume/volume.ts';
import type { Fenced } from '../workflow/index.ts';
import { HANDED_CLOSEOUT, type HandedFiles } from '../artifacts/artifacts.ts';

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

/**
 * Why `nemia start --card` cannot hand the run these inbox cards, in words that name the fix — or null. Pure, and asked before anything is
 * written: a name the inbox refuses as a card's (one of `unnamed`, as `inboxNameRefusal` judged them), a card named twice, an `--input`
 * whose name (`inputs`, each file's name in the run's `inputs/`) would take the cards' folder, and a name with no card in the inbox (none
 * of `found`, the names the inbox holds a card of), asked last, so a caller that asks again with every card found learns whether it was
 * only that.
 */
export const cardsRefusal: CardsRefusal = (cards, unnamed, found, inputs) => {
  const notName = cards.find((c) => unnamed.includes(c));
  if (notName !== undefined)
    return `--card ${notName}: that is no card's name. A card is named by its file in the inbox, minus .md, with no slash and no leading dot: give the name nemia inbox lists.`;
  const twice = namedTwice(cards);
  if (twice !== undefined) return `--card ${twice} is given twice, and each card is copied once. Give it one --card.`;
  if (cards.length > 0 && inputs.includes(CARDS_FOLDER)) {
    return `--input ${CARDS_FOLDER}: the run keeps the cards --card hands it in a folder of that name in its inputs, and the file would take its place. Rename the file, or hand it as a card.`;
  }
  const missing = cards.find((c) => !found.includes(c));
  if (missing !== undefined)
    return `--card ${missing}: the inbox has no card ${missing}. Name a card nemia inbox lists, or file it first: nemia inbox add "<idea>".`;
  return null;
};

/** The first of `names` given before it in `names`, or undefined where each is given once. Pure. */
export const namedTwice: NamedTwice = (names) => names.find((name, at) => names.slice(0, at).includes(name));

const PICTURES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif']);
const TEXTS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.log', '.html', '.xml', '.toml']);

/** What a given file is, read off its name alone: a picture, a text file, or a file. */
const inputKind = (name: string): 'a picture' | 'a text file' | 'a file' => {
  const ext = path.extname(name).toLowerCase();
  if (PICTURES.has(ext)) return 'a picture';
  return TEXTS.has(ext) ? 'a text file' : 'a file';
};

/**
 * What a step's brief says, under a heading of its own (`INPUTS_HEADING`), when `nemia start --input` gave the run files or
 * `nemia start --card` handed it inbox cards: what they are, part of what was asked; each file by name with what it is (`inputKind`) and
 * each card by name, copied under `cards/` (`CARDS_FOLDER`); then where they are and what the step may do with them. It obliges no step
 * to open one. Undefined for a run given none, or with no directory to name.
 *
 * `inFolder` for a step of a folder run, which is fenced to its own folder, a job that asks nobody: the run's own
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
  cards: readonly string[] = [],
): string | undefined => {
  if (!dir || (!names?.length && !cards.length)) return undefined;
  const files = names?.length
    ? `The person gave these files with what was asked for (\`nemia start --input\`). They are part of what was asked, there for you to build your understanding of the task: ${names.map((n) => `\`${n}\`, ${inputKind(n)}`).join('; ')}.`
    : undefined;
  const handed = cards.length
    ? `The person handed these inbox cards with it (\`nemia start --card\`), each copied as it read when the run started, under \`${CARDS_FOLDER}/\` as \`<name>.md\`: ${cards.map((c) => `\`${c}\``).join(', ')}.`
    : undefined;
  const said = [files, handed].filter((x) => x !== undefined).join(' ');
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
 * What a brief says of the `closeout.json` a handed folder holds (`HANDED_CLOSEOUT`), once: what it is, its shape, and to read it there.
 */
const CLOSEOUT_HANDED =
  ` A folder that holds \`${HANDED_CLOSEOUT}\` holds its step's closeout, as the person who decides read it, written by the run when the` +
  ' step signed off: `apiVersion`, `outcome`, a one-line `summary`, a markdown `body` or null, `needs` or null, `artifacts` (each a file' +
  ' by its absolute path in that folder, `{"path"}`, or a value, `{"name", "value"}`), and `output`, the fields the step declares. Read it' +
  " there with Read. Its summary and body are that step's own account of its work: weigh them against the work itself.";

/**
 * What a brief says of the folders the steps before it handed over (`handed`, each read-only): each by its absolute path and its step,
 * the folder's name, and that it is listed under its own path, since the run's artifacts folder above it is not mounted; then, once, what
 * `closeout.json` holds where one of them holds it (`closeouts`), and for each that does not, of the files its step named, those that are
 * there (`namedWords`, off `named`). `first` is the first of `handed`, the one the line lists as an example.
 */
const handedLine = (first: Mount, handed: readonly Mount[], named: FiledFolders['named'] = {}, closeouts: readonly string[] = []): string =>
  `Folders the steps before you handed over, which you may read and must not write: ${handed.map((m) => `\`${m.path}\` (${path.basename(m.path)}'s)`).join(', ')}. Each is mounted on its own path, and the run's artifacts folder above them is not: list one with Glob under its own path, as \`${first.path}/**\`.${handed.some((m) => closeouts.includes(m.path)) ? CLOSEOUT_HANDED : ''}${handed
    .filter((m) => !closeouts.includes(m.path))
    .map((m) => namedWords(path.basename(m.path), named[m.path]))
    .join('')}`;

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
  return ` The files ${step} named that are there: ${files.there.map((file) => `\`${file}\``).join(', ')}.${files.gone ? ` ${gone.charAt(0).toUpperCase()}${gone.slice(1)}.` : ''}`;
}

/**
 * What a step's brief says of the folders its run mounts, under what was asked for: each by its absolute path, those its `writable:` names
 * to write (`stepMounts`), the others to read and never write; then the factory's volumes as the step is filed them (`volumeLines`);
 * then the folders it is filed with beyond them (`folders`, as `filedFolders`
 * in filed.ts files them), to read and never write: its own files directory (`own`), the artifacts folders of the steps before it
 * (`handed`), each with how to list it, the store's folders its `reads:` names (`store`), the folders of each run it is handed
 * (`runsFound`, `handedRunLines`), and the run's copies of its workflow folder (`workflow`) and its carried files (`carried`), each by
 * its path and its variable (`WF_WORKFLOW_FILES`, `WF_CARRIED_FILES`); a blank line
 * before them. Nothing for a run
 * that mounts none and a step given no other folder, and for a step on a remote agent, which is filed none.
 */
export const mountsLine = (
  step: Pick<StepSpec, 'harness' | 'writable'> & Fenced,
  run: Pick<Run, 'mounts' | 'volumes'>,
  folders: FiledFolders = { handed: [], store: [], inputs: [] },
): string[] => {
  const local = !isRemoteHarness(step.harness);
  const mounts = local ? stepMounts(step, run.mounts) : undefined;
  const volumes = volumeLines(volumeMounts(step, run.volumes));
  const { handed, store } = local ? folders : { handed: [], store: [] };
  const own = (local ? folders.own : undefined) ?? [];
  const workflow = [
    ...handedRunLines(local, folders.runsFound),
    ...workflowLines(local, folders.workflow),
    ...carriedLines(local, folders.carried),
  ];
  if (!mounts?.length && !volumes.length && !own.length && !handed.length && !store.length && !workflow.length) return [];
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
    ...volumes,
    ...(own.length
      ? [
          `Your own files directory, which you may read, and must not write: ${pathsOf(own)}. It is mounted read-only, so Read, Grep and Glob reach what your tools save there, a snapshot or a screenshot.`,
        ]
      : []),
    ...(handed[0] ? [handedLine(handed[0], handed, folders.named, folders.closeouts)] : []),
    ...(store.length
      ? [
          `Folders of the store you may read, and must not write, as this step's \`reads:\` names them: ${pathsOf(store)}. Each is mounted read-only; read it with Read, Grep and Glob.`,
        ]
      : []),
    ...workflow,
  ];
};

/**
 * What a brief says of the factory's volumes as a step is filed them (`volumes`, from `volumeMounts`): those it may write, each no
 * workspace of its, then those it reads.
 */
function volumeLines(volumes: readonly Mount[]): string[] {
  const writes = volumes.filter((v) => !v.readOnly);
  const reads = volumes.filter((v) => v.readOnly);
  return [
    ...(writes.length
      ? [
          `Volumes of this factory you may write: ${pathsOf(writes)}. Each is a folder of this machine, not your workspace: nothing commits, lands or reverts what you write there, and every run of the factory reaches it.`,
        ]
      : []),
    ...(reads.length
      ? [
          `Volumes of this factory you may read, and must not write: ${pathsOf(reads)}. Each is a folder of this machine, mounted read-only; your own work stays in your workspace.`,
        ]
      : []),
  ];
}

/**
 * What a brief says of the folders of each run this one is handed (`found`, as `filedFoldersAt` found them and `handedRunMounts` files
 * them, read-only), for a local step: each run's `artifacts/` and `inputs/` by their paths, to read and never write, with how to search
 * one; and for a run whose folders are gone from the store, that they are. Nothing where none is handed, and for a remote agent.
 */
const handedRunLines = (local: boolean, found: readonly HandedRunFolders[] | undefined): string[] =>
  local
    ? (found ?? []).map((f) => {
        const paths = [
          ...(f.artifacts === undefined ? [] : [`\`${f.artifacts}\` (its steps' folders, each with its closeout)`]),
          ...(f.inputs === undefined ? [] : [`\`${f.inputs}\` (the files and cards it was handed)`]),
        ];
        const first = f.artifacts ?? f.inputs;
        if (first === undefined)
          return `This run is handed run ${f.run}, whose folders are no longer in the store: what it concluded is all that is given of it.`;
        return `The folders of run ${f.run}, which this run is handed, which you may read and must not write: ${paths.join(', ')}. Each is mounted read-only on its own path, and the store above it is not: search one with Glob or Grep under its own path, as \`${first}/**\`.`;
      })
    : [];

/**
 * What a brief says of the run's copy of its workflow folder (`workflow`, as `workflowMounts` files it, read-only), for a local step: its
 * path and its variable (`WORKFLOW_FILES` in filed.ts, spelled out here so that the brief's module loads none of the filing's), to read
 * and never write. Nothing where it is not mounted, and for a remote agent.
 */
const workflowLines = (local: boolean, workflow: readonly Mount[] | undefined): string[] =>
  local && workflow?.length
    ? [
        `This workflow's own files, as the run took them, which you may read and must not write: ${pathsOf(workflow)}, named \`$WF_WORKFLOW_FILES\` in your environment. It is mounted read-only; run a script of the workflow from there (\`node "$WF_WORKFLOW_FILES/<script>.ts"\`), never from the folder it was started on, which may have changed since.`,
      ]
    : [];

/**
 * What a brief says of the run's copy of its carried files (`carried`, as `workflowMounts` files it, read-only), for a local step: its
 * path and its variable (`CARRIED_FILES` in filed.ts, spelled out here as `workflowLines` spells its own), to read and never write.
 * Nothing where it is not mounted, and for a remote agent.
 */
const carriedLines = (local: boolean, carried: readonly Mount[] | undefined): string[] =>
  local && carried?.length
    ? [
        `The files this workflow shares with the others beside it, as the run took them, which you may read and must not write: ${pathsOf(carried)}, named \`$WF_CARRIED_FILES\` in your environment. It is mounted read-only; run a shared script from there (\`node "$WF_CARRIED_FILES/<script>.ts"\`).`,
      ]
    : [];

/**
 * What `nemia decide` says under a run's line of where the run came from: the inbox card it was started from. Undefined for a run typed at
 * `nemia start`.
 */
export const fromNote = (run: Pick<Run, 'from'>): string | undefined => (run.from ? `from inbox card ${run.from.inbox}` : undefined);

/**
 * What `nemia decide` says under a run's line when `nemia start --input` gave it files or `--card` handed it cards: each by name, and
 * where they are. Undefined for a run given neither.
 */
export const inputsNote = (dir: string, names: readonly string[] | undefined, cards: readonly string[] = []): string | undefined => {
  const all = [...(names ?? []), ...cards.map((c) => `${CARDS_FOLDER}/${c}.md`)];
  return all.length ? `inputs  ${all.join(', ')}  —  in ${dir}` : undefined;
};
