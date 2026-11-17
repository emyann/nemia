/**
 * The frame's side sheet for the machine's gauges, which the machine bar opens (`MachineBar`): each of its facts whole —
 * whether a daemon ticks the store and how to start one (`DaemonLine`), whether the board follows the feed, what is at work, the quota
 * (`QuotaLine`) and the version. They are the machine's, not a page's, so the bar has no Open (`barOpens`).
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { daemonQuery } from '@/lib/api/daemon';
import { openRunsQuery } from '@/lib/api/runs';
import { quotaQuery } from '@/lib/api/quota';
import { versionQuery } from '@/lib/api/version';
import type { FeedStatus } from '@/lib/feed';
import { atWork, atWorkWords, feedWords, versionWords } from '@/lib/footer';
import { DaemonLine } from './DaemonLine';
import { BarPanel } from './BarPanel';
import { QuotaLine } from './QuotaLine';
import { Reading, ReadingLines } from '@/components/look';

/** One gauge: its name over what it says. */
function Gauge({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-label-medium text-muted-foreground">{name}</h3>
      {children}
    </section>
  );
}

/**
 * The gauges, read as the gauges button reads them: the daemon's sentence while nothing ticks the store, else the api's line for the daemon
 * that does; `feed` in words; the runs and sessions at work; the quota as the floor said it; and the version. A read that failed says so.
 */
export function GaugesBar({ feed }: { feed: FeedStatus }) {
  const daemon = useQuery(daemonQuery);
  const quota = useQuery(quotaQuery);
  const runs = useQuery(openRunsQuery());
  const version = useQuery(versionQuery);
  const ticks = daemon.data?.ticking === true;

  return (
    <BarPanel title="This machine" description="The daemon, the feed, what is at work, the quota and the version, for every factory.">
      <div data-gauges className="space-y-5">
        <Gauge name="Daemon">
          <DaemonLine daemon={daemon.data} error={daemon.error} />
          {ticks && (
            <p data-daemon-ticks className="text-body-medium">
              {daemon.data?.line}
            </p>
          )}
        </Gauge>
        <Gauge name="Feed">
          <p data-feed-sentence={feed} className="text-body-medium">
            {feedWords(feed).title}
          </p>
        </Gauge>
        <Gauge name="At work">
          {runs.data || runs.error ? (
            <p data-at-work-sentence className="text-body-medium">
              {runs.data ? atWorkWords(atWork(runs.data)).title : `The runs could not be read: ${runs.error?.message}`}
            </p>
          ) : (
            <Reading label="Reading the runs…">
              <ReadingLines widths={['w-3/4']} className="text-body-medium" />
            </Reading>
          )}
        </Gauge>
        <Gauge name="Quota">
          <QuotaLine quota={quota.data} error={quota.error} />
        </Gauge>
        <Gauge name="Version">
          {version.data || version.error ? (
            <p data-version-sentence className="text-body-medium">
              {version.data
                ? `${versionWords(version.data).title}, as the api serving this board answers it.`
                : `The version could not be read: ${version.error?.message}`}
            </p>
          ) : (
            <Reading label="Reading the version…">
              <ReadingLines widths={['w-2/3']} className="text-body-medium" />
            </Reading>
          )}
        </Gauge>
      </div>
    </BarPanel>
  );
}
