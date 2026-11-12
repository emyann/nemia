import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, X } from 'lucide-react';
import { TextLink } from '@/components/look';
import { IconButton } from '@/components/ui/ds';
import { readinessQuery } from '@/lib/api/readiness';

/** The close glyph, as the kit's icon button takes one. */
const CLOSE = ({ className }: { size?: number; className?: string }) => <X size={14} className={className} />;

/**
 * Over every page but Setup's own, under the top bar: that the server misses a piece it needs (the readiness read has one `missing`),
 * how many, and a link to Setup, where each says its fix; nothing while everything is in place, before the read is answered or where it
 * could not be. Dismissed, it stays away for the rest of this visit. Drawn in what waits on a person: a missing piece waits on them.
 */
export function SetupBanner({ path }: { path: string }) {
  const readiness = useQuery(readinessQuery);
  const [dismissed, setDismissed] = useState(false);
  const missing = readiness.data?.pieces.filter((piece) => piece.state === 'missing').length ?? 0;
  if (dismissed || missing === 0 || path === '/setup') return null;
  return (
    <div
      role="status"
      data-setup-banner={missing}
      className="flex items-center gap-2 border-b border-outline-variant py-1 pr-1 pl-4 text-body-small text-on-surface"
    >
      <CircleAlert aria-hidden className="size-3.5 shrink-0 text-yours" />
      <span className="min-w-0 flex-1">
        This server misses {missing === 1 ? 'a piece' : `${missing} pieces`} it needs before a factory's first run:{' '}
        <TextLink to="/setup" className="underline">
          see Setup
        </TextLink>
      </span>
      <IconButton size="xsmall" variant="standard" icon={CLOSE} aria-label="Hide until the next visit" onPress={() => setDismissed(true)} />
    </div>
  );
}
