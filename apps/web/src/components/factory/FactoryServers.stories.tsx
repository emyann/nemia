import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FactoryServer, BuiltinServer } from '@/lib/api';
import { ServerForm, ServerRow, ServerState } from './FactoryServers';
import { SignInView } from './ServerSignIn';

/**
 * A factory's MCP servers: every state a chip carries, a row in each of them, and the form that records a remote one. The colour of a
 * state is what no node test can judge — `needs-auth` is the one that waits on a person, and a state that could not be read is a note
 * in rest and not a caution — so each is drawn here.
 */
const meta: Meta = { title: 'Board/FactoryServers' };
export default meta;

/** A row of a factory's list, in the state `state`, with whatever else that state comes with. */
const server = (name: string, state: string | null, more: Partial<FactoryServer> = {}): FactoryServer => ({
  name,
  type: 'http',
  url: 'https://api.githubcopilot.com/mcp/',
  state,
  ...more,
});

/** The box a section of the settings page gives its list. */
const BOX: CSSProperties = { width: 720 };

/** Nemia's builtin servers, as the form offers them: a press fills the fields, so a person types no address and no client id. */
const BUILTIN: readonly BuiltinServer[] = [
  {
    name: 'github',
    type: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    oauth: { clientId: 'Iv1.b507a08c87ecfe98', callbackPort: 33418 },
  },
];

/** Every state a chip carries, the two the board draws for itself last: none read, and a word a newer harness grew. */
export const States: StoryObj = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2" style={BOX}>
      {['connected', 'needs-auth', 'failed', 'pending', 'disabled', null, 'reconnecting'].map((state) => (
        <ServerState key={state ?? 'unread'} state={state} />
      ))}
    </div>
  ),
};

/** A row in each state: its tools where it has them, its sign-in facts, and the harness's own words where it failed. */
export const Rows: StoryObj = {
  render: () => (
    <ul className="flex flex-col gap-2" style={BOX}>
      <ServerRow
        server={server('github', 'connected', { tools: 42, oauth: { clientId: 'Iv1.b507a08c87ecfe98', callbackPort: 33418 } })}
        pending={false}
        onRemove={() => {}}
        signIn={
          <SignInView name="github" shown={{ at: 'connected' }} refused={null} pending={false} onSignIn={() => {}} onSignOut={() => {}} />
        }
      />
      <ServerRow
        server={server('linear', 'needs-auth', { oauth: { clientId: 'lin_app_01' } })}
        pending={false}
        onRemove={() => {}}
        signIn={
          <SignInView name="linear" shown={{ at: 'offer' }} refused={null} pending={false} onSignIn={() => {}} onSignOut={() => {}} />
        }
      />
      <ServerRow server={server('sentry', 'failed', { error: 'connect ETIMEDOUT 140.82.121.6:443' })} pending={false} onRemove={() => {}} />
      <ServerRow server={server('notion', 'pending')} pending={false} onRemove={() => {}} />
      <ServerRow server={server('figma', 'disabled', { type: 'sse' })} pending={false} onRemove={() => {}} />
      <ServerRow server={server('slack', null, { headers: { 'x-team': 'nemia' } })} pending={false} onRemove={() => {}} />
    </ul>
  ),
};

/** The form as a person meets it: the builtin list to press, and the fields a remote server needs. */
export const Form: StoryObj = {
  render: () => (
    <div style={BOX}>
      <ServerForm builtin={BUILTIN} pending={false} onRecord={() => {}} />
    </div>
  ),
};

/** The form while a write is in flight: its press is disabled, and nothing of the draft is lost. */
export const Writing: StoryObj = {
  render: () => (
    <div style={BOX}>
      <ServerForm builtin={BUILTIN} pending onRecord={() => {}} />
    </div>
  ),
};
