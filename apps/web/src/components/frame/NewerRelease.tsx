import { useQuery } from '@tanstack/react-query';
import { ArrowUpCircle } from 'lucide-react';
import { versionQuery } from '@/lib/api/version';
import { newerReleaseWords } from '@/lib/footer';

/**
 * Over every page, under the top bar: that a newer release of Nemia is out, and where to upgrade, where the api read one newer than the
 * release it runs (`newerReleaseWords`); nothing otherwise, nor before the version is read or where it could not be. A note, in
 * the muted ink of rest: nothing waits on it.
 */
export function NewerRelease() {
  const version = useQuery(versionQuery);
  const words = version.data ? newerReleaseWords(version.data) : null;
  if (!words) return null;
  return (
    <p
      data-newer-release={version.data?.latest?.version}
      className="flex items-center gap-1.5 border-b border-outline-variant px-4 py-1.5 text-body-small text-muted-foreground"
    >
      <ArrowUpCircle aria-hidden className="size-3.5 shrink-0" />
      <span>{words}</span>
    </p>
  );
}
