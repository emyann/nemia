import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { CardFileStatus } from 'objects';
import { Markdown } from '../markdown/Markdown';
import { CardFiles } from './CardFiles';

/** A picture the card's text names, kept. */
const SHOT: CardFileStatus = {
  name: 'shot.png',
  file: 'file_0123456789abcdef0123456789abcdef',
  mediaType: 'image/png',
  size: 48_213,
  inText: true,
  kept: true,
};

/** A log the card carries, its text naming it nowhere, let go of by its factory. */
const LOG: CardFileStatus = { name: 'run.log', file: 'file_fedcba9876543210fedcba9876543210', inText: false, kept: false };

/** A square of sixteen pixels a side, as a card's picture is served. */
const PIXELS =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAByElEQVR4nA3LobmGIBiA0TvOP4ADMACByPMmgoFIJBCMXyQQiEQDgUgkGIwO4DDX08/fj3vjVtya23Lv3IE7cQt34W7cnXtyX9wP98v992NtLMXSLMvaWYGVWMIqrMbqrMm6WA/rZX1hbkzF1EzL3JmBmZjCLMzG7MzJvJgP82V+YWwMxdAMy9gZgZEYwiiMxuiMybgYD+NlfOHcOBWn5rScO2fgTJzCWTgbZ+ecnBfnw/lyfqFtNEXTNEvbaYGWaEIrtEbrtEm7aA/tpX2hblRF1VRL3amBmqhCLdRG7dRJvagP9aV+IW9kRdZkS97JgZzIQi7kRu7kSb7ID/klf0E2RCEasciOBCQhghSkIR2ZyIU8yIt84dg4FIfmsBw7R+BIHMJROBpH55gcF8fD8XJ8IW5ERdRES9yJgZiIQizERuzESbyID/ElfiFsBEXQBEvYCYGQCEIohEbohEm4CA/hJXzBb3iF13iL3/EBn/CCL/iG7/iJv/AP/sV/wW04hdM4i9txAZdwgiu4huu4ibtwD+7FfcFuWIXVWIvdsQGbsIIt2Ibt2Im9sA/2xX7BbBiF0RiL2TEBkzCCKZiG6ZiJuTAP5sX8A+gMaBCXbzv2AAAAAElFTkSuQmCC';

/**
 * The files a card carries, on its page, one story a state: listed with Remove and a drop zone on a card no run was started from, none
 * yet, a started card's said and never changed, and a refusal of the api in full. Beside them, a card's text that shows the picture it
 * carries by the file's name.
 */
const meta: Meta<typeof CardFiles> = {
  title: 'Store/CardFiles',
  component: CardFiles,
  args: { files: [SHOT, LOG], canChange: true, onAttach: fn(), onDetach: fn() },
  render: (args) => (
    <div style={{ width: 560 }}>
      <CardFiles {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof CardFiles>;

/** Two files, one let go of, each with Remove; Remove takes a file off by its name in the card. */
export const Listed: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('list', { name: 'Files of the card' }).querySelectorAll('[data-card-file]')).toHaveLength(2);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove run.log' }));
    await expect(args.onDetach).toHaveBeenCalledWith('run.log');
    await expect(canvas.getByRole('button', { name: 'Choose files' })).toBeEnabled();
  },
};

/** A card that carries none yet: what files are for, and the drop zone. */
export const NoneYet: Story = { args: { files: [] } };

/** A started card: its files said, no Remove and no drop zone. */
export const Started: Story = {
  args: { canChange: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: /Remove/ })).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Choose files' })).toBeNull();
  },
};

/** The api refused the last change: its words in full. */
export const Refused: Story = {
  args: {
    refused:
      'The card fix-header names two files `shot.png`: a run keeps its inputs by name, in one folder. Give one of them another name.',
  },
};

/** A card's text that names its picture by the file's name, shown; an image of an address it does not carry stays a link. */
export const PictureInText: Story = {
  render: () => (
    <div style={{ width: 560 }}>
      <Markdown files={{ 'shot.png': PIXELS }}>
        {'The header is cut off:\n\n![the header](./shot.png)\n\nNot fetched: ![elsewhere](https://example.com/x.png)'}
      </Markdown>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('img[data-card-file]')).toHaveLength(1);
    await expect(within(canvasElement).getByRole('link', { name: 'image: elsewhere' })).toBeVisible();
  },
};
