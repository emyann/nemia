import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileCard } from './FileCard';
import { saysReading, Unread } from '../../../.storybook/unread';

/**
 * The box that files a card: here while the factories it lists are read, the shape of its line under the list. Axe's
 * `label-content-name-mismatch` alone is off, for the Factory list: the ds kit's `Select` draws its value before its floating label and
 * is named by the label first, which axe reads as visible text left out of its name, an ask of the kit.
 */
const meta: Meta<typeof FileCard> = {
  title: 'Store/FileCard',
  component: FileCard,
  args: { shown: 'solo' },
  parameters: { a11y: { config: { rules: [{ id: 'label-content-name-mismatch', enabled: false }] } } },
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <FileCard {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The factories still read. */
export const ReadingTheFactories: StoryObj<typeof meta> = {
  play: saysReading('Reading the factories…'),
};
