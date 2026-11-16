import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { TryAgent } from './TryAgent';
import { critic, scribe } from '../../../.storybook/fixtures/agents';

/** Try it, under an agent's form: a brief and Try it for an agent of yours, or why it cannot be tried. */
const meta: Meta<typeof TryAgent> = { title: 'Store/TryAgent', component: TryAgent, args: { agent: scribe } };
export default meta;

type Story = StoryObj<typeof TryAgent>;

/** Never tried: Try it held until a brief is written. */
export const NoBrief: Story = {
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement);
    await expect(panel.getByRole('button', { name: 'Try it' })).toBeDisabled();
    await userEvent.type(panel.getByRole('textbox', { name: 'Brief' }), 'Write the notes of the last change.');
    await expect(panel.getByRole('button', { name: 'Try it' })).toBeEnabled();
  },
};

/** The repository's: why it cannot be tried, and the line that copies it to yours. */
export const Untried: Story = { args: { agent: critic } };
