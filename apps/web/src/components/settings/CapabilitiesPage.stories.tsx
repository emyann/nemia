import type { Meta, StoryObj } from '@storybook/react-vite';
import { CapabilitiesReading } from './CapabilitiesPage';
import { saysReading } from '../../../.storybook/unread';

/** What a repository offers a step: here as its route draws it while the repository is read and its servers asked. */
const meta: Meta<typeof CapabilitiesReading> = {
  title: 'Pages/Capabilities',
  component: CapabilitiesReading,
  args: {},
  render: () => (
    <div style={{ width: 880 }}>
      <CapabilitiesReading />
    </div>
  ),
};
export default meta;

/** The repository still read. */
export const Reading: StoryObj<typeof meta> = {
  play: saysReading('Reading the repository, and asking each MCP server it enables for its tools…'),
};
