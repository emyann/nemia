import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { nemiaMemoryQuery } from '@/lib/api/nemia';
import { seeded } from '../../../.storybook/fixtures/proposals';
import { NemiaSettings } from './NemiaSettings';
import { saysReading, Unread } from '../../../.storybook/unread';

/** Her settings: here while where she is and her memory are read, each the shape of its parts. */
const meta: Meta<typeof NemiaSettings> = {
  title: 'Store/NemiaSettings',
  component: NemiaSettings,
  args: {},
  render: () => (
    <Unread>
      <div style={{ width: 720 }}>
        <NemiaSettings />
      </div>
    </Unread>
  ),
};
export default meta;

/** Where she is still read. */
export const ReadingWhereSheIs: StoryObj<typeof meta> = {
  play: saysReading('Reading where she is…'),
};

/** Her memory still read. */
export const ReadingHerMemory: StoryObj<typeof meta> = {
  play: saysReading('Reading her memory…'),
};

/** Her memory read, one fact opened while its words are read: the shape of the fact's lines. */
export const ReadingAFact: StoryObj<typeof meta> = {
  render: () => (
    <QueryClientProvider client={seeded([[nemiaMemoryQuery.queryKey, { dir: '/store/nemia/memory', facts: ['team'], fact: null }]])}>
      <div style={{ width: 720 }}>
        <NemiaSettings />
      </div>
    </QueryClientProvider>
  ),
  play: async (context) => {
    await userEvent.click(within(context.canvasElement).getByRole('button', { name: /team/ }));
    await saysReading('Reading the fact…')(context);
  },
};
