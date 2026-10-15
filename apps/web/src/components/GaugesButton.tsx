import { useQuery } from '@tanstack/react-query';
import { Gauge, TriangleAlert } from 'lucide-react';
import { IconButton } from '@/components/ui/ds';
import { daemonQuery, quotaQuery } from '@/lib/api';
import type { Bar } from '@/lib/bar';
import type { FeedStatus } from '@/lib/feed';
import { type DaemonTone, daemonDot, quotaShort } from '@/lib/footer';
import { useBar } from '@/lib/useBar';
import { useNow } from '@/lib/useNow';

/** What the button opens in the floating bar: the machine's gauges, whole. */
const GAUGES: Bar = { kind: 'gauges' };

/** The colour of the daemon's dot, by its tone. */
const DOT: Record<DaemonTone, string> = {
  ok: 'bg-alive',
  warn: 'bg-yours',
  down: 'bg-failure',
  reading: 'bg-muted-foreground/40',
};

/**
 * The top bar's gauges button: a gauge with a dot in the daemon's tone at its corner, the api's own standing as the store's daemon
 * (`GET /api/daemon`), and beside it a mark in money while the quota nears its limit (`quotaShort`, `GET /api/quota`); its name says
 * both. A press opens the machine's gauges in the floating bar (`GaugesBar`) — the daemon, the feed (`feed`, carried as `data-feed`),
 * what is at work, the quota and the version — and pressed again closes them.
 */
export function GaugesButton({ feed }: { feed: FeedStatus }) {
  const now = new Date(useNow(30_000));
  const daemon = useQuery(daemonQuery);
  const quota = useQuery(quotaQuery);
  const { open, toggle } = useBar();
  const dot = daemonDot(daemon.data, daemon.error, now);
  const short = quotaShort(quota.data, quota.error, now);
  const name = `This machine: daemon ${dot.word}${short.marked ? ', quota near its limit' : ''}`;
  return (
    <span
      data-gauges-button
      data-feed={feed}
      data-daemon-dot={dot.kind}
      data-tone={dot.tone}
      data-quota-short={short.text}
      data-marked={short.marked ? '' : undefined}
      title={dot.title}
      className="relative inline-flex shrink-0 items-center"
    >
      <IconButton
        variant="standard"
        icon={Gauge}
        aria-label={name}
        aria-expanded={open?.kind === 'gauges'}
        onPress={() => toggle(GAUGES)}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute top-1.5 right-1.5 size-2.5 rounded-full ring-2 ring-surface ${DOT[dot.tone]}`}
      />
      {short.marked && <TriangleAlert aria-hidden data-quota-mark className="pointer-events-none size-4 text-money" />}
    </span>
  );
}
