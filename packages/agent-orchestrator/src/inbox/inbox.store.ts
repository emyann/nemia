/**
 * The inbox's verbs: its cards read (`readInbox`), filed (`addToInbox`), queued and taken back (`queueInInbox`), dropped
 * (`dropFromInbox`), and a path named as a card (`inboxNameAt`), each card and each try the tick wrote down of a queued card's start read
 * and written through the Card door (`CardDoor`, `src/cards/cards.store.ts`): each verb an Effect program that yields it, so a program
 * given `StoreRoot` reads the store's files and a test gives `cardDoorMemory()`. The judgement is `inbox.ts`'s.
 *
 * Beneath the controllers, beside `files.store.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports what the
 * package exports of it. A card's start — `startFromInbox`, and `startQueued`, the tick's — starts a run, and
 * is `inbox.verb.ts`'s, through `startRun`.
 */
import { setting } from '../config/config.store.ts';
import { DEFAULT_NAMESPACE } from 'objects';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import {
  cardsListed,
  cardWorkflowRefusal,
  ideaCard,
  labelledText,
  inboxNameRefusal,
  noCardLine,
  parseInboxCard,
  queueOrder,
  queuedText,
  queueRefusal,
  retiredRepoRefusal,
  type InboxCard,
} from './inbox.ts';
import { queueFactoryRefusal } from './queue-factory.ts';
import { Conflict, Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { inheritedLabels, parseLabelEdits, type LeftOut } from '../labels/labels.ts';
import { CardDoor, cardNameAt, inboxAt } from '../cards/cards.store.ts';
import { CardName } from './inbox.model.ts';
import { firstPiece } from '../piece/piece.ts';
import { WorkflowError } from '../step/step.ts';
import { FactoryDoor, factoryOrNone } from '../factory/door/factories.store.ts';
import { unattachedRefusal, type Factory } from '../factory/factory.ts';
import { runId } from '../record/record.store.ts';
import { keptRuns } from '../record/files.store.ts';
import { StoreRoot } from '../config/root.store.ts';

/** The names of the inbox's cards, as `nemia inbox` lists them. */
export const inboxCards = Effect.fn('inboxCards')(function* () {
  const entries = yield* (yield* CardDoor).cards.entries();
  return cardsListed(entries, [])
    .filter((l) => l.file.endsWith('.md'))
    .map((l) => l.name);
});

/**
 * Every card in the inbox, by name, with the runs a record says it was started as (`cardsListed`) — and every entry that does not read as
 * a card, with why — before any run's phase is read, so with no `state`: what the queue's writes and the workflows' users read. The run
 * records are read for their `from`, so a card a run was started from is out of the queue; the tick's tries, so a queued card whose start
 * was refused, or failed, says why; and the factories that read, so a card says the repository its factory works on for its workflow
 * (`factoryRepo`).
 * `nemia inbox` lists the cards with their state through `inboxJudged` (inbox.verb.ts), which reads each run's phase.
 */
export const readInbox = Effect.fn('readInbox')(function* () {
  const home = yield* StoreRoot;
  const door = yield* CardDoor;
  const entries = yield* door.cards.entries();
  const tries = yield* door.tries.list();
  return cardsListed(
    entries,
    keptRuns(home, undefined, (run) => ({ id: run.id, ...(run.from === undefined ? {} : { from: run.from }) }), false),
    tries,
    yield* readableFactories(),
  );
});

/**
 * The store's factories that read, by name, as the Factory door lists them: what a queued card's repository is chosen from (`queueRepo`).
 * One not read is none.
 */
export const readableFactories = (): Effect.Effect<Map<string, Factory>, Refusal> =>
  Effect.map(
    Effect.flatMap(FactoryDoor, (door) => door.factories.listed()),
    (listed) => new Map(listed.flatMap((f) => ('error' in f ? [] : [[f.name, f] as const]))),
  );

/** The names of the factories filed, as the door lists them, the default left out: what a refusal names to choose from. */
export const filedNames = (): Effect.Effect<string[], Refusal> =>
  Effect.map(
    Effect.flatMap(FactoryDoor, (door) => door.factories.list()),
    (names) => names.filter((name) => name !== DEFAULT_NAMESPACE),
  );

/**
 * `nemia inbox add`: an idea filed as a card (`ideaCard`), under the slug `runId` makes of its body's first line, suffix and all, so two
 * ideas alike are two cards, and a name already taken is drawn again, never written over. `text` is a note, or a file's text; `from` is
 * what a refusal calls it. `workflow` and `factory` are written as the card's keys, over the text's own: `workflow` a workflow's name, and
 * `factory` a factory's name. The card is filed exclusively (`cards.add`): a name another card took meanwhile (`Conflict`) is drawn again.
 *
 * Refused `Invalid` before anything is written: a `repo` given, or a `repo:` in the text — retired: a card names its factory and its
 * workflow, and the factory's wiring places its run (`retiredRepoRefusal`, naming `nemia factory attach`); a `workflow` that is no
 * workflow's name (`cardWorkflowRefusal`); and in a factory filed, a workflow it does not attach (`unattachedRefusal`, naming the attach).
 * A factory not filed is the start's to refuse.
 *
 * `labels` are label edits (`--label`, `key=value` / `key-`), refused `Invalid` before anything is written where one does not parse
 * (`parseLabelEdits`). The card is filed with the labels its `from:` runs agree on, its text's own `labels:` over them, and the edits over
 * those (`inheritedLabels`); a key two of those runs disagree on is left out, and answered on `labelsLeftOut`.
 */
export const addToInbox = Effect.fn('addToInbox')(function* (opts: {
  text: string;
  from?: string;
  workflow?: string;
  /** Retired: refused whenever given (`retiredRepoRefusal`). */
  repo?: string;
  factory?: string;
  labels?: readonly string[];
}) {
  const edits = parseLabelEdits(opts.labels ?? []);
  if ('refused' in edits) return yield* Effect.fail(new Invalid({ message: `--label: ${edits.refused}. Nothing was filed.` }));
  if (opts.repo !== undefined)
    return yield* Effect.fail(new Invalid({ message: `repository ${opts.repo}: ${retiredRepoRefusal('Nothing was filed.')}` }));
  const given = { workflow: opts.workflow, factory: opts.factory };
  const idea = ideaCard(opts.from ?? 'the idea', opts.text, given);
  const { body } = idea;
  const read = parseInboxCard(opts.from ?? 'the idea', idea.text);
  yield* refuseUnattached(read, 'Nothing was filed.');
  const runDoor = yield* RunDoor;
  const parents = yield* Effect.forEach(read.from ?? [], (run) =>
    Effect.map(
      runDoor.runs.find(RunId.read(run), () => {}),
      (found) => ({ run, labels: found?.labels ?? {} }),
    ),
  );
  const inherited = inheritedLabels({ parents, ...(read.labels !== undefined ? { card: read.labels } : {}), edits: edits.edits });
  const labelled = parents.length > 0 || edits.edits.length > 0;
  const text = labelled ? labelledText(read, inherited.labels) : idea.text;
  const leftOut: readonly LeftOut[] = inherited.leftOut;
  const door = yield* CardDoor;
  for (;;) {
    const name = CardName.read(runId(firstPiece(body, '\n')));
    const filed = yield* Effect.result(door.cards.add(name, text));
    if (filed._tag === 'Failure' && filed.failure._tag === 'Conflict') continue;
    if (filed._tag === 'Failure') return yield* Effect.fail(filed.failure);
    const out: { card: InboxCard; file: string; labelsLeftOut?: readonly LeftOut[] } = {
      card: parseInboxCard(`${name}.md`, text),
      file: filed.success,
      ...(leftOut.length ? { labelsLeftOut: leftOut } : {}),
    };
    return out;
  }
});

/**
 * Refuses `Invalid` a card whose factory is filed and does not attach its workflow (`unattachedRefusal`, naming the attach), then what was
 * not done. Silent for a card of the default factory, one with no workflow, and one whose factory is not filed or does not read: the
 * start says that.
 */
const refuseUnattached = Effect.fn('refuseUnattached')(function* (card: Pick<InboxCard, 'workflow' | 'factory'>, notDone: string) {
  const { workflow } = card;
  if (workflow === undefined || card.factory === undefined || card.factory === DEFAULT_NAMESPACE) return;
  const filed = yield* factoryOrNone(card.factory).pipe(Effect.orElseSucceed(() => undefined));
  const refused = filed === undefined ? undefined : unattachedRefusal(filed, workflow);
  if (refused !== undefined) return yield* Effect.fail(new Invalid({ message: refused.replace('Nothing was started.', notDone) }));
});

/**
 * What `nemia inbox queue` did: the card as it now reads, its file, and — once queued — its place in the queue's order, how many are in
 * it, and the repository its factory works on for its workflow (`factoryRepo`), null when it names none or the card is not queued.
 */
export type InboxQueued = {
  card: InboxCard;
  file: string;
  place?: number;
  of?: number;
  was: 'queued' | 'taken back' | 'not queued';
  factoryRepo: string | null;
};

/** What `queueInInbox` answers, as its type says it. */
const queued = (done: InboxQueued): InboxQueued => done;

/** A queue `queueRefusal` refused, by its kind: a card a run's record names, or one already queued, is a `Conflict`; the rest `Invalid`. */
const queueRefused = (why: string, card: InboxCard, startedAs: readonly string[]): Conflict | WorkflowError =>
  startedAs.length || card.queued !== undefined ? new Conflict({ message: why }) : new WorkflowError(why);

/**
 * Throws what refuses the queue of `card`, in `file`, on `workflow` when one is given: `queueRefusal`'s reasons by their kind
 * (`queueRefused`), then its factory's (`queueFactoryRefusal`), an `Invalid`, by the factories on file and `StoreConfig`'s
 * `defaultFactoryStarts`.
 */
const refuseQueue = Effect.fn('refuseQueue')(function* (card: InboxCard, file: string, workflow: string | undefined) {
  const listed = (yield* readInbox()).find((l) => l.name === card.name);
  const startedAs = listed?.startedAs ?? [];
  const why = queueRefusal(card, file, startedAs, listed?.queued?.place ?? null, workflow);
  if (why) throw queueRefused(why, card, startedAs);
  const whyFactory = queueFactoryRefusal(card, file, yield* filedNames(), yield* setting('defaultFactoryStarts'));
  if (whyFactory) throw new WorkflowError(whyFactory);
});

/**
 * `nemia inbox queue <name>`: the card marked to start on its own, `queued:` the time now, and `workflow:` written over its own when given;
 * `off` takes the mark back, whatever the card's `repo:` names: a card whose repository is gone leaves the queue as any card does. The
 * card's file is written whole, through a hidden file renamed over it, so a pass never reads half a card — and the file keeps the time it
 * was last written, as the rename would give it the time of the queue, and a card has no filing time of its own but its mtime: a board
 * orders its cards by it, and a card queued or taken back would jump to the top of the list. A queue is no edit of the idea. When that time
 * cannot be set back, the queue is written all the same.
 *
 * Refused by name, exit 2, before anything is written: a name that is not a card's (`inboxNameRefusal`), a name with no card (`Missing`) —
 * naming the cards there are — a card that does not read, and what `queueRefusal` refuses: a card a run's record names and one already
 * queued (`Conflict`), and one with no workflow and none given; then a card that names no factory, unless `StoreConfig`'s
 * `defaultFactoryStarts`, or names the default one (`refuseQueue`), which `off` never asks. A `workflow` given, queued or taken back, is
 * written over the card's own, and refused where it is no workflow's name (`cardWorkflowRefusal`) or, in a factory filed, one it does
 * not attach (`unattachedRefusal`). An old card's `repo:` is kept as it is, never judged. `off` on a card not queued writes nothing, and
 * says so.
 */
export const queueInInbox = Effect.fn('queueInInbox')(function* (name: string, how: { off?: boolean; workflow?: string } = {}) {
  const refused = inboxNameRefusal(name);
  if (refused) return yield* Effect.fail(new WorkflowError(refused));
  const door = yield* CardDoor;
  const card$ = CardName.read(name);
  const file = yield* door.cards.where(card$);
  const text = yield* door.cards.read(card$);
  if (text === null) {
    return yield* new Missing({
      message: `${noCardLine(name, yield* inboxCards())} Queue one of those — nemia inbox queue <name> — or park the idea first: nemia inbox add "<idea>".`,
    });
  }
  const card = parseInboxCard(`${name}.md`, text);
  if (how.off && card.queued === undefined) return queued({ card, file, was: 'not queued', factoryRepo: null });
  if (how.workflow !== undefined) {
    const refusedWorkflow = cardWorkflowRefusal('--workflow', how.workflow, 'Nothing was queued.');
    if (refusedWorkflow !== undefined) return yield* Effect.fail(new Invalid({ message: refusedWorkflow }));
    yield* refuseUnattached(
      { workflow: how.workflow, ...(card.factory !== undefined ? { factory: card.factory } : {}) },
      'Nothing was queued.',
    );
  }
  if (!how.off) yield* refuseQueue(card, file, how.workflow);
  const written = queuedText(card, how.off ? null : new Date().toISOString(), how.workflow);
  yield* door.cards.rewrite(card$, written);
  const now = parseInboxCard(`${name}.md`, written);
  if (how.off) return queued({ card: now, file, was: 'taken back', factoryRepo: null });
  const order = queueOrder(yield* readInbox());
  const place = order.findIndex((l) => l.name === name) + 1;
  const factoryRepo = order.find((l) => l.name === name)?.factoryRepo ?? null;
  return queued({ card: now, file, ...(place ? { place } : {}), of: order.length, was: 'queued', factoryRepo });
});

/** What `nemia inbox rm` did: the card's file removed, or no card of that name, and the cards the inbox has. */
export type InboxDropped = { removed: true; file: string } | { removed: false; cards: string[] };

/**
 * `nemia inbox rm`: a card dropped without being started. Refused, exit 2, for a name that is not a card's (`inboxNameRefusal`). A name
 * with no card is normal — dropped already, or never filed — and says which cards there are.
 */
export const dropFromInbox = Effect.fn('dropFromInbox')(function* (name: string) {
  const refused = inboxNameRefusal(name);
  if (refused) return yield* Effect.fail(new WorkflowError(refused));
  const door = yield* CardDoor;
  const file = yield* door.cards.where(CardName.read(name));
  const removed = yield* door.cards
    .drop(CardName.read(name))
    .pipe(
      Effect.catchDefect((err) =>
        Effect.die(
          Object.assign(
            new Error(
              `nemia inbox rm: ${file} could not be removed — ${(err as Error).message}. Nothing was dropped: remove the file by hand, or fix what stops it and drop it again.`,
            ),
            { exitCode: 1 },
          ),
        ),
      ),
    );
  const out: InboxDropped = removed ? { removed: true, file } : { removed: false, cards: yield* inboxCards() };
  return out;
});

/**
 * The name of the card `given` is a path to in the store `home`'s inbox (`cardNameAt`) — any path under the inbox, links resolved — or
 * the card's name `given` says, with or without its `.md`, where the inbox has that card and no file of that name stands where it is
 * typed; else null, for a path outside it and for text: what makes `nemia start <path|name>` go through `startFromInbox`. A card not
 * there at its path is still a card's path, refused by name at start; a name no card has is text.
 */
export const inboxNameAt = (home: string, given: string): string | null => {
  const at = cardNameAt(home, given);
  if (at !== null) return at;
  if (inboxNameRefusal(given) !== undefined || fs.existsSync(given)) return null;
  const bare = given.endsWith('.md') ? given.slice(0, -'.md'.length) : undefined;
  const named = [given, ...(bare ? [bare] : [])];
  return named.find((name) => fs.existsSync(path.join(inboxAt(home), `${name}.md`))) ?? null;
};
