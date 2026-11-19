/** The host of a volume's origin, as `originParams` is asked with it: each spelling of a git URL, and none for a path or a file URL. */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { originHostOf } from './origin-params.ts';

describe('the host of a git URL, lower-cased, and none where the volume was given by its path', () => {
  const rows: Array<[string | undefined, string | undefined]> = [
    ['https://GitHub.com/acme/app.git', 'github.com'],
    ['ssh://git@github.com/acme/app.git', 'github.com'],
    ['git@github.com:acme/app.git', 'github.com'],
    ['https://example.org:8443/acme/app', 'example.org'],
    ['file:///srv/app.git', undefined],
    ['/srv/app', undefined],
    [undefined, undefined],
  ];
  for (const [origin, host] of rows) test(`${String(origin)} → ${String(host)}`, () => assert.equal(originHostOf(origin), host));
});
