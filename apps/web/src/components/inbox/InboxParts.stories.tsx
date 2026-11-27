import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FACTORY, queuedCard } from '../../../.storybook/fixtures/proposals';
import { CardStateChip, Refused, StartedAs, Tried } from './InboxParts';

/** The small parts a card and its page share: the word of a card's state, where it started, the tick's last try, and a refusal. */
const meta: Meta<typeof CardStateChip> = {
  title: 'Store/InboxParts',
  component: CardStateChip,
  args: { state: 'running' },
  render: (args) => (
    <div style={{ width: 560 }}>
      <CardStateChip {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof CardStateChip>;

/** The word of a card whose run is at work. */
export const Running: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-card-state="running"]')).not.toBeNull();
  },
};

/** The word of a card whose start was refused. */
export const RefusedState: Story = {
  args: { state: 'refused' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-card-state="refused"]')).not.toBeNull();
  },
};

/** The runs a card started as, each linked, and the word of its state. */
export const Started: Story = {
  render: () => (
    <div style={{ width: 560 }}>
      <StartedAs startedAs={['ship-it-k2rq']} state="succeeded" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'ship-it-k2rq' })).toBeVisible();
  },
};

/** The tick's last try of a queued card's start: refused, in amber. */
export const TriedRefused: Story = {
  render: () => {
    const entry = {
      ...queuedCard('route-the-idea', FACTORY, 1),
      tried: { at: '2026-11-19T00:00:00.000Z', repo: '/work/nemia', why: 'no workflow gone.', refused: true },
    };
    return (
      <div style={{ width: 560 }}>
        <Tried entry={entry} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-tried="refused"]')).not.toBeNull();
  },
};

/** What the api refused a write with, said in its words. */
export const Said: Story = {
  render: () => (
    <div style={{ width: 560 }}>
      <Refused
        refusal={{ entry: queuedCard('route-the-idea', FACTORY, 1), action: 'start', message: 'no card route-the-idea in the inbox' }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-refused="start"]')).toHaveTextContent('no card route-the-idea in the inbox');
  },
};
