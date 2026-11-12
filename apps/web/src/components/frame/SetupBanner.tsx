import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, X } from 'lucide-react';
import { TextLink } from '@/components/look';
import { IconButton } from '@/components/ui/ds';
import { missingSaid, runsWait } from 'objects';
import { readinessQuery } from '@/lib/api/readiness';

/** The close glyph, as the kit's icon button takes one. */
const CLOSE = ({ className }: { size?: number; className?: string }) => <X size={14} className={className} />;

/**
 * Over every page but Setup's own, under the top bar: that a run waits on a piece the server misses (`objects`' `runsWait`: a missing
 * piece that costs `run`), what the missing pieces cost as each declares it (`missingSaid`, "before a factory's first run" only where
 * no run was ever started), and a link to Setup, where each says its fix. A piece advised (linger, the bind), which stops no run, raises
 * none: Setup lists it. Nothing while no run waits, before the read is answered or where it could not be. Dismissed, it stays away for
 * the rest of this visit. Drawn in what waits on a person: a missing piece waits on them.
 */
export function SetupBanner({ path }: { path: string }) {
  const readiness = useQuery(readinessQuery);
  const [dismissed, setDismissed] = useState(false);
  const read = readiness.data;
  if (dismissed || read === undefined || !runsWait(read) || path === '/setup') return null;
  const missing = read.pieces.filter((piece) => piece.state === 'missing').length;
  return (
    <div
      role="status"
      data-setup-banner={missing}
      className="flex items-center gap-2 overflow-hidden border-b border-outline-variant py-1 pr-2 pl-4 text-body-small text-on-surface"
    >
      <CircleAlert aria-hidden className="size-3.5 shrink-0 text-yours" />
      <span className="min-w-0 flex-1">
        Missing: {missingSaid(read)}.{' '}
        <TextLink to="/setup" className="underline">
          See Setup
        </TextLink>
      </span>
      <IconButton size="xsmall" variant="standard" icon={CLOSE} aria-label="Hide until the next visit" onPress={() => setDismissed(true)} />
    </div>
  );
}
