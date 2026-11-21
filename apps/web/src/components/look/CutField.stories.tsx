import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Button } from '@/components/ui/ds';
import { atRest, tabTo } from '../../../.storybook/play';
import { CutField } from './CutField';
import { ON_PLAIN } from './stories.fixture';

/** The look's cut frame for a field: quiet, and with the focus in it, where the edge takes a session's hue round both cut corners. */
const meta: Meta = { title: 'Look/CutField' };
export default meta;

/** A field at rest: its edge a pixel of the outline's hue, in the cut shape. Tab into it and the whole edge lights. */
export const Quiet: StoryObj = {
  render: () => (
    <div style={ON_PLAIN}>
      <CutField size={10}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, minHeight: 52, padding: '6px 6px 6px 14px' }}>
          <input
            aria-label="A field in a cut frame"
            placeholder="Write here"
            className="min-w-60 flex-1 bg-transparent py-2 text-body-medium text-on-surface outline-none placeholder:text-on-surface-variant"
          />
        </div>
      </CutField>
    </div>
  ),
};

/** A field there is nowhere to send: its ground the quieter surface, and nothing in it takes the focus. */
export const Off: StoryObj = {
  render: () => (
    <div style={ON_PLAIN}>
      <CutField size={10} ground="bg-surface-container">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, minHeight: 52, padding: '6px 6px 6px 14px' }}>
          <input
            aria-label="A field with nowhere to send"
            disabled
            placeholder="Waiting for the daemon"
            className="min-w-60 flex-1 bg-transparent py-2 text-body-medium text-on-surface outline-none placeholder:text-on-surface-variant"
          />
        </div>
      </CutField>
    </div>
  ),
};

/**
 * A list's label filter: a field cut 12 with its Filter at the row's end, set in from the right so the button's corner stands inside
 * the cut, never over it. Tab into it and the whole edge lights, the button still inside the diagonal; Tab to the Filter and its
 * focus ring is drawn inside its own box, clear of the field's edge and its cut.
 */
export const WithEnd: StoryObj<typeof CutField> = {
  args: { size: 12 },
  render: (args) => (
    <div style={{ ...ON_PLAIN, width: 480 }}>
      <CutField
        {...args}
        end={
          <Button type="submit" size="xsmall" variant="tonal" data-filter-button>
            Filter
          </Button>
        }
      >
        <input
          aria-label="Filter by labels"
          data-filter-input
          placeholder="Filter by labels: team=core"
          className="min-w-0 flex-1 bg-transparent py-1.5 pl-3.5 text-body-medium text-on-surface outline-none placeholder:text-on-surface-variant"
        />
      </CutField>
    </div>
  ),
  play: async ({ canvasElement, userEvent }) => {
    await tabTo(userEvent, 'filterButton');
    const button = document.activeElement as HTMLElement;
    const ring = getComputedStyle(button);
    await expect(ring.outlineStyle, 'the Filter has its focus ring with the keyboard on it').toBe('solid');
    const [reach, width] = [parseFloat(ring.outlineOffset), parseFloat(ring.outlineWidth)];
    await expect(reach + width <= 0, `its ring is drawn inside its own box: offset ${reach}, width ${width}`).toBe(true);
    await expect(canvasElement.querySelector('[data-cut-end]')?.contains(button)).toBe(true);
    atRest();
  },
};
