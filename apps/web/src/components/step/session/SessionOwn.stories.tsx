import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { SessionOwn } from './SessionOwn';

/** What a step's session has that the one turn shape has none for: its brief folded on the look's trace, its told words, its closeout. */
const meta: Meta<typeof SessionOwn> = { title: 'Run/SessionOwn', args: { step: 'implement', marks: 'session' } };
export default meta;

/** Where an item stands in its story: a panel's width, on the card's ground, laid out as the talk lays its items out. */
const PANEL = {
  width: 460,
  padding: 16,
  background: 'var(--md-sys-color-surface-container-low)',
  display: 'flex',
  flexDirection: 'column' as const,
};

/** The brief it was told, folded to the trace's line; opened, its words. */
export const Brief: StoryObj<typeof SessionOwn> = {
  args: { own: { what: 'brief', text: '# Implement\n\nBuild the change the spec describes, with the tests that prove it.' } },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(canvasElement.querySelector('[data-slot="trace-collapsible-trigger"]')!);
    await expect(canvasElement).toHaveTextContent('Build the change the spec describes');
  },
  render: (args) => (
    <div style={PANEL}>
      <SessionOwn {...args} />
    </div>
  ),
};

/** The person's words told to it while it ran, at the right, once they reached it. */
export const Told: StoryObj<typeof SessionOwn> = {
  args: {
    own: {
      what: 'told',
      at: '2026-10-15T17:40:00.000Z',
      attempt: 1,
      text: 'Leave the e2e for the round after.',
      arrived: '2026-10-15T17:41:00.000Z',
      by: null,
    },
  },
  render: (args) => (
    <div style={PANEL}>
      <SessionOwn {...args} />
    </div>
  ),
};

/** Its closeout: that it signed off, and how, linking to what it said. */
export const Closeout: StoryObj<typeof SessionOwn> = {
  args: {
    own: {
      what: 'closeout',
      call: {
        id: 'c-1',
        at: '2026-10-15T17:50:00.000Z',
        name: 'StructuredOutput',
        input: { outcome: 'done', summary: 'Built the change and its tests.' },
        result: null,
      },
    },
  },
  render: (args) => (
    <div style={PANEL}>
      <SessionOwn {...args} />
    </div>
  ),
};
