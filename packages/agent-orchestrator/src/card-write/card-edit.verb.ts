/**
 * A card written from its text (the Card's edit, `PUT /api/namespaces/<factory>/cards/<name>/source`, which `nemia inbox edit` sends),
 * refused as `cardEditRefusal` says, then handed to the Card's whole write (`replaceCard`), which judges and writes the rest. A
 * controller: an Effect program over the Card and Run doors.
 */
import { Effect, Exit } from 'effect';
import { type CardEdit, type CardWrite, DEFAULT_NAMESPACE } from 'objects';
import type { CardEditRefusal } from '../../contracts/card-edit.contract.ts';
import { CardDoor } from '../cards/cards.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { tried } from '../runtime-client.ts';
import { CardName } from '../inbox/inbox.model.ts';
import { inboxNameRefusal, parseInboxCard, startedRefusal, type InboxCard } from '../inbox/index.ts';
import { labelsText } from '../labels/labels.ts';
import { cardEditRefusal } from './card-edit.ts';
import { replaceCard } from './card-write.verb.ts';

/** The words of each refusal of a card's edit, naming the fix. */
const refusalOf = (refusal: CardEditRefusal, card: InboxCard, read: InboxCard | null, file: string, started: readonly string[]) => {
  switch (refusal) {
    case 'started':
      return new Conflict({ message: startedRefusal(card, file, started) });
    case 'factory':
      return new Invalid({
        message: `the card ${card.name} lives in the factory ${card.factory ?? DEFAULT_NAMESPACE}, and its text says factory: ${read?.factory ?? ''}: a card stays in its factory. Leave the line out, or file the idea in that factory as a card of its own: nemia inbox add <file> --factory ${read?.factory ?? '<name>'}. Nothing was written.`,
      });
    case 'labels':
      return new Invalid({
        message: `the card ${card.name}'s labels are ${labelsText(card.labels ?? {})}, and its text says ${labelsText(read?.labels ?? {})}: labels are edited by their own verb. Leave the labels: lines out, and set them with nemia label inbox ${card.name} key=value (key- takes one off). Nothing was written.`,
      });
  }
};

/** The Card's spec a card's text says (`read`): its keys and body, and its `queued:` as the card has it (`queued`) where it says none. */
const specOf = (read: InboxCard, queued: string | undefined): CardWrite['spec'] => {
  const at = read.queued ?? queued;
  return {
    ...(read.workflow !== undefined ? { workflow: read.workflow } : {}),
    ...(read.gate !== undefined ? { gate: read.gate } : {}),
    ...(read.model !== undefined ? { model: read.model } : {}),
    ...(read.from !== undefined ? { from: read.from } : {}),
    ...(read.repo !== undefined ? { repo: read.repo } : {}),
    ...(at !== undefined ? { queued: at } : {}),
    body: read.body,
  };
};

/**
 * The card `name` of the namespace `namespace` (its factory, `default` for a card that names none) written from `edit.source`, its file
 * as it is to be: read as the card's own file is read (`parseInboxCard`, after a byte order mark and CRLF line ends are taken off), its
 * `workflow:`, `gate:`, `model:`, `from:` and body written as the text says them — a key it leaves out taken off — and its name, labels,
 * factory and `queued:` kept, a `queued:` left out read as the card's own. Written whole by the Card's whole write (`replaceCard`) at
 * `edit.resourceVersion` where it is sent, and not written at all where the file would read the same.
 *
 * Refused before anything is written, exit 2: a name that is not a card's, no card of that name in the namespace (`Missing`), then what
 * `cardEditRefusal` refuses — a started card (`Conflict`, whatever the text says), a `factory:` other than the namespace, `labels:` other
 * than the card's (`Invalid`) — then a text that does not read as a card (`Invalid`, naming the key), then what `replaceCard` refuses.
 */
export const editCard = Effect.fn('editCard')(function* (name: string, namespace: string, edit: CardEdit) {
  const refused = inboxNameRefusal(name);
  if (refused) return yield* Effect.fail(new Invalid({ message: refused }));
  const door = yield* CardDoor;
  const runDoor = yield* RunDoor;
  const card$ = CardName.read(name);
  const file = yield* door.cards.where(card$);
  const text = yield* door.cards.read(card$);
  const card = text === null ? null : yield* tried(() => parseInboxCard(`${name}.md`, text));
  if (card === null || (card.factory ?? DEFAULT_NAMESPACE) !== namespace)
    return yield* Effect.fail(
      new Missing({
        message: `no card ${name} in the namespace ${namespace}: list the cards with nemia get cards, a card's namespace being its factory, default for one that names none; file a new one with nemia inbox add "<idea>"`,
      }),
    );
  const source = edit.source.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const parsed = yield* Effect.exit(tried(() => parseInboxCard(`${name}.md`, source)));
  const read = Exit.isSuccess(parsed) ? parsed.value : null;
  const started = (yield* runDoor.runs.list()).filter((r) => r.from?.inbox === card.name).map((r) => r.id);
  const refusal = cardEditRefusal({
    started: started.length > 0,
    namespace,
    labelsNow: labelsText(card.labels ?? {}),
    ...(read?.factory !== undefined ? { factoryRead: read.factory } : {}),
    ...(read?.labels !== undefined ? { labelsRead: labelsText(read.labels) } : {}),
  });
  if (refusal !== null) return yield* Effect.fail(refusalOf(refusal, card, read, file, started));
  if (Exit.isFailure(parsed)) return yield* Effect.failCause(parsed.cause);
  return yield* replaceCard(name, namespace, {
    metadata: edit.resourceVersion !== undefined ? { resourceVersion: edit.resourceVersion } : {},
    spec: specOf(parsed.value, card.queued),
  });
});
