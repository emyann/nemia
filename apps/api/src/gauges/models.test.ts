/**
 * GET /api/models (app.ts, models.ts): the models each harness lists, as the daemon last recorded them in `models.json` of the harness's
 * scratch store (`root`) — read and never written by the api; none while the daemon has recorded nothing.
 */
import { root } from '../../test/harness.ts';
import { afterEach, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../app.ts';

const FILE = path.join(root, 'models.json');

describe('GET /api/models: what the daemon recorded of each harness, and nothing where it recorded none', () => {
  afterEach(() => fs.rmSync(FILE, { force: true }));

  test('with no record, no harness is listed', async () => {
    const res = await app.request('/api/models');
    assert.equal(res.status, 200, await res.clone().text());
    assert.deepEqual(await res.json(), { harnesses: [] });
  });

  test('a recorded harness is served with its models, a fact the harness left unsaid as null', async () => {
    fs.writeFileSync(
      FILE,
      JSON.stringify({
        claude: {
          at: '2026-11-26T10:00:00.000Z',
          models: [
            { id: 'claude-opus-5-5', aliases: ['opus'], name: 'Opus 5.5', keepsAuto: true, efforts: ['low', 'high'] },
            { id: 'claude-haiku-4-5', aliases: [], name: 'Haiku 4.5' },
          ],
        },
      }),
    );
    const before = fs.readFileSync(FILE, 'utf8');
    const res = await app.request('/api/models');
    assert.equal(res.status, 200, await res.clone().text());
    assert.deepEqual(await res.json(), {
      harnesses: [
        {
          harness: 'claude',
          at: '2026-11-26T10:00:00.000Z',
          models: [
            { id: 'claude-opus-5-5', aliases: ['opus'], name: 'Opus 5.5', keepsAuto: true, efforts: ['low', 'high'] },
            { id: 'claude-haiku-4-5', aliases: [], name: 'Haiku 4.5', keepsAuto: null, efforts: null },
          ],
        },
      ],
    });
    assert.equal(fs.readFileSync(FILE, 'utf8'), before, 'the api reads models.json and never writes it');
  });
});
