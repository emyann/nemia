import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { BUILT_APART, ReadRefusal, UnreadAnswer } from '@/lib/api/read';
import { ReadTrouble } from './ReadTrouble';

/** How the story's read failed: the api refused it, it answered what the board does not read, or nothing answered. */
type Failed = 'refused' | 'unread' | 'unanswered';

/** What a story of the line reads: what the page reads, and how that read failed. */
type Args = { what: string; failed: Failed };

/** The error each kind of failure is rejected with, as the objects' client builds it. */
const ERRORS: Record<Failed, () => unknown> = {
  refused: () => new ReadRefusal('factory "acme" not found: its Settings name the factories there are', 404),
  unread: () =>
    new UnreadAnswer(
      'GET /api/agents',
      `GET /api/agents answered what this board does not read: at [0].name, the value is missing. ${BUILT_APART}`,
    ),
  unanswered: () => new TypeError('Failed to fetch'),
};

/** The line over the story's failure, in the room of a page's body. */
const drawn = ({ what, failed }: Args) => (
  <div style={{ width: 720 }}>
    <ReadTrouble what={what} error={ERRORS[failed]()} />
  </div>
);

/**
 * The one line every page says where a read failed, a story a kind: the api's refusal in its words, an answer this board does not read
 * with its message, and nothing having answered, with why and to reload. Each is marked by its kind.
 */
const meta: Meta<Args> = { title: 'Frame/ReadTrouble', args: { what: 'the agents', failed: 'refused' }, render: drawn };
export default meta;

type Story = StoryObj<Args>;

/** The line's mark, which says the kind it was drawn for. */
const marked = (failed: Failed) => ({
  args: { failed },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expect(canvasElement.querySelector('[data-read-trouble]')?.getAttribute('data-read-trouble')).toBe(failed);
  },
});

/** The api refused the read: its own words. */
export const Refused: Story = { ...marked('refused'), args: { what: 'the factory acme', failed: 'refused' } };

/** The api answered what this board does not read: the answer's message, naming the read, the key and the fix. */
export const Unread: Story = marked('unread');

/** Nothing answered: that Nemia's api did not, why, and to reload once it does. */
export const Unanswered: Story = marked('unanswered');
