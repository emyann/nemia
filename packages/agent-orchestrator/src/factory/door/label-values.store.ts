/**
 * A write's labels judged against the values its factory states each key takes (`labelValues`), as every door that writes a person's
 * labels asks before it writes: a filing, an apply of a card, a label of a card or a run, and a start's own labels. Only what the write
 * gives is judged, never a value that stands; the decision is `labelValuesRefused`'s, pure and proved.
 */
import { Effect } from 'effect';
import { Invalid } from '../../refusal/refusal.ts';
import { labelValuesRefused } from '../../label-spelling/label-spelling.ts';
import type { LabelGiven, LabelValueOffence } from '../../../contracts/label-values.contract.ts';
import { factoryOrNone } from './factories.store.ts';

/**
 * The refusal of `offences` in the factory `factory`: each label refused with the values its key takes, what to type instead, then what
 * was not done.
 * @param factory The factory's name.
 * @param offences The labels refused, each with the values its key takes.
 * @param notDone What the caller did not do, said last.
 */
export const labelValuesRefusal = (factory: string, offences: readonly LabelValueOffence[], notDone: string) => {
  const each = offences.map((o) => `${o.key}=${o.value}: the factory ${factory} takes ${o.key}=${o.takes.join('|')}`).join('; ');
  const first = offences[0];
  const again =
    first === undefined
      ? ''
      : ` Give ${first.key} one of those values, as in ${first.key}=${first.takes[0] ?? '<value>'}, or leave it out, and type it again.`;
  return `${each}.${again} ${notDone}`;
};

/**
 * Refuses `Invalid` the labels of `given` the factory `factory` does not take (`labelValuesRefused`), naming each and the values its key
 * takes, then `notDone`. Silent for no factory, the default, a factory not filed or one that does not read, and a label set empty, which
 * takes the key's value away: a write is never refused for a factory the start or the pass judges.
 * @param factory The factory the cards or runs written are of, by name; none for the default.
 * @param given The labels the write gives, by key: only these are judged.
 * @param notDone What the caller did not do, said at the end of the refusal, as `Nothing was filed.`.
 */
export const labelValuesJudged = Effect.fn('labelValuesJudged')(function* (
  factory: string | undefined,
  given: Readonly<Record<string, string>>,
  notDone: string,
) {
  const labels: readonly LabelGiven[] = Object.entries(given)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => ({ key, value }));
  if (factory === undefined || labels.length === 0) return;
  const filed = yield* factoryOrNone(factory).pipe(Effect.orElseSucceed(() => undefined));
  const values = filed?.labelValues;
  if (values === undefined) return;
  const rules = Object.entries(values).map(([key, taken]) => ({ key, values: taken }));
  const offences = labelValuesRefused(rules, labels);
  if (offences.length) return yield* Effect.fail(new Invalid({ message: labelValuesRefusal(factory, offences, notDone) }));
});
