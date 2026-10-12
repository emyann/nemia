import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { IconButton } from '@/components/ui/ds';
import { cn } from '@/components/ui/ds/utils';
import { edged } from '@/lib/meaning';

/** What the copy control says to a screen reader once pressed. */
const SAID = { copy: '', copied: 'Copied', failed: 'Could not copy: select the id and copy it' } as const;

/** The box the look draws a short id in: a hairline around it, six pixels of room each side, on a line of eighteen. */
const BOXED = 'border border-outline-variant px-1.5 py-px';

/**
 * A run's id, in the mono face, with the control that copies it: the kit's smallest icon button, which answers over 48 by 48 pixels
 * where nothing around it clips. Pressed, it says so for a moment (`data-copied`), or that it could not. `short` shows the id's last
 * four characters in a box, which takes the hue of a session at work for that moment, and the whole id in its title; what is copied
 * is always the whole id.
 */
export function CopyId({ id, short = false }: { id: string; short?: boolean }) {
  const [said, setSaid] = useState<keyof typeof SAID>('copy');
  useEffect(() => {
    if (said === 'copy') return;
    const timer = setTimeout(() => setSaid('copy'), 1_600);
    return () => clearTimeout(timer);
  }, [said]);
  const copy = () => {
    const written = navigator.clipboard ? navigator.clipboard.writeText(id) : Promise.reject(new Error('no clipboard'));
    written.then(
      () => setSaid('copied'),
      () => setSaid('failed'),
    );
  };
  const copied = said === 'copied';
  return (
    <span data-copy-id={id} data-copied={copied || undefined} className="inline-flex items-center gap-1">
      <span
        data-run-id
        title={short ? id : undefined}
        className={cn(
          'font-mono text-body-small whitespace-nowrap text-on-surface-variant',
          short && BOXED,
          short && copied && edged.alive,
        )}
      >
        {short ? id.slice(-4) : id}
      </span>
      <IconButton size="xsmall" icon={copied ? Check : Copy} aria-label={`Copy the run id ${id}`} onPress={copy} />
      <span role="status" className="sr-only">
        {SAID[said]}
      </span>
    </span>
  );
}
