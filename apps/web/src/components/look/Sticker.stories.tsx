import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sticker } from './Sticker';

/** The look's sticker tile: a rounded tile filled in a hue, a small label over its value. */
const meta: Meta = { title: 'Look/Sticker' };
export default meta;

/** A time, in the hue of a session at work. */
export const Clock: StoryObj = {
  render: () => (
    <Sticker hue="alive" label="Clock">
      27m
    </Sticker>
  ),
};

/** An amount, in the hue of money. */
export const Cost: StoryObj = {
  render: () => (
    <Sticker hue="money" label="Cost">
      $4.25
    </Sticker>
  ),
};

/** A count, in grey. */
export const Tokens: StoryObj = {
  render: () => (
    <Sticker hue="grey" label="Tokens">
      21.4M
    </Sticker>
  ),
};
