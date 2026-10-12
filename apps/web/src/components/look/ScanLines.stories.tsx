import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScanLines } from './ScanLines';

/** The look's ground under a page: a glow from its top left corner, and scan lines over it. */
const meta: Meta = { title: 'Look/ScanLines' };
export default meta;

const ROOM = { width: 480, height: 200, padding: 16 };

/** The ground with its scan lines. */
export const Lined: StoryObj = {
  render: () => (
    <ScanLines>
      <div style={ROOM}>A page stands on this ground.</div>
    </ScanLines>
  ),
};

/** The ground with its glow alone. */
export const GlowAlone: StoryObj = {
  render: () => (
    <ScanLines lines={false}>
      <div style={ROOM}>A page stands on this ground.</div>
    </ScanLines>
  ),
};
