import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Quota, QuotaWindow } from '@/lib/api/quota';
import { QuotaLine } from './QuotaLine';

/**
 * The quota over a factory's floor: an ask's answer, the windows a token's sessions heard with a turn, and a token none of whose sessions
 * has reported one yet. Times are counted back from when the story is drawn, since the line says how long ago against the clock.
 */
const meta: Meta = { title: 'Board/QuotaLine' };
export default meta;

/** The room of a board at 1440 pixels with the rail open. */
const WIDE: CSSProperties = { width: 1136 };

const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();
const later = (hours: number): string => new Date(Date.now() + hours * 3_600_000).toISOString();

const win = (extra: Partial<QuotaWindow>): QuotaWindow => ({
  key: 'seven_day',
  label: 'week',
  usedPercentage: 40,
  resetsAt: later(30),
  reset: false,
  marked: false,
  ...extra,
});

const ASKED: Quota = {
  state: 'fresh',
  askedAt: ago(2),
  ageMs: 120_000,
  againAt: later(0.1),
  subscription: 'max',
  windows: [win({ key: 'five_hour', label: '5-hour', usedPercentage: 38.4, resetsAt: later(2) }), win({ usedPercentage: 86, marked: true })],
  last: null,
  keepMs: 600_000,
  markAt: 80,
  said: null,
};

/** The measured event: the week at 40%, told a session's turn seven minutes ago. */
const HEARD: Quota = { ...ASKED, subscription: null, windows: [win({})], heard: { at: ago(7), ageMs: 420_000 } };

const NONE_YET: Quota = {
  ...ASKED,
  state: 'no-plan',
  subscription: null,
  windows: [],
  heard: null,
  said: "No plan limits to show yet: the Claude Code the sessions run is signed in by a long-lived token (CLAUDE_CODE_OAUTH_TOKEN), which can make model requests but not read the plan's usage, and no session has reported the plan's utilization with a turn yet. It shows once one has. For the quota on demand, run claude, then /login, under the api's CLAUDE_CONFIG_DIR, take the token away (nemia claude-token rm) and restart the api. Asked again in 8 min.",
};

export const Asked: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <QuotaLine quota={ASKED} error={null} />
    </div>
  ),
};

export const HeardByASession: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <QuotaLine quota={HEARD} error={null} />
    </div>
  ),
};

export const TokenNoneYet: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <QuotaLine quota={NONE_YET} error={null} />
    </div>
  ),
};
