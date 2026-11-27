import type { Decorator } from '@storybook/react-vite';
import { FrameGrid } from '@/components/frame/FrameGrid';

/**
 * A page's body drawn as the frame draws a reading page: in the page's column, under the frame's grid at its reading span, so its edges
 * and its measure are the board's.
 */
export const readingColumn: Decorator = (Story) => (
  <div className="@container/page" style={{ width: 1200 }}>
    <FrameGrid span="reading">
      <Story />
    </FrameGrid>
  </div>
);
