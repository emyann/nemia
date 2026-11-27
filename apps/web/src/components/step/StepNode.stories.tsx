import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { StepNode, type StepFlowNode } from './StepNode';
import { CODES, stepOf } from '../../../.storybook/fixtures/steps';

/** A step's node on the run's canvas: a wait node, which runs no session and stands on its conditions. */
const meta: Meta<{ node: StepFlowNode['data'] }> = {
  title: 'Run/StepNode',
  render: ({ node }) => (
    <ReactFlowProvider>
      <StepNode {...({ id: 'ready', data: node, selected: false } as unknown as NodeProps<StepFlowNode>)} />
    </ReactFlowProvider>
  ),
};
export default meta;

/** A wait node whose conditions are laid and none yet written: it reads checking and says it runs no session. */
export const WaitingOnItsConditions: StoryObj<{ node: StepFlowNode['data'] }> = {
  args: {
    node: {
      step: { ...stepOf(CODES.come, []), name: 'ready', message: 'checking' },
      index: 1,
      runCancelled: false,
      runHeld: false,
      waitingOnYou: false,
      node: { name: 'ready', kind: 'wait' },
    },
  },
  play: async ({ canvasElement }) => {
    const node = canvasElement.querySelector<HTMLElement>('[data-node-kind="wait"]')!;
    await expect(node.textContent).toContain('no session');
  },
};
