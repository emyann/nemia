/**
 * The runs a run is handed as context (`nemia start --from`, a card's `from:`): what a start refuses of them (`contextRefusal`). Pure.
 * Context is no wait: nothing here is read by what decides whether a run's steps are filed.
 */
import { idRefusal } from '../forget/forget.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';

/**
 * Why the runs `context` cannot be handed to a run: one that is not a run's id (`idRefusal`, before `exists` is asked of it), one named
 * twice, one also in `after` (whose section `--after` hands already), the run `self` itself, and one the store does not have (`exists`).
 * A run in flight is taken: what it has when the roots are filed is handed. Null when each can be.
 *
 * @param context The runs to be handed, by id, in the order named.
 * @param after The runs the run waits on (`--after`), by id.
 * @param exists Whether the store has the run of that id.
 * @param self The run itself, by id, or undefined where there is none to name.
 * @param flag How the caller names one, in its refusal: `--from` at a start, `from:` on a card.
 */
export function contextRefusal(
  context: readonly string[],
  after: readonly string[],
  exists: (runId: string) => boolean,
  self?: string,
  flag = '--from',
) {
  const seen = new Set<string>();
  for (const id of context) {
    const notId = idRefusal(id, 'read', flag);
    if (notId) return new Invalid({ message: `${flag} ${notId}` });
    if (seen.has(id))
      return new Invalid({ message: `${flag} ${id} is given twice, and a run is handed another once. Name each run once.` });
    seen.add(id);
    if (after.includes(id)) {
      return new Invalid({
        message: `${flag} ${id}: it is already waited on (--after ${id}), and --after hands what it concluded too. Drop ${flag} ${id}.`,
      });
    }
    if (id === self) return new Invalid({ message: `${flag} ${id}: that is the run itself, which has concluded nothing yet. Drop it.` });
    if (!exists(id))
      return new Missing({ message: `${flag} ${id}: the store has no run ${id}. ${flag} takes a run by its id — nemia ls lists them.` });
  }
  return null;
}
