import type { ReactNode } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { CutFrame, CutTag, StatTile, Sticker } from '@/components/look';
import { Avatar, Body, Label, Meter, Tag } from '@/components/ui/ds';
import { ceilingsQuery, daemonQuery, factoriesQuery, type Quota, type QuotaWindow, quotaQuery, runsQuery } from '@/lib/api';
import { tokensBreakdown } from '@/lib/breakdown';
import { type DaemonDot, type DaemonTone, daemonDot } from '@/lib/footer';
import { lastWords } from '@/lib/quota';
import { dayStartOf, dollars, quotaLineOf, readoutOf, type Strip, stripOf } from '@/lib/strip';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';

/** The daemon's tag colour by its tone: alive while it ticks, neutral while read or warned of, failure when nothing ticks. */
const DAEMON_TAG: Record<DaemonTone, 'secondary' | 'neutral' | 'error'> = {
  ok: 'secondary',
  warn: 'neutral',
  reading: 'neutral',
  down: 'error',
};

/** A small mono figure, in the muted ink. */
const FIGURE = 'shrink-0 font-mono text-body-small whitespace-nowrap text-on-surface-variant';

/**
 * The Overview's strip, above the factories' canvas: the factories' day, the agents at work and the quota, three cut frames in one row
 * that never wraps from `lg` up, each narrowing into it, and stacked below it. It counts the factory in view (`factory`), or every
 * factory, off the whole list (`stripOf`); the caps, the daemon and the quota are the machine's.
 */
export function OverviewStrip({ factory }: { factory?: string }) {
  const now = useNow(30_000);
  const { data: runs } = useSuspenseQuery(runsQuery);
  const { data: factories } = useSuspenseQuery(factoriesQuery);
  const ceilings = useQuery(ceilingsQuery);
  const daemon = useQuery(daemonQuery);
  const quota = useQuery(quotaQuery);
  const strip = stripOf({ runs, factories, ceilings: ceilings.data, now, dayStart: dayStartOf(now), factory });
  return (
    <StripView
      strip={strip}
      dot={daemonDot(daemon.data, daemon.error, new Date(now))}
      quota={quota.data}
      quotaError={quota.error}
      now={now}
    />
  );
}

/** The strip drawn from its numbers, the daemon's dot and the quota as read, at `now`. */
export function StripView({
  strip,
  dot,
  quota,
  quotaError,
  now,
}: {
  strip: Strip;
  dot: DaemonDot;
  quota: Quota | undefined;
  quotaError: Error | null;
  now: number;
}) {
  return (
    <section aria-label="Kept in view" data-overview-strip className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap">
      <Slot basis="lg:flex-[1_1_640px]">
        <Today strip={strip} dot={dot} />
      </Slot>
      <Slot basis="lg:flex-[1_1_210px]" hue="alive">
        <Agents strip={strip} />
      </Slot>
      <Slot basis="lg:flex-[1_1_280px]">
        <QuotaFrame quota={quota} error={quotaError} now={now} />
      </Slot>
    </section>
  );
}

/** One frame's room in the row: its asked width, from which it narrows, and its cut frame. */
function Slot({ basis, hue = 'none', children }: { basis: string; hue?: 'none' | 'alive'; children: ReactNode }) {
  return (
    <div data-strip-frame className={cn('flex min-w-0', basis)}>
      <CutFrame hue={hue} size={24} className="h-full w-full">
        {children}
      </CutFrame>
    </div>
  );
}

/** A frame's heading, in small caps. */
function Heading({ children }: { children: ReactNode }) {
  return (
    <Label component="span" size="medium" className="min-w-0 truncate uppercase">
      {children}
    </Label>
  );
}

/**
 * Your factories · today: the six stickers, Spent's with a preview of today's tokens by kind, what is at work against its caps, and the
 * daemon's word.
 */
function Today({ strip, dot }: { strip: Strip; dot: DaemonDot }) {
  return (
    <div data-strip="today" className="flex flex-col gap-2.5 pt-3 pr-5 pb-3.5 pl-[18px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Heading>Your factories · today</Heading>
        <span
          data-strip-readout
          title="Runs in flight and sessions at work, against the caps this machine runs with."
          className={cn('ml-auto', FIGURE)}
        >
          {readoutOf(strip)}
        </span>
        <CutTag>
          <Tag data-strip-daemon={dot.kind} title={dot.title} variant="tonal" color={DAEMON_TAG[dot.tone]} className="uppercase">
            {dot.word}
          </Tag>
        </CutTag>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Sticker hue="yours" label="Wait on you">
          {strip.waitsOnYou}
        </Sticker>
        <Sticker hue="alive" label="In flight">
          {strip.inFlight}
        </Sticker>
        <Sticker hue="grey" label="Landed">
          {strip.landed}
        </Sticker>
        <StatTile
          hue="money"
          label="Spent"
          value={dollars(strip.spentUsd)}
          breakdown={strip.spentTokens && tokensBreakdown(strip.spentTokens, `${dollars(strip.spentUsd)} today`)}
        />
        <Sticker hue="grey" label="Per landing">
          {dollars(strip.perLanding)}
        </Sticker>
        <Sticker hue="failure" label="Failed">
          {strip.failed}
        </Sticker>
      </div>
    </div>
  );
}

/** Agents at work: how many of those hired, and a row for each step at work, cut short, never wrapped. */
function Agents({ strip }: { strip: Strip }) {
  const { count, hired } = strip.agents;
  return (
    <div data-strip="agents" className="flex flex-col gap-2 px-[18px] py-3">
      <div className="flex items-center gap-3">
        <Heading>Agents at work</Heading>
        <span data-strip-agents className={cn('ml-auto', FIGURE)}>
          {hired === null ? count : `${count} OF ${hired}`}
        </span>
      </div>
      {strip.rows.map((row) => {
        const words = `${row.agent} · ${row.step} · ${row.title}`;
        return (
          <div key={`${row.run}/${row.step}`} data-agent-row className="flex items-center gap-2.5">
            <Avatar
              size={24}
              alt={row.agent}
              fallback={row.agent.charAt(0).toUpperCase()}
              className="shrink-0 bg-secondary-container text-on-secondary-container"
            />
            <span data-agent-words className="min-w-0 flex-1 truncate" title={words}>
              <Body component="span" size="small">
                {words}
              </Body>
            </span>
            <span className={FIGURE}>{row.atWork}</span>
          </div>
        );
      })}
      {strip.more > 0 && (
        <Body data-agents-more size="small" colorRole="on-surface-variant">
          and {strip.more} more
        </Body>
      )}
      {strip.rows.length === 0 && (
        <Body size="small" colorRole="on-surface-variant">
          No agent at work.
        </Body>
      )}
    </div>
  );
}

/** A window's label as a meter says it, its first letter a capital. */
const meterLabel = (w: QuotaWindow): string => w.label.charAt(0).toUpperCase() + w.label.slice(1);

/**
 * The quota of this machine: a meter in money for each window, `PAST 80%` once one is used past the mark, and when it runs out and
 * resets. A reading that is not fresh says why, with the last good one's meters under it and when it was.
 */
function QuotaFrame({ quota, error, now }: { quota: Quota | undefined; error: Error | null; now: number }) {
  const fresh = quota?.state === 'fresh';
  const windows = fresh ? quota.windows : (quota?.last?.windows ?? []);
  const marked = fresh && quota.windows.some((w) => w.marked && !w.reset);
  const line = quotaLineOf(windows, now);
  const last = quota && !fresh ? lastWords(quota, new Date(now)) : null;
  return (
    <div data-strip="quota" data-quota-state={quota?.state} className="flex flex-col gap-2.5 px-[18px] py-3">
      <div className="flex items-center gap-3">
        <Heading>Quota · this machine</Heading>
        {marked && (
          <span className="ml-auto">
            <CutTag>
              <Tag data-quota-past variant="tonal" color="tertiary" className="uppercase">
                Past {quota.markAt}%
              </Tag>
            </CutTag>
          </span>
        )}
      </div>
      {error && (
        <Body size="small" className="text-failure">
          The quota could not be read: {error.message}
        </Body>
      )}
      {quota && !fresh && (
        <Body size="small" colorRole="on-surface-variant">
          {quota.said}
          {last && ` The last reading, ${last.asOf}:`}
        </Body>
      )}
      {windows.map((w) => (
        <Meter key={w.key} label={meterLabel(w)} value={w.usedPercentage} showValue color="tertiary" />
      ))}
      {fresh && line && (
        <Body data-quota-line component="span" size="small" className="text-money">
          {line.runsOut && <span className="whitespace-nowrap">{line.runsOut} ·</span>}{' '}
          <span className="whitespace-nowrap">{line.resets}</span>
        </Body>
      )}
    </div>
  );
}
