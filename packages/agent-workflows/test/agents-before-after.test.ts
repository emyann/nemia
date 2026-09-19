/**
 * The proof that writing an agent once changed no run: every shipped folder resolves to what it did before `agents/` existed.
 *
 * `fixtures/resolved-before.json` is what today's loader read every shipped folder as, written from the loader of 6c4e57b before any
 * folder moved a line into an agent. It is never regenerated: a difference is a finding, not a fixture to refresh.
 *
 * Every key of every step is held equal, field for field, with no exception but the new `agent` and the keys `KEYS_ADDED` and `KEYS_CHANGED` name. The bodies are compared too, and the
 * steps whose body moved must be exactly `BODIES_REWORDED`: the reworded briefs of the change that wrote the agents, each printed as a
 * diff for the person who reads the run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from '../src/workflow.ts';

const REPO = path.join(import.meta.dirname, '..', '..', '..');
const BEFORE: Record<string, Array<Record<string, unknown>>> = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'resolved-before.json'), 'utf8'));

/**
 * The steps whose resolved body is not the one it had, as `<folder>/<step>`: the implementer's and the shipper's, reworded so one file
 * serves every dev folder. The implementer's plan paragraph is said when a plan is there, which dev-planned said always and dev never;
 * the shipper's third item points to the check under *Where to look*, which `composeBrief` names for each folder, where each ship.md
 * wrote its folder's check out.
 *
 * The two build folders' ship bodies moved once more afterwards, and stay in this list: their ship.md got back, as a team's note after
 * the shipper's instructions (`NOTES`), the reason their old recipe gave for running the build and the e2e on the merged tree.
 *
 * All four ship bodies moved again when the shipper's fourth item stopped committing git's default `Merge branch '…'` and began writing a
 * message of what shipped, committed with `-F` from a file outside the checkout. The list is the same: those steps were already in it.
 *
 * The ui implementer's body moved when the e2e's pages left the one array `PAGES` in `apps/web/test/e2e/run.ts` for a file each under
 * `apps/web/test/e2e/pages/`: its brief said to add a new page to that array, which no longer exists. Both ui folders name that agent.
 */
const BODIES_REWORDED: string[] = [
  ...['dev', 'dev-build', 'dev-planned', 'dev-planned-build'].flatMap((folder) => [`workflows/${folder}/implement`, `workflows/${folder}/ship`]),
  'workflows/ui/implement',
  'packages/agent-workflows/workflows/ui/implement',
];

/**
 * The shipped steps that keep words of their own after the agent's, as `<folder>/<step>` and a phrase of the note: the ship of each build
 * folder, told why its check's build and e2e matter on a merged tree — what the reworded shipper, which names no check, no longer said.
 * Every other shipped step keeps none.
 */
const NOTES: Record<string, string> = {
  'workflows/dev-build/ship': 'the merged tree is the first tree either has seen',
  'workflows/dev-planned-build/ship': 'the merged tree is the first tree either has seen',
};

/** The agent each shipped step names, by `<folder>/<step>`: the steps of the dev folders and ui. The supervisor and the codex folder name none. */
const AGENTS: Record<string, string> = {
  ...Object.fromEntries(['dev', 'dev-build', 'dev-planned', 'dev-planned-build'].flatMap((folder) => [
    [`workflows/${folder}/implement`, 'implementer'], [`workflows/${folder}/review`, 'reviewer'], [`workflows/${folder}/ship`, 'shipper'],
  ])),
  'workflows/dev-planned/plan': 'planner',
  'workflows/dev-planned-build/plan': 'planner',
  'workflows/ui/implement': 'ui-implementer',
  'workflows/ui/review': 'ui-reviewer',
  'packages/agent-workflows/workflows/ui/implement': 'ui-implementer',
  'packages/agent-workflows/workflows/ui/review': 'ui-reviewer',
};

/**
 * The keys a shipped step gained after the snapshot, as `<folder>/<step>` and each key with its value: nothing an agent moved, and each
 * held to that value. The supervisor, which names no agent, got its `context:` window once the agent refactor had shipped
 * (docs/pivot-2026-09-18.md §6, P1): the one session here that never ends is the one a cap is for. No other key of it moved.
 */
const KEYS_ADDED: Record<string, Record<string, unknown>> = {
  'workflows/supervisor/supervise': { context: 200_000 },
};

/**
 * The keys of a shipped step whose value moved after the snapshot, as `<folder>/<step>` and each key with its new value: nothing an agent
 * moved, and each held to that value, and to having been in the snapshot with another. The `dev` folders' implement check runs the build
 * and the e2e when, and only when, the work touched the web app (docs/pivot-2026-09-18.md §6, P0.6): three runs changed `apps/web/src` on
 * `dev`, whose check was the suite and the types, and no build and no e2e ever ran on them. The line is `dev`'s own, read here rather than
 * copied, and held equal between the two folders; web-check.test.ts runs it against real git.
 */
const DEV_CHECK = loadWorkflows(path.join(REPO, 'workflows', 'dev')).find((s) => s.name === 'implement')!.check!;
const KEYS_CHANGED: Record<string, Record<string, unknown>> = {
  'workflows/dev/implement': { check: DEV_CHECK },
  'workflows/dev-planned/implement': { check: DEV_CHECK },
};

/** A step as JSON has it — no `undefined` — without the fields the proof sets aside. */
const keysOf = (step: Record<string, unknown>): Record<string, unknown> => {
  const { body: _body, agent: _agent, ...keys } = JSON.parse(JSON.stringify(step)) as Record<string, unknown>;
  return keys;
};

/** The lines of `after` that are not in `before` and the other way round, in order: a diff to read, not to apply. */
function lineDiff(before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; continue; }
    if (j < b.length && (i === a.length || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) out.push(`+ ${b[j++]}`);
    else out.push(`- ${a[i++]}`);
  }
  return out.join('\n');
}

test('every shipped folder resolves to the keys it had before agents, and only the reworded bodies moved', (t) => {
  const moved: string[] = [];
  const named: Record<string, string> = {};
  for (const [folder, before] of Object.entries(BEFORE)) {
    const dir = path.join(REPO, folder);
    assert.ok(fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory(), `${folder} is still shipped`);
    const after = loadWorkflows(dir) as unknown as Array<Record<string, unknown>>;
    assert.deepEqual(after.map((s) => s.name), before.map((s) => s.name), `${folder}: the same steps, in the same order`);
    for (const [i, step] of after.entries()) {
      const was = before[i]!;
      assert.deepEqual(keysOf(step), { ...keysOf(was), ...KEYS_ADDED[`${folder}/${String(step.name)}`], ...KEYS_CHANGED[`${folder}/${String(step.name)}`] }, `${folder}/${String(step.name)}: every key as it resolved before`);
      const agent = step.agent as { name: string; body: string } | undefined;
      if (agent) {
        named[`${folder}/${String(step.name)}`] = agent.name;
        const note = NOTES[`${folder}/${String(step.name)}`];
        if (note === undefined) assert.equal(agent.body, '', `${folder}/${String(step.name)}: keeps no words of its own`);
        else {
          assert.ok(agent.body.replace(/\s+/g, ' ').includes(note), `${folder}/${String(step.name)}: its note says ${note}\n\n${agent.body}`);
          assert.ok(String(step.body).endsWith(`\n\n${agent.body}`), `${folder}/${String(step.name)}: its note comes after the agent's instructions`);
        }
      }
      if (step.body !== was.body) {
        moved.push(`${folder}/${String(step.name)}`);
        t.diagnostic(`${folder}/${String(step.name)}.md, its brief before and after:\n${lineDiff(String(was.body), String(step.body))}`);
      }
    }
  }
  // Each key added is one the snapshot did not have: a key that moved is never passed off as one added.
  for (const [at, keys] of Object.entries(KEYS_ADDED)) {
    const [folder, name] = [at.slice(0, at.lastIndexOf('/')), at.slice(at.lastIndexOf('/') + 1)];
    const was = BEFORE[folder]!.find((s) => s.name === name)!;
    for (const key of Object.keys(keys)) assert.equal(Object.hasOwn(keysOf(was), key), false, `${at}: ${key} was in the snapshot`);
  }
  // Each key changed is one the snapshot had, with another value: a key added is never passed off as one changed.
  for (const [at, keys] of Object.entries(KEYS_CHANGED)) {
    const [folder, name] = [at.slice(0, at.lastIndexOf('/')), at.slice(at.lastIndexOf('/') + 1)];
    const was = keysOf(BEFORE[folder]!.find((s) => s.name === name)!);
    for (const [key, value] of Object.entries(keys)) {
      assert.equal(Object.hasOwn(was, key), true, `${at}: ${key} was not in the snapshot`);
      assert.notDeepEqual(was[key], value, `${at}: ${key} is as the snapshot had it`);
    }
  }
  assert.deepEqual(moved.sort(), [...BODIES_REWORDED].sort(), 'the bodies that moved are exactly the reworded ones');
  assert.deepEqual(named, AGENTS, 'each shipped step names the agent it was written from');
});
