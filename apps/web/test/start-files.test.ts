/**
 * The files a start hands its run, uploaded one after another before the start names them (`files.uploaded`, src/lib/api/objects.ts): a
 * file an earlier press uploaded is named by its id and not sent again, the first refusal stops the loop and names its file, and a start
 * refused for a file the api keeps no more forgets that file's id (`files.unkept`), so the next press uploads it again. The api's answers
 * are stubbed on the fetch the objects' client calls.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { WriteRefusal } from '../src/lib/api/read.ts';
import { files } from '../src/lib/api/objects.ts';

/** An upload's answer: the file kept under `id`. */
const kept = (id: string, name: string) => ({ id, name, mediaType: 'image/png', size: 1, createdAt: '2026-11-16T10:00:00.000Z' });

/**
 * Every request answered in turn by `answers`, each a status and a body, for the length of the test: the paths asked, in order.
 * @param t The test, whose end puts the fetch back.
 * @param answers What each request is answered, in order.
 */
function answering(t: { onTestFinished: (fn: () => void) => void }, answers: Array<[number, unknown]>) {
  const before = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = async (url: string | URL | Request) => {
    asked.push(String(url));
    const [status, body] = answers[asked.length - 1] ?? [500, { error: 'no answer stubbed' }];
    return new Response(JSON.stringify(body), { status });
  };
  t.onTestFinished(() => {
    globalThis.fetch = before;
  });
  return asked;
}

const UPLOAD = '/api/namespaces/default/files';

test('a file already sent is named by its id and not uploaded again, and the first refused stops the loop naming its file', async (t) => {
  const first = new File(['a'], 'first.png');
  const second = new File(['b'], 'second.png');
  const third = new File(['c'], 'third.png');
  const asked = answering(t, [[413, { error: 'past the limit' }]]);
  const sent = new Map([[first, 'file_0123456789abcdef0123456789abcdef']]);
  const told: number[] = [];
  const refused = await files.uploaded('default', { listed: [first, second, third], sent, onSent: (n) => told.push(n) }).then(
    () => assert.fail('the upload was refused'),
    (error: unknown) => error,
  );
  assert.deepEqual(
    asked.map((url) => new URL(url, 'http://board').pathname),
    [UPLOAD],
    'one upload: the second file, not the first again, nor the third',
  );
  assert.ok(refused instanceof WriteRefusal);
  assert.equal(refused.status, 413);
  assert.match(refused.message, /second\.png/, 'the refusal names the file');
  assert.deepEqual(told, [1], 'the first counted as sent, from its id');
  assert.deepEqual([...sent.keys()], [first], 'nothing set for the refused file');
});

test('a start refused 422 naming a file the api keeps no more forgets its id, and the next press uploads it again', async (t) => {
  const stale = 'file_00000000000000000000000000000001';
  const still = 'file_00000000000000000000000000000002';
  const gone = new File(['a'], 'gone.png');
  const other = new File(['b'], 'other.png');
  const sent = new Map([
    [gone, stale],
    [other, still],
  ]);
  const unnamed = new WriteRefusal(`a refusal naming ${stale}`, 409);
  assert.deepEqual(files.unkept(sent, unnamed), [], 'a refusal of another status forgets nothing');
  assert.deepEqual(files.unkept(sent, new WriteRefusal('no file named', 422)), [], 'a 422 naming no id forgets nothing');
  assert.deepEqual(files.unkept(sent, new Error(stale)), [], 'what is no refusal of the api forgets nothing');
  assert.equal(sent.size, 2);

  assert.deepEqual(files.unkept(sent, new WriteRefusal(`the input gone.png names the file ${stale}`, 422)), [gone]);
  assert.deepEqual([...sent.values()], [still], 'the file still kept keeps its id');

  const fresh = 'file_00000000000000000000000000000003';
  const asked = answering(t, [[200, kept(fresh, 'gone.png')]]);
  const inputs = await files.uploaded('default', { listed: [gone, other], sent });
  assert.equal(asked.length, 1, 'only the forgotten file is uploaded again');
  assert.deepEqual(inputs, [
    { name: 'gone.png', file: fresh },
    { name: 'other.png', file: still },
  ]);
  assert.equal(sent.get(gone), fresh);
});
