/**
 * Why a step's session alone could not be read, as a person is told it (`StepNeeds.sessionUnread`): the runtime's words off the views the
 * request already read, by the step's own task, and nothing where its view says nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TaskView } from '../runtime-client.ts';
import type { Run } from '../record/record.ts';
import { needsOf } from './judged.verb.ts';

const at = (s: number) => new Date(Date.parse('2026-10-06T06:00:00.000Z') + s * 1000).toISOString();

/** A task at work on its first attempt, its session unread where `unreadWhy` is given. */
const working = (taskId: string, unreadWhy?: string): TaskView => ({
  id: taskId,
  phase: 'starting',
  sessionId: null,
  ...(unreadWhy === undefined ? {} : { unreadWhy }),
  state: {
    taskId,
    brief: 'Build it.',
    cwd: '/nowhere',
    attempts: [
      {
        n: 1,
        startedAt: at(1),
        spawnedAt: at(1),
        ended: null,
        endedAt: null,
        reason: null,
        nativeId: null,
        usage: null,
        exitCode: null,
      },
    ],
    said: [],
    inputs: [],
    closed: false,
    stopRequested: false,
    settled: null,
    filedAt: at(0),
  },
});

const run = {
  id: 'r-unread',
  steps: { build: { taskId: 't-build' }, review: { taskId: 't-review' } },
} as unknown as Run;

const starting = { phase: 'running', reason: 'Running', on: null, via: null, verdict: null } as const;

const judged = {
  codes: new Map([
    ['build', starting],
    ['review', starting],
  ]),
  waitingOnYou: [] as string[],
  beside: new Map<string, { waits?: string; denied?: string }>(),
};

test("REFUSED: a step whose session alone is unread says why in the runtime's words, by its own task, and a step read beside it says nothing", () => {
  const words = 'a line of its output does not decode: Expected string, got 7 at ["id"]';
  const views = new Map([
    ['t-build', working('t-build', words)],
    ['t-review', working('t-review')],
  ]);
  assert.equal(needsOf(run, 'build', views, judged).sessionUnread, words, 'the words as the runtime said them');
  assert.equal(needsOf(run, 'review', views, judged).sessionUnread, null, 'the step read beside it: none, not the other step’s');
  assert.equal(needsOf(run, 'build', new Map([['t-build', working('t-build')]]), judged).sessionUnread, null, 'the next look reads it');
  assert.equal(needsOf(run, 'build', new Map(), judged).sessionUnread, null, 'a step whose task no view has: none');
});
