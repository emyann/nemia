import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';
import { NowForm, PauseButton } from './PauseButton';
import { saysReading, Unread } from '../../../.storybook/unread';

/** Stop now… of the pause: here while what runs is read, the shape of what it says it stops. */
const meta: Meta<typeof NowForm> = {
  title: 'Frame/PauseButton',
  component: NowForm,
  args: { standing: false, onPut: fn(), onClose: fn(), isPending: false },
  render: (args) => (
    <Unread>
      <div style={{ width: 360 }}>
        <NowForm {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** What runs still read. */
export const ReadingWhatRuns: StoryObj<typeof meta> = { play: saysReading('Reading what runs.') };

/** The pause's popover opened before the pause is read: its sentence the shape of its lines. */
export const ReadingThePause: StoryObj<typeof meta> = {
  render: () => (
    <Unread>
      <PauseButton />
    </Unread>
  ),
  play: async (context) => {
    await userEvent.click(within(context.canvasElement).getByRole('button', { name: 'The pause of all factories, not read' }));
    await saysReading('Reading whether all factories are paused.')(context);
  },
};
