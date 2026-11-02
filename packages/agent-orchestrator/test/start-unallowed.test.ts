/**
 * `nemia start` on a folder whose step is given a tool nothing its session would be allowed: refused as `Invalid` with exit 2, in the
 * orchestrator's words, before a run is written (`unallowedRefusal`, asked by `stepsToStart`). The same folder starts in a repository
 * whose own settings allow the call, and in one whose settings are added afterwards: the rules the session gets are read at the start,
 * from the repository the run works on, and the fence travels with the folder while the rules do not.
 *
 * `WF_ROOT` is set before the import, since the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from './scratch.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest } from './placed.ts';

const stand = eachTest(testPlace);
const ROOT = scratch('wf-unallowed-start-');
process.env.WF_ROOT = ROOT;
const { startRun } = await import('../src/start/start.verb.ts');
const { StoreRoot } = await import('../src/config/root.store.ts');

/** A holder of one workflow folder `name` and the agents beside it: the folder's path. */
function folder(name: string, steps: Record<string, string>, agents: Record<string, string> = {}): string {
  const dir = path.join(ROOT, 'trees', name, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, '..', 'agents'), { recursive: true });
  for (const [step, text] of Object.entries(steps)) fs.writeFileSync(path.join(dir, `${step}.md`), text);
  for (const [agent, text] of Object.entries(agents)) fs.writeFileSync(path.join(dir, '..', 'agents', `${agent}.md`), text);
  return dir;
}

/** A repository with one commit, so a run has a base to record; `allow` writes its own settings where it is given. */
function aRepo(allow?: readonly string[]): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  if (allow) settings(repo, allow);
  return repo;
}

/** The repository's own harness settings, allowing `allow` and nothing else. */
function settings(repo: string, allow: readonly string[]): void {
  fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: [...allow] } }));
}

const runsWritten = (): string[] =>
  fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')) : [];

/** `startRun` of `workflowDir` in `repo`: the run's id, or the refusal it failed with, thrown. */
function started(workflowDir: string, repo: string): string {
  const exit = Effect.runSyncExit(
    startRun({ brief: 'add a flag', repo, workflowDir }).pipe(Effect.provide(stand().layer), Effect.provideService(StoreRoot, ROOT)),
  );
  if (exit._tag === 'Success') return exit.value.id;
  throw Effect.runSync(Effect.flip(Effect.failCause(exit.cause)));
}

/** The folder of the card: one step, whose agent is held to its rules and given the web with no rule for it. */
const HELD = folder(
  'held',
  { design: '---\nplace: git\nagent: seldon\n---\nWrite the spec.\n' },
  { seldon: '---\nrole: Architect\npermissionMode: dontAsk\ntools: Read, Grep, Glob, WebFetch\n---\nDesign it.\n' },
);

test('REFUSED at `nemia start`: a step given a tool no rule of its session names fails as Invalid with exit 2, and no run is written', () => {
  const before = runsWritten();
  assert.throws(
    () => started(HELD, aRepo()),
    (err: Error & { _tag?: string; exitCode?: number }) => {
      assert.equal(err._tag, 'Invalid');
      assert.equal(err.exitCode, 2);
      assert.match(err.message, /^design: /);
      assert.match(err.message, /gives its session `WebFetch`/);
      assert.match(err.message, /agents\/seldon\.md/);
      assert.match(err.message, /take `WebFetch` off `tools:`/);
      return true;
    },
  );
  assert.deepEqual(runsWritten(), before, 'nothing was written');
});

test('the same folder starts in a repository whose own settings allow the call, scoped or bare: what the session gets is read at the start', () => {
  assert.match(started(HELD, aRepo(['WebFetch'])), /./);
  assert.match(started(HELD, aRepo(['WebFetch(domain:example.com)', 'Bash(npm test)'])), /./);
});

test('the rules are read off the repository the run works on, so the folder that was refused starts once that repository allows it', () => {
  const repo = aRepo();
  assert.throws(() => started(HELD, repo), /gives its session `WebFetch`/);
  settings(repo, ['WebFetch']);
  assert.match(started(HELD, repo), /./, 'the same folder and the same repository, with the rule added');
});

test('a trust the harness does not have is said after the refusal, as the second thing to check, and nothing is said where it has one', () => {
  const config = scratch('wf-untrusted-');
  process.env.CLAUDE_CONFIG_DIR = config;
  try {
    const untrusted = aRepo();
    assert.throws(
      () => started(HELD, untrusted),
      (err: Error) => {
        assert.match(err.message, /Check too that .* trusts /);
        assert.match(err.message, /withholds /);
        return true;
      },
    );
    const trusted = aRepo();
    fs.writeFileSync(
      path.join(config, '.claude.json'),
      JSON.stringify({ projects: { [path.resolve(trusted)]: { hasTrustDialogAccepted: true } } }),
    );
    assert.throws(
      () => started(HELD, trusted),
      (err: Error) => {
        assert.match(err.message, /gives its session `WebFetch`/);
        assert.ok(!err.message.includes('Check too that'), 'a trusted repository adds no second thing to check');
        return true;
      },
    );
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR;
  }
});
