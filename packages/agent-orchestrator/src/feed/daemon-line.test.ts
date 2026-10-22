/**
 * The feed's daemon line (`startedLine`): what it says of the daemon before, how a person reads it, that the fold and a pass's lines
 * ignore it, and that the store appends it as it appends a pass's and reads it back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { DaemonFile, DaemonStanding } from '../daemon/daemon.ts';
import { feedChanges, feedLineWords, foldFeed, freshFold, startedLine, upgraded, type FeedLine, type FeedWords } from './feed.ts';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-daemon-line-');
process.env.WF_ROOT = ROOT;
const { freshFeedMemo, readFeed, recordDaemonLine, recordFeed } = await import('./feed.store.ts');
const FEED = path.join(ROOT, 'feed.jsonl');

const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const AT = new Date(NOW).toISOString();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

/** A lease the daemon of pid 4242 wrote, with `over` on it. */
const file = (over: Partial<DaemonFile> = {}): DaemonFile => ({
  pid: 4242,
  by: 'api',
  startedAt: ago(60),
  cwd: '/srv/nemia',
  every: 4000,
  passedAt: ago(5),
  ...over,
});

/** The lease standing as `kind`, its pid confirmed. */
const standing = (kind: 'stopped' | 'gone' | 'stalled', over: Partial<DaemonFile> = {}): DaemonStanding => ({
  kind,
  file: file(over),
  last: NOW - 300_000,
  quiet: 300_000,
  identity: 'same',
});

test('a daemon’s line says how the one before it ended: stopped and when, gone without a stop and how, or none before it', () => {
  assert.deepEqual(
    startedLine(5151, { kind: 'none' }, AT, NOW),
    {
      at: AT,
      daemon: 5151,
      word: 'daemon started',
      note: 'first daemon on this store',
      apiVersion: 'nemia/v1',
      involved: { kind: 'Daemon', name: '5151' },
      labels: {},
      reason: 'DaemonStarted',
      type: 'Normal',
      source: 'daemon',
      message: 'daemon started · first daemon on this store',
    },
    'involved by its pid, no run\u2019s labels, its own source',
  );
  assert.equal(startedLine(5151, standing('stopped', { stoppedAt: ago(1) }), AT, NOW).note, `last stopped at ${ago(1)}`);
  assert.match(
    startedLine(5151, standing('gone'), AT, NOW).note ?? '',
    /^last gone without a stop: took the store over from pid 4242, whose process is gone — its last pass 5m00s ago \(/,
  );
  assert.match(
    startedLine(5151, standing('stalled'), AT, NOW).note ?? '',
    /^last gone without a stop: took the store over from pid 4242, alive but silent/,
  );
  assert.match(
    startedLine(5151, { kind: 'unreadable', text: '{' }, AT, NOW).note ?? '',
    /^last gone without a stop: took the store over from a daemon\.json that did not read as a holder$/,
  );
});

test('a person reads a daemon’s line by its pid, where a run’s names its run and step', () => {
  assert.equal(
    feedLineWords(startedLine(5151, { kind: 'none' }, AT, NOW)),
    '12:00:00  pid 5151  daemon started  · first daemon on this store',
  );
  assert.equal(feedLineWords({ at: AT, run: 'r-1', word: 'running' }), '12:00:00  r-1  —  running');
});

test('REFUSED: a daemon’s line is no run’s — the fold keeps none of it, and a pass owes no `removed` for it', () => {
  const running: FeedWords = { run: { word: 'running' }, steps: [] };
  const lines: FeedLine[] = [{ at: AT, run: 'r-1', word: 'running' }, startedLine(5151, { kind: 'none' }, AT, NOW)];
  const fold = foldFeed(freshFold(), lines);
  assert.deepEqual([...fold.said.keys()], ['Run/r-1'], "a daemon's line is of no run, and the fold keys on what a line is about");
  assert.deepEqual(feedChanges(fold, new Map([['r-1', running]]), AT), [], 'nothing moved, and nothing is gone');
});

test('the store appends a daemon’s line after a torn one, reads it back, and a pass beside it writes only what moved', () => {
  fs.rmSync(FEED, { force: true });
  fs.writeFileSync(FEED, '{"at":"x","run":"r-torn","wo');
  const line = startedLine(5151, { kind: 'none' }, AT, NOW);
  const appended = recordDaemonLine(line);
  assert.equal(appended.leading, '\n', 'the torn line is ended first');
  assert.deepEqual(appended.lines, [line]);
  assert.equal(appended.after, fs.statSync(FEED).size);
  assert.deepEqual(readFeed(0).lines, [line]);

  const memo = freshFeedMemo();
  const running: FeedWords = { run: { word: 'running' }, steps: [] };
  const ran = upgraded({ at: AT, run: 'r-1', word: 'running' });
  assert.deepEqual(recordFeed(new Map([['r-1', running]]), { at: AT, memo }).lines, [ran]);
  assert.deepEqual(recordFeed(new Map([['r-1', running]]), { at: AT, memo }).lines, [], 'a daemon line read back owes nothing');
  assert.deepEqual(readFeed(0).lines, [line, ran]);
});
