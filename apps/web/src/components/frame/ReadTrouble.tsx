/**
 * The one line every page says where a read failed (`troubleLine`, `src/lib/api/read.ts`): what it could not read and why, by the kind of
 * failure, which the line is marked by (`data-read-trouble`): the api's own words where it refused, the answer's message where it answered
 * what this board does not read, and where nothing answered, that Nemia's api did not and to reload once it does.
 */
import type { ReactNode } from 'react';
import { troubleLine, troubleOf } from '@/lib/api/read';
import { cn } from '@/lib/utils';
import { Body } from '@/components/ui/ds';

/**
 * The line a page says where reading `what` (as a person names it: `the agents`, `the run r-1`) failed with `error`, `then` after it:
 * what the trouble does not say, the page's own next step. `size` is its body role's, medium by default. In the failure's ink by
 * default; `className` keeps a page's own ink or room, merged by `cn`.
 */
export function ReadTrouble({
  what,
  error,
  then,
  size = 'medium',
  className,
}: {
  what: string;
  error: unknown;
  then?: ReactNode;
  size?: 'small' | 'medium';
  className?: string;
}) {
  return (
    <Body size={size} data-read-trouble={troubleOf(error).kind} className={cn('text-failure', className)}>
      {troubleLine(what, error)}
      {then ? <> {then}</> : null}
    </Body>
  );
}
