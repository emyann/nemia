/**
 * The runs a run is handed as context (`nemia start --from`, a card's `from:`): what a start refuses of them (`contextRefusal`) and what it
 * says of each (`contextLines`). Pure. Context is no wait: nothing here is read by what decides whether a run's steps are filed.
 */
import { idRefusal } from '../forget/forget.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';

/**
 * Why the runs `context` cannot be handed to a run: one that is not a run's id (`idRefusal`, before `exists` is asked of it), one named
 * twice, one also in `after` (whose section `--after` hands already), the run `self` itself, and one the store does not have (`exists`).
 * A run in flight is taken: what it has when the roots are filed is handed. Null when each can be.
 *
 * @param flag How the caller names one, in its refusal: `--from` at a start, `from:` on a card.
 */
export function contextRefusal(
  context: readonly string[],
  after: readonly string[],
  exists: (runId: string) => boolean,
  self?: string,
  flag = '--from',
): Missing | Invalid | null {
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

/**
 * What a start says of each run it is handed as context: `reads <id>`, and for one that has not landed (`landed`), that it is still in
 * flight and what that means for what is handed.
 */
export const contextLines = (context: readonly string[], landed: (runId: string) => boolean): string[] =>
  context.map((id) =>
    landed(id)
      ? `reads: ${id} — handed what it concluded, as context; not waited on`
      : `reads: ${id}, still in flight — what it has when this run's steps are filed is handed, not landed, not judged`,
  );
