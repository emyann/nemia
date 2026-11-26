import { Body } from '@/components/ui/ds';

/**
 * Why the keeper could not trust Nemia's folder, as the api answers it (`untrusted`), with the fix its words name: her session is filed
 * only once her folder is trusted, which the keeper gives itself at each beat that owes her session, so nothing here asks a person to
 * run anything. None where the keeper's write was not refused.
 */
export function TrustLine({ untrusted }: { untrusted: string | null }) {
  if (untrusted === null) return null;
  return (
    <Body size="small" data-nemia-trust className="break-words text-failure">
      {untrusted}
    </Body>
  );
}
