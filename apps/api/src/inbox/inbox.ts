/**
 * What a card filed through the Card's verb files (`filingOf`, objects/cards.ts). A card listed, an entry that does not read among them
 * with its `status.error` saying why, is the package's Card (`cardList`), never read again here.
 *
 * The package's inbox: `$WF_ROOT/inbox/`, a card per `<name>.md`, read from disk on each request, as the workflows are, so a card a person
 * has just filed or dropped at the command line reads as it is now. Every verb of a card — listed, read alone with its file as written,
 * written whole (its `from:` among its keys), filed, dropped, started, queued and taken off the queue, and its labels edited — is the
 * Card's, served from `objects`' `Api` (src/objects/cards.ts). No route of the inbox's own is left: `GET /api/inbox/:name` and `PUT` and
 * `DELETE /api/inbox/:name/from` answer 404, as the others before them.
 */
import path from 'node:path';
import { Invalid, readFactory, type Factory } from 'agent-orchestrator';
import type { CardFile } from 'objects';
import type { Refusal } from '../guard.ts';
import { folderOf, type WorkflowSource } from '../workflows/workflows.ts';

/** What a card filed hands the package: the idea, and the keys the card writes. */
export type Filing = { text: string; workflow?: string; repo?: string; factory?: string; label?: string[] };

/** Why `factory` does not take a card about `repo`, not one of its repositories: an `Invalid`, naming them. */
const outsideFactory = (factory: Factory, repo: string): Invalid =>
  new Invalid({
    message: `${repo}: the factory ${factory.name} works on ${factory.repos.map((r) => path.resolve(r)).join(', ')}, and this repository is not one of them. Send one of them as \`repo\`, or leave it out. Nothing was filed.`,
  });

/**
 * The folder of the workflow `name` in `factory`, looked for on each of `repos` in turn as a start there would (`folderOf`, the factory's
 * tree first): the one folder found, whichever of them has it; else what the first refused it with (404, 409); and for two folders on two
 * repositories a 409 that asks for `repo`.
 */
function folderAmong(
  name: string,
  from: WorkflowSource | undefined,
  repos: readonly string[],
  home: string,
  factory: Factory,
): { dir: string } | Refusal {
  const looked = repos.map((repo) => folderOf(name, from, repo, home, factory.tree));
  const dirs = [...new Set(looked.flatMap((found) => ('dir' in found ? [found.dir] : [])))];
  const [only] = dirs;
  if (dirs.length === 1 && only !== undefined) return { dir: only };
  if (dirs.length > 1) {
    return {
      status: 409,
      error: `The factory ${factory.name} works on ${repos.join(', ')}, and more than one has a workflow named '${name}' (${dirs.join(' and ')}). Say which with \`"repo": "<one of them>"\`.`,
    };
  }
  return (
    looked.find((found): found is Refusal => 'status' in found) ?? {
      status: 404,
      error: `No workflow '${name}': the factory ${factory.name} names no repository to look for one on. Leave \`workflow\` out, or file the card in a factory that works on one.`,
    }
  );
}

/**
 * What a filing in `factory` files, or why not. The repository the card is about is the one sent, which must be one of the factory's
 * (`outsideFactory`, thrown), else the factory's only one, else none; `repo:` is written only when one was sent, never a repository nobody
 * chose. Its workflow is looked for where a start in the factory would look (`folderOf` on that repository, `folderAmong` when it has
 * several and none was sent), and written by name only where a start finds that same folder by its name: under the factory's tree, or
 * under the repository the card is about. Else by its folder, absolute.
 */
function filingIn(factory: Factory, body: CardFile, home: string): Filing | Refusal {
  const repos = factory.repos.map((r) => path.resolve(r));
  const sent = body.repo === undefined ? undefined : path.resolve(body.repo);
  if (body.repo !== undefined && sent !== undefined && !repos.includes(sent)) throw outsideFactory(factory, body.repo);
  const filing: Filing = {
    text: body.body,
    factory: factory.name,
    ...(sent !== undefined ? { repo: sent } : {}),
    ...(body.label !== undefined ? { label: [...body.label] } : {}),
  };
  if (body.workflow === undefined) return filing;
  const about = sent ?? (repos.length === 1 ? repos[0] : undefined);
  const folder = folderAmong(body.workflow, body.from, about === undefined ? repos : [about], home, factory);
  if ('status' in folder) return folder;
  const byName = [factory.tree, about].some((at) => at !== undefined && path.dirname(folder.dir) === path.join(at, 'workflows'));
  return { ...filing, workflow: byName ? body.workflow : folder.dir };
}

/**
 * What a card filed (`POST /api/namespaces/:namespace/cards`) files, or why not, before the package is asked: `from` with no workflow
 * (400), and the workflow, found among the folders a start finds one in (`folderOf`: 404, 409) — so a card names a workflow a start from
 * the board can run, never a path that was sent.
 *
 * A repository's workflow is written by name, as `nemia inbox add --workflow dev` writes it, when the card starts on the api's repository:
 * a name is found under the repository's `workflows/` at start. Yours, or any workflow on a card about another repository, is written as
 * the folder found, absolute, since its name would be looked for where it is not. Whether the idea, the workflow and the repo make a card
 * is the package's to say (`addToInbox`).
 *
 * An absolute `repo` is written as `nemia inbox add --repo` writes it (`path.resolve`): no trailing slash, no `.` or `..`, so the run a
 * start records names the repository as every other run on it does, and the board finds them together. A relative one is sent on as it is,
 * for the package to refuse: the api has no directory it was typed from.
 *
 * A filing that names a `factory` is the factory's to place (`filingIn`), and the api's repository is not looked at.
 */
export function filingOf(body: CardFile, repo: string, home: string): Filing | Refusal {
  const { body: text, workflow, from, repo: about } = body;
  if (from !== undefined && workflow === undefined) {
    return {
      status: 400,
      error: "`from` says where the card's workflow is read from, and this request names no `workflow`. Name one, or leave both out.",
    };
  }
  if (body.factory !== undefined) return filingIn(readFactory(body.factory, 'Nothing was filed.'), body, home);
  const filing: Filing = {
    text,
    ...(body.label !== undefined ? { label: [...body.label] } : {}),
    ...(about !== undefined ? { repo: path.isAbsolute(about) ? path.resolve(about) : about } : {}),
  };
  if (workflow === undefined) return filing;
  const folder = folderOf(workflow, from, repo, home);
  if ('status' in folder) return folder;
  const byName = path.dirname(folder.dir) === path.join(repo, 'workflows') && (filing.repo === undefined || filing.repo === repo);
  return { ...filing, workflow: byName ? workflow : folder.dir };
}
