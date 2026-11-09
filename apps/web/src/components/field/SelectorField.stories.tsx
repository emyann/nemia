import type { Meta, StoryObj } from '@storybook/react-vite';
import { SelectorField } from './SelectorField';

/** The label filter of Inbox and Runs: empty, holding a selector, and refusing one in the api's words. */
const meta: Meta = { title: 'Board/SelectorField' };
export default meta;

const BOX = { maxWidth: 560, padding: 24 };
const reads = () => Promise.resolve();
const refuses = () => Promise.reject(new Error("the selector's key 'no/pe' is not a label key: write it as team=core"));

export const Empty: StoryObj = {
  render: () => (
    <div style={BOX}>
      <SelectorField selector={undefined} onSelect={() => undefined} check={reads} />
    </div>
  ),
};

export const Selected: StoryObj = {
  render: () => (
    <div style={BOX}>
      <SelectorField selector="team=core" onSelect={() => undefined} check={reads} />
    </div>
  ),
};

/** Press Filter: the api's refusal is said under the field. */
export const Refused: StoryObj = {
  render: () => (
    <div style={BOX}>
      <SelectorField selector="no/pe=x" onSelect={() => undefined} check={refuses} />
    </div>
  ),
};
