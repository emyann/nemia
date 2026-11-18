import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import type { HarnessCheck, ReadinessPiece } from 'objects';
import { atRest } from '../../../.storybook/play';
import { HarnessChecks } from './HarnessChecks';

/** The version check at the pin. */
const VERSION: HarnessCheck = {
  name: 'version',
  state: 'passed',
  message: '1.2.3, the version this release was tested with',
  fixes: [],
  found: '1.2.3',
  pin: '1.2.3',
};

/** The turn check, never run. */
const UNRUN: HarnessCheck = {
  name: 'turn',
  state: 'unrun',
  message: "no check turn has run through Agent One: run one from the board's Setup, capped at $0.05",
  fixes: [],
  capUsd: 0.05,
};

/** A harness's install piece in place, carrying `checks`. */
const install = (checks: HarnessCheck[]): ReadinessPiece => ({
  name: 'agent-one',
  area: 'harness',
  state: 'met',
  message: 'Agent One (agent) is installed',
  fixes: [],
  harness: { name: 'agent-one', part: 'install' },
  checks,
});

/** The sign-in's typed fix, offered under a turn that failed. */
const SIGN_IN_FIX = { message: 'sign in through the browser', command: 'agent-one auth login', startable: false, kind: 'typed' } as const;

/**
 * A harness's two checks, one story a state: the turn not run, running, passed with its cost and the quota beside it, the version
 * failed with the install offered again, and the turn failed in the harness's own words with the sign-in to type.
 */
const meta: Meta<typeof HarnessChecks> = {
  title: 'Store/HarnessChecks',
  component: HarnessChecks,
  args: { install: install([VERSION, UNRUN]), onStart: () => undefined, turn: { onRun: () => undefined } },
  render: (args) => (
    <div style={{ width: 640 }}>
      <HarnessChecks {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof HarnessChecks>;

/** The version passed, the turn not run: Run the check, its cap said, runs it. */
export const Unrun: Story = {
  args: { turn: { onRun: fn() } },
  play: async ({ args, canvasElement, userEvent }) => {
    const press = within(canvasElement).getByRole('button', { name: /Run the check/ });
    await expect(press).toHaveTextContent('$0.05');
    await userEvent.click(press);
    await expect(args.turn?.onRun).toHaveBeenCalledOnce();
    atRest();
  },
};

/** The turn running: its press waits. */
export const Running: Story = {
  args: {
    install: install([
      VERSION,
      { ...UNRUN, state: 'running', message: 'a check turn runs through Agent One, capped at $0.05', turn: 't-1' },
    ]),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: /Running/ })).toBeDisabled();
  },
};

/** Both passed: what the turn cost, and the quota beside it as information. */
export const Passed: Story = {
  args: {
    install: install([
      VERSION,
      { ...UNRUN, state: 'passed', message: 'Agent One answered a check turn, for $0.0042', costUsd: 0.0042, answer: 'ready', turn: 't-1' },
    ]),
    quota: '12% of the 5-hour window used',
  },
};

/** The version differs from the pin: both said, and the install offered again. */
export const VersionFailed: Story = {
  args: {
    install: install([
      {
        ...VERSION,
        state: 'failed',
        found: '1.0.0',
        message: 'Agent One answers 1.0.0, and this release was tested with 1.2.3: install 1.2.3 again',
        fixes: [
          { message: 'install Agent One 1.2.3 into the tools folder', command: 'tool doctor fix agent-one', startable: true, index: 0 },
        ],
      },
      UNRUN,
    ]),
    onStart: fn(),
  },
  play: async ({ args, canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Start the fix' }));
    await expect(args.onStart).toHaveBeenCalledWith({ need: 'agent-one', index: 0 }, expect.any(String));
    atRest();
  },
};

/** The turn failed: why, in the harness's own words, and the sign-in to type. */
export const TurnFailed: Story = {
  args: {
    install: install([
      VERSION,
      {
        ...UNRUN,
        state: 'failed',
        failure: 'unanswered',
        message: "Agent One's check turn failed: it answered nothing: Invalid API key · Please run /login",
        fixes: [SIGN_IN_FIX],
        turn: 't-1',
      },
    ]),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('agent-one auth login')).toBeVisible();
    await expect(within(canvasElement).getByRole('button', { name: /Run again/ })).toBeEnabled();
  },
};
