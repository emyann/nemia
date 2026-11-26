import { useContext, useEffectEvent, useLayoutEffect, useState, type RefObject } from 'react';
import { TooltipContext, TooltipTriggerStateContext } from 'react-aria-components';
import { Tooltip, type TooltipProps } from '@/components/ui/ds';

/** Where a trigger stands on the page: its box in the window, or none where it has left the page or is drawn nowhere. */
const standing = (trigger: Element | null | undefined) => {
  if (!trigger?.isConnected) return null;
  const box = trigger.getBoundingClientRect();
  return box.width > 0 && box.height > 0 ? box : null;
};

/** Whether `trigger`'s text is cut: what it holds is wider or taller than its box, by more than the rounding of a fraction of a pixel. */
const cut = (trigger: Element) => trigger.scrollWidth - trigger.clientWidth > 1 || trigger.scrollHeight - trigger.clientHeight > 1;

/** Whether a box stands where `at` stood, to the pixel. */
const stays = (box: DOMRect, at: DOMRect) =>
  Math.abs(box.left - at.left) <= 1 && Math.abs(box.top - at.top) <= 1 && Math.abs(box.width - at.width) <= 1;

/**
 * Watches the trigger `triggerRef` holds each frame, and calls `lost` once it is no longer `trigger`, has left the page or stands
 * elsewhere than `at`. Answers what stops the watch.
 * @param triggerRef The ref React Aria keeps of the trigger.
 * @param trigger The trigger as it was when the tooltip opened.
 * @param at Its box then.
 * @param lost What closes the tooltip.
 */
const watch = (triggerRef: RefObject<Element | null>, trigger: Element, at: DOMRect, lost: () => void) => {
  let frame = 0;
  const look = () => {
    const box = standing(triggerRef.current);
    if (box && triggerRef.current === trigger && stays(box, at)) frame = requestAnimationFrame(look);
    else lost();
  };
  frame = requestAnimationFrame(look);
  return () => cancelAnimationFrame(frame);
};

/**
 * The kit's `Tooltip`, held to its trigger, inside the kit's `TooltipTrigger` in its place: it is drawn only once its trigger was found
 * on the page as it opened, and it closes when the trigger leaves the page or moves. React Aria places a tooltip whose trigger it cannot
 * measure, one drawn nowhere or off the page as it opens, at the window's top-left corner; this one never draws there. A tooltip closed
 * at once, as React Aria closes one when the pointer reaches the next trigger, is taken off the page with its state: React Aria keeps it
 * waiting on the exit it skipped, and would draw it again, unplaced, at that corner when it next ends one. With `repeats`, for a tooltip
 * that only says again the text its trigger shows, it opens only while that text is cut, measured as it opens.
 * @param props The kit tooltip's props, and `repeats`, set where the tooltip only repeats its trigger's text.
 */
export function HeldTooltip({ repeats = false, ...props }: TooltipProps & { repeats?: boolean }) {
  const state = useContext(TooltipTriggerStateContext);
  const triggerRef = (useContext(TooltipContext) as { triggerRef?: RefObject<Element | null> } | null)?.triggerRef;
  const open = state?.isOpen ?? false;
  const close = useEffectEvent(() => state?.close(true));
  const [held, setHeld] = useState(false);
  useLayoutEffect(() => {
    if (!open || !triggerRef) return;
    const trigger = triggerRef.current;
    const at = standing(trigger);
    if (!at || !trigger || (repeats && !cut(trigger))) {
      close();
      return;
    }
    setHeld(true);
    const stop = watch(triggerRef, trigger, at, () => close());
    return () => {
      stop();
      setHeld(false);
      if (!standing(trigger)) close();
    };
  }, [open, triggerRef, repeats]);
  if (open ? !held : state?.shouldSkipAnimation) return null;
  return <Tooltip {...props} />;
}
