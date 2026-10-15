import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { DaemonDot } from '@/lib/footer';
import type { Quota, QuotaWindow } from '@/lib/api';
import type { Strip } from '@/lib/strip';
import { StripView } from './OverviewStrip';

/** The Overview's strip: a busy day, a quiet one, the quota past its mark, the daemon stalled, and a box too narrow for one row. */
const meta: Meta = { title: 'Board/OverviewStrip' };
export default meta;

/** The instant the stories' answers were read at. */
const NOW = Date.parse('2026-10-14T17:00:00.000Z');

/** The room of a board at 1440 pixels with the rail open. */
const WIDE: CSSProperties = { width: 1136 };

/** A phone's room. */
const NARROW: CSSProperties = { width: 360 };

const BUSY: Strip = {
  waitsOnYou: 2,
  inFlight: 5,
  landed: 12,
  failed: 1,
  spentUsd: 230.4,
  perLanding: 12.18,
  runs: { count: 5, cap: 7 },
  sessions: { count: 2, cap: 50 },
  agents: { count: 2, hired: 6 },
  rows: [
    {
      agent: 'ada',
      step: 'implement',
      run: 'r-1',
      title: 'The kit batch, and every part of it the board draws',
      minutes: 17,
      atWork: '17m',
    },
    { agent: 'otto', step: 'land', run: 'r-2', title: 'The runs page', minutes: 9, atWork: '9m' },
    { agent: 'agora', step: 'review', run: 'r-3', title: 'The quota meter', minutes: 4, atWork: '4m' },
  ],
  more: 2,
};

const QUIET: Strip = {
  ...BUSY,
  waitsOnYou: 0,
  inFlight: 0,
  landed: 0,
  failed: 0,
  spentUsd: 0,
  perLanding: null,
  runs: { count: 0, cap: null },
  sessions: { count: 0, cap: null },
  agents: { count: 0, hired: null },
  rows: [],
  more: 0,
};

const TICKING: DaemonDot = { kind: 'ticking', tone: 'ok', word: 'ticking', title: 'The api ticks this store.' };
const STALLED: DaemonDot = { kind: 'stalled', tone: 'warn', word: 'stalled', title: 'The daemon has not ticked for 4 minutes.' };

/** A window `extra` says. */
const win = (extra: Partial<QuotaWindow>): QuotaWindow => ({
  key: 'five_hour',
  label: '5-hour',
  usedPercentage: 42,
  resetsAt: '2026-10-14T19:00:00.000Z',
  reset: false,
  marked: false,
  ...extra,
});

/** A fresh reading of `windows`. */
const quota = (windows: QuotaWindow[]): Quota => ({
  state: 'fresh',
  askedAt: '2026-10-14T16:58:00.000Z',
  ageMs: 120_000,
  againAt: null,
  subscription: 'max',
  windows,
  last: null,
  keepMs: 300_000,
  markAt: 80,
  said: null,
});

const CALM = quota([win({}), win({ key: 'seven_day', label: 'week', usedPercentage: 31, resetsAt: '2026-10-21T11:00:00.000Z' })]);
const PAST = quota([
  win({ usedPercentage: 64 }),
  win({ key: 'seven_day', label: 'week', usedPercentage: 86, marked: true, resetsAt: '2026-10-15T11:00:00.000Z' }),
]);

export const BusyDay: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <StripView strip={BUSY} dot={TICKING} quota={CALM} quotaError={null} now={NOW} />
    </div>
  ),
};

export const QuietDay: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <StripView strip={QUIET} dot={TICKING} quota={CALM} quotaError={null} now={NOW} />
    </div>
  ),
};

export const QuotaPastTheMark: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <StripView strip={BUSY} dot={TICKING} quota={PAST} quotaError={null} now={NOW} />
    </div>
  ),
};

export const DaemonStalled: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <StripView strip={BUSY} dot={STALLED} quota={CALM} quotaError={null} now={NOW} />
    </div>
  ),
};

export const Narrow: StoryObj = {
  render: () => (
    <div style={NARROW}>
      <StripView strip={BUSY} dot={TICKING} quota={PAST} quotaError={null} now={NOW} />
    </div>
  ),
};
