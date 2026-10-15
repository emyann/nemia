import type { Meta, StoryObj } from '@storybook/react-vite';
import { CopyId } from './CopyId';
import { ON_CARD } from './stories.fixtures';

/** A run's id with the control that copies it: short, its last four characters in a box, whole, and whole under a title. */
const meta: Meta = { title: 'Look/CopyId' };
export default meta;

/** The short id: boxed, and its box takes the hue of a session at work for the moment after a copy. */
export const Short: StoryObj = {
  render: () => (
    <div data-id-ground style={ON_CARD}>
      <CopyId id="the-tool-errors-panels-2e13" short />
    </div>
  ),
};

/** The whole id, in no box. */
export const Whole: StoryObj = {
  render: () => (
    <div data-id-ground style={ON_CARD}>
      <CopyId id="lay-the-diamond-top-e2e4" />
    </div>
  ),
};

/** The whole id under a run's title, four pixels from it, as a card lays it out: the line it stands on is as tall as the id. */
export const UnderTitle: StoryObj = {
  render: () => (
    <div data-id-ground style={ON_CARD}>
      <div data-under-title style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <span className="text-title-medium">Lay the diamond top</span>
        <CopyId id="lay-the-diamond-top-e2e4" />
      </div>
    </div>
  ),
};

/** Two whole ids of different lengths given one room, as the rows of a table hold them: their controls stand at one edge. */
export const Lined: StoryObj = {
  render: () => (
    <div data-id-ground style={ON_CARD}>
      <div data-lined style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
        <CopyId id="lay-the-diamond-top-e2e4" room={33} />
        <CopyId id="the-board-s-frame-on-the-kit-04ys" room={33} />
      </div>
    </div>
  ),
};
