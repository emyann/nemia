/**
 * A write sent as JSON (`jsonBodied`): a write with no body is given `{}` as `content-type: application/json`, as the api's write guard
 * takes it; a read, and a write with a body of its own, go as they are.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpClientRequest } from 'effect/http';
import { jsonBodied } from 'objects';

test('REFUSED by the guard until mapped: a write with no body is given `{}` as JSON', () => {
  for (const request of [HttpClientRequest.put('/w'), HttpClientRequest.post('/w'), HttpClientRequest.delete('/w')]) {
    assert.equal(request.body._tag, 'Empty');
    const sent = jsonBodied(request);
    assert.equal(sent.body._tag, 'Uint8Array');
    assert.equal(sent.body.contentType, 'application/json');
    assert.equal(new TextDecoder().decode((sent.body as { body: Uint8Array }).body), '{}');
  }
});

test('a read, and a write with a body of its own, go as they are', () => {
  const read = HttpClientRequest.get('/r');
  assert.equal(jsonBodied(read), read);
  const written = HttpClientRequest.bodyText(HttpClientRequest.post('/w'), 'x', 'text/plain');
  assert.equal(jsonBodied(written), written);
});
