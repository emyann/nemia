import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { StepGraph } from '@/components/look';
import { previewBar } from './StepPreview';
import { Unread } from '../../../.storybook/unread';
import { AS_OF, RUN } from '../run/approve.fixture';

/** A run's rail with each diamond a button: the pointer or the focus shows its step's glance, and a press opens the step in the bar. */
const meta: Meta<{ step: string }> = {
  title: 'Run/StepPreview',
  tags: ['network'],
  args: { step: 'land' },
  render: () => (
    <Unread>
      <div style={{ width: 240, height: 120 }}>
        <StepGraph run={RUN} wrap={previewBar(RUN, AS_OF)} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The focus on a diamond shows the glance: a tooltip of a few lines, never scrolling. */
export const Focused: StoryObj<{ step: string }> = {
  play: async ({ canvasElement, args }) => {
    const bar = canvasElement.querySelector<HTMLElement>(`[data-step-bar="${args.step}"]`)!;
    await userEvent.tab();
    bar.focus();
    const glance = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-step-glance]');
      if (!found) throw new Error('the glance is not open yet');
      return found;
    });
    await expect(glance.scrollHeight).toBe(glance.clientHeight);
  },
};
