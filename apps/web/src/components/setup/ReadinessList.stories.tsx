import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Readiness } from 'objects';
import { ReadinessList } from './ReadinessList';

/** The readiness read as the Setup page draws it: pieces missing, in place and unknown, with fixes typed and started. */
const meta: Meta = { title: 'Board/ReadinessList' };
export default meta;

/** A server half set up: the harness's token missing, its service in place, the bind unknown, and a workflow's sign-in missing. */
const HALF: Readiness = {
  ready: false,
  pieces: [
    {
      name: 'harness-token',
      area: 'harness',
      state: 'missing',
      message: 'no token of the harness is set: a session cannot start',
      fixes: [{ message: 'set the token the harness made for you', command: 'tool token set', startable: false }],
    },
    { name: 'service', area: 'service', state: 'met', message: 'the service runs, and lingers after you log out', fixes: [] },
    { name: 'bind', area: 'bind', state: 'unknown', message: 'the bound address could not be read', fixes: [], addressKind: 'private' },
    {
      name: 'git-identity',
      area: 'place',
      state: 'missing',
      message: 'git has a name and an email to commit under',
      fixes: [
        {
          message: 'set the name and the email git commits under, for this machine',
          command: 'git config --global user.name "$NEMIA_ANSWER_NAME"',
          startable: true,
          index: 0,
          asks: [
            { name: 'name', message: 'the name your commits are made under' },
            { name: 'email', message: 'the email your commits are made under' },
          ],
        },
      ],
    },
    {
      name: 'tool-sign-in',
      area: 'workflow',
      state: 'missing',
      message: 'the tool is signed in with the scope the workflow needs',
      factory: 'acme',
      workflow: 'build',
      fixes: [
        { message: 'sign in with a device code', command: 'tool auth login', startable: true, index: 0, code: '[A-Z0-9]{4}-[A-Z0-9]{4}' },
      ],
    },
  ],
};

/** A harness installed and signed out: its install in place, offering Deactivate, and its sign-in's commands to type. */
const ACTIVATED: Readiness = {
  ready: false,
  pieces: [
    {
      name: 'agent-one',
      area: 'harness',
      state: 'met',
      message: 'Agent One is installed: 1.2.3, the version this release was tested with',
      fixes: [{ message: 'deactivate it', command: 'tool doctor fix agent-one --index 1', startable: true, index: 1, kind: 'removes' }],
      harness: { name: 'agent-one', part: 'install' },
    },
    {
      name: 'agent-one-sign-in',
      area: 'harness',
      state: 'missing',
      message: 'Agent One is signed in',
      fixes: [{ message: 'sign in through the browser', command: 'agent-one auth login', startable: false, kind: 'typed' }],
      harness: { name: 'agent-one', part: 'sign-in' },
    },
  ],
};

/** Everything in place. */
const READY: Readiness = {
  ready: true,
  pieces: [{ name: 'service', area: 'service', state: 'met', message: 'the service runs, and lingers after you log out', fixes: [] }],
};

/** A box as wide as a phone. */
const PHONE: CSSProperties = { width: 360 };

/** A box as wide as Setup's column. */
const WIDE: CSSProperties = { width: 760 };

/** A server half set up, in Setup's column. */
export const Missing: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ReadinessList readiness={HALF} onStart={() => undefined} />
    </div>
  ),
};

/** The same at a phone's width: the commands wrap, nothing runs out of the box. */
export const Phone: StoryObj = {
  render: () => (
    <div style={PHONE}>
      <ReadinessList readiness={HALF} onStart={() => undefined} />
    </div>
  ),
};

/** A start the api refused, said under its fix. */
export const Refused: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ReadinessList
        readiness={HALF}
        onStart={() => undefined}
        refused={{ key: 'acme/build/tool-sign-in/0', message: 'the factory acme is not trusted: trust it, then start the fix again' }}
      />
    </div>
  ),
};

/** A harness's Deactivate refused while a run that needs it has not finished, said under it as any refused start is. */
export const DeactivateRefused: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ReadinessList
        readiness={ACTIVATED}
        onStart={() => undefined}
        refused={{
          key: '//agent-one/1',
          message: 'agent-one is needed by a run that has not finished: stop it (tool cancel run-1), then deactivate it again',
        }}
      />
    </div>
  ),
};

/** Everything in place. */
export const Ready: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <ReadinessList readiness={READY} onStart={() => undefined} />
    </div>
  ),
};
