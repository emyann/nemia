/**
 * The runners of the commands that start work from where they are typed — `nemia inbox add` and `nemia inbox queue` — and `nemia inbox
 * from`: each reads the files and folders its command line names, hands its entry's handler what it found, and prints
 * what the entry says of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { INBOX_ADD, INBOX_QUEUE, type Place, workflowAt, type Args, type Env } from '../runner.ts';
import { forwardedAnswer, forwardedCall, forwardedOf, type Linked } from '../command/forward.verb.ts';
import { INBOX_FROM } from '../inbox/commands.verb.ts';
import { printed, answered, usage, type Engine } from './flags.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

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
  for (const line of printed(INBOX_ADD, data, asked)) console.log(line);
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
  for (const line of printed(INBOX_QUEUE, data, asked)) console.log(line);
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
  for (const line of printed(INBOX_FROM, data, asked)) console.log(line);
}
