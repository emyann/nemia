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
import { Invalid } from 'agent-orchestrator';
import type { CardFile } from 'objects';

/** What a card filed hands the package: the idea, and the keys the card writes. */
export type Filing = { text: string; workflow?: string; factory?: string; label?: string[] };

/**
 * What a card filed (`POST /api/namespaces/:namespace/cards`) files: its body, its workflow by name, its factory and its labels. A card
 * names its factory and its workflow, and nothing about repositories: the factory places its run (`nemia factory attach <factory>
 * <workflow> --repo <name>`), so no repository is read here and an api with none of its own files a card all the same.
 *
 * Refused, `Invalid`: a `repo`, retired, naming the attach. `from` is retired, read and ignored. Whether the workflow is a name the
 * factory offers, and whether the idea makes a card, is the package's to say (`addToInbox`).
 */
export function filingOf(body: CardFile): Filing {
  if (body.repo !== undefined)
    throw new Invalid({
      message: `\`repo\` is retired: a card names its factory and its workflow, and the factory places its run. Leave \`repo\` out, and name the workflow's repository with nemia factory attach <factory> <workflow> --repo <name>. Nothing was filed.`,
    });
  return {
    text: body.body,
    ...(body.workflow !== undefined ? { workflow: body.workflow } : {}),
    ...(body.factory !== undefined ? { factory: body.factory } : {}),
    ...(body.label !== undefined ? { label: [...body.label] } : {}),
  };
}
