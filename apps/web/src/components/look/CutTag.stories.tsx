import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Tag } from '@/components/ui/ds';
import { atRest, tabTo } from '../../../.storybook/play';
import { CutTag } from './CutTag';
import { TextLink } from './TextLink';
import { ON_CARD } from './stories.fixture';

/**
 * The look's cut tag: the kit's tag that says a state, its top-right corner cut; an outlined tag and a hairline, whose edge the cut tag
 * draws along its whole shape, and a tag in a link, whose focus ring it draws in its cut.
 */
const meta: Meta = { title: 'Look/CutTag' };
export default meta;

/** The tag of what waits on a person's word. */
export const YourWord: StoryObj = {
  render: () => (
    <div style={ON_CARD}>
      <CutTag>
        <Tag variant="filled" color="primary" className="uppercase">
          Your word
        </Tag>
      </CutTag>
    </div>
  ),
};

/**
 * An outlined tag, the kit's, as the runs page's count chip at zero: its own border taken off, the tag's edge drawn along its whole
 * cut shape, the diagonal the colour of its sides.
 */
export const Outlined: StoryObj<typeof CutTag> = {
  args: { edge: true },
  render: (args) => (
    <div style={ON_CARD}>
      <CutTag {...args}>
        <Tag variant="outlined" color="neutral" className="h-8 px-3 uppercase">
          0 waiting on you
        </Tag>
      </CutTag>
    </div>
  ),
};

/** A span drawn with a hairline ring, as a server's grey state was: the ring taken off, the tag's edge drawn in its place. */
export const Hairline: StoryObj<typeof CutTag> = {
  args: { edge: true },
  render: (args) => (
    <div style={ON_CARD}>
      <CutTag {...args}>
        <span className="inline-flex items-center px-2 py-0.5 text-label-small text-on-surface-variant uppercase ring-1 ring-outline-variant ring-inset">
          Not connected
        </span>
      </CutTag>
    </div>
  ),
};

/**
 * A tag inside a link, as a label links to its page: the link's own focus ring, a rectangle, and the one its class names behind a
 * focus state, are taken off, and the tag draws its ring itself, in its cut shape, when the keyboard reaches the link.
 */
export const Linked: StoryObj<typeof CutTag> = {
  args: { edge: false },
  render: (args) => (
    <div style={ON_CARD}>
      <CutTag {...args}>
        <TextLink
          to="."
          search={{ read: 'label' } as never}
          data-label-link
          className="focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <Tag variant="tonal" color="secondary">
            team=core
          </Tag>
        </TextLink>
      </CutTag>
    </div>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const ring = canvasElement.querySelector<HTMLElement>('[data-cut-tag] [data-cut-ring]')!;
    await expect(getComputedStyle(ring).display, 'no ring before the keyboard reaches it').toBe('none');
    await tabTo(userEvent, 'labelLink');
    await expect(getComputedStyle(ring).display, 'the ring in the cut shape, with the keyboard on the link').toBe('block');
    const link = getComputedStyle(document.activeElement!);
    await expect(link.outlineStyle, "the link's own outline is taken off").toBe('none');
    await expect(/[1-9]/.test(link.boxShadow.replace(/rgba?\([^)]*\)/g, '')), "and its ring, a focus state's too").toBe(false);
    atRest();
  },
};
