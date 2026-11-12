import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReadinessPiece } from 'objects';
import { harnessChoices } from '@/lib/setup';
import { FixRun } from './FixRun';
import { HarnessChoice, HarnessSkipped } from './HarnessChoice';

/** The first visit's question on Setup: none activated, one installing, one installed and signed out, and the question skipped. */
const meta: Meta = { title: 'Board/HarnessChoice' };
export default meta;

/** A harness's two pieces as the read answers them, its install in `installed` and its sign-in missing, with `signIn`'s fixes. */
const pieces = (name: string, title: string, installed: boolean, signIn: ReadinessPiece['fixes']): ReadinessPiece[] => [
  {
    name,
    area: 'harness',
    state: installed ? 'met' : 'missing',
    message: installed ? `${title} is installed: 1.2.3, the version this release was tested with` : `${title} is installed`,
    fixes: installed
      ? [{ message: 'deactivate it', command: `tool doctor fix ${name} --index 1`, startable: true, index: 1, kind: 'removes' }]
      : [{ message: `install ${title} 1.2.3`, command: `tool doctor fix ${name}`, startable: true, index: 0 }],
    harness: { name, part: 'install' },
  },
  {
    name: `${name}-sign-in`,
    area: 'harness',
    state: 'missing',
    message: `${title} is signed in`,
    fixes: signIn,
    harness: { name, part: 'sign-in' },
  },
];

/** Two harnesses, neither installed: one signed in by a command typed on the server, one by a device code the server starts. */
const NONE = harnessChoices([
  ...pieces('agent-one', 'Agent One', false, [
    { message: 'sign in through the browser', command: 'agent-one auth login', startable: false, kind: 'typed' },
    { message: 'make a long-lived token', command: 'agent-one setup-token', startable: false, kind: 'typed' },
  ]),
  ...pieces('agent-two', 'Agent Two', false, [
    { message: 'sign in with a device code', command: 'tool doctor fix agent-two-sign-in', startable: true, index: 0 },
  ]),
]);

/** The first, installed. */
const INSTALLED = harnessChoices(
  pieces('agent-one', 'Agent One', true, [
    { message: 'sign in through the browser', command: 'agent-one auth login', startable: false, kind: 'typed' },
    { message: 'make a long-lived token', command: 'agent-one setup-token', startable: false, kind: 'typed' },
  ]),
);

/** A box as wide as Setup's column. */
const WIDE: CSSProperties = { width: 760 };

/** What the install printed so far. */
const PRINTED = 'added 1 package in 2s\n';

/** The question on a first visit: each harness the read declares, Activate beside each, and Skip. */
export const NoneActivated: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <HarnessChoice choices={NONE} onStart={() => undefined} onSkip={() => undefined} />
    </div>
  ),
};

/** Activate pressed: the install's run as it is followed. */
export const Installing: StoryObj = {
  render: () => {
    const choice = NONE[0];
    return (
      <div style={WIDE}>
        {choice !== undefined && (
          <HarnessChoice
            choices={NONE}
            activation={{ choice, installed: false, run: <FixRun need={choice.install.name} phase="running" output={PRINTED} /> }}
            onStart={() => undefined}
          />
        )}
      </div>
    );
  },
};

/** The install done, the harness signed out: its run ended, then its sign-in's commands to type, each with the control that copies it. */
export const SignedOut: StoryObj = {
  render: () => {
    const choice = INSTALLED[0];
    return (
      <div style={WIDE}>
        {choice !== undefined && (
          <HarnessChoice
            choices={INSTALLED}
            activation={{
              choice,
              installed: true,
              run: <FixRun need={choice.install.name} phase="succeeded" output={PRINTED} exitCode={0} />,
            }}
            onStart={() => undefined}
          />
        )}
      </div>
    );
  },
};

/** The question skipped in this browser while no harness is activated: one line, and Ask again. */
export const Skipped: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <HarnessSkipped onAskAgain={() => undefined} />
    </div>
  ),
};
