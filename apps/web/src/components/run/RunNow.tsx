import type { ComponentProps, ReactNode } from 'react';
import { Focusable, Tag, Tooltip, TooltipTrigger } from '@/components/ui/ds';
import { cn, focusRing } from '@/components/ui/ds/utils';
import type { ListedRun } from '@/lib/api/runs';
import { ink } from '@/lib/meaning';
import { dollars } from '@/lib/money';
import { CHIP_TAG, type ChipTone } from '@/lib/nowChip';
import { nowOf, type Now, type NowPart } from '@/lib/runWords';
import { NOW_WORDS } from '@/lib/words';
import { previewBar } from '../step/StepPreview';
import { CutTag, RunSteps, TextLink } from '../look';

/** The ink of NOW's words by the chip's colour: yellow where the row waits on you, red where it failed, quiet for every other. */
const WORDS_INK: Record<ChipTone, string> = {
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

/** The step's round of its rounds, as pips: one a round, lit up to the round it is on, in the chip's colour where it waits on you. */
function Pips({ round, tone }: { round: NonNullable<Now['round']>; tone: ChipTone }) {
  const said = NOW_WORDS.round(round.at, round.of);
  return (
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
            className={cn('block size-1.5', i < round.at ? (tone === 'yours' ? 'bg-yours' : 'bg-alive') : 'bg-surface-container-highest')}
          />
        ))}
      </span>
    </Marked>
  );
}

/** The step's budget as a ring of what it spent of its cap, in money's hue, and in red with its words once it is past its cap. */
function Ring({ budget }: { budget: NonNullable<Now['budget']> }) {
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
      {budget.over && <span className={cn('text-body-small', ink.failure)}>{NOW_WORDS.over(budget.capSaid)}</span>}
    </span>
  );
}

/** How many runs of the page wait on this one: a fan and the count, in plain ink. */
function Fan({ count }: { count: number }) {
  const said = NOW_WORDS.waitedBy(count);
  return (
    <Marked said={said}>
      <span
        data-waited-by={count}
        aria-label={said}
        role="img"
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the keyboard opens the fan's tooltip by focusing it
        tabIndex={0}
        className={cn('inline-flex shrink-0 items-center gap-1 font-mono text-body-small text-on-surface-variant', focusRing())}
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
 * A part of NOW's words: a word, or the run it names, a link to its page by its id's last four characters, the whole id in the kit's
 * tooltip on hover and on focus.
 */
function Part({ part }: { part: NowPart }) {
  if (typeof part === 'string') return <>{part}</>;
  return (
    <TooltipTrigger delay={300}>
      <TextLink to="/runs/$runId" params={{ runId: part.run }} data-now-run={part.run} className="font-mono text-body-medium">
        {part.run.slice(-4)}
      </TextLink>
      <Tooltip>{part.run}</Tooltip>
    </TooltipTrigger>
  );
}

/**
 * What a run does now, in marks: one chip naming the step it is on, its colour the state (`nowOf`, `chipTone`); the step's agent; its
 * round as pips; the few words of its wait, a run it names a link; and at the line's end how many of the page's runs wait on it
 * (`waitedBy`, none drawn for none) and its budget's ring, or `end` where the caller gives it. Under the line, with `rail`, the run's
 * steps (`RunSteps`), each bar a button that opens its step's card, said at `asOf`. Nothing on the line is cut: what does not fit
 * wraps.
 */
export function RunNow({
  run,
  asOf,
  waitedBy = 0,
  rail = true,
  end,
}: {
  run: ListedRun;
  asOf: Date;
  waitedBy?: number;
  rail?: boolean;
  end?: ReactNode;
}) {
  const now = nowOf(run);
  if (!now) return null;
  const tag = CHIP_TAG[now.tone];
  return (
    <span data-now={now.tone} className="flex min-w-0 flex-col gap-2">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <CutTag>
          <Tag data-now-word data-tone={now.tone} variant={tag.variant} color={tag.color} className="uppercase">
            {now.step}
          </Tag>
        </CutTag>
        {now.agent && (
          <span data-now-agent className="text-body-medium font-medium text-on-surface">
            {now.agent}
          </span>
        )}
        {now.round && <Pips round={now.round} tone={now.tone} />}
        {now.words.length > 0 && (
          <span data-now-words className={cn('text-body-medium', WORDS_INK[now.tone])}>
            {now.words.map((part, i) => (
              <span key={i}>
                {i > 0 && ' '}
                <Part part={part} />
              </span>
            ))}
          </span>
        )}
        {(waitedBy > 0 || now.budget || end) && (
          <span className="ml-auto inline-flex items-center gap-2.5">
            {waitedBy > 0 && <Fan count={waitedBy} />}
            {now.budget && <Ring budget={now.budget} />}
            {end}
          </span>
        )}
      </span>
      {rail && <RunSteps steps={run.steps} cancelled={run.cancelledAt !== null} held={run.holding != null} wrap={previewBar(run, asOf)} />}
    </span>
  );
}
