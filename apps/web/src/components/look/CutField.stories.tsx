import type { Meta, StoryObj } from '@storybook/react-vite';
import { CutField } from './CutField';
import { ON_PLAIN } from './stories.fixtures';

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
