import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { Focusable, TooltipTrigger } from '@/components/ui/ds';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { tipOf } from '../../../.storybook/play';
import { HeldTooltip } from './HeldTooltip';

/** The event a story's play sends its window to take a trigger off the page: its `detail` names which. */
const LEAVE = 'story-leave';

const BOARD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 24, padding: 32, width: 360 };

/** What a trigger says, cut to its line where its box is narrower. */
const SAID = 'every other record kind moves into the store';

/**
 * A focusable mark, the trigger of a held tooltip that says `SAID`, under the heading `name`; once the window is sent `LEAVE` for `name` a
 * plain word stands in its place, the trigger gone and its `TooltipTrigger` kept, as a trigger is that swaps for another element. Where
 * `nowhere`, the mark is drawn nowhere and its tooltip open from the start. The case writes `data-tried` once React Aria opens its tooltip.
 */
function Case({
  name,
  width,
  repeats,
  nowhere,
  children,
}: {
  name: string;
  width?: number;
  repeats?: boolean;
  nowhere?: boolean;
  children: ReactNode;
}) {
  const [left, setLeft] = useState(false);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    const leave = (event: Event) => {
      if ((event as CustomEvent<string>).detail === name) setLeft(true);
    };
    window.addEventListener(LEAVE, leave);
    return () => window.removeEventListener(LEAVE, leave);
  }, [name]);
  return (
    <div data-case={name} data-tried={tried || undefined} style={{ width }}>
      <span className="text-label-small text-on-surface-variant uppercase">{name}</span>
      <TooltipTrigger defaultOpen={nowhere} onOpenChange={(open) => open && setTried(true)}>
        {left ? (
          <span className="block text-body-medium text-on-surface-variant">gone</span>
        ) : (
          <Focusable>
            <span
              role="img"
              aria-label={SAID}
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the keyboard opens the tooltip by focusing it
              tabIndex={0}
              className={cn('block w-fit max-w-full truncate text-body-medium text-on-surface', nowhere && 'hidden', focusRing())}
            >
              {children}
            </span>
          </Focusable>
        )}
        <HeldTooltip repeats={repeats}>{SAID}</HeldTooltip>
      </TooltipTrigger>
    </div>
  );
}

/** The kit's tooltip held to its trigger: drawn only where its trigger stands, and, where it repeats its trigger's text, only where cut. */
const meta: Meta = { title: 'Look/HeldTooltip' };
export default meta;

/** The trigger of the case named `name`. */
const triggerOf = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`[data-case="${name}"] [role="img"]`)!;

/**
 * A tooltip open from the start over a trigger drawn nowhere is not drawn, where React Aria would place it at the window's top-left
 * corner; a text that reads whole opens no tooltip that repeats it, and one cut opens it, by the keyboard; a trigger that leaves the page
 * while its tooltip is open closes it. A press on a heading first puts React Aria in the pointer's mode, as a person's pointer does.
 */
export const Held: StoryObj = {
  render: () => (
    <div style={BOARD}>
      <Case name="whole" repeats>
        every record
      </Case>
      <Case name="cut" width={160} repeats>
        {SAID}
      </Case>
      <Case name="drawn nowhere" nowhere>
        {SAID}
      </Case>
      <Case name="leaves while open">{SAID}</Case>
    </div>
  ),
  play: async ({ canvasElement, userEvent }) => {
    await expect(document.querySelectorAll('[role="tooltip"]'), 'a tooltip open over a trigger drawn nowhere is not drawn').toHaveLength(0);
    const whole = triggerOf(canvasElement, 'whole');
    await userEvent.tab();
    whole.focus();
    await waitFor(() => expect(canvasElement.querySelector('[data-case="whole"]')).toHaveAttribute('data-tried'));
    await expect(whole, 'a text that reads whole is described by nothing').not.toHaveAttribute('aria-describedby');
    await expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(0);
    await expect(await tipOf(userEvent, triggerOf(canvasElement, 'cut')), 'a cut text opens the whole').toHaveTextContent(SAID);
    (document.activeElement as HTMLElement | null)?.blur();
    await waitFor(() => expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(0));

    await userEvent.click(within(canvasElement).getByText('leaves while open'));
    const open = triggerOf(canvasElement, 'leaves while open');
    await userEvent.hover(open);
    await waitFor(() => expect(open).toHaveAttribute('aria-describedby'));
    window.dispatchEvent(new CustomEvent(LEAVE, { detail: 'leaves while open' }));
    await waitFor(() => expect(document.querySelectorAll('[role="tooltip"]'), 'the tooltip closes with its trigger gone').toHaveLength(0));
    await userEvent.unhover(canvasElement);
  },
};
