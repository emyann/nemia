import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { PauseButton } from '@/components/PauseButton';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { daemonQuery, openRunsQuery, quotaQuery, versionQuery } from '@/lib/api';
import type { Bar } from '@/lib/bar';
import type { FeedStatus } from '@/lib/feed';
import { atWork, atWorkWords, type DaemonTone, daemonDot, feedWords, footerParts, quotaShort, versionWords } from '@/lib/footer';
import { useBar } from '@/lib/useBar';
import { useNow } from '@/lib/useNow';

/** What every group of the bar opens in the floating bar: the machine's gauges, whole. */
const GAUGES: Bar = { kind: 'gauges' };

/** The colour of the daemon's dot, by its tone. */
const DOT: Record<DaemonTone, string> = {
  ok: 'bg-alive',
  warn: 'bg-yours',
  down: 'bg-failure',
  reading: 'bg-muted-foreground/40',
};

/**
 * One group of the bar: a ghost button that opens the machine's gauges in the floating bar, or closes them (`useBar`'s `toggle`), its
 * words on one line cut short at about thirty characters, the whole sentence its `title`, and `data` on that line for a test to read.
 */
function Part({
  label,
  title,
  data,
  children,
}: {
  label?: string;
  title: string;
  data: Record<string, string | undefined>;
  children: ReactNode;
}) {
  const { open, toggle } = useBar();
  return (
    <Button
      variant="ghost"
      size="xs"
      aria-label={label}
      aria-expanded={open?.kind === 'gauges'}
      onPress={() => toggle(GAUGES)}
      className="min-w-0 font-normal text-muted-foreground"
    >
      <span {...data} title={title} className="flex min-w-0 max-w-[30ch] items-center gap-1.5 truncate">
        {children}
      </span>
    </Button>
  );
}

/** The bottom bar's version (`GET /api/version`): the orchestrator's, and the release serving the board (`versionWords`). */
function VersionPart() {
  const version = useQuery(versionQuery);
  const words = version.data ? versionWords(version.data) : { text: 'v…', title: version.error?.message ?? '' };
  return (
    <Part title={words.title} data={{ 'data-version': version.data?.version, 'data-release': version.data?.release?.kind }}>
      <span className="truncate">{words.text}</span>
    </Part>
  );
}

/**
 * The frame's bottom bar, across the foot of every page, `h-8`, under the rail, the sidebar and the page, its height whatever it says.
 * Left, the daemon's dot — the api's own standing as the store's daemon (`GET /api/daemon`) — the pause (`PauseButton`), and
 * whether the board follows the workflow feed (`feed`, carried as `data-feed`); in the centre, what is at work across every factory
 * (`atWork`, off `GET /api/runs-open`); at the right, the subscription's quota in short (`GET /api/quota`) and the version
 * (`GET /api/version`).
 * All of it is read from the api over HTTP. A phone keeps the daemon's dot, the pause and the quota (`footerParts`). Each group but the
 * pause opens the gauges, whole, in the floating bar (`GaugesBar`); the pause opens its own popover.
 */
export function FrameFooter({ feed }: { feed: FeedStatus }) {
  const parts = footerParts(useIsMobile());
  const now = new Date(useNow(30_000));
  const daemon = useQuery(daemonQuery);
  const quota = useQuery(quotaQuery);
  const runs = useQuery(openRunsQuery());
  const dot = daemonDot(daemon.data, daemon.error, now);
  const live = feedWords(feed);
  const short = quotaShort(quota.data, quota.error, now);
  const work = runs.data
    ? atWorkWords(atWork(runs.data))
    : { text: runs.error ? 'unread' : 'reading', title: runs.error?.message ?? '' };
  const narrow = !parts.includes('feed');

  return (
    <footer
      data-feed={feed}
      data-frame-footer
      className="sticky bottom-0 z-30 flex h-8 shrink-0 items-center gap-1 overflow-hidden border-t bg-background px-2 text-xs"
    >
      <Part
        label={narrow ? `Daemon ${dot.word}` : undefined}
        title={dot.title}
        data={{ 'data-daemon-dot': dot.kind, 'data-tone': dot.tone }}
      >
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[dot.tone]}`} />
        {!narrow && <span className="truncate">daemon {dot.word}</span>}
      </Part>
      {parts.includes('pause') && <PauseButton />}
      {parts.includes('feed') && (
        <Part title={live.title} data={{ 'data-feed-word': feed }}>
          <span className="truncate">feed {live.word}</span>
        </Part>
      )}
      <span className="flex-1" />
      {parts.includes('work') && (
        <Part title={work.title} data={{ 'data-at-work': work.text }}>
          <span className="truncate">{work.text}</span>
        </Part>
      )}
      <span className="flex-1" />
      <Part title={short.title} data={{ 'data-quota-short': short.text, 'data-marked': short.marked ? '' : undefined }}>
        {short.marked && <TriangleAlert aria-hidden className="size-3 text-money" />}
        <span className={`truncate ${short.stale ? 'text-foreground opacity-70' : short.marked ? 'text-money' : ''}`}>
          quota {short.text}
        </span>
      </Part>
      {parts.includes('version') && <VersionPart />}
    </footer>
  );
}
