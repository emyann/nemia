import type { Meta, StoryObj } from '@storybook/react-vite';
import { LabelTags, Labels } from './Labels';

/** A run's labels: as a row's tags, and edited on its page, the store's `factory` and `workflow` shown and never removed. */
const meta: Meta = { title: 'Board/Labels' };
export default meta;

const BOX = { maxWidth: 640, padding: 24 };
const MAP = { factory: 'acme', workflow: 'build', team: 'core', size: 'wide' };

export const Tags: StoryObj = {
  render: () => (
    <div style={BOX}>
      <LabelTags labels={MAP} />
    </div>
  ),
};

export const Edited: StoryObj = {
  render: () => (
    <div style={BOX}>
      <Labels labels={MAP} edit={() => Promise.resolve()} />
    </div>
  ),
};

/** Add a changed value: the api's refusal is said under the field. */
export const Refused: StoryObj = {
  render: () => (
    <div style={BOX}>
      <Labels labels={MAP} edit={() => Promise.reject(new Error('team is core: pass overwrite to change it to web'))} />
    </div>
  ),
};
