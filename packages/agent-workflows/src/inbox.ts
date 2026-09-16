/**
 * An inbox is cards before they are started: `$WF_ROOT/inbox/`, beside `runs/`, one card per file — an idea parked where the work is
 * looked at, until a person starts it.
 *
 *     ---
 *     workflow: dev
 *     repo: /home/me/code/app
 *     ---
 *     Cache the engine's views between passes.
 *
 * A card in a plan's format (plan.ts), with two differences. `workflow:` is optional: an idea often does not know what will run it, and that
 * is chosen at start. `repo:` is a key of its own, optional too: the absolute path of the repository the idea is about, for a board that will
 * serve more than one. And an inbox card has no `after:`: what it waits on is said at start, when the runs it could wait on are known.
 *
 * **The keys are a closed list**, as a plan card's are: a key nothing reads is a constraint nobody enforces.
 *
 * Pure: handed a card's text, and whether a path is a directory, never reading one (runner.ts reads the folder).
 */
import path from 'node:path';
import { bodyOf, frontmatterKeys } from './plan.ts';
import { splitFrontmatter, WorkflowError } from './workflow.ts';

export type InboxCard = {
  /** Its file's name in the inbox, minus `.md`: what `wf inbox rm` and a start name it by. */
  name: string;
  /** Its file's name, as a refusal names it. */
  file: string;
  /** The workflow to start it on, as written — a name under the repository's `workflows/`, or a path to a workflow folder — when it says. */
  workflow?: string;
  /** The absolute path of the repository the idea is about, when it says. */
  repo?: string;
  /** Everything below the frontmatter: the idea, and its run's brief unless a brief given at start replaces it. */
  body: string;
};

/** Every key an inbox card may set, each optional. Anything else is refused by name — `after:` with where it is said instead. */
export const INBOX_KEYS = ['workflow', 'repo'] as const;

function refuse(why: string): never {
  throw new WorkflowError(why);
}

/**
 * One inbox card, from its file's text — or refused, naming the file and the fix: a key an inbox card does not have (`after:` among them),
 * a key set twice or to nothing, a `repo:` that is not an absolute path or names no directory (`isDirectory`), an empty body, and a
 * frontmatter that never closes.
 */
export function parseInboxCard(file: string, text: string, isDirectory: (at: string) => boolean): InboxCard {
  const { block, body } = splitFrontmatter(file, text);
  const keys = block === null ? {} : frontmatterKeys(file, block, INBOX_KEYS, (key) => (key === 'after'
    ? `${file}: \`after\` is not a key an inbox card has: what a card waits on is said when it is started, once the runs it could wait on are known — wf start <inbox>/${file} --after <runId>. Delete the line.`
    : `${file}: \`${key}\` is not a key an inbox card has. An inbox card's keys are: ${INBOX_KEYS.join(', ')}, each optional — what runs it, and the repository it is about; how its steps run is its workflow's to say. Correct the spelling or delete the line — a key nothing reads is a constraint nobody enforces.`));
  const { repo, workflow } = keys;
  if (repo !== undefined && !path.isAbsolute(repo)) {
    refuse(`${file}: \`repo: ${repo}\` is not an absolute path. \`repo:\` is the repository the idea is about, from the root — \`repo: /home/me/code/app\` — since a relative one would name a different repository from wherever the card is started.`);
  }
  if (repo !== undefined && !isDirectory(repo)) {
    refuse(`${file}: \`repo: ${repo}\` names no directory. Correct it to the repository the idea is about, or delete the line, and the card is started on the repository its start names.`);
  }
  return {
    name: file.slice(0, -'.md'.length),
    file,
    ...(workflow !== undefined ? { workflow } : {}),
    ...(repo !== undefined ? { repo } : {}),
    body: bodyOf(file, body),
  };
}
