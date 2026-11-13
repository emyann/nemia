import type { Meta, StoryObj } from '@storybook/react-vite';
import { UP, type Presence } from '@/lib/presence';
import { NemiaRailFace } from './NemiaRailFace';

/** Nemia's face as the rail draws it: closed, with cues in its tooltip, open and ringed, and on her own page. */
const meta: Meta = { title: 'Board/NemiaRailFace' };
export default meta;

/** Where a face stands in its story: the rail's ground, as wide as the narrow rail. */
const AROUND = { display: 'inline-flex', justifyContent: 'center', width: 96, padding: 24, background: 'var(--surface)' };

/** Her face for `presence`, open or not, on her page or not. */
const at = (presence: Presence, open: boolean, ownsChat = false): StoryObj => ({
  render: () => (
    <div style={AROUND}>
      <NemiaRailFace presence={presence} open={open} ownsChat={ownsChat} onToggle={() => undefined} />
    </div>
  ),
});

/** Closed, at rest: her dot alive, no tooltip. */
export const Closed = at(UP, false);

/** Closed with two cues: the dot in the first's hue, both in the tooltip on hover or focus. */
export const TwoCues = at({ ...UP, runsWaiting: 2, answering: true }, false);

/** Her sheet open: ringed. */
export const Open = at(UP, true);

/** Down: the dot at rest. */
export const Down = at({ ...UP, down: true }, false);

/** On her own page: ringed, a link to the page it is. */
export const OnHerPage = at(UP, false, true);
