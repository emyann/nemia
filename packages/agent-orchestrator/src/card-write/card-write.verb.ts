/**
 * A card written whole (the Card's update, `PUT /api/namespaces/<factory>/cards/<name>`, which `nemia apply` sends), through the Card
 * door (`replaceCard`), refused as `cardWriteRefusal` says; and the `resourceVersion` a card is served and compared at (`cardVersion`).
 * A controller: Effect programs over the Card and Run doors.
 */
import { modelsText } from '../start/index.ts';
import { versionDigest } from '../digest/digest.ts';
import { Effect } from 'effect';
import { type CardWrite, DEFAULT_NAMESPACE } from 'objects';
import type { CardWriteRefusal } from '../../contracts/card-write.contract.ts';
import { CardDoor } from '../cards/cards.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { isDirectory } from '../record/record.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { tried } from '../runtime-client.ts';
import { contextRefusal } from '../start/index.ts';
import { cardWriteRefusal } from './card-write.ts';
import { CardName } from '../inbox/inbox.model.ts';
import { cardText, fromLine, inboxNameRefusal, parseInboxCard, startedRefusal, type InboxCard } from '../inbox/index.ts';

/** The digest of a card's text, its `resourceVersion`: changed by every write of the file, and by nothing else. */
export const cardVersion = versionDigest;

/** What `replaceCard` did: the card as it reads now, its file, and whether the file was written (a write that changed nothing is not). */
export type CardReplaced = { card: InboxCard; file: string; written: boolean };

/** The words of each refusal of a card's whole write, naming the fix. */
const refusalOf = (refusal: CardWriteRefusal, card: InboxCard, file: string, started: readonly string[]): Conflict | Invalid => {
  switch (refusal) {
    case 'started':
      return new Conflict({ message: startedRefusal(card, file, started) });
    case 'stale':
      return new Conflict({
        message: `the card ${card.name} has changed since it was read: read it again (nemia get card ${card.name} -o yaml), make the change on what it holds now, and write that`,
      });
    case 'queued':
      return new Invalid({
        message: `spec.queued of the card ${card.name} is not what the card has (${card.queued ?? 'unset'}): send it back as read, and queue or unqueue the card with nemia inbox queue ${card.name} [--off]`,
      });
    case 'repo':
      return new Invalid({
        message: `spec.repo of the card ${card.name} is retired: a card names its factory and its workflow, and the factory places its run. Send the card's repo back as read (${card.repo ?? 'unset'}) or leave it out, and name the workflow's repository with nemia factory attach <factory> <workflow> --repo <name>`,
      });
    case 'empty':
      return new Invalid({
        message: `spec.body of the card ${card.name} is empty: a card's body is its run's brief; write what the run is asked to do`,
      });
  }
};

/**
 * The card `name` of the namespace `namespace` (its factory, `default` for a card that names none) written whole from `write` (the Card's
 * update): its `workflow:`, `repo:`, `gate:`, `model:`, `from:` and body as `write.spec` says — a key it leaves out taken off — its labels
 * as `write.metadata.labels` says where it says (`{}` takes them all off; absent keeps them), its `queued:` and `factory:` kept. Written
 * through the Card door as `nemia inbox from` writes one (`cardText`), and not written at all where the file would read the same, so a
 * write of every key as it is leaves the file and its `resourceVersion` as they were.
 *
 * Refused before anything is written, exit 2: a name that is not a card's (`inboxNameRefusal`), no card of that name in the namespace
 * (`Missing`), a card that does not read, and what `cardWriteRefusal` refuses — a started card and a stale `resourceVersion` (`Conflict`,
 * the version compared with the digest of the file as it reads now, which `cardObject` serves), a `queued` changed and no body
 * (`Invalid`) — then what `contextRefusal` refuses of `spec.from` (a run the store does not have, `Missing`), and what `parseInboxCard`
 * refuses of the card it would write (`Invalid`): a `repo:` that is no absolute path or, where it changes, names no directory, a bad label.
 */
export const replaceCard = Effect.fn('replaceCard')(function* (name: string, namespace: string, write: CardWrite) {
  const refused = inboxNameRefusal(name);
  if (refused) return yield* Effect.fail(new Invalid({ message: refused }));
  const door = yield* CardDoor;
  const runDoor = yield* RunDoor;
  const card$ = CardName.read(name);
  const file = yield* door.cards.where(card$);
  const text = yield* door.cards.read(card$);
  const card = text === null ? null : yield* tried(() => parseInboxCard(`${name}.md`, text, () => true));
  if (text === null || card === null || (card.factory ?? DEFAULT_NAMESPACE) !== namespace)
    return yield* Effect.fail(
      new Missing({
        message: `no card ${name} in the namespace ${namespace}: list the cards with nemia get cards, a card's namespace being its factory, default for one that names none; file a new one with nemia inbox add "<idea>"`,
      }),
    );
  const started = (yield* runDoor.runs.list()).filter((r) => r.from?.inbox === card.name).map((r) => r.id);
  const { spec, metadata } = write;
  const refusal = cardWriteRefusal({
    started: started.length > 0,
    versionNow: cardVersion(text),
    ...(metadata.resourceVersion !== undefined ? { versionSent: metadata.resourceVersion } : {}),
    ...(card.queued !== undefined ? { queuedNow: card.queued } : {}),
    ...(spec.queued !== undefined ? { queuedSent: spec.queued } : {}),
    ...(card.repo !== undefined ? { repoNow: card.repo } : {}),
    ...(spec.repo !== undefined ? { repoSent: spec.repo } : {}),
    ...(spec.body !== undefined ? { body: spec.body } : {}),
  });
  if (refusal !== null) return yield* Effect.fail(refusalOf(refusal, card, file, started));
  const ids = new Set(yield* runDoor.runs.ids());
  const refusedRuns = contextRefusal(spec.from ?? [], [], (id) => ids.has(id), undefined, 'spec.from');
  if (refusedRuns) return yield* Effect.fail(refusedRuns);
  const labels = metadata.labels ?? card.labels ?? {};
  const isDirectoryNow = (at: string): boolean => (at === card.repo ? true : isDirectory(at));
  const written = yield* tried(() =>
    cardText(
      { ...card, body: spec.body ?? '' },
      {
        workflow: spec.workflow,
        repo: spec.repo,
        gate: spec.gate,
        model: spec.model && modelsText(spec.model),
        from: fromLine(spec.from),
        labels: { ...labels },
      },
      isDirectoryNow,
    ),
  );
  const same = written === (yield* tried(() => cardText(card, {}, () => true)));
  if (!same) yield* door.cards.rewrite(card$, written);
  const out: CardReplaced = { card: parseInboxCard(`${name}.md`, written, () => true), file, written: !same };
  return out;
});
