import { Reading, ReadingLines } from '@/components/look';
import { Skeleton } from '@/components/ui/ds';

/** The items each kind of the library is drawn with while it is read: skills, agents, MCP servers, workflows. */
const KINDS_READ = [3, 2, 2, 1];

/**
 * The Library page while the store's library is read: its opening lines, then each kind's heading over its items, an item its name, where
 * it is from and the factories that use it. Shown at once: the router holds a pending page back a second already.
 */
export function LibraryReading() {
  return (
    <Reading label="Reading the store's library…" at="now" className="flex flex-col gap-8">
      <ReadingLines widths={['w-full', 'w-2/3']} className="text-body-medium" />
      {KINDS_READ.map((items, at) => (
        <div key={at} className="flex flex-col gap-2">
          <Skeleton className="w-28 text-title-medium" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: items }, (_, item) => (
              <div key={item} className="flex items-center gap-2 text-body-medium">
                <Skeleton className="w-32" />
                <Skeleton shape="rectangle" className="h-5 w-24 rounded-shape-full" />
                <Skeleton className="w-40" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Reading>
  );
}
