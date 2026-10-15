import type { Meta, StoryObj } from '@storybook/react-vite';
import { CutCue } from '@/components/look';
import { cuesOf, UP, type Presence } from '@/lib/presence';
import { NemiaFace } from './NemiaFace';

/** Nemia's face, in each of her six expressions, at the size she is docked at and at a header's, and beside her cues. */
const meta: Meta = { title: 'Board/NemiaFace' };
export default meta;

/** Where a face stands in its story. */
const AROUND = { display: 'inline-flex', padding: 24, background: 'var(--background)' };

/** Each presence of the owner's sheet, by its name. */
const SHEET: [string, Presence][] = [
  ['Up', UP],
  ['Answering', { ...UP, answering: true }],
  ['Waits on you', { ...UP, waitsOnYou: 2 }],
  ['Unread', { ...UP, unread: 1 }],
  ['Down', { ...UP, down: true }],
  ['Not sent', { ...UP, notSent: true }],
];

/** Her face for `presence`, docked. */
const docked = (presence: Presence): StoryObj => ({
  render: () => (
    <div style={AROUND}>
      <NemiaFace presence={presence} />
    </div>
  ),
});

/** Up: idle, she breathes, bobs and blinks. */
export const Idle = docked(UP);

/** Answering: thinking, the library's loader with a face. */
export const Thinking = docked({ ...UP, answering: true });

/** Something waits on the person: surprised. */
export const Surprised = docked({ ...UP, waitsOnYou: 2 });

/** An answer unread: happy. */
export const Happy = docked({ ...UP, unread: 1 });

/** Her session down: sleepy. */
export const Sleepy = docked({ ...UP, down: true });

/** A message not sent: unsure. */
export const Unsure = docked({ ...UP, notSent: true });

/** Every presence at once: the first in the owner's order wins, surprised. */
export const SeveralAtOnce = docked({ waitsOnYou: 2, notSent: true, down: true, answering: true, unread: 1 });

/** At a panel header's size, 34 pixels. */
export const InTheHeader: StoryObj = {
  render: () => (
    <div style={AROUND}>
      <NemiaFace presence={{ ...UP, answering: true }} size={34} />
    </div>
  ),
};

/** The owner's sheet: each presence's face and the cues beside it, as she is docked at the corner of a page. */
export const Docked: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24, background: 'var(--background)' }}>
      {SHEET.map(([name, presence]) => (
        <div key={name} data-presence={name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {cuesOf(presence).map((cue) => (
            <CutCue key={cue.words} hue={cue.hue}>
              {cue.words}
            </CutCue>
          ))}
          <NemiaFace presence={presence} />
        </div>
      ))}
    </div>
  ),
};
