/**
 * The Stats page's section on the system (`StatsSystem`), as data: the ranges it offers, the traces each chart draws off the series the api
 * serves, where a value falls in a drawing, and each factory's landings over a range.
 */
import type { FactoryDays, SeriesPoint, SeriesRange, SeriesRead } from './api.ts';
import { msWord } from './pass.ts';
import { durationWord } from './stats.ts';

/** The ranges the section offers, in order, the last day the default. */
export const SERIES_RANGES: ReadonlyArray<{ id: SeriesRange; label: string }> = [
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All' },
];

/**
 * One line of a chart: its values in time, oldest first, scaled to `top`, each said in `words`; drawn as a filled area behind the lines
 * where `area`.
 */
export type Trace = {
  key: string;
  label: string;
  area: boolean;
  top: number;
  words: (v: number) => string;
  values: Array<{ t: string; v: number }>;
};

/** One chart of the section: its traces, and what it says it draws. */
export type SystemChart = { key: 'pass' | 'admission' | 'quota'; title: string; about: string; traces: Trace[] };

/** The values `pick` takes off each point of the series `s`, over every label set, oldest first; a point it says nothing of left out. */
const valuesOf = (read: SeriesRead, s: string, pick: (p: SeriesPoint) => number | undefined): Trace['values'] =>
  read.series
    .filter((x) => x.s === s)
    .flatMap((x) => x.points.flatMap((p) => (pick(p) === undefined ? [] : [{ t: p.t, v: pick(p)! }])))
    .sort((a, b) => a.t.localeCompare(b.t));

/** The top of a scale for `values`: their most, and 1 for none or a most of 0. */
export const topOf = (values: Trace['values']): number => Math.max(1, ...values.map((x) => x.v));

const ms = (v: number): string => `${msWord(v)} ms`;
const count = (v: number): string => `${Math.round(v)}`;
const percent = (v: number): string => `${Math.round(v)}%`;

/**
 * The charts of `read`: a pass's time at p95 and p50 on one scale, beside the most runs in the store on its own; the longest a queued
 * session waited beside the most sessions queued; and each quota window's use at its most, on a scale of 100. A trace with no value is
 * left out, so a chart with none says nothing was kept.
 */
export function systemCharts(read: SeriesRead): SystemChart[] {
  const p95 = valuesOf(read, 'pass.ms', (p) => p.p95);
  const p50 = valuesOf(read, 'pass.ms', (p) => p.p50);
  const passTop = topOf([...p95, ...p50]);
  const runs = valuesOf(read, 'store.runs', (p) => p.max);
  const wait = valuesOf(read, 'admission.wait.ms', (p) => p.max);
  const queued = valuesOf(read, 'sessions.queued', (p) => p.max);
  const quota = read.series
    .filter((x) => x.s === 'quota.used')
    .map((x) => ({
      key: `quota ${x.l.harness ?? ''} ${x.l.window ?? ''}`,
      label: `${x.l.harness ?? ''} ${x.l.window ?? ''}`,
      area: false,
      top: 100,
      words: percent,
      values: x.points.map((p) => ({ t: p.t, v: p.max })),
    }));
  const kept = (traces: Trace[]) => traces.filter((x) => x.values.length);
  return [
    {
      key: 'pass',
      title: 'A pass, against the store',
      about: 'its time at p95 and p50, beside the most runs in the store',
      traces: kept([
        { key: 'runs', label: 'runs in the store', area: true, top: topOf(runs), words: count, values: runs },
        { key: 'p95', label: 'p95', area: false, top: passTop, words: ms, values: p95 },
        { key: 'p50', label: 'p50', area: false, top: passTop, words: ms, values: p50 },
      ]),
    },
    {
      key: 'admission',
      title: 'Admission',
      about: 'the longest a queued session waited, beside the most sessions queued',
      traces: kept([
        { key: 'queued', label: 'queued', area: true, top: topOf(queued), words: count, values: queued },
        { key: 'wait', label: 'longest wait', area: false, top: topOf(wait), words: durationWord, values: wait },
      ]),
    },
    { key: 'quota', title: 'Quota burn', about: "each window's use at its most, of 100%", traces: kept(quota) },
  ];
}

/** Where `t` and `v` fall in a drawing `width` by `height` whose left edge is `from` and right edge `to`, its foot 0 and its head `top`. */
export function placeOf(
  { t, v }: { t: string; v: number },
  frame: { from: string; to: string; top: number; width: number; height: number },
): [number, number] {
  const from = Date.parse(frame.from);
  const span = Math.max(1, Date.parse(frame.to) - from);
  const x = Math.min(1, Math.max(0, (Date.parse(t) - from) / span)) * frame.width;
  const y = frame.height - (Math.max(0, v) / frame.top) * frame.height;
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
}

const DAY_MS = 86_400_000;

/** The first UTC day of the stats a range reads as of `now`: the day it reaches back to, and null for every day kept. */
export function rangeFrom(range: SeriesRange, now: Date): string | null {
  const days = { '24h': 1, '7d': 7, '30d': 30, all: null }[range];
  return days === null ? null : new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);
}

/** A factory's landings over a range: every day the api answered, with how many landed and what they cost; and their totals. */
export type Landings = {
  factory: string;
  landed: number;
  costUsd: number | null;
  days: Array<{ day: string; landed: number; costUsd: number | null }>;
};

/**
 * Each factory's landings over the days the api answered: on each day how many landed (0 where none did or nothing said) and what they
 * cost, the landings times the mean cost of one (null where no landed run's cost was measured); and their totals. A factory that landed
 * nothing is left out, the most landed first.
 */
export function landingsOf(groups: readonly FactoryDays[]): Landings[] {
  return groups
    .flatMap(({ key, days }) => {
      const each = days.map(({ day, landed, costPerLanded }) => ({
        day,
        landed: landed ?? 0,
        costUsd: landed && costPerLanded !== null ? landed * costPerLanded : null,
      }));
      const landed = each.reduce((n, d) => n + d.landed, 0);
      const costs = each.flatMap((d) => (d.costUsd === null ? [] : [d.costUsd]));
      return key === null || !landed
        ? []
        : [{ factory: key, landed, costUsd: costs.length ? costs.reduce((n, c) => n + c, 0) : null, days: each }];
    })
    .sort((a, b) => b.landed - a.landed || a.factory.localeCompare(b.factory));
}
