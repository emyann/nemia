import type { Meta, StoryObj } from '@storybook/react-vite';
import { ON_CARD } from './stories.fixtures';
import { TextLink } from './TextLink';

/** The board's text link: no line at rest, underlined under the pointer and with the keyboard on it, where it takes the kit's ring. */
const meta: Meta = { title: 'Look/TextLink' };
export default meta;

/** A title that links to a route. */
export const Title: StoryObj = {
  render: () => (
    <div data-title-ground style={ON_CARD}>
      <TextLink to="." search={{ read: 'link' } as never} data-plain-link>
        Read the review
      </TextLink>
    </div>
  ),
};
