/**
 * The frame's floating bar for the machine's gauges, which the top bar's gauges button opens (`GaugesButton`): each of its facts whole —
 * whether a daemon ticks the store and how to start one (`DaemonLine`), whether the board follows the feed, what is at work, the quota
 * (`QuotaLine`) and the version. They are the machine's, not a page's, so the bar has no Open (`barOpens`).
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { daemonQuery, openRunsQuery, quotaQuery, versionQuery } from '@/lib/api';
import type { FeedStatus } from '@/lib/feed';
import { atWork, atWorkWords, feedWords, versionWords } from '@/lib/footer';
import { DaemonLine } from './DaemonLine';
import { FloatingBar } from './FloatingBar';
import { QuotaLine } from './QuotaLine';

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
    <FloatingBar title="This machine" description="The daemon, the feed, what is at work, the quota and the version, for every factory.">
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
          <p data-at-work-sentence className="text-body-medium">
            {runs.data
              ? atWorkWords(atWork(runs.data)).title
              : runs.error
                ? `The runs could not be read: ${runs.error.message}`
                : 'Reading the runs…'}
          </p>
        </Gauge>
        <Gauge name="Quota">
          <QuotaLine quota={quota.data} error={quota.error} />
        </Gauge>
        <Gauge name="Version">
          <p data-version-sentence className="text-body-medium">
            {version.data
              ? `${versionWords(version.data).title}, as the api serving this board answers it.`
              : version.error
                ? `The version could not be read: ${version.error.message}`
                : 'Reading the version…'}
          </p>
        </Gauge>
      </div>
    </FloatingBar>
  );
}
