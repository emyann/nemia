/**
 * The OpenAPI document's reference page (`GET /openapi`): a page that reads the document at `OPENAPI_PATH` and loads its viewer's script
 * from this api, never from another host.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { OPENAPI_PATH, REFERENCE_PATH, REFERENCE_SCRIPT_PATH } from './index.ts';
import { appOver, eachTest } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const app = eachTest(() => appOver(standIn(), stand()));

test('`GET /openapi` answers a page that reads the served document and loads its script from this api', async () => {
  const res = await app().request(REFERENCE_PATH);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/, 'the answer is a page');
  const page = await res.text();
  assert.ok(page.includes(`"url": "${OPENAPI_PATH}"`), 'the page reads the document the api serves at OPENAPI_PATH');
  const sources = [...page.matchAll(/<script[^>]*\bsrc="([^"]*)"/g)].map(([, src]) => src);
  assert.deepEqual(sources, [REFERENCE_SCRIPT_PATH], "the page's one script is the api's own copy of the viewer");
  assert.doesNotMatch(page, /https?:\/\//, 'the page names no other host');
  assert.ok(page.includes('"withDefaultFonts": false'), "the viewer's fonts, served from Scalar's host, are off");
  assert.ok(page.includes('"telemetry": false'), "the viewer's telemetry is off");
  assert.ok(page.includes('"hideTestRequestButton": true'), "the viewer's client, which would act on the live api, is off");
});

test("the viewer's script is served from the installed package", async () => {
  const res = await app().request(REFERENCE_SCRIPT_PATH);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/javascript/, 'the answer is a script');
  assert.ok((await res.text()).includes('createApiReference'), 'the script defines the viewer the page calls');
});

test('the page answers to the same access as the document: whatever the document answers, the page answers', async () => {
  const [doc, page] = await Promise.all([app().request(OPENAPI_PATH), app().request(REFERENCE_PATH)]);
  assert.equal(page.status, doc.status, 'the page and the document are answered alike');
});
