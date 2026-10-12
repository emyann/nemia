import { TriangleAlert } from 'lucide-react';
import type { Daemon } from '@/lib/api';
import { daemonWords } from '@/lib/daemon';
import { useNow } from '@/lib/useNow';

/**
 * Over the Factory's floor when nothing ticks the store: why — no daemon, the api or the CLI's daemon stopped, gone, or silent past its
 * stale mark — and how to start one, so a run that waits is not read as a machine being slow. Nothing while a daemon ticks, and nothing
 * until it is read; why, when it cannot be. The CLI `ls`'s own line on hover. A row of its own under the counts, since it never fits beside
 * them. Its age moves between reads, on a clock of its own: the api is read again every minute while the feed is followed.
 */
export function DaemonLine({ daemon, error }: { daemon: Daemon | undefined; error: Error | null }) {
  const now = new Date(useNow(30_000));
  if (error) {
    return (
      <p data-daemon="error" className="max-w-3xl basis-full text-xs text-failure" title={error.message}>
        Whether a daemon ticks this store could not be read: {error.message}
      </p>
    );
  }
  if (!daemon) return null;
  const words = daemonWords(daemon, now);
  if (!words) return null;
  return (
    <p data-daemon={daemon.kind} title={daemon.line} className="max-w-3xl basis-full text-sm text-yours">
      <TriangleAlert aria-hidden className="mr-1 inline size-3.5 -translate-y-px" />
      {words.before}
      <code className="font-medium">{words.command}</code>
      {words.after}
    </p>
  );
}
