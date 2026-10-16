/**
 * `nemia up` as a person runs it brings a factory made from a template to it: a process of its own, on a scratch store where
 * `nemia factory apply` filed the factory's file alone, renders its base, seeds its tree and writes its status, with no other verb run.
 * `WF_VERIFY_REST=1` judges in full every run a pass answers from its memo, in the child as in any test that ticks a store.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { nodeChild } from './child.ts';
import { scratch } from './scratch.ts';
import { teamCopy } from './team.ts';
import { WAITED } from 'agent-runtime/testing';

const PKG = path.join(import.meta.dirname, '..');
const BIN = path.join(PKG, 'bin', 'nemia.ts');

test(
  'nemia up runs the factory controller: a factory nemia factory apply filed gets its status, its read-only base and its tree',
  WAITED,
  async (t) => {
    const root = scratch('wf-factory-up-');
    const env = {
      ...process.env,
      WF_ROOT: root,
      AE_ROOT: path.join(root, 'engine'),
      WF_MAX_CONCURRENT: '2',
      WF_MAX_RUNS: '2',
      WF_VERIFY_REST: '1',
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
    };
    const nemia = (...args: string[]) =>
      execFileSync(process.execPath, [BIN, ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const repo = scratch('wf-factory-up-repo-');
    fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
    const template = path.join(scratch('wf-factory-up-template-'), 'team');
    nemia('template', 'export', template, '--from', repo);
    nemia('factory', 'apply', 'shaped', '--template', template, '--repo', repo);
    const folder = path.join(root, 'factories', 'shaped');
    assert.deepEqual(fs.existsSync(folder) ? fs.readdirSync(folder) : [], [], 'apply files the factory file alone');
    const up = nodeChild(`process.argv = [process.argv[0], ${JSON.stringify(BIN)}, 'up']; await import(${JSON.stringify(BIN)});`, env);
    t.after(() => up.child.kill());
    const status = path.join(folder, 'status.json');
    const tree = path.join(folder, 'tree', 'factory.json');
    await up.until(() => fs.existsSync(status) && fs.existsSync(tree), "the controller writes the factory's status and seeds its tree");
    const written = JSON.parse(fs.readFileSync(status, 'utf8')) as { version: string; conditions: { type: string; reason: string }[] };
    assert.equal(written.version, '0.1.0');
    assert.deepEqual(
      written.conditions.map((c) => `${c.type} ${c.reason}`),
      ['Applied Rendered', 'ConflictsPending NoUpgrade'],
    );
    assert.equal(fs.statSync(path.join(folder, 'applied', 'factory.json')).mode & 0o222, 0, 'the base is read-only');
  },
);
