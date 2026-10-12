import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { CutButton, CutPress } from './CutButton';
import { ON_CARD } from './stories.fixtures';

/** The look's filled button with two cut corners: a link to a route, a button that is pressed, and a press that is disabled. */
const meta: Meta = { title: 'Look/CutButton' };
export default meta;

/** The button as a link: pressed, or Enter on it, it leads to its route once. */
export const Link: StoryObj = {
  render: () => (
    <div style={ON_CARD}>
      <CutButton to="." search={{ read: 'button' } as never}>
        Open the run
      </CutButton>
    </div>
  ),
};

/** A press on a card, which counts on its ground how many times it was pressed (`data-presses`). */
function Counted({ isDisabled = false }: { isDisabled?: boolean }) {
  const [presses, setPresses] = useState(0);
  return (
    <div data-presses={presses} style={ON_CARD}>
      <CutPress isDisabled={isDisabled} onPress={() => setPresses((n) => n + 1)}>
        Approve
      </CutPress>
    </div>
  );
}

/** The button as a press: a click, Enter and Space each press it once, and its ring is the link's. */
export const Press: StoryObj = { render: () => <Counted /> };

/** A press that is disabled: it takes no press and no focus, and is drawn in the disabled ground and ink. */
export const DisabledPress: StoryObj = { render: () => <Counted isDisabled /> };
