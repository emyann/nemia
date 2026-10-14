import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageName, Plate } from './Plate';

/** The look's plate, a section's heading, in each hue and quiet; and a page's name over its rule. */
const meta: Meta = { title: 'Look/Plate' };
export default meta;

/** The plate of what waits on a person. */
export const Yours: StoryObj = { render: () => <Plate count={2} title="Waiting on you" /> };

/** The plate of the sessions at work. */
export const Alive: StoryObj = { render: () => <Plate count={3} title="In flight" hue="alive" /> };

/** The plate of what is at rest. */
export const Grey: StoryObj = { render: () => <Plate count={6} title="Finished" hue="grey" /> };

/** The plate of a section that holds nothing: grey whatever its hue, with no barcode. */
export const Quiet: StoryObj = { render: () => <Plate count={0} title="Waiting on you" quiet /> };

/** A page's short name, in the brand face over its rule, lit under the name alone. */
export const NameOfAPage: StoryObj = { render: () => <PageName>Runs</PageName> };

/** A page's long name: its rule lit under the whole name, past where a short one's stops. */
export const LongNameOfAPage: StoryObj = { render: () => <PageName>Factories and their workflows</PageName> };
