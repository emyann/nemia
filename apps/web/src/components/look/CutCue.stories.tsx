import type { Meta, StoryObj } from '@storybook/react-vite';
import { CutCue } from './CutCue';
import { ON_PLAIN, ROW } from './stories.fixtures';

/** The look's cue: a few words in a small cut frame, in each hue a cue of Nemia's presence takes. */
const meta: Meta = { title: 'Look/CutCue' };
export default meta;

/** What waits on the person: yours, its glow following the cut. */
export const WaitsOnYou: StoryObj = {
  render: () => (
    <div style={ON_PLAIN}>
      <CutCue hue="yours">2 wait on you</CutCue>
    </div>
  ),
};

/** She is answering: alive. */
export const Answering: StoryObj = {
  render: () => (
    <div style={ON_PLAIN}>
      <CutCue hue="alive">Answering</CutCue>
    </div>
  ),
};

/** An answer unread: alive. */
export const Unread: StoryObj = {
  render: () => (
    <div style={ON_PLAIN}>
      <CutCue hue="alive">1 new</CutCue>
    </div>
  ),
};

/** Her session is down: at rest. */
export const Down: StoryObj = {
  render: () => (
    <div style={ON_PLAIN}>
      <CutCue>Down</CutCue>
    </div>
  ),
};

/** A message that was not sent: failure. */
export const NotSent: StoryObj = {
  render: () => (
    <div style={ON_PLAIN}>
      <CutCue hue="failure">Not sent</CutCue>
    </div>
  ),
};

/** Every cue side by side, as a header holding several shows them. */
export const SideBySide: StoryObj = {
  render: () => (
    <div style={{ ...ON_PLAIN, ...ROW }}>
      <CutCue hue="yours">2 wait on you</CutCue>
      <CutCue hue="failure">Not sent</CutCue>
      <CutCue>Down</CutCue>
      <CutCue hue="alive">Answering</CutCue>
      <CutCue hue="alive">1 new</CutCue>
    </div>
  ),
};
