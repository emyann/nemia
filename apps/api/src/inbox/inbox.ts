/**
 * What a card filed through the Card's verb files (`filingOf`, objects/cards.ts). A card listed, an entry that does not read among them
 * with its `status.error` saying why, is the package's Card (`cardList`), never read again here.
 *
 * The package's inbox: a record of the store's keyspace per card, read through the Card door on each request — a card file a person drops
 * into `$WF_ROOT/inbox/` taken up first — so a card a person has just filed or dropped at the command line reads as it is now. Every verb
 * of a card — listed, read alone with its file as written, written whole (its `from:` among its keys), filed, dropped, started, queued and
 * taken off the queue, and its labels edited — is the Card's, served from `objects`' `Api` (src/objects/cards.ts). No route of the inbox's
 * own is left: `GET /api/inbox/:name` and `PUT` and `DELETE /api/inbox/:name/from` answer 404, as the others before them.
 */
import { factoryOrNone } from 'agent-orchestrator';
import type { Served } from '../layer.ts';
import type { CardFile } from 'objects';

/**
 * What a card filed (`POST /api/namespaces/:namespace/cards`) files: its body, its workflow by name, its factory, its labels, the cards it
 * waits on (`after`) and its files, each a File uploaded to the card's namespace first, by its id. A card
 * names its factory and its workflow, and nothing about repositories: the factory places its run (`nemia factory attach <factory>
 * <workflow> --repo <name>`), so no repository is read here and an api with none of its own files a card all the same.
 *
 * Refused: a `factory` the store `home` does not have, a 404 naming those it has, or a name that is no slug, a 422 (`factoryOrNone`),
 * before the package is asked. The package refuses, `Invalid`, before anything is written (`addToInbox`): a `repo`, retired, naming the
 * attach; a workflow that is no name; and in a factory, a workflow it does not attach, naming the attach. `from` is retired, read and
 * ignored.
 * @param body The card's body, as the endpoint decodes it.
 * @param s The request's services, through which the factory it names is read.
 */
export async function filingOf(body: CardFile, s: Pick<Served, 'inRequest'>) {
  if (body.factory !== undefined) await s.inRequest(factoryOrNone(body.factory));
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
