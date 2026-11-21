import { Button, type IconComponent } from '@/components/ui/ds';
import { cutRing, cutShape, type CutSize } from './cut';

/** The room between the press and its focus ring, and the ring's width, in pixels: the look's cut button's own. */
const [GAP, RING] = [2, 3];

/** The data marks a caller names the press by, under its own prefix (`mark`, `lib/conversation.ts`). */
type Marks = { [mark: `data-${string}`]: string | true | undefined };

/**
 * The kit's tonal icon button in the look's cut, its top-right and bottom-left corners cut by `cut`: a composer's send, or its stop.
 * Tonal and nothing else, so it has no border for its clip to cut open; its focus ring is a band in the cut shape around it, as wide
 * and as far as the kit's, shown when the keyboard reaches it (`data-cut-ring`). `label` is what a reader is told it is, `icon` what
 * it shows, `type` whether it submits its form, `isDisabled` whether it takes a press, and `onPress` what a press does; the caller's
 * data marks are put on the button.
 */
export function CutIconPress({
  cut = 10,
  icon,
  label,
  type = 'button',
  isDisabled = false,
  onPress,
  ...marks
}: {
  cut?: CutSize;
  icon: IconComponent;
  label: string;
  type?: 'button' | 'submit';
  isDisabled?: boolean;
  onPress?: () => void;
} & Marks) {
  return (
    <span className="group/cutpress relative inline-flex shrink-0">
      <span
        aria-hidden="true"
        data-cut-ring
        className="pointer-events-none absolute -inset-[5px] hidden bg-ring group-has-data-focus-visible/cutpress:block"
        style={{ clipPath: cutRing(cut, GAP, RING) }}
      />
      <Button
        type={type}
        {...marks}
        aria-label={label}
        icon={icon}
        size="xsmall"
        variant="tonal"
        isDisabled={isDisabled}
        onPress={onPress}
        className="w-8 rounded-none px-0"
        style={{ clipPath: cutShape(cut) }}
      />
    </span>
  );
}
