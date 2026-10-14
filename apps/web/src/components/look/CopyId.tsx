import { useEffect, useState } from 'react';
import { Check, Copy, type LucideIcon } from 'lucide-react';
import { IconButton } from '@/components/ui/ds';
import { cn } from '@/components/ui/ds/utils';
import { edged } from '@/lib/meaning';

/** What the copy control says to a screen reader once pressed. */
const SAID = { copy: '', copied: 'Copied', failed: 'Could not copy: select the id and copy it' } as const;

/** The box the look draws a short id in: a hairline around it, six pixels of room each side, on a line of eighteen. */
const BOXED = 'border border-outline-variant px-1.5 py-px';

/** How wide and tall the control's glyph is drawn, in pixels, whatever size the kit's button hands it. */
const GLYPH = 12;

/** `Icon` as the kit's icon button takes one, drawn `GLYPH` across whatever `size` it is handed. */
const glyphOf = (Icon: LucideIcon) =>
  function Glyph({ className }: { size?: number; className?: string }) {
    return <Icon data-copy-glyph size={GLYPH} className={className} />;
  };

const [COPY, COPIED] = [glyphOf(Copy), glyphOf(Check)];

/**
 * The control pulled in around its glyph: three pixels over the id, so the glyph stands seven from it, and eight up and down, so the
 * line that holds it is as tall as the id's own. Its box and its target keep their size, and reach over what is around it.
 */
const PULLED = '-my-2 -ml-0.75';

/**
 * A run's id, in the mono face, with the control that copies it: the kit's smallest icon button, its glyph twelve pixels across and
 * seven from the id, which answers over 48 by 48 pixels where nothing around it clips or stands over it. Pressed, it says so for a
 * moment (`data-copied`), or that it could not. `short` shows the id's last four characters in a box, which takes the hue of a session
 * at work for that moment, and the whole id in its title; what is copied is always the whole id. `room` is how many characters wide the
 * id is drawn at least, so that ids of different lengths given the same room hold their controls, and what follows, at one edge.
 */
export function CopyId({ id, short = false, room }: { id: string; short?: boolean; room?: number }) {
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
    <span data-copy-id={id} data-copied={copied || undefined} className="inline-flex items-center">
      <span
        data-run-id
        title={short ? id : undefined}
        style={room ? { minWidth: `${room}ch` } : undefined}
        className={cn(
          'font-mono text-body-small whitespace-nowrap text-on-surface-variant',
          short && BOXED,
          short && copied && edged.alive,
        )}
      >
        {short ? id.slice(-4) : id}
      </span>
      <IconButton
        size="xsmall"
        variant="standard"
        icon={copied ? COPIED : COPY}
        aria-label={`Copy the run id ${id}`}
        onPress={copy}
        className={PULLED}
      />
      <span role="status" className="sr-only">
        {SAID[said]}
      </span>
    </span>
  );
}
