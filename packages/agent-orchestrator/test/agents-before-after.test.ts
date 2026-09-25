/**
 * The proof that writing an agent once changed no run: every shipped folder resolves to what it did before `agents/` existed.
 *
 * `fixtures/resolved-before.json` is what today's loader read every shipped folder as, written from the loader of 6c4e57b before any
 * folder moved a line into an agent. It is never regenerated: a difference is a finding, not a fixture to refresh.
 *
 * Every key of every step is held equal, field for field, with no exception but the new `agent` and the keys `KEYS_ADDED` and `KEYS_CHANGED` name. The bodies are compared too, and the
 * steps whose body moved must be exactly `BODIES_REWORDED`: the reworded briefs of the change that wrote the agents, each printed as a
 * diff for the person who reads the run.
 *
 * A step can be added to a shipped folder only as a copy of one that is there: `STEPS_ADDED` names each by `<folder>/<step>` beside the
 * step it copies, and holds it to that step's keys, agent and body as they resolve today, and to being absent from the snapshot.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from '../src/workflow-store.ts';
import { asNamed, type Workflow } from '../src/workflow.ts';

const REPO = path.join(import.meta.dirname, '..', '..', '..');
/**
 * The fixture names the package's folders as they were when it was written, and keeps those words: its keys are read at the package's
 * folder today. And its steps hold `disallow` and `allow`, the names `disallowedTools` and `allowedTools` had until 2026-09-23: each is
 * read as a run frozen then is read (`asNamed`, in `readRun`). Nothing else of it is touched.
 */
const FORMER_PACKAGE = 'packages/agent-workflows/'; // renamed on 2026-09-23
const atToday = (folder: string) => (folder.startsWith(FORMER_PACKAGE) ? `packages/agent-orchestrator/${folder.slice(FORMER_PACKAGE.length)}` : folder);
const BEFORE: Record<string, Array<Record<string, unknown>>> = Object.fromEntries(Object.entries(
  JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'resolved-before.json'), 'utf8')) as Record<string, Workflow[]>,
).map(([folder, steps]) => [atToday(folder), steps.map(asNamed) as unknown as Array<Record<string, unknown>>]));

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
 *
 * The supervisor's body moved when the packages were renamed (2026-09-23): it names the runtime's open issues and the orchestrator's
 * features.md by their folders, and those are new words for the same pages. It moved again when it became a background session in
 * `dontAsk` (stage 2 part 2): its wait is `sleep 60` alone, since its `allowedTools:` lets no shell loop through.
 *
 * The ui reviewers' bodies moved when the e2e left every round's check for the merged tree (2026-09-25): the screenshots they read are
 * implement's own run of the e2e, no longer its check's. The implementer, ui implementer, shipper and build ships said so in the same change.
 *
 * Every implementer and reviewer was told that a job's turn cannot end to wait for a process in the background (2026-09-25,
 * `[structured-output-enforce]`), the lesson the owner gave at a plan gate. So each reviewer's body is on the list now, beside the
 * implementers already there.
 *
 * The four ship bodies moved again when the run began landing an ending's merge on the ending's own check (2026-09-25): the shipper
 * stages the merge and signs off its message, and a build folder's note speaks of the check the run executes. Both ui folders' ships,
 * added on main meanwhile as dev-build's, came in with that body when the run merged main.
 *
 * The planners' bodies moved when planners and reviewers were given git's other read-only verbs (2026-09-25): the planner, the reviewer
 * and the ui reviewer name them, and that `git -C` and a `cd` elsewhere are denied. The reviews were on the list already.
 *
 * Every agent's body moved when its procedures left it for the skills its card describes (agents card 1b, 2026-09-25): each keeps its
 * role and its limits — what it may run, that a job's turn is its last — and names its skills, which say how (`workflows/skills/`). What
 * left each body is in a skill, word for word but where a sentence named the body it sat in; `ui-workflow.test.ts` and
 * `planned-workflow.test.ts` read the sentences they pin in the body and its skills together (`toldIn`). Every step naming an agent was
 * on the list already, so the list is the same; the note folder's two, which also moved, are not in the snapshot.
 */
const BODIES_REWORDED: string[] = [
  ...['dev', 'dev-build', 'dev-planned', 'dev-planned-build'].flatMap((folder) => [`workflows/${folder}/implement`, `workflows/${folder}/review`, `workflows/${folder}/ship`]),
  'workflows/ui/implement',
  'workflows/ui/review',
  'packages/agent-orchestrator/workflows/ui/implement',
  'packages/agent-orchestrator/workflows/ui/review',
  'workflows/supervisor/supervise',
  'workflows/dev-planned/plan',
  'workflows/dev-planned-build/plan',
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
  'packages/agent-orchestrator/workflows/ui/implement': 'ui-implementer',
  'packages/agent-orchestrator/workflows/ui/review': 'ui-reviewer',
  'workflows/ui/ship': 'shipper',
  'packages/agent-orchestrator/workflows/ui/ship': 'shipper',
};

/**
 * The steps a shipped folder gained after the snapshot, as `<folder>/<step>` and the step each copies, by the same name. Both ui folders
 * got the build folders' ship (2026-09-25), once the e2e ran only on the merged tree: without a ship no check the run executes ran it
 * for a ui run. Each is keyed by its full path, so a dev folder that lost or gained a ship still fails.
 */
const STEPS_ADDED: Record<string, string> = {
  'workflows/ui/ship': 'workflows/dev-build/ship',
  'packages/agent-orchestrator/workflows/ui/ship': 'workflows/dev-build/ship',
};

/**
 * The keys a shipped step gained after the snapshot, as `<folder>/<step>` and each key with its value: nothing an agent moved, and each
 * held to that value. The supervisor, which names no agent, got its `context:` window once the agent refactor had shipped
 * (docs/pivot-2026-09-18.md §6, P1): the one session here that never ends is the one a cap is for.
 *
 * When steps became jobs (`claude -p`, thin runtime stage 2 part 2) the supervisor alone stayed a background session, and its mode was
 * written by its role: `background: true`, `permissionMode: dontAsk` and an `allowedTools:` list, read here from its file rather than copied.
 * The agents that build and ship — implementer, ui-implementer, shipper — say `permissionMode: auto`, the engine's default, so the mode
 * of every role is written where the role is. Each step naming one of them gains that key and nothing else.
 *
 * Each dev folder's ship gained a `check:` and the shipper's `output:` when the run began landing the ending's merge on its check: the
 * run executes the folder's check on the merge the step stages, and commits it with the `message` the step's closeout gives. The check is
 * the folder's implement's, read here; the schema is the shipper's file, read here too.
 */
const SUPERVISOR_ALLOW = loadWorkflows(path.join(REPO, 'workflows', 'supervisor')).find((s) => s.name === 'supervise')!.allowedTools!;
const SHIPPER_OUTPUT = { file: 'shipper.schema.json', schema: JSON.parse(fs.readFileSync(path.join(REPO, 'workflows', 'agents', 'shipper.schema.json'), 'utf8')) };
const checkOf = (folder: string) => loadWorkflows(path.join(REPO, 'workflows', folder)).find((s) => s.name === 'implement')!.check!;
const KEYS_ADDED: Record<string, Record<string, unknown>> = {
  'workflows/supervisor/supervise': { context: 200_000, background: true, permissionMode: 'dontAsk', allowedTools: SUPERVISOR_ALLOW },
  ...Object.fromEntries(Object.entries(AGENTS).filter(([at, agent]) => !Object.hasOwn(STEPS_ADDED, at) && ['implementer', 'ui-implementer', 'shipper'].includes(agent)).map(([at, agent]) => {
    const folder = at.slice('workflows/'.length, at.lastIndexOf('/'));
    return [at, agent === 'shipper' ? { permissionMode: 'auto', check: checkOf(folder), output: SHIPPER_OUTPUT } : { permissionMode: 'auto' }];
  })),
};

/**
 * The keys of a shipped step whose value moved after the snapshot, as `<folder>/<step>` and each key with its new value: nothing an agent
 * moved, and each held to that value, and to having been in the snapshot with another. The `dev` folders' implement check runs the build
 * and the e2e when, and only when, the work touched the web app (docs/pivot-2026-09-18.md §6, P0.6): three runs changed `apps/web/src` on
 * `dev`, whose check was the suite and the types, and no build and no e2e ever ran on them. The line is `dev`'s own, read here rather than
 * copied, and held equal between the two folders; web-check.test.ts runs it against real git.
 *
 * Every implement check with an e2e moved again when the e2e left the rounds for the merged tree (2026-09-25): a round's check, which the
 * run gives `WF_BASE_REF`, builds and runs no e2e, and the shipper's run of the line, with none, runs it. The build folders' and ui's line
 * is dev-build's, read here too, and web-check.test.ts runs every one of them.
 */
const DEV_CHECK = loadWorkflows(path.join(REPO, 'workflows', 'dev')).find((s) => s.name === 'implement')!.check!;
const BUILD_CHECK = loadWorkflows(path.join(REPO, 'workflows', 'dev-build')).find((s) => s.name === 'implement')!.check!;
const KEYS_CHANGED: Record<string, Record<string, unknown>> = {
  'workflows/dev/implement': { check: DEV_CHECK },
  'workflows/dev-planned/implement': { check: DEV_CHECK },
  ...Object.fromEntries(['workflows/dev-build', 'workflows/dev-planned-build', 'workflows/ui', 'packages/agent-orchestrator/workflows/ui']
    .map((folder) => [`${folder}/implement`, { check: BUILD_CHECK }])),
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
    const loaded = loadWorkflows(dir) as unknown as Array<Record<string, unknown>>;
    const after = loaded.filter((s) => !Object.hasOwn(STEPS_ADDED, `${folder}/${String(s.name)}`));
    for (const step of loaded.filter((s) => !after.includes(s))) {
      const at = `${folder}/${String(step.name)}`;
      const from = STEPS_ADDED[at]!;
      const copied = loadWorkflows(path.join(REPO, from.slice(0, from.lastIndexOf('/')))).find((s) => s.name === step.name) as unknown as Record<string, unknown>;
      assert.ok(copied, `${at}: ${from} is there to copy`);
      assert.deepEqual(keysOf(step), keysOf(copied), `${at}: every key as ${from} resolves`);
      assert.equal(step.body, copied.body, `${at}: the body of ${from}`);
      assert.deepEqual(step.agent, copied.agent, `${at}: the agent of ${from}, and its note`);
      named[at] = (step.agent as { name: string }).name;
    }
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
  // Each step added is one the snapshot did not have.
  for (const at of Object.keys(STEPS_ADDED)) {
    const [folder, name] = [at.slice(0, at.lastIndexOf('/')), at.slice(at.lastIndexOf('/') + 1)];
    assert.equal(BEFORE[folder]!.some((s) => s.name === name), false, `${at} was in the snapshot`);
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
