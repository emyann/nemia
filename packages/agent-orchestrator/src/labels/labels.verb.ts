/**
 * `nemia label run` and `nemia label inbox`: a person's labels on a run or a card edited at any time, as `kubectl label` edits a
 * resource's — `key=value` sets a key, `key-` removes it, and a set that would change a value is refused without `--overwrite`. A run's
 * labels are written whole through the Run door (`runs.labels.put`), beside its record and never in it; a card's in its own frontmatter
 * through the Card door (`cards.rewrite`), every other key kept, as `nemia inbox from` writes `from:`. The rules are `labels.ts`'s.
 */
import { Effect } from 'effect';
import { labelEdits, parseLabelEdits, type Labels } from './labels.ts';
import type { Labelled } from './labels.model.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { idRefusal } from '../forget/forget.ts';
import { CardDoor } from '../cards/cards.store.ts';
import { CardName } from '../inbox/inbox.model.ts';
import { inboxNameRefusal, labelledText, noCardLine, parseInboxCard } from '../inbox/index.ts';
import { inboxCards } from '../inbox/inbox.store.ts';
import { tried } from '../runtime-client.ts';

/** `edits` parsed and applied to `current`, or the refusal of either, as `Invalid` naming the command typed. */
const edited = (command: string, current: Labels, edits: readonly string[], overwrite: boolean): Effect.Effect<Labels, Invalid> => {
  if (!edits.length)
    return Effect.fail(new Invalid({ message: `${command} takes the edits to make: key=value to set a key, key- to remove one.` }));
  const parsed = parseLabelEdits(edits);
  if ('refused' in parsed) return Effect.fail(new Invalid({ message: `${command}: ${parsed.refused}` }));
  const done = labelEdits(current, parsed.edits, overwrite);
  return 'refused' in done ? Effect.fail(new Invalid({ message: `${command}: ${done.refused}` })) : Effect.succeed(done.labels);
};

/**
 * `nemia label run <id> <edit>... [--overwrite]`: the run's person labels edited and written whole (`runs.labels.put`), any run — in
 * flight, waiting or finished. Refused before anything is written: an id that is not a run's (`Invalid`), a run the store does not have
 * (`Missing`, naming `nemia ls`), and an edit `parseLabelEdits` or `labelEdits` refuses (`Invalid`).
 */
export const labelRun = Effect.fn('labelRun')(function* (id: string, edits: readonly string[], overwrite = false) {
  const command = `nemia label run ${id}`;
  const notId = idRefusal(id, 'read', 'nemia label run');
  if (notId) return yield* Effect.fail(new Invalid({ message: notId }));
  const door = yield* RunDoor;
  const run = yield* door.runs.find(RunId.read(id), () => {});
  if (run === undefined)
    return yield* Effect.fail(new Missing({ message: `${command}: the store has no run ${id}. Label one nemia ls lists, by its id.` }));
  const was = run.labels ?? {};
  const labels = yield* edited(command, was, edits, overwrite);
  yield* door.labels.put(RunId.read(id), labels);
  const out: Labelled = { kind: 'Run', name: id, labels, was };
  return out;
});

/**
 * `nemia label inbox <name> <edit>... [--overwrite]`: the card's `labels:` edited and written back into its frontmatter, every other key
 * and its body kept (`labelledText`), a started card's too. Refused before anything is written: a name that is not a card's (`Invalid`),
 * a card the inbox does not have (`Missing`, naming `nemia inbox` and the cards there are), a card that does not read (`tried`, its
 * reader's refusal as the failure), and an edit
 * `parseLabelEdits` or `labelEdits` refuses (`Invalid`).
 */
export const labelCard = Effect.fn('labelCard')(function* (name: string, edits: readonly string[], overwrite = false) {
  const command = `nemia label inbox ${name}`;
  const notName = inboxNameRefusal(name);
  if (notName) return yield* Effect.fail(new Invalid({ message: notName }));
  const door = yield* CardDoor;
  const card$ = CardName.read(name);
  const text = yield* door.cards.read(card$);
  if (text === null)
    return yield* Effect.fail(
      new Missing({ message: `${command}: ${noCardLine(name, yield* inboxCards())} Label one nemia inbox lists, by its name.` }),
    );
  const card = yield* tried(() => parseInboxCard(`${name}.md`, text, () => true));
  const was = card.labels ?? {};
  const labels = yield* edited(command, was, edits, overwrite);
  yield* door.cards.rewrite(card$, yield* tried(() => labelledText(card, labels, () => true)));
  const out: Labelled = { kind: 'Card', name, labels, was };
  return out;
});
