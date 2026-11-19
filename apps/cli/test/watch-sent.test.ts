/**
 * One event of `nemia watch`'s stream as the client reads it (`onSent`, `src/watch/watch.ts`): each decoded by `objects`'
 * `FeedStreamEvent`, and one whose data does not decode said on stderr by its name and left out, never read as `undefined`.
 */
import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { type Asked, type At, onSent } from '../src/watch/watch.ts';

const asked: Asked = { once: true, how: {}, selectors: [] };

/**
 * What `onSent` said on stderr and stdout of `sent`, and what it answered: the spies are restored after each read, since a second spy on
 * the same method is the first one, and would count the lines of the reads before it.
 */
const read = (sent: Parameters<typeof onSent>[0], at: At = { cursor: 0, hinted: false }) => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    const answered = onSent(sent, asked, at);
    return { answered, err: err.mock.calls.map((c) => c.join(' ')), out: out.mock.calls.map((c) => c.join(' ')), at };
  } finally {
    vi.restoreAllMocks();
  }
};

test('a hint and a failed read are said on stderr from their decoded data', () => {
  assert.deepEqual(read({ event: 'hint', data: JSON.stringify({ message: 'say waits=person' }) }).err, ['nemia watch: say waits=person']);
  const cut = read({ event: 'unreadable', data: JSON.stringify({ error: 'the feed was replaced', retrying: false }) });
  assert.equal(cut.answered, 'cut');
  assert.deepEqual(cut.err, ['nemia watch: the feed was replaced']);
});

test('REFUSED: an event whose data does not decode is said on stderr by its name, never as undefined, and the watch goes on', () => {
  for (const [event, data] of [
    ['hint', { note: 'a hint the api now words otherwise' }],
    ['unreadable', { message: 'EIO' }],
    ['step', { run: 'r-1', step: 'plan' }],
  ] as const) {
    const said = read({ event, data: JSON.stringify(data), id: '10' });
    assert.equal(said.answered, undefined, `${event}: the watch goes on`);
    assert.equal(said.err.length, 1, `${event}: one line on stderr`);
    assert.ok(said.err[0]?.includes(`\`${event}\``), `${event}: the line names the event: ${said.err[0]}`);
    assert.ok(!said.err[0]?.includes('undefined'), `${event}: nothing read as undefined: ${said.err[0]}`);
    assert.deepEqual(said.out, [], `${event}: nothing printed as a line`);
    assert.equal(said.at.cursor, 0, `${event}: the cursor stays where it was`);
  }
});
