/**
 * The api speaks MCP through the SDK's v2 packages alone (`@modelcontextprotocol/server` for the port, `@modelcontextprotocol/client` for
 * a factory's servers): its `package.json` lists no `@modelcontextprotocol/sdk`, the v1 line that speaks no modern era, and no file of
 * the api imports it. The v1 package stays installed for others (it resolves through the workspace's `node_modules`), so a stray import
 * would typecheck: this refuses it. The scanner is shown to refuse a planted import, once.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { specifiersIn } from 'test-kit/imports';
import { files, REPO } from 'test-kit/repo';

const API = path.join(import.meta.dirname, '..');

/** The package of the MCP SDK's v1 line. */
const V1 = '@modelcontextprotocol/sdk';

/** Whether `spec` names the v1 package or a path inside it. */
const isV1 = (spec: string): boolean => spec === V1 || spec.startsWith(`${V1}/`);

/** The modules of the v1 line a piece of source names. */
const v1In = (text: string): string[] => specifiersIn(text).filter(isV1);

test('the scanner refuses a planted import of the v1 SDK', () => {
  assert.deepEqual(v1In("import { Client } from '@modelcontextprotocol/sdk/client/index.js';"), [
    '@modelcontextprotocol/sdk/client/index.js',
  ]);
});

test("the api's package.json lists no @modelcontextprotocol/sdk", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(API, 'package.json'), 'utf8')) as Record<string, unknown>;
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const listed = manifest[field];
    const names = typeof listed === 'object' && listed !== null ? Object.keys(listed) : [];
    assert.ok(!names.includes(V1), `${field} lists ${V1}: speak MCP through @modelcontextprotocol/server or /client`);
  }
});

test('no file of the api imports @modelcontextprotocol/sdk', () => {
  const prefix = `${path.relative(REPO, API)}/`;
  const sources = files().filter((f) => f.startsWith(prefix) && /\.(ts|tsx|mts|cts)$/.test(f));
  assert.ok(sources.length > 0, 'the api has sources to read');
  const importing = sources.filter((f) => {
    const at = path.join(REPO, f);
    return fs.existsSync(at) && v1In(fs.readFileSync(at, 'utf8')).length > 0;
  });
  assert.deepEqual(importing, [], 'each imports the v1 SDK: take @modelcontextprotocol/server or /client in its place');
});
