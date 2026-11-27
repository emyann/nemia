import type { ReactNode } from 'react';
import { Focusable, focusRing, TooltipTrigger } from '@/components/ui/ds';
import { HeldTooltip } from '@/components/look';
import { cn } from '@/lib/utils';

/**
 * What it holds, with the sentence that says it on hover and on focus: the kit's tooltip, held to its trigger, around a part that is
 * not itself a control (a tag, a sticker), made reachable by the keyboard.
 * @param props.said The sentence the hover says.
 * @param props.className The trigger's layout.
 */
export function Hovered({ said, className, children }: { said: string; className?: string; children: ReactNode }) {
  return (
    <TooltipTrigger delay={300}>
      <Focusable>
        <span data-hovered className={cn('inline-flex rounded-sm', focusRing(), className)}>
          {children}
        </span>
      </Focusable>
      <HeldTooltip>{said}</HeldTooltip>
    </TooltipTrigger>
  );
}
