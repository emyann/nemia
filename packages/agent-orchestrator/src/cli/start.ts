/**
 * The runners of the commands that start work from where they are typed — `nemia start`, of a brief or a folder of cards, `nemia inbox add`
 * and `nemia inbox queue`: each reads the files and folders its command line names, hands its entry's handler what it found, and prints
 * what the entry says of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  cardToStart,
  folderRefusal,
  inboxDir,
  inboxNameAt,
  INBOX_ADD,
  INBOX_QUEUE,
  planLines,
  planStopped,
  repoFor,
  START,
  startFactory,
  startPlan,
  runWith,
  type Place,
  workflowAt,
  workflowFolder,
  type Args,
} from '../runner.ts';
import { usage, placedIn, type Engine } from './flags.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Where a start of a workflow typed here is made (`startFactory`): the factory `--factory` names, else the one whose repository holds
 * `--repo`, else the directory it is typed in; and its repository — the one that holds the folder, when the factory was found from it,
 * else `--repo`, else the factory's one repository, else here (`repoFor`); and its tree, where it is made from a template. Refused as
 * `startFactory` and `repoFor` refuse.
 */
function placeOfStart(args: Args): { factory?: string; repo: string; tree?: string } {
  const given = textOf(args, 'repo');
  const named = given === undefined ? undefined : path.resolve(given);
  const found = startFactory(textOf(args, 'factory'), named ?? path.resolve('.'), '--factory <name>');
  const factory = found.factory?.name;
  const tree = found.factory?.tree;
  return {
    ...(factory !== undefined ? { factory } : {}),
    repo: found.repo ?? repoFor(factory, named, path.resolve('.')),
    ...(tree !== undefined ? { tree } : {}),
  };
}

/** `nemia start` of the inbox's card `card`: its body, or `--brief` in its place — a file's text, or the words. */
function cardArgs(card: string, args: Args): Args {
  const instead = textOf(args, 'instead');
  const repo = textOf(args, 'repo');
  return {
    ...args,
    card,
    instead:
      instead !== undefined && fs.statSync(instead, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(instead, 'utf8') : instead,
    repo: repo === undefined ? undefined : path.resolve(repo),
    at: path.resolve('.'),
    fix: '--factory <name>',
  };
}

/**
 * A brief's arguments: a file that opens with a frontmatter block of keys is a plan's card, or refused by the key a plan's card lacks
 * (`cardToStart`); any other file is the whole brief; and a card's own `workflow:` is found from its plan folder.
 */
function briefArgs(arg: string, args: Args): Args {
  if (args.instead !== undefined)
    usage(
      `nemia start takes --brief only for a card of the inbox, in place of its body: nemia start ${path.join(inboxDir(), '<name>.md')} --brief "<brief>". Anywhere else the brief is its first argument: nemia start "<brief>".`,
    );
  const after = Array.isArray(args.after) ? args.after : [];
  const text = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : undefined;
  const card = text === undefined ? null : cardToStart(arg, text, after);
  const workflows = textOf(args, 'workflows');
  const { factory, repo, tree } = placeOfStart(args);
  return {
    ...args,
    brief: card ? card.body : (text?.trim() ?? arg),
    repo,
    repoNamed: args.repo !== undefined,
    workflows:
      workflows === undefined && card?.workflow !== undefined
        ? workflowFolder(card.workflow, path.dirname(path.resolve(arg)), repo, tree)
        : workflowFolder(workflows ?? './workflows', process.cwd(), repo, tree),
    factory,
  };
}

/**
 * Whether `arg` reads as a path rather than words: one word that opens with `.`, `/` or `~`, or ends with `/` (Windows' `\\` the same). A
 * word with a slash only inside it is words: a link, or a branch such as `fix/login`.
 */
const pathLike = (arg: string): boolean => !/\s/.test(arg) && (/^[./~\\]/.test(arg) || /[\\/]$/.test(arg));

/**
 * `nemia start`: a run of a brief, a plan's card or an inbox card (`START`), and what it prints of it; or, for a folder, a run per card of
 * the plan it holds (`folderRun`). A brief is words or a file, never a folder, so a folder is always a plan; and a brief that reads as a
 * path (`pathLike`) and names nothing here, nor a card of the inbox, is refused rather than started as words: it is a file or a plan folder
 * mistyped, or not made yet, as the former spelling of a plan's start only ever meant a folder.
 */
export async function startRun(args: Args, e: Engine, place: Place): Promise<void> {
  const arg = textOf(args, 'brief') ?? '';
  const at = fs.statSync(arg, { throwIfNoEntry: false });
  if (at?.isDirectory()) return folderRun(arg, args, e, place);
  const card = inboxNameAt(arg);
  if (at === undefined && card === null && pathLike(arg))
    usage(
      `nemia start was given ${arg}, which reads as a path, and there is no file nor plan folder at ${path.resolve(arg)}. Make the folder of cards and start it: nemia start <folder> --repo <r>; or give the file's path as it is, or the brief in words: nemia start "<brief>".`,
    );
  const asked = card !== null ? cardArgs(card, args) : briefArgs(arg, args);
  const data = await runWith(e, placedIn(place, START.handler(asked)));
  for (const line of START.print(data, asked)) console.log(line);
}

/**
 * `nemia start <folder>`: a run per card of a plan folder, a line each, in the factory and on the repository a `nemia start` typed here
 * would be (`placeOfStart`); refused for a flag the folder says instead (`folderRefusal`); a card that did not start stops the rest, and
 * fails with what it was told.
 */
async function folderRun(folder: string, args: Args, e: Engine, place: Place): Promise<void> {
  const refused = folderRefusal(args);
  if (refused !== undefined) usage(refused);
  const { factory, repo } = placeOfStart(args);
  const plan = { dir: path.resolve(folder), repo: path.resolve(repo) };
  const { started, stopped, folderOf } = await runWith(
    e,
    placedIn(place, startPlan({ ...plan, ...(factory !== undefined ? { factory } : {}) })),
  );
  for (const line of planLines(started)) console.log(line);
  if (stopped) {
    const told = planStopped({ card: stopped.card, why: stopped.error.message, rest: stopped.rest }, started, { ...plan, folderOf });
    throw Object.assign(new Error(told), { exitCode: stopped.error.exitCode ?? 1 });
  }
  console.log(`run 'nemia tick' (or 'nemia up') to start them`);
}

/**
 * `nemia inbox add`: an idea, the words or a file's text, filed as a card (`INBOX_ADD`), with a `--workflow` path read from where it is
 * typed (`workflowAt`); a directory is refused.
 */
export async function inboxAddRun(args: Args, e: Engine, place: Place): Promise<void> {
  const idea = textOf(args, 'idea') ?? '';
  const at = fs.statSync(idea, { throwIfNoEntry: false });
  if (at?.isDirectory())
    usage(
      `${idea} is a directory, and nemia inbox add takes the idea as text or as one file: nemia inbox add "<idea>", or nemia inbox add ./idea.md.`,
    );
  const workflow = textOf(args, 'workflow');
  const repo = textOf(args, 'repo');
  const asked: Args = {
    ...args,
    idea: at ? fs.readFileSync(idea, 'utf8') : idea,
    ...(at ? { from: idea, dir: path.dirname(path.resolve(idea)) } : { dir: process.cwd() }),
    workflow: workflow === undefined ? undefined : workflowAt(workflow, process.cwd()),
    repo: repo === undefined ? undefined : path.resolve(repo),
  };
  const data = await runWith(e, placedIn(place, INBOX_ADD.handler(asked)));
  for (const line of INBOX_ADD.print(data, asked)) console.log(line);
}

/**
 * `nemia inbox queue`: a card queued or taken back (`INBOX_QUEUE`), with a `--workflow` path read from where it is typed (`workflowAt`).
 */
export async function inboxQueueRun(args: Args, e: Engine, place: Place): Promise<void> {
  const workflow = textOf(args, 'workflow');
  const asked: Args = { ...args, workflow: workflow === undefined ? undefined : workflowAt(workflow, process.cwd()) };
  const data = await runWith(e, placedIn(place, INBOX_QUEUE.handler(asked)));
  for (const line of INBOX_QUEUE.print(data, asked)) console.log(line);
}
