import { CircleCheck, CircleDashed, CircleX, type LucideIcon } from 'lucide-react';
import type { HarnessCheck, HarnessCheckState, ReadinessPiece } from 'objects';
import { CutPress, Pending } from '@/components/look';
import { Button } from '@/components/ui/ds';
import { cn } from '@/components/ui/ds/utils';
import { container, dashed, ringed } from '@/lib/meaning';
import { dollars } from '@/lib/money';
import { PieceFixes, type Starts } from './ReadinessList';

/** How each state of a check is drawn: a glyph and a word, so it is read without its colour, and a hue. */
const MARK: Record<HarnessCheckState, { word: string; icon: LucideIcon; className: string }> = {
  passed: { word: 'Passed', icon: CircleCheck, className: container.sage },
  failed: { word: 'Failed', icon: CircleX, className: ringed.yours },
  running: { word: 'Running', icon: CircleDashed, className: dashed.grey },
  unrun: { word: 'Not run', icon: CircleDashed, className: container.grey },
};

/** What each check is, as its row names it. */
const NAMES: Record<HarnessCheck['name'], string> = { version: 'Version', turn: 'A real turn' };

/** What the turn's press says: running while it is, Run again once it ran, else Run the check, with its cap. */
const turnWord = (check: HarnessCheck, pending: boolean) => {
  const cap = check.capUsd === undefined ? '' : ` (at most ${dollars(check.capUsd)})`;
  if (pending || check.state === 'running') return 'Running…';
  return `${check.state === 'unrun' ? 'Run the check' : 'Run again'}${cap}`;
};

/** What a turn check runs on, said once beside its row. */
type TurnRun = { onRun: () => void; pending?: boolean; refused?: string };

/**
 * One check: its mark, its name and what it found, and under a failed one its fixes, the install started again or the sign-in to type;
 * the turn's own press, which runs it, its cap said, filled until it passed and outlined after, when the view's next step is its one
 * filled action; and once it passed, what it cost and the quota beside it as information.
 */
function CheckRow({
  check,
  install,
  starts,
  turn,
  quota,
}: {
  check: HarnessCheck;
  install: ReadinessPiece;
  starts: Starts;
  turn?: TurnRun;
  quota?: string;
}) {
  const mark = MARK[check.state];
  const Icon = mark.icon;
  return (
    <li data-harness-check={check.name} data-check-state={check.state} className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={cn('inline-flex items-center gap-1 rounded-shape-full px-2 py-0.5 text-label-medium', mark.className)}>
              {check.state === 'running' ? <Pending size={14} /> : <Icon aria-hidden className="size-3.5" />}
              {mark.word}
            </span>
            <span className="text-title-small font-title-small text-on-surface">{NAMES[check.name]}</span>
          </div>
          <p className="text-body-medium break-words text-on-surface">{check.message}</p>
          {check.name === 'turn' && check.state === 'passed' && quota !== undefined && (
            <p data-harness-quota className="text-body-small text-on-surface-variant">
              For your information, the quota: {quota}
            </p>
          )}
        </div>
        {turn !== undefined && check.name === 'turn' && check.state !== 'passed' && (
          <CutPress
            data-harness-turn
            pending={turn.pending === true || check.state === 'running'}
            isDisabled={turn.pending === true || check.state === 'running'}
            onPress={turn.onRun}
          >
            {turnWord(check, turn.pending === true)}
          </CutPress>
        )}
        {turn !== undefined && check.name === 'turn' && check.state === 'passed' && (
          <Button
            variant="outlined"
            size="xsmall"
            data-harness-turn
            icon={turn.pending === true ? Pending : undefined}
            isDisabled={turn.pending === true}
            onPress={turn.onRun}
          >
            {turnWord(check, turn.pending === true)}
          </Button>
        )}
      </div>
      {check.state === 'failed' && <PieceFixes piece={{ ...install, state: 'missing', fixes: check.fixes }} starts={starts} />}
      {turn?.refused !== undefined && check.name === 'turn' && (
        <p role="alert" data-turn-refused className="text-body-small break-words text-failure">
          Not started. The api refused it: {turn.refused}
        </p>
      )}
    </li>
  );
}

/**
 * A harness's two checks, a tick each, as the readiness read carries them on its install piece: its version against the pin, and one
 * tiny real turn through it, which `turn` runs; drawn by Setup and by the welcome alike.
 */
export function HarnessChecks({ install, turn, quota, ...starts }: { install: ReadinessPiece; turn?: TurnRun; quota?: string } & Starts) {
  const checks = install.checks ?? [];
  if (checks.length === 0) return null;
  return (
    <ul data-harness-checks={install.harness?.name ?? install.name} className="flex flex-col divide-y divide-outline-variant">
      {checks.map((check) => (
        <CheckRow
          key={check.name}
          check={check}
          install={install}
          starts={starts}
          {...(turn === undefined ? {} : { turn })}
          {...(quota === undefined ? {} : { quota })}
        />
      ))}
    </ul>
  );
}
