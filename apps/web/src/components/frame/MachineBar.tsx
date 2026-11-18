import { useQuery } from '@tanstack/react-query';
import { Pressable } from '@/components/ui/ds';
import { daemonQuery } from '@/lib/api/daemon';
import { pauseQuery } from '@/lib/api/pause';
import { quotaQuery } from '@/lib/api/quota';
import { openRunsQuery } from '@/lib/api/runs';
import { versionQuery } from '@/lib/api/version';
import type { Bar } from '@/lib/bar';
import type { FeedStatus } from '@/lib/feed';
import { atWork, atWorkWords, type DaemonTone, daemonDot, feedWords, quotaShort, tickWord, versionWords } from '@/lib/footer';
import { ink } from '@/lib/meaning';
import type { Presence } from '@/lib/presence';
import { useBar } from '@/lib/useBar';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';
import { useNemiaPresence } from '../nemia/useNemiaPresence';
import { PauseButton } from './PauseButton';

/** What the line opens in the frame's side sheet: the machine's gauges, whole. */
const GAUGES: Bar = { kind: 'gauges' };

/** The colour of the daemon's dot, by its tone. */
const DOT: Record<DaemonTone, string> = {
  ok: 'bg-alive',
  warn: 'bg-yours',
  down: 'bg-failure',
  reading: 'bg-muted-foreground/40',
};

/**
 * Nemia's session in a word: down, resting, answering, asking the person, holding an unsent message, or here.
 *
 * @param presence her presence, as her face reads it
 */
export function presenceWord(presence: Presence): string {
  if (presence.down) return 'Nemia down';
  if (presence.resting) return 'Nemia resting';
  if (presence.answering) return 'Nemia answering';
  if (presence.asksWaiting > 0) return `Nemia asks ${presence.asksWaiting}`;
  if (presence.notSent) return 'Nemia, not sent';
  return 'Nemia here';
}

/**
 * The machine bar, at the window's foot across the whole frame, one line as tall as `--frame-foot` on `surface-container`: the machine in
 * short, the kit's `Pressable`, the line pressed whole, that opens and closes its gauges in the side sheet (`GaugesBar`, `?bar=gauges`),
 * the daemon's state said on hover — the daemon's dot and whether the store ticks or is paused, the runs and sessions at work, the feed
 * (`feed`), Nemia's session at the page at `path`, the quota (in money while it nears its limit) and the version the api runs — then Pause
 * every factory (`PauseButton`).
 */
export function MachineBar({ path, feed }: { path: string; feed: FeedStatus }) {
  const now = new Date(useNow(30_000));
  const daemon = useQuery(daemonQuery);
  const quota = useQuery(quotaQuery);
  const runs = useQuery(openRunsQuery());
  const version = useQuery(versionQuery);
  const pause = useQuery(pauseQuery);
  const presence = useNemiaPresence(path);
  const { open, toggle } = useBar();
  const dot = daemonDot(daemon.data, daemon.error, now);
  const short = quotaShort(quota.data, quota.error, now);
  const tick = tickWord(dot, Boolean(pause.data?.pause));
  const parts = [
    tick,
    runs.data ? atWorkWords(atWork(runs.data)).text : undefined,
    `feed ${feedWords(feed).word}`,
    presenceWord(presence),
  ].filter((part) => part !== undefined);
  return (
    <footer
      aria-label="The machine"
      data-machine-bar
      className="sticky bottom-0 z-40 flex h-(--frame-foot) w-full shrink-0 items-center gap-2 bg-surface-container px-3 font-mono text-body-small text-on-surface-variant"
    >
      <Pressable
        data-gauges-button
        data-feed={feed}
        data-daemon-dot={dot.kind}
        data-tone={dot.tone}
        data-quota-short={short.text}
        data-marked={short.marked ? '' : undefined}
        aria-expanded={open?.kind === 'gauges'}
        aria-label={`This machine: daemon ${parts.join(', ')}, quota ${short.text}${short.marked ? ', near its limit' : ''}`}
        onPress={() => toggle(GAUGES)}
        className="flex h-full min-w-0 flex-1 overflow-hidden"
      >
        <span title={dot.title} className="flex h-full min-w-0 flex-1 items-center gap-2 px-2">
          <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[dot.tone]}`} />
          <span className="min-w-0 truncate">{parts.join(' · ')}</span>
          <span aria-hidden>·</span>
          <span data-quota-line data-quota-mark={short.marked ? '' : undefined} className={cn('shrink-0', short.marked && ink.money)}>
            {short.text}
          </span>
          {version.data && (
            <span data-version-line className="ml-auto shrink-0 max-md:hidden">
              {versionWords(version.data).text}
            </span>
          )}
        </span>
      </Pressable>
      <PauseButton />
    </footer>
  );
}
