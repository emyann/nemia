import { useLinkRefused } from '@/lib/linkClaim';

/** What a refused link's status says: one used or lapsed (409), or no link this Nemia made (404, or anything else). */
const WHY: Record<'used' | 'unknown', string> = {
  used: 'This sign-in link was used already or has lapsed: a link signs in one browser, once, within ten minutes.',
  unknown: 'This sign-in link is no link this Nemia made.',
};

/**
 * That the first-visit link this page was opened on was refused (`useLinkRefused`), in the board's words and the api's, with what to do
 * next: the server's shell prints a new one. Nothing where no link was refused.
 */
export function LinkRefusal() {
  const refused = useLinkRefused();
  if (refused === null) return null;
  return (
    <div role="alert" data-link-refused={refused.status === 409 ? 'used' : 'unknown'} className="flex flex-col gap-1">
      <p className="text-body-medium text-failure">{WHY[refused.status === 409 ? 'used' : 'unknown']}</p>
      <p className="text-body-small break-words text-muted-foreground">
        Ask the server's shell for a new link, or sign in below. The api said: {refused.message}
      </p>
    </div>
  );
}
