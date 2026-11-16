import type { NodeProps } from '@xyflow/react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DEFAULT_NAMESPACE } from 'objects';
import { expect } from 'storybook/test';
import { FactoryBlockNode, type FactoryFlowNode } from './FactoryBlock';
import { block } from '../../../.storybook/fixtures/factories';

/** A block as React Flow hands it its node: the factory it draws, and whether the frame's bar shows it. */
const drawn = (data: FactoryFlowNode['data']) => <FactoryBlockNode {...({ data } as NodeProps<FactoryFlowNode>)} />;

/** One factory on the Factories canvas, one story a state: a factory that reads, the default one tagged, and one whose file does not. */
const meta: Meta<{ data: FactoryFlowNode['data'] }> = {
  title: 'Factory/FactoryBlock',
  args: { data: { ...block('nemia'), inspected: false } },
  render: ({ data }) => drawn(data),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** A factory that reads: its repositories, what its runs are doing and what it offers. */
export const Reads: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-runs]')).not.toBeNull();
  },
};

/** The default factory, tagged with the kit's tag, and shown in the frame's bar: ringed. */
export const DefaultInspected: Story = {
  args: { data: { ...block(DEFAULT_NAMESPACE), default: true, inspected: true } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="tag"]')?.textContent).toBe('default');
  },
};

/** A factory whose file does not read: why, in the package's words. */
export const Unread: Story = {
  args: { data: { ...block('broken', 'factories/broken.json: repos must be a list'), inspected: false } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-error]')).not.toBeNull();
  },
};
