import type { Meta, StoryObj } from '@storybook/react-vite';
import { TokensReading } from './TokenTable';
import { saysReading } from '../../../.storybook/unread';

/** The store's tokens: here while they are read, the shape of their table. */
const meta: Meta<typeof TokensReading> = {
  title: 'Store/TokenTable',
  component: TokensReading,
  args: {},
  render: () => (
    <div style={{ width: 880 }}>
      <TokensReading />
    </div>
  ),
};
export default meta;

/** The tokens still read. */
export const Reading: StoryObj<typeof meta> = { play: saysReading('Reading the tokens…') };
