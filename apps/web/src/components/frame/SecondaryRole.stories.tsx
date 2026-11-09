import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, CheckIcon, IconButton, Meter, NavigationRail, PlusIcon, SearchIcon } from '@/components/ui/ds';

/**
 * The kit's parts where Material draws its secondary role, as the board's stylesheet hands it to them: a selected tonal toggle, a
 * selected tonal icon toggle, the active label of a collapsed rail, and a secondary meter. Each stands in a box named by
 * `data-secondary`, which the e2e reads.
 */
const meta: Meta = { title: 'Board/SecondaryRole' };
export default meta;

const ROW: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 32, padding: 24 };
const METER: CSSProperties = { width: 200 };

/** The destinations of the rail, none a link: the stories page is never left. */
const DESTINATIONS = [
  { id: 'runs', label: 'Runs', icon: CheckIcon },
  { id: 'find', label: 'Find', icon: SearchIcon },
];

/** Each part that draws secondary, side by side. */
export const Drawn: StoryObj = {
  render: () => (
    <div style={ROW}>
      <div data-secondary="toggle">
        <Button isToggle variant="tonal" isSelected>
          Selected
        </Button>
      </div>
      <div data-secondary="icon-toggle">
        <IconButton isToggle variant="tonal" isContained isSelected icon={PlusIcon} aria-label="Selected" />
      </div>
      <div data-secondary="rail">
        <NavigationRail items={DESTINATIONS} selectedKey="runs" />
      </div>
      <div data-secondary="meter" style={METER}>
        <Meter label="Quota" value={60} color="secondary" />
      </div>
    </div>
  ),
};
