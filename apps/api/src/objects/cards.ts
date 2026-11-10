/**
 * The cards group's handlers (`objects`' `Api`): the inbox's cards as objects, over the package's entries the inbox's routes and the card
 * start run — a page of them (`cardList`), one (`cardObject`) in its namespace or found in any (`getAll`), each with its file as
 * written, written whole (`replaceCard`), filed (`nemia inbox add`), dropped (`inbox rm`), started (`nemia start <card>`), queued and
 * taken off (`inbox queue`), and its labels edited (`label inbox`).
 *
 * A card's namespace is its factory, `default` for one that names none: a card read, dropped, started, queued or labelled under a
 * namespace it is not in is `Missing`, as one no card has the name of; a card filed under `default` names no factory, under another the
 * namespace's. `?labelSelector=` and its retired spelling `?selector=` are read the same, each given again for another (OR); a `limit`,
 * a token or a selector the package refuses is its `Invalid`, a 422.
 */
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import {
  cardList,
  cardObject,
  INBOX_ADD,
  replaceCard,
  inboxNameRefusal,
  informerMemo,
  Invalid as Refused,
  type SummaryHow,
  verifiesRest,
} from 'agent-orchestrator';
import { Api, DEFAULT_NAMESPACE, type LabelEdit } from 'objects';
import { filingOf } from '../inbox/inbox.ts';
import type { Served } from '../layer.ts';
import { commandNamed, runPlaced } from '../store.ts';
import { cardStart } from '../runs/index.ts';
import { answered, locatedAt, orFailed, readerRefused } from './refused.ts';

/** The entries the verbs write through. */
const INBOX_RM = commandNamed('inbox rm');
const INBOX_QUEUE = commandNamed('inbox queue');
const LABEL_CARD = commandNamed('label inbox');

/** How a read of the cards judges a started card's run: off the app's informer and its feed's filing times, verified as the env says. */
const howOf = (s: Served): SummaryHow => ({
  home: s.home,
  memo: s.informer ?? informerMemo(),
  filings: s.memo.filings,
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
};

/** A page of the cards of `namespace` (every card for none) the query asks for. */
const page = (namespace: string | undefined, query: ListQuery) =>
  answered((s) =>
    runPlaced(
      s,
      s.e,
      cardList(s.e, howOf(s), {
        namespace,
        limit: query.limit === undefined ? null : Number(query.limit),
        continue: query.continue,
        labelSelector: [...listOf(query.labelSelector), ...listOf(query.selector)],
      }),
    ),
  );

/**
 * The card `name` of `namespace` (any namespace, for none), read now with its file as written (`status.source`), after its name is one a
 * card can have: what every verb on one card reads first.
 */
const cardIn = async (s: Served, namespace: string | undefined, name: string) => {
  const wrong = inboxNameRefusal(name);
  if (wrong) throw new Refused({ message: wrong });
  return runPlaced(s, s.e, cardObject(s.e, howOf(s), name, namespace));
};

/** The factory a namespace names: none for `default`. */
const factoryOf = (namespace: string): string | undefined => (namespace === DEFAULT_NAMESPACE ? undefined : namespace);

/** The card `name` of `namespace` queued on the workflow it names, or taken off the queue (`off`), and read again. */
const queued = (namespace: string, name: string, off: boolean) =>
  answered(async (s) => {
    await cardIn(s, namespace, name);
    await runPlaced(s, s.e, INBOX_QUEUE.handler({ name, off }, s.env, s.home));
    return cardIn(s, namespace, name);
  });

export const cardsHandlers = HttpApiBuilder.group(Api, 'cards', (handlers) =>
  handlers
    .handle('listAll', ({ query }) => page(undefined, query))
    .handle('list', ({ params: { namespace }, query }) => page(namespace, query))
    .handle('get', ({ params: { namespace, name } }) => answered((s) => cardIn(s, namespace, name)))
    .handle('getAll', ({ params: { name } }) => answered((s) => cardIn(s, undefined, name)))
    .handle('update', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        await runPlaced(s, s.e, replaceCard(name, namespace, payload));
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
        const asked = filingOf({ ...payload, ...(factory === undefined ? {} : { factory }) }, s.repo, s.home);
        if ('status' in asked) throw readerRefused(asked);
        const { card } = await runPlaced(
          s,
          s.e,
          INBOX_ADD.handler(
            { idea: asked.text, workflow: asked.workflow, repo: asked.repo, factory: asked.factory, label: asked.label },
            undefined,
            s.home,
          ),
        );
        return cardIn(s, card.factory ?? DEFAULT_NAMESPACE, card.name);
      }),
    )
    .handle('delete', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        const card = await cardIn(s, namespace, name);
        await runPlaced(s, s.e, INBOX_RM.handler({ name }, s.env, s.home));
        return card;
      }),
    )
    .handle('start', ({ params: { namespace, name }, payload }) =>
      answered(
        orFailed(async (s) => {
          await cardIn(s, namespace, name);
          const started = await cardStart(s, name, payload, factoryOf(namespace) ?? s.factory?.name);
          if ('status' in started) throw readerRefused(started);
          const { id, card, ignoredRepo } = started;
          return { id, card, ...(ignoredRepo !== undefined ? { ignoredRepo } : {}) };
        }),
      ).pipe(Effect.tap((started) => ('id' in started ? locatedAt(started.id) : Effect.void))),
    )
    .handle('queue', ({ params: { namespace, name } }) => queued(namespace, name, false))
    .handle('unqueue', ({ params: { namespace, name } }) => queued(namespace, name, true))
    .handle('labels', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        await cardIn(s, namespace, name);
        const edit: LabelEdit = payload;
        return runPlaced(
          s,
          s.e,
          LABEL_CARD.handler({ name, labels: [...edit.labels], overwrite: edit.overwrite === true }, s.env, s.home),
        ) as Promise<typeof import('objects').Labelled.Type>;
      }),
    ),
);
