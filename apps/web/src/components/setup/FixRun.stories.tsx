import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FixRun } from './FixRun';

/** A fix the server runs, as Setup follows it: running with a device code and a link, done, and failed. */
const meta: Meta = { title: 'Board/FixRun' };
export default meta;

/** What a device-code sign-in prints. */
const SIGN_IN = '! First copy your one-time code: K7QM-3XRP\nOpen https://example.com/login/device in your browser.\n';

/** The pattern the need declares for its code. */
const CODE = '[A-Z0-9]{4}-[A-Z0-9]{4}';

/** A box as wide as a phone. */
const PHONE: CSSProperties = { width: 360 };

/** A box as wide as Setup's column. */
const WIDE: CSSProperties = { width: 760 };

/** Running, its code large over its output, its link a link. */
export const Running: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <FixRun need="tool-sign-in" phase="running" output={SIGN_IN} code={CODE} />
    </div>
  ),
};

/** The same at a phone's width. */
export const Phone: StoryObj = {
  render: () => (
    <div style={PHONE}>
      <FixRun need="tool-sign-in" phase="running" output={SIGN_IN} code={CODE} />
    </div>
  ),
};

/** Started, nothing printed yet. */
export const Pending: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <FixRun need="git-identity" phase="pending" output="" />
    </div>
  ),
};

/** Ended well. */
export const Done: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <FixRun need="tool-sign-in" phase="succeeded" output={`${SIGN_IN}✓ Logged in\n`} code={CODE} exitCode={0} />
    </div>
  ),
};

/** Ended in a failure. */
export const Failed: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <FixRun need="git-identity" phase="failed" output="error: could not lock config file\n" exitCode={255} />
    </div>
  ),
};
