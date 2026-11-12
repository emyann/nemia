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
  settingsOf,
  startFactoryAtOnce,
  startPlan,
  runWith,
  type Place,
  workflowAt,
  workflowFolder,
  type Args,
  type StartInput,
  wfRoot,
  type Env,
} from '../runner.ts';
import { forwardedAnswer, forwardedCall, forwardedOf, type Linked } from '../command/forward.verb.ts';
import { INBOX_FROM } from '../inbox/commands.verb.ts';
import { answered, usage, placedIn, type Engine } from './flags.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Where a start of a workflow typed here is made (`startFactoryAtOnce`): the factory `--factory` names, else the one whose repository holds
 * `--repo`, else the directory it is typed in; and its repository — the one that holds the folder, when the factory was found from it,
 * else `--repo`, else the factory's one repository, else here (`repoFor`); and its tree, where it is made from a template. Refused as
 * `startFactoryAtOnce` and `repoFor` refuse.
 */
function placeOfStart(env: Env, args: Args): { factory?: string; repo: string; tree?: string } {
  const given = textOf(args, 'repo');
  const named = given === undefined ? undefined : path.resolve(given);
  const found = startFactoryAtOnce(
    wfRoot(env),
    textOf(args, 'factory'),
    named ?? path.resolve('.'),
    '--factory <name>',
    settingsOf(env).defaultFactoryStarts,
  );
  const factory = found.factory?.name;
  const tree = found.factory?.tree;
  return {
    ...(factory !== undefined ? { factory } : {}),
    repo: found.repo ?? repoFor(wfRoot(env), factory, named, path.resolve('.')),
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
function briefArgs(env: Env, arg: string, args: Args): Args {
  if (args.instead !== undefined)
    usage(
      `nemia start takes --brief only for a card of the inbox, in place of its body: nemia start ${path.join(inboxDir(wfRoot(env)), '<name>.md')} --brief "<brief>". Anywhere else the brief is its first argument: nemia start "<brief>".`,
    );
  const after = Array.isArray(args.after) ? args.after : [];
  const text = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : undefined;
  const card = text === undefined ? null : cardToStart(arg, text, after);
  const workflows = textOf(args, 'workflows');
  const { factory, repo, tree } = placeOfStart(env, args);
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
export async function startRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  if (forwardedOf(env) !== undefined) return startThere(env, args, e, place);
  const arg = textOf(args, 'brief') ?? '';
  const at = fs.statSync(arg, { throwIfNoEntry: false });
  if (at?.isDirectory()) return folderRun(env, arg, args, e, place);
  const card = inboxNameAt(wfRoot(env), arg);
  if (at === undefined && card === null && pathLike(arg))
    usage(
      `nemia start was given ${arg}, which reads as a path, and there is no file nor plan folder at ${path.resolve(arg)}. Make the folder of cards and start it: nemia start <folder> --repo <r>; or give the file's path as it is, or the brief in words: nemia start "<brief>".`,
    );
  const asked = card !== null ? cardArgs(card, args) : briefArgs(env, arg, args);
  const data = await runWith(e, placedIn(env, place, START.handler(asked)));
  for (const line of START.print(data, asked)) console.log(line);
}

/** What a forwarded start says where it runs instead, for what it cannot send. */
const RUN_THERE = "or run it on this machine's store with NEMIA_CONTEXT=local";

/**
 * `nemia start` forwarded to another machine's api: a brief in words or a file's text, read here, started on the workflow `--workflows`
 * names there — by name, or a plan's card's own `workflow:` — on the repository `--repo` names there (`runs.create`); or a card of that
 * machine's inbox, named by one word that names no file here (`cards.start`). Refused (`Invalid`): a plan folder, whose cards are read
 * here, and a workflow given as a path or not given, which that machine resolves by name.
 */
async function startThere(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const arg = textOf(args, 'brief') ?? '';
  const at = fs.statSync(arg, { throwIfNoEntry: false });
  if (at?.isDirectory())
    usage(
      `nemia start ${arg} reads a plan folder on this machine, which is not sent to another machine's daemon: file each card there (nemia inbox add <card>) and start it by name, ${RUN_THERE}.`,
    );
  const asked = startedThereOf(arg, at?.isFile() === true, args) as StartInput;
  const data = await answered(env, e, place, START, asked);
  for (const line of START.print(data, asked)) console.log(line);
}

/**
 * What a forwarded `nemia start` of `arg` sends (`startThere`): the file's text as the brief where `arg` is a file here (`isFile`), a
 * plan's card's body and its `workflow:` among them; a card of that machine's inbox where `arg` is one word naming no file here, by its
 * name with or without its `.md`, its workflow and its factory that machine's card's own where `--workflows` names none; else the words.
 * Refused (`Invalid`) for a workflow given as a path, and for a brief whose workflow is not named.
 */
export function startedThereOf(arg: string, isFile: boolean, args: Args): Args {
  const after = Array.isArray(args.after) ? args.after : [];
  const text = isFile ? fs.readFileSync(arg, 'utf8') : undefined;
  const card = text === undefined ? null : cardToStart(arg, text, after);
  const named = text === undefined && !/\s/.test(arg) && !pathLike(arg) && arg !== '' ? cardNamed(arg) : undefined;
  const workflow = textOf(args, 'workflows') ?? card?.workflow;
  if (workflow !== undefined && /[\\/]/.test(workflow))
    usage(
      `nemia start forwarded to another machine's daemon starts a workflow of that machine, by its name: nemia start ${named ?? '"<brief>"'} --workflows <name>, ${RUN_THERE}.`,
    );
  if (named !== undefined) {
    const { workflows: _typed, ...rest } = args;
    return { ...rest, brief: undefined, card: named, ...(workflow === undefined ? {} : { workflows: workflow }) };
  }
  if (workflow === undefined)
    usage(
      `nemia start forwarded to another machine's daemon starts a brief on a workflow of that machine, named: nemia start "<brief>" --workflows <name>, ${RUN_THERE}.`,
    );
  return { ...args, brief: card ? card.body : (text?.trim() ?? arg), workflows: workflow };
}

/** A card's name as that machine's inbox names it: `given` without its `.md`, as `nemia inbox add` prints the file. */
const cardNamed = (given: string): string => (given.endsWith('.md') && given.length > '.md'.length ? given.slice(0, -'.md'.length) : given);

/**
 * `nemia start <folder>`: a run per card of a plan folder, a line each, in the factory and on the repository a `nemia start` typed here
 * would be (`placeOfStart`); refused for a flag the folder says instead (`folderRefusal`); a card that did not start stops the rest, and
 * fails with what it was told.
 */
async function folderRun(env: Env, folder: string, args: Args, e: Engine, place: Place): Promise<void> {
  const refused = folderRefusal(args);
  if (refused !== undefined) usage(refused);
  const { factory, repo } = placeOfStart(env, args);
  const plan = { dir: path.resolve(folder), repo: path.resolve(repo) };
  const { started, stopped, folderOf } = await runWith(
    e,
    placedIn(env, place, startPlan({ ...plan, ...(factory !== undefined ? { factory } : {}) })),
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
 * typed (`workflowAt`); a directory is refused. Forwarded to another machine's api, the file's text is what is sent, and `--workflow` and
 * `--repo` are that machine's, sent as typed.
 */
export async function inboxAddRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const idea = textOf(args, 'idea') ?? '';
  const at = fs.statSync(idea, { throwIfNoEntry: false });
  if (at?.isDirectory())
    usage(
      `${idea} is a directory, and nemia inbox add takes the idea as text or as one file: nemia inbox add "<idea>", or nemia inbox add ./idea.md.`,
    );
  const workflow = textOf(args, 'workflow');
  const repo = textOf(args, 'repo');
  const factory = textOf(args, 'factory');
  const there = forwardedOf(env) !== undefined;
  const asked = {
    idea: at ? fs.readFileSync(idea, 'utf8') : idea,
    ...(there ? {} : at ? { from: idea, dir: path.dirname(path.resolve(idea)) } : { dir: process.cwd() }),
    ...(workflow === undefined ? {} : { workflow: there ? workflow : workflowAt(workflow, process.cwd()) }),
    ...(repo === undefined ? {} : { repo: there ? repo : path.resolve(repo) }),
    ...(factory === undefined ? {} : { factory }),
    label: Array.isArray(args.label) ? args.label.map(String) : [],
  };
  const data = await answered(env, e, place, INBOX_ADD, asked);
  for (const line of INBOX_ADD.print(data, asked)) console.log(line);
}

/**
 * `nemia inbox queue`: a card queued or taken back (`INBOX_QUEUE`), with a `--workflow` path read from where it is typed (`workflowAt`).
 */
export async function inboxQueueRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const workflow = textOf(args, 'workflow');
  const asked = {
    name: textOf(args, 'name') ?? '',
    ...(workflow === undefined ? {} : { workflow: forwardedOf(env) !== undefined ? workflow : workflowAt(workflow, process.cwd()) }),
    ...(args.off === true ? { off: true } : {}),
  };
  const data = await answered(env, e, place, INBOX_QUEUE, asked);
  for (const line of INBOX_QUEUE.print(data, asked)) console.log(line);
}

/** The card's read across namespaces, which `nemia inbox from` forwarded makes before it writes the card whole. */
const CARD_READ: Linked = { name: 'inbox from', served: [{ endpoint: 'cards.getAll' }] };

/**
 * `nemia inbox from`: the runs a card is handed as context set, or taken off (`INBOX_FROM`). Forwarded to another machine's api, which
 * writes a card whole, the card is read there first and handed to the entry's link beside what was typed (`current`).
 */
export async function inboxFromRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const forwarded = forwardedOf(env);
  const current =
    forwarded === undefined ? undefined : await forwardedAnswer(forwardedCall(forwarded, CARD_READ, { name: textOf(args, 'name') ?? '' }));
  const asked = (current === undefined ? args : { ...args, current }) as Args;
  const data = await answered(env, e, place, INBOX_FROM, asked);
  for (const line of INBOX_FROM.print(data, asked)) console.log(line);
}
