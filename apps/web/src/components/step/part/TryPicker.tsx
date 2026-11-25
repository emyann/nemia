/**
 * Which try of a step its part shows: a toggle a try, grouped by its round, the current one said so. A choice is kept in the address
 * (`?try=<step>:<n>`, `setTry`), so every place the step is drawn shows the same try, and choosing its current takes the choice back.
 * Nothing for a step of one try or none.
 */
import { useNavigate } from '@tanstack/react-router';
import type { StepTry } from '@/lib/api/tries';
import type { Frozen } from '@/lib/frozen';
import { setTry } from '@/lib/tryAddress';
import { Label, Segment, SegmentedButton } from '@/components/ui/ds';
import { triesByRound } from '../Closeout';

/** The picker of the tries of the step `step`, showing `shown`. */
export function TryPicker({ step, tries, shown }: { step: string; tries: readonly Frozen<StepTry>[]; shown: number | null }) {
  const navigate = useNavigate();
  if (tries.length < 2 || shown === null) return null;
  const current = tries.find((t) => t.current)?.try ?? null;
  const pick = (n: number) =>
    void navigate({
      to: '.',
      search: (prev: { try?: string }) => setTry(prev, step, n === current ? null : n),
      replace: true,
      resetScroll: false,
    });
  return (
    <SegmentedButton
      aria-label={`Which try of ${step}`}
      data-try-picker={step}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[String(shown)]}
      onSelectionChange={(keys) => pick(Number([...keys][0]))}
      className="flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      {triesByRound(tries).map(({ round, tries: ofRound }) => (
        <span key={round} data-round={round} className="flex items-center">
          <Label size="small" component="span" colorRole="on-surface-variant" className="me-2 uppercase">
            round {round}
          </Label>
          {ofRound.map((t) => (
            <Segment key={t.try} id={String(t.try)} data-try={t.try} className="flex-none">
              {t.current ? `try ${t.try} (current)` : `try ${t.try}`}
            </Segment>
          ))}
        </span>
      ))}
    </SegmentedButton>
  );
}
