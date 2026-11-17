import { useRef, useState, type PointerEvent, type ReactNode, type SyntheticEvent } from 'react';
import { ContextMenu, Popover } from '@/components/ui/ds';
import type { RunView } from '@/lib/api/judged';
import { runActionsOf, type RunAction } from '@/lib/runActions';
import { cn } from '@/lib/utils';
import { RunQuestion } from './RunMenu';

/** A run found under what a menu was asked for on, and the element its question opens beside: its row, its card. */
export type FoundRun = { run: RunView; at: Element };

/** How long a finger rests on a run before its menu opens, where the browser opens none itself. */
export const LONG_PRESS_MS = 500;

/** How far a finger may wander, in pixels, and still be resting: past it, it is panning or scrolling. */
const SLOP = 10;

/** The name each question's surface is given, as the run's page names it. */
const ASKED: Record<RunAction, (id: string) => string> = {
  remove: (id) => `Remove ${id}`,
  lift: (id) => `Lift the hold on ${id}`,
  hold: (id) => `Hold ${id}`,
  prune: (id) => `Prune ${id}`,
};

/** A finger resting on the area: where it came down, its timer, whether the menu was opened for it. */
type Press = { x: number; y: number; timer: number; fired: boolean };

/**
 * A long press on touch, for the browsers that fire no `contextmenu` on one (iOS Safari): a finger resting `LONG_PRESS_MS` on the area
 * dispatches one where it rests, which the kit's menu opens on as on a right-click. Where the browser fires its own first (Android), the
 * timer is dropped and the browser's is the one; where it fires its own after, that one is swallowed, so the menu opens once. The click a
 * lifted finger makes once the menu opened is swallowed too, so the press does not also follow the title's link. A finger that wanders
 * past `SLOP` pans or scrolls, and opens nothing.
 */
function useLongPress() {
  const press = useRef<Press | null>(null);
  const drop = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  return {
    onPointerDown: (event: PointerEvent) => {
      drop();
      if (event.pointerType !== 'touch') return;
      const target = event.target as Element;
      const { clientX, clientY } = event;
      const resting: Press = { x: clientX, y: clientY, fired: false, timer: 0 };
      resting.timer = window.setTimeout(() => {
        resting.fired = true;
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY, button: 2 }));
      }, LONG_PRESS_MS);
      press.current = resting;
    },
    onPointerMove: (event: PointerEvent) => {
      const resting = press.current;
      if (resting && !resting.fired && Math.hypot(event.clientX - resting.x, event.clientY - resting.y) > SLOP) drop();
    },
    onPointerUp: () => {
      if (press.current && !press.current.fired) drop();
    },
    onPointerCancel: drop,
    onContextMenuCapture: (event: SyntheticEvent) => {
      const resting = press.current;
      if (!resting || !event.nativeEvent.isTrusted) return;
      if (!resting.fired) return drop();
      event.preventDefault();
      event.stopPropagation();
    },
    onClickCapture: (event: SyntheticEvent) => {
      if (press.current?.fired) {
        event.preventDefault();
        event.stopPropagation();
      }
      drop();
    },
  };
}

/**
 * The actions of a run, opened where the run is listed, through the kit's `ContextMenu`: the same list as the run page's menu
 * (`runActionsOf`), and each, pressed, asks the question the page asks (`RunQuestion`) in a popover beside the run's row or card, every
 * write reading the run and the lists again (`runsMoved`). Nothing on screen says it is there: the run's page keeps its menu.
 *
 * Opened by the pointer's secondary press, a long press on Android and the keyboard's menu key or Shift+F10 on what has the focus inside
 * it, which the kit gives; and a long press on iOS, which it adds (`useLongPress`). A press on what holds no run (`runOf` answers null), or
 * on a run that offers no action, leaves the browser's own menu.
 * @param props the props: `runOf`, the run under what the menu was asked for on and the element its question opens beside, null where
 *   none; what the area holds; and the area's classes
 */
export function RunActions({
  runOf,
  children,
  className,
}: {
  runOf: (target: Element) => FoundRun | null;
  children: ReactNode;
  className?: string;
}) {
  const anchor = useRef<Element | null>(null);
  const [asked, setAsked] = useState<{ run: RunView; action: RunAction } | null>(null);
  const longPress = useLongPress();
  const items = (target: Element) => {
    const found = runOf(target);
    if (!found) return [];
    return runActionsOf(found.run).map(({ key, label }) => ({
      id: key,
      label,
      onAction: () => {
        anchor.current = found.at;
        setAsked({ run: found.run, action: key });
      },
    }));
  };
  return (
    <div data-run-actions-area {...longPress} className={cn('[-webkit-touch-callout:none]', className)}>
      <ContextMenu aria-label="Actions on the run" items={items} className={className}>
        {children}
      </ContextMenu>
      <Popover
        triggerRef={anchor}
        isOpen={asked !== null}
        onOpenChange={(open) => {
          if (!open) setAsked(null);
        }}
        placement="bottom end"
        aria-label={asked ? ASKED[asked.action](asked.run.id) : 'Actions on the run'}
        className="max-h-[inherit] w-96 space-y-3 overflow-y-auto"
      >
        {asked && <RunQuestion run={asked.run} action={asked.action} onClose={() => setAsked(null)} />}
      </Popover>
    </div>
  );
}
