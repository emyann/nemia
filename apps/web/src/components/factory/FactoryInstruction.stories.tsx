import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { factoryInstructionQuery } from '@/lib/api/factories';
import { FactoryInstruction } from './FactoryInstruction';
import { FACTORY, seeded } from '../../../.storybook/fixtures/proposals';
import { instruction } from '../../../.storybook/fixtures/factories';
import { saysReading, Unread } from '../../../.storybook/unread';

/** The instruction of the factory, read as `store` says it is kept. */
const drawn = (name: string, store: boolean) => (
  <QueryClientProvider client={seeded([[factoryInstructionQuery(name).queryKey, instruction(store)]])}>
    <FactoryInstruction name={name} />
  </QueryClientProvider>
);

/** A factory's instruction on its settings page, one story a state: kept in the store, edited here; and read from a file of its folder. */
const meta: Meta<typeof FactoryInstruction> = {
  title: 'Factory/FactoryInstruction',
  component: FactoryInstruction,
  args: { name: FACTORY },
};
export default meta;

type Story = StoryObj<typeof FactoryInstruction>;

/** Kept in the store: its words in the kit's field, Save and Clear…, and where else it may be kept. */
export const InTheStore: Story = {
  render: (args) => drawn(args.name, true),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-instruction-kept="store"] textarea')).not.toBeNull();
  },
};

/** Read from NEMIA.md in its folder: its words as the file reads, and the field that reads another file. */
export const InAFile: Story = {
  render: (args) => drawn(args.name, false),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-instruction-kept="folder"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-instruction-place] input')).not.toBeNull();
  },
};

/** The instruction still read: the shape of its words. */
export const Reading: Story = {
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <FactoryInstruction {...args} />
      </div>
    </Unread>
  ),
  play: saysReading('Reading the instruction…'),
};
