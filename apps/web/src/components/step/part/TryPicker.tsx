/**
 * Which try of a step its part shows: a toggle a try, grouped by its round, the current one said so. A choice is kept in the address
 * (`?try=<step>:<n>`, `setTry`), so every place the step is drawn shows the same try, and choosing its current takes the choice back.
 * Nothing for a step of one try or none.
 */
import { useNavigate } from '@tanstack/react-router';
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import type { StepTry } from '@/lib/api/tries';
import type { Frozen } from '@/lib/frozen';
import { setTry } from '@/lib/tryAddress';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { triesByRound } from '../Closeout';

const TOGGLE = cn(
  'border border-outline-variant px-1.5 py-0.5 font-mono text-body-small text-on-surface-variant hover:text-on-surface data-selected:border-on-surface data-selected:text-on-surface',
  focusRing(),
);

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
    <ToggleButtonGroup
      aria-label={`Which try of ${step}`}
      data-try-picker={step}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[String(shown)]}
      onSelectionChange={(keys) => pick(Number([...keys][0]))}
      className="flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      {triesByRound(tries).map(({ round, tries: ofRound }) => (
        <span key={round} data-round={round} className="flex items-center gap-1">
          <span className="text-label-small text-on-surface-variant uppercase">round {round}</span>
          {ofRound.map((t) => (
            <ToggleButton key={t.try} id={String(t.try)} data-try={t.try} className={TOGGLE}>
              {t.current ? `try ${t.try} (current)` : `try ${t.try}`}
            </ToggleButton>
          ))}
        </span>
      ))}
    </ToggleButtonGroup>
  );
}
