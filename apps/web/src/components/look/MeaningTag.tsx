import type { HTMLAttributes, ReactNode } from 'react';
import { Label } from '@/components/ui/ds';
import { cn } from '@/components/ui/ds/utils';
import { container, filled, type Hue } from '@/lib/meaning';

/** The kit's `Tag` box, as its own file writes it: 24 pixels tall, its small shape's corners, 8 pixels each side, in a line of text. */
const BOX = 'inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-shape-small px-2 align-middle';

/** A meaning's two forms a tag takes: its container under its ink, the quiet one, or the meaning itself under its own ink. */
type Form = 'container' | 'filled';

/** The ground and ink of each form, by hue, each a whole literal of `lib/meaning.ts`. */
const FORMS: Record<Form, Record<Hue, string>> = { container, filled };

/**
 * A tag in a meaning's colour, where the kit's `Tag` takes only the theme's roles: at the kit Tag's metrics and in its label type
 * (label-medium), the same `data-slot`, so a cut tag holds it as it holds the kit's, its ground and ink a form of the meaning
 * (`lib/meaning.ts`). For a state the theme has no role for: `alive`, now that the theme's secondary is ink.
 * @param props.hue The meaning the tag says.
 * @param props.form The meaning's container under its ink (the default), or the meaning itself.
 */
export function MeaningTag({
  hue,
  form = 'container',
  className,
  children,
  ...rest
}: { hue: Hue; form?: Form; className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLSpanElement>, 'color'>) {
  return (
    <span data-slot="tag" data-meaning={hue} data-form={form} {...rest} className={cn(BOX, FORMS[form][hue], className)}>
      <Label size="medium" component="span" className="text-inherit">
        {children}
      </Label>
    </span>
  );
}
