import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Button } from '@/components/ui/ds';
import { Pending } from './Pending';
import { ON_CARD } from './stories.fixtures';

/**
 * A wait still out: the kit's small circular ProgressIndicator, drawn in the ink of what holds it, a button's icon while its press is
 * out.
 */
const meta: Meta<typeof Pending> = {
  title: 'Look/Pending',
  component: Pending,
  args: { size: 20 },
  render: (args) => (
    <div style={{ ...ON_CARD, display: 'flex', gap: 16, alignItems: 'center' }}>
      <Pending {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const ring = canvasElement.querySelector('[data-pending]');
    await expect(ring).not.toBeNull();
    await expect(ring).toHaveAttribute('aria-hidden', 'true');
  },
};
export default meta;

/** Alone, at a small button's icon size. */
export const Alone: StoryObj<typeof Pending> = {};

/** In a tag's line of text, as a fix or an upgrade at work draws it beside its word. */
export const InAWord: StoryObj<typeof Pending> = {
  args: { size: 14 },
  render: (args) => (
    <div style={ON_CARD}>
      <span className="inline-flex items-center gap-1 rounded-shape-full bg-surface-container-highest px-2 py-0.5 text-label-medium">
        <Pending {...args} />
        Running
      </span>
    </div>
  ),
};

/** In each button whose press is still out: filled, outlined, tonal and the error's, each keeping its label as its name. */
export const InButtons: StoryObj<typeof Pending> = {
  render: () => (
    <div style={{ ...ON_CARD, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
      <Button icon={Pending} isDisabled>
        Approving…
      </Button>
      <Button variant="outlined" icon={Pending} isDisabled>
        Asking…
      </Button>
      <Button variant="tonal" icon={Pending} isDisabled>
        Starting…
      </Button>
      <Button variant="tonal" color="error" size="xsmall" icon={Pending} isDisabled>
        Removing…
      </Button>
      <Button icon={Pending}>Saving…</Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ['Approving…', 'Asking…', 'Starting…', 'Removing…', 'Saving…'])
      await expect(canvas.getByRole('button', { name })).toBeVisible();
    await expect(canvas.queryByRole('progressbar')).toBeNull();
  },
};
