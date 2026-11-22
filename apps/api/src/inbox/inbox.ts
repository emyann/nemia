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
import { readFactoryAtOnce } from 'agent-orchestrator';
import type { CardFile, CardFileRef } from 'objects';

/**
 * What a card filed hands the package: the idea, and the keys the card writes. `repo` is retired, and handed on only for the package to
 * refuse it in its own words (`addToInbox`), so the api says no second sentence of its own.
 */
export type Filing = {
  text: string;
  workflow?: string;
  repo?: string;
  factory?: string;
  label?: string[];
  after?: string[];
  files?: CardFileRef[];
};

/**
 * What a card filed (`POST /api/namespaces/:namespace/cards`) files: its body, its workflow by name, its factory, its labels, the cards it
 * waits on (`after`) and its files, each a File uploaded to the card's namespace first, by its id. A card
 * names its factory and its workflow, and nothing about repositories: the factory places its run (`nemia factory attach <factory>
 * <workflow> --repo <name>`), so no repository is read here and an api with none of its own files a card all the same.
 *
 * Refused: a `factory` the store `home` does not have, a 404 naming those it has, or a name that is no slug, a 422 (`readFactoryAtOnce`),
 * before the package is asked. The package refuses, `Invalid`, before anything is written (`addToInbox`): a `repo`, retired, naming the
 * attach; a workflow that is no name; and in a factory, a workflow it does not attach, naming the attach. `from` is retired, read and
 * ignored.
 * @param body The card's body, as the endpoint decodes it.
 * @param home The store's root folder, whose factories are read.
 */
export function filingOf(body: CardFile, home: string) {
  if (body.factory !== undefined) readFactoryAtOnce(home, body.factory, 'Nothing was filed.');
  return {
    text: body.body,
    ...(body.workflow !== undefined ? { workflow: body.workflow } : {}),
    ...(body.repo !== undefined ? { repo: body.repo } : {}),
    ...(body.factory !== undefined ? { factory: body.factory } : {}),
    ...(body.label !== undefined ? { label: [...body.label] } : {}),
    ...(body.after !== undefined ? { after: [...body.after] } : {}),
    ...(body.files !== undefined ? { files: [...body.files] } : {}),
  };
}
