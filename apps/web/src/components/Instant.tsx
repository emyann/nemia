import type { ComponentProps } from 'react';
import { instantWhole, instantWords } from '../lib/instant';
import { useNow } from '../lib/useNow';

/**
 * An instant on a page: a `<time>` that says it in the page's words (`instantWords`, against a clock read every minute) and, on
 * hover, whole (`instantWhole`), after `about` and a colon where the caller says what the instant is of. Takes `at`, an ISO instant,
 * and whatever else a `<time>` takes but its `dateTime`, its `title` and its children.
 */
export function Instant({
  at,
  about,
  ...rest
}: { at: string; about?: string } & Omit<ComponentProps<'time'>, 'dateTime' | 'title' | 'children'>) {
  const now = useNow(60_000);
  const date = new Date(at);
  const whole = instantWhole(date);
  return (
    <time dateTime={at} title={about ? `${about}: ${whole}` : whole} {...rest}>
      {instantWords(date, new Date(now))}
    </time>
  );
}
