import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { firstCardStore } from '../../../.storybook/fixtures/firstCard';
import { YouAreSet } from './YouAreSet';

/** "You are set", its reads answered by MSW from typed fixtures (`.storybook/fixtures/firstCard.ts`), one story a state. */
const meta: Meta<typeof YouAreSet> = {
  tags: ['network'],
  title: 'Pages/You are set',
  args: {},
  parameters: { msw: firstCardStore({ landed: true }) },
  render: () => <YouAreSet />,
};
export default meta;

type Story = StoryObj<typeof meta>;

/** The steps offered, once the page is read. */
const stepsIn = async (canvas: HTMLElement) => {
  await waitFor(() => expect(canvas.querySelector('[data-you-are-set]')).not.toBeNull(), { timeout: 5000 });
  return [...canvas.querySelectorAll('[data-next-step]')].map((s) => s.getAttribute('data-next-step') ?? '');
};

/** Landed on a folder of this machine, its template following a host: three steps, the host's with the line the api answered. */
export const LocalFolder: Story = {
  parameters: { msw: firstCardStore({ landed: true }) },
  play: async ({ canvasElement }) => {
    await expect(await stepsIn(canvasElement)).toEqual(['level', 'github', 'terminal']);
    await expect(canvasElement.querySelector('[data-follow-line]')).toHaveTextContent('--set github=true');
  },
};

/** Landed on a repository cloned from its address: no host to connect, two steps. */
export const ByAddress: Story = {
  parameters: { msw: firstCardStore({ landed: true, origin: 'git@github.com:you/app.git' }) },
  play: async ({ canvasElement }) => {
    await expect(await stepsIn(canvasElement)).toEqual(['level', 'terminal']);
  },
};

/** Nothing landed yet: it says so, and leads back to the first card. */
export const NotYet: Story = {
  parameters: { msw: firstCardStore({ landed: false }) },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-you-are-set="not-yet"]')).not.toBeNull(), { timeout: 5000 });
    await expect(canvasElement.querySelector('[data-next-step]')).toBeNull();
  },
};
