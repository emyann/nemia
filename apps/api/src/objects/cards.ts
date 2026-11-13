/**
 * The cards group's handlers (`objects`' `Api`): the inbox's cards as objects, over the package's entries the inbox's routes and the card
 * start run — a page of them (`cardList`, or `cardTable` as a table), one (`cardObject`) in its namespace or found in any (`getAll`), each
 * with its file as written, written whole (`replaceCard`), written from its text (`nemia inbox edit`), filed (`nemia inbox add`),
 * dropped (`inbox rm`), started (`nemia start <card>`), queued and taken off (`inbox queue`), and its labels edited (`label inbox`).
 *
 * A card started under a factory's namespace is placed in that factory (`placedIn`), as `nemia start <card> --factory <namespace>` is: its
 * workflow, by its name, found in the factory's tree first, and the card's own `workflow:` where the start names none, on the repository
 * the factory's wiring names for it — never one the card or the request names (`cardStart`). One started under `default` is placed by the
 * request's own `?factory=`, as the board's start of a card that names no factory sends it. A card filed names no repository (`filingOf`).
 *
 * A card's namespace is its factory, `default` for one that names none: a card read, dropped, started, queued or labelled under a
 * namespace it is not in is `Missing`, as one no card has the name of; a card filed under `default` names no factory, under another the
 * namespace's. `?labelSelector=` and its retired spelling `?selector=` are read the same, each given again for another (OR); a `limit`,
 * a token or a selector the package refuses is its `Invalid`, a 422. A list asked as a `Table` (`wantsTable`) answers the package's
 * (`cardTable`): the columns `nemia inbox` prints, never words of the api's own. Each entry is called by its `input`, through `inRequest`.
 */
import { Effect } from 'effect';
import {
  cardList,
  cardObject,
  cardTable,
  INBOX_ADD,
  INBOX_EDIT,
  INBOX_QUEUE,
  INBOX_RM,
  LABEL_CARD,
  Missing,
  noCardLine,
  replaceCard,
  inboxNameRefusal,
  informerMemo,
  Invalid as Refused,
  type SummaryHow,
  verifiesRest,
} from 'agent-orchestrator';
import { Api, type CardList, DEFAULT_NAMESPACE, type Table } from 'objects';
import { filingOf } from '../inbox/inbox.ts';
import type { Served } from '../layer.ts';
import { cardStart } from '../runs/start.ts';
import { answered, locatedAt, orFailed } from './refused.ts';
import { wantsTable } from './table.ts';
import { readsBounded } from './answer-bound.ts';

/** How a read of the cards judges a started card's run: off the app's informer, verified as the env says. */
const howOf = (s: Served): SummaryHow => ({
  home: s.home,
  memo: s.informer ?? informerMemo(),
  verify: verifiesRest(s.env),
});

/** One selector, several, or none, as a list. */
const listOf = (given: string | readonly string[] | undefined): string[] =>
  given === undefined ? [] : typeof given === 'string' ? [given] : [...given];

type ListQuery = {
  readonly limit?: string;
  readonly continue?: string;
  readonly labelSelector?: string | readonly string[];
  readonly selector?: string | readonly string[];
  readonly fieldSelector?: string;
};

/** A page of the cards of `namespace` (every card for none) the query asks for: as a `Table` where the request asks for one. */
const page = (namespace: string | undefined, query: ListQuery) =>
  Effect.flatMap(wantsTable, (table) =>
    answered((s): Promise<CardList | Table> => {
      const asked = {
        namespace,
        limit: query.limit === undefined ? null : Number(query.limit),
        continue: query.continue,
        labelSelector: [...listOf(query.labelSelector), ...listOf(query.selector)],
        fieldSelector: query.fieldSelector,
      };
      return table ? s.inRequest(cardTable(s.e, howOf(s), asked)) : s.inRequest(cardList(s.e, howOf(s), asked));
    }),
  );

/**
 * The card `name` of `namespace` (any namespace, for none), read now with its file as written (`status.source`), after its name is one a
 * card can have: what every verb on one card reads first.
 */
const cardIn = async (s: Served, namespace: string | undefined, name: string) => {
  const wrong = inboxNameRefusal(name);
  if (wrong) throw new Refused({ message: wrong });
  return s.inRequest(cardObject(s.e, howOf(s), name, namespace));
};

/** The factory a namespace names: none for `default`. */
const factoryOf = (namespace: string): string | undefined => (namespace === DEFAULT_NAMESPACE ? undefined : namespace);

/**
 * The card `name` of `namespace` queued on the workflow sent by name (`workflow`, written over the card's own) or else the one it names,
 * or taken off the queue (`off`), and read again; a card queued says too how many are queued (`queueLength`) and, where its factory has
 * one repository, the one it starts on (`factoryRepo`). A workflow sent as a path, or as no text, is refused before the card is read: the
 * daemon finds a workflow by its name where a start of the card would.
 */
const queued = (namespace: string, name: string, off: boolean, workflow?: string) =>
  answered(async (s) => {
    if (workflow !== undefined && (workflow === '' || /[\\/]/.test(workflow)))
      throw new Refused({
        message: `\`workflow\` is a workflow's name, with no \`/\`: queue the card on one by name — nemia inbox queue ${name} --workflow <name> — or leave it out for the card's own. Nothing was queued.`,
      });
    await cardIn(s, namespace, name);
    const done = await s.inRequest(INBOX_QUEUE.handler({ name, off, ...(workflow === undefined ? {} : { workflow }) }));
    const card = await cardIn(s, namespace, name);
    if (done.was !== 'queued') return card;
    const extra = {
      ...(done.of === null ? {} : { queueLength: done.of }),
      ...(done.factoryRepo === null ? {} : { factoryRepo: done.factoryRepo }),
    };
    return { ...card, status: { ...card.status, ...extra } };
  });

export const cardsHandlers = readsBounded(Api, 'cards', (handlers) =>
  handlers
    .handle('listAll', ({ query }) => page(undefined, query))
    .handle('list', ({ params: { namespace }, query }) => page(namespace, query))
    .handle('get', ({ params: { namespace, name } }) => answered((s) => cardIn(s, namespace, name)))
    .handle('getAll', ({ params: { name } }) => answered((s) => cardIn(s, undefined, name)))
    .handle('update', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        await s.inRequest(replaceCard(name, namespace, payload));
        return cardIn(s, namespace, name);
      }),
    )
    .handle('edit', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        await s.inRequest(INBOX_EDIT.handler({ name, namespace, ...payload }));
        return cardIn(s, namespace, name);
      }),
    )
    .handle('create', ({ params: { namespace }, payload }) =>
      answered(async (s) => {
        const factory = factoryOf(namespace);
        if (payload.factory !== undefined && payload.factory !== factory)
          throw new Refused({
            message: `The card's \`factory\` is its namespace: send this one to /api/namespaces/${payload.factory}/cards, or leave \`factory\` out. Nothing was filed.`,
          });
        if (payload.workflow !== undefined && (payload.workflow === '' || /[\\/]/.test(payload.workflow)))
          throw new Refused({
            message: "`workflow` is a workflow folder's name, with no `/`: send one, or leave it out. Nothing was filed.",
          });
        const { text, ...keys } = filingOf({ ...payload, ...(factory === undefined ? {} : { factory }) }, s.home);
        const { card, labelsLeftOut } = await s.inRequest(INBOX_ADD.handler({ idea: text, ...keys }));
        const filed = await cardIn(s, card.factory ?? DEFAULT_NAMESPACE, card.name);
        return labelsLeftOut?.length ? { ...filed, status: { ...filed.status, labelsLeftOut } } : filed;
      }),
    )
    .handle('delete', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        const card = await cardIn(s, namespace, name);
        const dropped = await s.inRequest(INBOX_RM.handler({ name }));
        if (!dropped.removed) throw new Missing({ message: noCardLine(name, dropped.cards) });
        return card;
      }),
    )
    .handle('start', ({ params: { namespace, name }, payload }) =>
      answered(
        orFailed(async (s) => {
          await cardIn(s, namespace, name);
          const factory = factoryOf(namespace);
          const placed = factory === undefined ? s : { ...s, ...s.placedIn(namespace) };
          const started = await cardStart(placed, name, payload, factory ?? s.factory?.name);
          return started;
        }),
      ).pipe(Effect.tap((started) => ('id' in started ? locatedAt(started.id) : Effect.void))),
    )
    .handle('queue', ({ params: { namespace, name }, query }) => queued(namespace, name, false, query.workflow))
    .handle('unqueue', ({ params: { namespace, name } }) => queued(namespace, name, true))
    .handle('labels', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        await cardIn(s, namespace, name);
        return s.inRequest(LABEL_CARD.handler({ name, ...payload }));
      }),
    ),
);
