import type { Meta, StoryObj } from '@storybook/react-vite';
import { RunSteps } from './RunSteps';
import { AT_WORK, DONE, GATE, ON_CARD, REFUSED } from './stories.fixtures';

/** A run's steps as a rail, one bar a step: at its gate, done, at work and refused, with the steps' names and without. */
const meta: Meta = { title: 'Look/RunSteps' };
export default meta;

/** A rail on a card, 420 pixels wide. */
function Rail({ steps, names = true }: { steps: typeof GATE; names?: boolean }) {
  return (
    <div data-rail style={{ ...ON_CARD, display: 'block', width: 420 }}>
      <RunSteps steps={steps} cancelled={false} held={false} names={names} />
    </div>
  );
}

/** A run at its gate: the last bar hollow and lit, in the hue of what waits on a person. */
export const AtItsGate: StoryObj = { render: () => <Rail steps={GATE} /> };

/** A run whose steps are done: each filled, whether a check says so or the step's own word does. */
export const Done: StoryObj = { render: () => <Rail steps={DONE} /> };

/** A run at work: the step at work filled in its hue, its glow breathing, still where reduced motion is asked for. */
export const AtWork: StoryObj = { render: () => <Rail steps={AT_WORK} /> };

/** A run whose step its check refused. */
export const Refused: StoryObj = { render: () => <Rail steps={REFUSED} /> };

/** A rail with no names under its bars, as a table's row draws it. */
export const WithoutNames: StoryObj = { render: () => <Rail steps={AT_WORK} names={false} /> };
