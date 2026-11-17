import { ProgressIndicator } from '@/components/ui/ds';
import { cn } from '@/components/ui/ds/utils';

/** What the kit hands an icon: its size, and the classes of its box. */
type PendingProps = {
  /** Its width and height in pixels, 20 where none is given: a small button's icon. */
  size?: number;
  /** Classes of the box that holds it. */
  className?: string;
};

/**
 * A wait that is still out, drawn small: the kit's circular `ProgressIndicator`, indeterminate, its ring in the ink of what holds it
 * (the kit draws it in `primary`, which is a filled button's own ground). It has the kit's icon shape, so a kit `Button` whose press is
 * still out takes it as its `icon` beside its label, which stays the button's name: the ring is hidden from a screen reader, the words
 * beside it saying what waits.
 */
export function Pending({ size = 20, className }: PendingProps) {
  return (
    <span aria-hidden data-pending className={cn('inline-flex shrink-0', className)}>
      <ProgressIndicator
        variant="circular"
        isIndeterminate
        aria-label="Waiting"
        size={size}
        thickness={Math.max(2, Math.round(size / 8))}
        className="[&_[data-slot=progress-active-indicator]]:stroke-current"
      />
    </span>
  );
}
