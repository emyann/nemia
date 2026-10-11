/**
 * The runners of the library's writers that read what a person wrote: `nemia agents write` (an agent's file, and the result schema its
 * `output:` names beside it), `nemia skills write` (a SKILL.md) and `nemia workflows write` (a draft folder's steps and README). Each reads
 * its file or folder into the form the board sends, hands it to its entry's handler in the store, and prints what the entry says of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HOME, Invalid, loadWorkflows, placedIn, runWith, TABLE, type Place, templatedTree, type Args, type Command } from '../runner.ts';
import { agentDraftOf, frontmatterKey, isReadme, skillDraftOf } from '../workflow.ts';
import { usage, type Engine } from './flags.ts';

/** The table's entry named `name`. */
const entryOf = (name: string): Command => TABLE.find((c) => c.name === name) as Command;

/** The path a writer's `--<key>` names, or its refusal: the command takes it, as its usage says. */
function pathOf(args: Args, key: string, command: Command, what: string): string {
  const given = args[key];
  if (typeof given === 'string' && given) return given;
  return usage(`nemia ${command.name} takes --${key}, ${what}: nemia ${command.name} ${command.usage}`);
}

/** The text of `file`, or the refusal of `command` that cannot read it. */
function textOf(file: string, command: Command): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    return usage(`nemia ${command.name} cannot read ${path.resolve(file)}: ${(err as Error).message}. Name a file that is there.`);
  }
}

/** What `read` makes of `file`, or its refusal, as `Invalid`, in the reader's words, naming the file. */
function readOf<T>(file: string, read: () => T): T {
  try {
    return read();
  } catch (err) {
    throw new Invalid({ message: `${path.resolve(file)} does not read: ${(err as Error).message}` });
  }
}

/** `args` without the flags `command` takes at the command line alone: what the api's body could hand its handler. */
function handedOf(command: Command, args: Args): Args {
  const cliOnly = new Set(command.spec.flags.filter((flag) => flag.only?.side === 'cli').map((flag) => flag.key));
  return Object.fromEntries(Object.entries(args).filter(([key]) => !cliOnly.has(key)));
}

/** The entry `command` run in the store on the arguments `asked`, its paths left out (`handedOf`), and the lines it says printed. */
async function ran(command: Command, asked: Args, e: Engine, place: Place): Promise<void> {
  const data = await runWith(e, placedIn(place, command.handler(handedOf(command, asked), undefined, HOME)));
  for (const line of command.print(data, asked)) console.log(line);
}

/** The text of the file `named` beside the agent's file `file`, or none where nothing is there: how its result schema is read. */
function besideOf(file: string, named: string): string | undefined {
  const at = path.join(path.dirname(file), named);
  return fs.statSync(at, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(at, 'utf8') : undefined;
}

/**
 * The result schema an agent's file names (`output:`), read beside the file `file`: `{ file, text }` as JSON text, or none where it
 * names none or none is there.
 */
function schemaBeside(file: string, text: string): string | undefined {
  const named = frontmatterKey(text, 'output');
  const read = named ? besideOf(file, named) : undefined;
  return named && read !== undefined ? JSON.stringify({ file: named, text: read }) : undefined;
}

/**
 * `nemia agents write`'s runner: the agent's file `--file` names read into its draft (`agentDraftOf`), named by the file, with the result
 * schema its `output:` names read beside it (`schemaBeside`).
 */
export async function agentsWriteRun(args: Args, e: Engine, place: Place): Promise<void> {
  const command = entryOf('agents write');
  const file = pathOf(args, 'file', command, "the agent's file to write, named <name>.md");
  const text = textOf(file, command);
  const draft = readOf(file, () => agentDraftOf(path.basename(file, '.md'), text, (named) => besideOf(file, named)));
  const schema = schemaBeside(file, text);
  await ran(command, { ...args, draft: JSON.stringify(draft), ...(schema !== undefined && { schema }) }, e, place);
}

/**
 * `nemia skills write`'s runner: the SKILL.md `--file` names read into its form (`skillDraftOf`), the skill named by its `name:`, else by
 * its folder; refused where a skill named to change (`<name>`) is not the file's.
 */
export async function skillsWriteRun(args: Args, e: Engine, place: Place): Promise<void> {
  const command = entryOf('skills write');
  const file = pathOf(args, 'file', command, "the skill's SKILL.md to write");
  const text = textOf(file, command);
  const name = frontmatterKey(text, 'name') ?? path.basename(path.dirname(path.resolve(file)));
  if (typeof args.name === 'string' && args.name !== name)
    usage(`nemia skills write was asked to change ${args.name}, and ${path.resolve(file)} is the skill ${name}: name the skill it is.`);
  const change = readOf(file, () => skillDraftOf(file, name, text));
  await ran(command, { ...args, change: JSON.stringify(change) }, e, place);
}

/**
 * `nemia workflows write`'s runner: the draft folder `--folder` names read as a start reads a folder, its agents looked for beside it
 * and in yours (`loadWorkflows`), or in the tree written for the place `factory` (`templatedTree`), into the steps the builder sends, and
 * its README where it has one.
 */
export async function workflowsWriteRun(args: Args, e: Engine, place: Place): Promise<void> {
  const command = entryOf('workflows write');
  const folder = pathOf(args, 'folder', command, 'the draft folder whose steps and README to write');
  if (!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory())
    usage(`nemia workflows write reads the folder ${path.resolve(folder)}, and it is not one. Name the draft folder.`);
  const factory = args.from === 'factory' && typeof args.factory === 'string' ? args.factory : undefined;
  const home = factory === undefined ? HOME : templatedTree(factory, 'nemia workflows write');
  const steps = readOf(folder, () => loadWorkflows(folder, { home }));
  const readme = fs.readdirSync(folder).find(isReadme);
  const asked = {
    ...args,
    draft: JSON.stringify(steps),
    ...(readme !== undefined && { readme: textOf(path.join(folder, readme), command) }),
  };
  await ran(command, asked, e, place);
}
