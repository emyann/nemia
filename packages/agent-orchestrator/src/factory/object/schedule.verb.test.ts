/** A factory's schedules as objects (schedule.verb.ts): named by the workflow, spec of the file, status of the listing, nulls left out. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { Schedule } from 'objects';
import type { FactoryListing } from '../factory.ts';
import { scheduleOf } from './schedule.verb.ts';

const mill: Exclude<FactoryListing, { error: string }> = {
  name: 'mill',
  file: '/store/factories/mill.json',
  repos: ['/repo'],
  workflows: ['nightly'],
  hires: {},
  schedules: { nightly: { cron: '0 3 * * *', brief: 'tidy', since: '2026-10-01T00:00:00.000Z' } },
};

test('a schedule is named by its workflow in its factory, its status the listing’s with every null left out', () => {
  const s = scheduleOf(
    {
      factory: 'mill',
      workflow: 'nightly',
      cron: '0 3 * * *',
      tz: null,
      brief: 'tidy',
      repo: null,
      next: '2026-11-05T03:00:00.000Z',
      last: null,
      refused: null,
    },
    mill,
  );
  assert.ok(Schema.is(Schedule)(s));
  assert.equal(s.metadata.name, 'nightly');
  assert.equal(s.metadata.namespace, 'mill');
  assert.deepEqual(s.spec, { cron: '0 3 * * *', brief: 'tidy' });
  assert.deepEqual(s.status, { since: '2026-10-01T00:00:00.000Z', next: '2026-11-05T03:00:00.000Z' });
});
