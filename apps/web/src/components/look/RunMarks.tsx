import type { ComponentProps } from 'react';
import { Focusable, Tag, Tooltip, TooltipTrigger } from '@/components/ui/ds';
import { cn, focusRing } from '@/components/ui/ds/utils';
import type { RunView } from '@/lib/api/judged';
import { titleOf } from '@/lib/factory';
import { ink } from '@/lib/meaning';
import { dollars } from '@/lib/money';
import { CHIP_TAG, type ChipTone } from '@/lib/nowChip';
import { nowOf, type Now, type NowPart } from '@/lib/runWords';
import { nowMark } from '@/lib/stepMark';
import { NOW_WORDS } from '@/lib/words';
import { CutTag } from './CutTag';
import { MarkDiamond } from './StepGraph';
import { TextLink } from './TextLink';

/** A run another names, as the mark finds it among the surface's runs: what its mark and its title are read from. */
export type NamedRun = Pick<RunView, 'id' | 'brief' | 'steps' | 'cancelledAt' | 'holding' | 'waiting' | 'waitingOnYou' | 'toDecide'>;

/** The ink of NOW's words by the chip's colour: yellow where the run waits on you, red where it failed, quiet for every other. */
export const WORDS_INK: Record<ChipTone, string> = {
  yours: ink.yours,
  failure: ink.failure,
  alive: 'text-on-surface-variant',
  waits: 'text-on-surface-variant',
  rest: 'text-on-surface-variant',
};

/**
 * A mark that is no control, `children`, as a trigger of the kit's plain tooltip saying `said`: it takes the focus, so the keyboard
 * opens the tooltip as the pointer does, and is said aloud as `said` too.
 */
function Marked({ said, children }: { said: string; children: ComponentProps<typeof Focusable>['children'] }) {
  return (
    <TooltipTrigger delay={300}>
      <Focusable>{children}</Focusable>
      <Tooltip>{said}</Tooltip>
    </TooltipTrigger>
  );
}

/**
 * A run by its mark: the diamond of the step it is on, as its graph draws that step (`nowMark`), and its id's last four characters,
 * a link to its page, its whole id, title and step in the kit's tooltip. `run` is the run as the surface has it; a run the surface
 * does not have is named by `id` alone, its diamond at rest.
 */
export function RunMark({ id, run }: { id: string; run?: NamedRun }) {
  const now = run ? nowOf(run) : null;
  const said = run ? `${titleOf(run)} — ${now?.step ?? 'done'}` : id;
  return (
    <TooltipTrigger delay={300}>
      <TextLink
        to="/runs/$runId"
        params={{ runId: id }}
        data-now-run={id}
        data-run-mark={id}
        aria-label={`${id.slice(-4)}: ${said}`}
        className="inline-flex items-center gap-1 align-baseline font-mono text-body-medium whitespace-nowrap"
      >
        <MarkDiamond mark={run ? nowMark(run) : 'rest'} />
        <span className="underline decoration-outline underline-offset-4">{id.slice(-4)}</span>
      </TextLink>
      <Tooltip>{`${id}\n${said}`}</Tooltip>
    </TooltipTrigger>
  );
}

/** The chip naming the step a run is on, its colour the state; `small` at a line and a card at md. */
export function Chip({ now, small = false }: { now: Pick<Now, 'step' | 'tone'>; small?: boolean }) {
  const tag = CHIP_TAG[now.tone];
  return (
    <CutTag>
      <Tag
        data-now-word
        data-tone={now.tone}
        variant={tag.variant}
        color={tag.color}
        className={cn('shrink-0 uppercase', small && 'h-5 px-1.5 text-label-small')}
      >
        {now.step}
      </Tag>
    </CutTag>
  );
}

/**
 * The step's round of its rounds, as pips: one a round, lit up to the round it is on, in the chip's colour where it waits on you; with
 * `words`, the round said beside them.
 */
export function Pips({ round, tone, words = false }: { round: NonNullable<Now['round']>; tone: ChipTone; words?: boolean }) {
  const said = NOW_WORDS.round(round.at, round.of);
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <Marked said={said}>
        <span
          data-pips={`${round.at}/${round.of}`}
          role="img"
          aria-label={said}
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the keyboard opens the mark's tooltip by focusing it
          tabIndex={0}
          className={cn('inline-flex shrink-0 gap-[3px]', focusRing())}
        >
          {Array.from({ length: round.of }, (_, i) => (
            <i
              key={i}
              className={cn(
                'block size-1.5',
                i < round.at ? (tone === 'yours' ? 'bg-yours' : 'bg-alive') : 'bg-surface-container-highest',
              )}
            />
          ))}
        </span>
      </Marked>
      {words && <span className="text-body-medium text-on-surface-variant">{said}</span>}
    </span>
  );
}

/**
 * The step's budget as a ring of what it spent of its cap, in money's hue, and in red with its words once it is past its cap; with
 * `words`, what it spent of its cap beside it, in money's ink.
 */
export function Ring({ budget, words = false }: { budget: NonNullable<Now['budget']>; words?: boolean }) {
  const round = 2 * Math.PI * 5;
  const share = Math.max(0, Math.min(1, budget.spent / budget.cap));
  const said = NOW_WORDS.ring(dollars(budget.spent), budget.capSaid);
  return (
    <span data-budget-ring={budget.over ? 'over' : 'under'} className="inline-flex shrink-0 items-center gap-1.5">
      <Marked said={said}>
        <svg
          data-ring
          width="14"
          height="14"
          viewBox="0 0 14 14"
          role="img"
          aria-label={said}
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the keyboard opens the ring's tooltip by focusing it
          tabIndex={0}
          className={cn('rounded-full', focusRing())}
        >
          <circle cx="7" cy="7" r="5" fill="none" strokeWidth="2.4" className="stroke-surface-container-highest" />
          <circle
            cx="7"
            cy="7"
            r="5"
            fill="none"
            strokeWidth="2.4"
            strokeDasharray={`${(share * round).toFixed(2)} ${round.toFixed(2)}`}
            transform="rotate(-90 7 7)"
            className={budget.over ? 'stroke-failure' : 'stroke-money'}
          />
        </svg>
      </Marked>
      {budget.over ? (
        <span className={cn('text-body-small', ink.failure)}>{NOW_WORDS.over(budget.capSaid)}</span>
      ) : (
        words && (
          <span data-ring-words className={cn('font-mono text-body-small whitespace-nowrap', ink.money)}>
            {dollars(budget.spent)} of {budget.capSaid}
          </span>
        )
      )}
    </span>
  );
}

/** How many runs of the surface wait on this one: a fan and the count, in plain ink. */
export function Fan({ count, className }: { count: number; className?: string }) {
  const said = NOW_WORDS.waitedBy(count);
  return (
    <Marked said={said}>
      <span
        data-waited-by={count}
        aria-label={said}
        role="img"
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the keyboard opens the fan's tooltip by focusing it
        tabIndex={0}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 font-mono text-body-small text-on-surface-variant',
          focusRing(),
          className,
        )}
      >
        <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
          <path d="M0.5,5 L4.5,5 L11.5,1 M4.5,5 L11.5,5 M4.5,5 L11.5,9" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        {count}
      </span>
    </Marked>
  );
}

/**
 * The few words of what a run waits for (`nowOf`'s words), in its tone's ink; a run they name is its mark (`RunMark`), found among the
 * surface's runs (`among`). `title` says whole what a card cuts to its line.
 */
export function Words({
  words,
  tone,
  among,
  title,
  className,
}: {
  words: readonly NowPart[];
  tone: ChipTone;
  among: readonly NamedRun[];
  title?: string;
  className?: string;
}) {
  if (words.length === 0) return null;
  return (
    <span data-now-words title={title} className={cn('min-w-0 text-body-medium', WORDS_INK[tone], className)}>
      {words.map((part, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {typeof part === 'string' ? part : <RunMark id={part.run} run={among.find((run) => run.id === part.run)} />}
        </span>
      ))}
    </span>
  );
}
