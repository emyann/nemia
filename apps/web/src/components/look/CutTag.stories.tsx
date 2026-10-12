import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tag } from '@/components/ui/ds';
import { CutTag } from './CutTag';
import { ON_CARD } from './stories.fixtures';

/** The look's cut tag: the kit's tag that says a state, its top-right corner cut. */
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
