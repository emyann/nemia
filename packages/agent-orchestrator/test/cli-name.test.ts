/**
 * The orchestrator names its command `nemia` in every word it prints: its help, its refusals, the commands `nemia ls` and `nemia decide`
 * offer. `wf` is the alias (`bin/wf.ts`): it runs the same commands, with `WF_HINT` on stderr first.
 *
 * The `wf` word itself is held by `tools/guards/test/glossary.test.ts`, through the run core's glossary table (`glossary.json`, whose
 * term Nemia retires `wf`): each file of the package that still says it is counted, and the count only shrinks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CLI } from '../src/runner.ts';

const PKG = path.join(import.meta.dirname, '..');

const CLIENT = path.join(PKG, '..', '..', 'apps', 'cli');

test('the bin is nemia, and wf its alias, each a file of its own: the client declares them, and this package exports the entries it spawns', () => {
  assert.equal(CLI, 'nemia');
  const client = JSON.parse(fs.readFileSync(path.join(CLIENT, 'package.json'), 'utf8')) as { bin: Record<string, string> };
  assert.deepEqual(client.bin, { nemia: 'bin/nemia.ts', wf: 'bin/wf.ts' });
  for (const bin of Object.values(client.bin)) assert.ok(fs.existsSync(path.join(CLIENT, bin)), bin);
  const pkg = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')) as { bin?: unknown; exports: Record<string, string> };
  assert.equal(pkg.bin, undefined, 'one package declares the bins, so npm links one nemia');
  assert.equal(pkg.exports['./bin'], './bin/nemia.ts');
  assert.equal(pkg.exports['./bin/wf'], './bin/wf.ts');
  for (const entry of [pkg.exports['./bin'], pkg.exports['./bin/wf']]) assert.ok(fs.existsSync(path.join(PKG, entry)), entry);
});
