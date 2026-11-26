import { Check, Copy, type LucideIcon } from 'lucide-react';
import { Body, Focusable, IconButton, TooltipTrigger } from '@/components/ui/ds';
import { HeldTooltip } from './HeldTooltip';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { ink } from '@/lib/meaning';
import { useCopy, type CopySaid } from '@/lib/useCopy';

/** What the copy control says to a screen reader once pressed. */
const SAID: Record<CopySaid, string> = { copy: '', copied: 'Copied', failed: 'Could not copy: select the id and copy it' };

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

/** How the id is drawn: the mono face, on one line, quiet. */
const ID = 'font-mono whitespace-nowrap text-on-surface-variant';

/**
 * A run's id, in the mono face, with the control that copies it: the kit's smallest icon button, its glyph twelve pixels across and
 * seven from the id, which answers over 48 by 48 pixels where nothing around it clips or stands over it. Pressed, it says so for a
 * moment (`data-copied`), or that it could not. `short` shows the id's last four characters, quiet beside a run's title, which take
 * the hue of a session at work for that moment, and the whole id in the kit's tooltip, on hover and on focus; what is copied is always
 * the whole id. `room` is how many characters wide the id is drawn at least, so that ids of different lengths given the same room hold
 * their controls, and what follows, at one edge.
 */
export function CopyId({ id, short = false, room }: { id: string; short?: boolean; room?: number }) {
  const { said, copy } = useCopy(id);
  const copied = said === 'copied';
  return (
    <span data-copy-id={id} data-copied={copied || undefined} className="inline-flex items-center">
      {short ? (
        <TooltipTrigger delay={300}>
          <Focusable>
            <Body
              size="small"
              component="span"
              data-run-id
              role="img"
              aria-label={id.slice(-4)}
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the keyboard opens the whole id's tooltip by focusing it
              tabIndex={0}
              style={room ? { minWidth: `${room}ch` } : undefined}
              className={cn(ID, copied && ink.alive, focusRing())}
            >
              {id.slice(-4)}
            </Body>
          </Focusable>
          <HeldTooltip>{id}</HeldTooltip>
        </TooltipTrigger>
      ) : (
        <Body size="small" component="span" data-run-id style={room ? { minWidth: `${room}ch` } : undefined} className={ID}>
          {id}
        </Body>
      )}
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
