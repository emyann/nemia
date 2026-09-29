/**
 * The proof that writing an agent changes no run: every shipped folder resolves to what it did before `agents/` existed.
 *
 * `fixtures/resolved-before.json` is every shipped folder as the loader of 6c4e57b resolved it, before any folder moved a line into an
 * agent. It is never regenerated: a difference is a finding, not a fixture to refresh.
 *
 * Every key of every step is held equal, field for field, with no exception but the new `agent` and the keys `KEYS_ADDED` and
 * `KEYS_CHANGED` name. The bodies are compared too, and the steps whose body moved must be exactly `BODIES_REWORDED`: the reworded briefs
 * of the change that wrote the agents, each printed as a diff for the person who reads the run.
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
 * The package's former folder, as the fixture names it and keeps it: its keys are read at the package's folder today. It is spelled in
 * parts, so that the line is not one `names.test.ts` refuses for naming a former package. The fixture's steps hold `disallow` and
 * `allow`, the former names of `disallowedTools` and `allowedTools`: each is read as a run frozen with them is read (`asNamed`, in
 * `readRun`). Its one codex step holds its sandbox under `permissionMode`, the name a codex step gave it then, and is read under
 * `sandbox`, the name a folder gives it today (`codexSandbox`). Nothing else of it is touched.
 */
const FORMER_PACKAGE = ['packages/agent', 'workflows/'].join('-');
const atToday = (folder: string) =>
  folder.startsWith(FORMER_PACKAGE) ? `packages/agent-orchestrator/${folder.slice(FORMER_PACKAGE.length)}` : folder;
const codexSandbox = (step: Workflow): Workflow => {
  if (step.harness !== 'codex' || step.permissionMode === undefined) return step;
  const { permissionMode: sandbox, ...rest } = step;
  return { ...rest, sandbox };
};
const BEFORE_JSON = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'resolved-before.json'), 'utf8')) as Record<
  string,
  Workflow[]
>;
const BEFORE: Record<string, Array<Record<string, unknown>>> = Object.fromEntries(
  Object.entries(BEFORE_JSON).map(([folder, steps]) => [
    atToday(folder),
    steps.map((step) => codexSandbox(asNamed(step))) as unknown as Array<Record<string, unknown>>,
  ]),
);

/**
 * The steps whose resolved body is not the snapshot's, as `<folder>/<step>`, each for a reason below.
 *
 * The implementer's and the shipper's are reworded so one file serves every dev folder: the implementer's plan paragraph is said when a
 * plan is there, which dev-planned said always and dev never; the shipper's third item points to the check under *Where to look*, which
 * `composeBrief` names for each folder, where each ship.md wrote its folder's check out.
 *
 * The two build folders' ships keep, as a team's note after the shipper's instructions (`NOTES`), the reason their recipe gave for running
 * the build and the e2e on the merged tree. Every ship stages the ending's merge, which the run lands on the ending's own check, and signs
 * off a message of what shipped, committed with `-F` from a file outside the checkout rather than git's default `Merge branch '…'`; a build
 * folder's note speaks of the check the run executes. Both ui folders' ships are dev-build's, with that body.
 *
 * The ui implementer's brief adds a new page to the e2e as a file under `apps/web/test/e2e/pages/`. Both ui folders name that agent.
 *
 * The supervisor's body names the runtime's open issues and the orchestrator's features.md by the packages' folders. It is a background
 * session in `dontAsk`: its wait is `sleep 60` alone, since its `allowedTools:` lets no shell loop through.
 *
 * The ui reviewers read the screenshots of implement's own run of the e2e, which no round's check runs: the e2e runs on the merged tree.
 * The implementer, ui implementer, shipper and build ships say so too.
 *
 * Every implementer and reviewer is told that a job's turn cannot end to wait for a process in the background
 * (`[structured-output-enforce]`), so each reviewer's body is on the list beside the implementers.
 *
 * The planner, the reviewer and the ui reviewer name git's other read-only verbs they may run, and that `git -C` and a `cd` elsewhere are
 * denied.
 *
 * Every agent's procedures are in the skills its card describes (`workflows/skills/`): each body keeps its role and its limits — what it
 * may run, that a job's turn is its last — and names its skills, which say how. What left each body is in a skill, word for word but where
 * a sentence named the body it sat in; `ui-workflow.test.ts` and `planned-workflow.test.ts` read the sentences they pin in the body and its
 * skills together (`toldIn`). The note folder's two steps, whose bodies moved too, are not in the snapshot.
 */
const BODIES_REWORDED: string[] = [
  ...['dev', 'dev-build', 'dev-planned', 'dev-planned-build'].flatMap((folder) => [
    `workflows/${folder}/implement`,
    `workflows/${folder}/review`,
    `workflows/${folder}/ship`,
  ]),
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

/**
 * The agent each shipped step names, by `<folder>/<step>`: the steps of the dev folders and ui. The supervisor and the codex folder name
 * none.
 */
const AGENTS: Record<string, string> = {
  ...Object.fromEntries(
    ['dev', 'dev-build', 'dev-planned', 'dev-planned-build'].flatMap((folder) => [
      [`workflows/${folder}/implement`, 'implementer'],
      [`workflows/${folder}/review`, 'reviewer'],
      [`workflows/${folder}/ship`, 'shipper'],
    ]),
  ),
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
 * The steps a shipped folder has beyond the snapshot, as `<folder>/<step>` and the step each copies, by the same name. Both ui folders have
 * the build folders' ship: the e2e runs only on the merged tree, and without a ship no check the run executes runs it for a ui run. Each is
 * keyed by its full path, so a dev folder that lost or gained a ship still fails.
 */
const STEPS_ADDED: Record<string, string> = {
  'workflows/ui/ship': 'workflows/dev-build/ship',
  'packages/agent-orchestrator/workflows/ui/ship': 'workflows/dev-build/ship',
};

/**
 * The keys a shipped step has beyond the snapshot, as `<folder>/<step>` and each key with its value: nothing an agent moved, and each
 * held to that value. The supervisor, which names no agent, has a `context:` window: the one session here that never ends is the one a
 * cap is for.
 *
 * Steps are jobs (`claude -p`) but the supervisor, a background session whose mode is written by its role: `background: true`,
 * `permissionMode: dontAsk` and an `allowedTools:` list, read here from its file rather than copied. The agents that build and ship —
 * implementer, ui-implementer, shipper — say `permissionMode: auto`, the engine's default, so the mode of every role is written where the
 * role is. Each step naming one of them gains that key and nothing else.
 *
 * Each dev folder's ship has a `check:` and the shipper's `output:`: the run executes the folder's check on the merge the step stages, and
 * commits it with the `message` the step's closeout gives. The check is the folder's implement's, read here; the schema is the shipper's
 * file, read here too.
 *
 * The ui agents say `model: opus`: a job reads its checkout's settings and not the operator's (`--setting-sources project,local`), so a
 * step that names no model runs Claude Code's default rather than the operator's Opus. The model is written where the role is, as the
 * modes are.
 */
const SUPERVISOR_ALLOW = loadWorkflows(path.join(REPO, 'workflows', 'supervisor')).find((s) => s.name === 'supervise')!.allowedTools!;
const SHIPPER_OUTPUT = {
  file: 'shipper.schema.json',
  schema: JSON.parse(fs.readFileSync(path.join(REPO, 'workflows', 'agents', 'shipper.schema.json'), 'utf8')),
};
const checkOf = (folder: string) => loadWorkflows(path.join(REPO, 'workflows', folder)).find((s) => s.name === 'implement')!.check!;
const KEYS_ADDED: Record<string, Record<string, unknown>> = {
  'workflows/supervisor/supervise': { context: 200_000, background: true, permissionMode: 'dontAsk', allowedTools: SUPERVISOR_ALLOW },
  ...Object.fromEntries(
    Object.entries(AGENTS)
      .filter(([at, agent]) => !Object.hasOwn(STEPS_ADDED, at) && ['implementer', 'ui-implementer', 'shipper'].includes(agent))
      .map(([at, agent]) => {
        const folder = at.slice('workflows/'.length, at.lastIndexOf('/'));
        return [
          at,
          agent === 'shipper'
            ? { permissionMode: 'auto', check: checkOf(folder), output: SHIPPER_OUTPUT }
            : agent === 'ui-implementer'
              ? { permissionMode: 'auto', model: 'opus' }
              : { permissionMode: 'auto' },
        ];
      }),
  ),
  ...Object.fromEntries(
    Object.entries(AGENTS)
      .filter(([, agent]) => agent === 'ui-reviewer')
      .map(([at]) => [at, { model: 'opus' }]),
  ),
};

/**
 * The keys of a shipped step whose value is not the snapshot's, as `<folder>/<step>` and each key with its new value: nothing an agent
 * moved, and each held to that value, and to having been in the snapshot with another. The `dev` folders' implement check runs the build
 * and the e2e when, and only when, the work touched the web app: a check of the suite and the types alone runs no build and no e2e on a
 * change to `apps/web/src`. The line is `dev`'s own, read here rather than copied, and held equal between the two folders;
 * web-check.test.ts runs it against real git.
 *
 * A round's check, which the run gives `WF_BASE_REF`, builds and runs no e2e, and the shipper's run of the line, with none, runs it. The
 * build folders' and ui's line is dev-build's, read here too, and web-check.test.ts runs every one of them.
 *
 * Every shipped check runs `npm run lint` (oxlint and oxfmt's check) after the types; the package's own folder's line is read here as it
 * stands too.
 */
const DEV_CHECK = loadWorkflows(path.join(REPO, 'workflows', 'dev')).find((s) => s.name === 'implement')!.check!;
const BUILD_CHECK = loadWorkflows(path.join(REPO, 'workflows', 'dev-build')).find((s) => s.name === 'implement')!.check!;
const PACKAGE_CHECK = loadWorkflows(path.join(REPO, 'packages', 'agent-orchestrator', 'workflows')).find(
  (s) => s.name === 'implement',
)!.check!;
const CHECKS_CHANGED: Record<string, Record<string, unknown>> = {
  'workflows/dev/implement': { check: DEV_CHECK },
  'workflows/dev-planned/implement': { check: DEV_CHECK },
  'packages/agent-orchestrator/workflows/implement': { check: PACKAGE_CHECK },
  ...Object.fromEntries(
    ['workflows/dev-build', 'workflows/dev-planned-build', 'workflows/ui', 'packages/agent-orchestrator/workflows/ui'].map((folder) => [
      `${folder}/implement`,
      { check: BUILD_CHECK },
    ]),
  ),
};
/**
 * What a step that builds or ships is denied: what no step needs, as in the snapshot, and a push, a forced branch delete and the browser's
 * unsafe tool, which the checkout's settings denied every session before each step denied them itself (agent-fences.test.ts). Held on
 * every step that names implementer, ui-implementer or shipper, and on the package's own implement, which names no agent.
 */
const BUILDER_DENIED = [
  'SendMessage',
  'CronCreate',
  'CronDelete',
  'RemoteTrigger',
  'Bash(git push)',
  'Bash(git push:*)',
  'Bash(git branch -D:*)',
  'Bash(git branch --delete --force:*)',
  'mcp__playwright__browser_run_code_unsafe',
];
const DENIES_CHANGED = [
  ...Object.entries(AGENTS)
    .filter(([at, agent]) => !Object.hasOwn(STEPS_ADDED, at) && ['implementer', 'ui-implementer', 'shipper'].includes(agent))
    .map(([at]) => at),
  'packages/agent-orchestrator/workflows/implement',
];
/**
 * What the supervisor is denied: its list in the snapshot, and a forced branch delete and the browser's unsafe tool, which its `dontAsk`
 * does not refuse a background session that reads the person's own settings (agent-fences.test.ts).
 */
const SUPERVISOR_DENIED = [
  ...(asNamed(BEFORE_JSON['workflows/supervisor'][0]).disallowedTools ?? []),
  'Bash(git branch -D:*)',
  'Bash(git branch --delete --force:*)',
  'mcp__playwright__browser_run_code_unsafe',
];
const KEYS_CHANGED: Record<string, Record<string, unknown>> = {
  ...Object.fromEntries(
    [...new Set([...Object.keys(CHECKS_CHANGED), ...DENIES_CHANGED])].map((at) => [
      at,
      { ...CHECKS_CHANGED[at], ...(DENIES_CHANGED.includes(at) ? { disallowedTools: BUILDER_DENIED } : {}) },
    ]),
  ),
  'workflows/supervisor/supervise': { disallowedTools: SUPERVISOR_DENIED },
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
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) out.push(`+ ${b[j++]}`);
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
      const from = STEPS_ADDED[at];
      const copied = loadWorkflows(path.join(REPO, from.slice(0, from.lastIndexOf('/')))).find(
        (s) => s.name === step.name,
      ) as unknown as Record<string, unknown>;
      assert.ok(copied, `${at}: ${from} is there to copy`);
      assert.deepEqual(keysOf(step), keysOf(copied), `${at}: every key as ${from} resolves`);
      assert.equal(step.body, copied.body, `${at}: the body of ${from}`);
      assert.deepEqual(step.agent, copied.agent, `${at}: the agent of ${from}, and its note`);
      named[at] = (step.agent as { name: string }).name;
    }
    assert.deepEqual(
      after.map((s) => s.name),
      before.map((s) => s.name),
      `${folder}: the same steps, in the same order`,
    );
    for (const [i, step] of after.entries()) {
      const was = before[i];
      assert.deepEqual(
        keysOf(step),
        { ...keysOf(was), ...KEYS_ADDED[`${folder}/${String(step.name)}`], ...KEYS_CHANGED[`${folder}/${String(step.name)}`] },
        `${folder}/${String(step.name)}: every key as it resolved before`,
      );
      const agent = step.agent as { name: string; body: string } | undefined;
      if (agent) {
        named[`${folder}/${String(step.name)}`] = agent.name;
        const note = NOTES[`${folder}/${String(step.name)}`];
        if (note === undefined) assert.equal(agent.body, '', `${folder}/${String(step.name)}: keeps no words of its own`);
        else {
          assert.ok(
            agent.body.replace(/\s+/g, ' ').includes(note),
            `${folder}/${String(step.name)}: its note says ${note}\n\n${agent.body}`,
          );
          assert.ok(
            String(step.body).endsWith(`\n\n${agent.body}`),
            `${folder}/${String(step.name)}: its note comes after the agent's instructions`,
          );
        }
      }
      if (step.body !== was.body) {
        moved.push(`${folder}/${String(step.name)}`);
        t.diagnostic(`${folder}/${String(step.name)}.md, its brief before and after:\n${lineDiff(String(was.body), String(step.body))}`);
      }
    }
  }
  for (const at of Object.keys(STEPS_ADDED)) {
    const [folder, name] = [at.slice(0, at.lastIndexOf('/')), at.slice(at.lastIndexOf('/') + 1)];
    assert.equal(
      BEFORE[folder].some((s) => s.name === name),
      false,
      `a step added is one the snapshot did not have, and ${at} was in it`,
    );
  }
  for (const [at, keys] of Object.entries(KEYS_ADDED)) {
    const [folder, name] = [at.slice(0, at.lastIndexOf('/')), at.slice(at.lastIndexOf('/') + 1)];
    const was = BEFORE[folder].find((s) => s.name === name)!;
    for (const key of Object.keys(keys))
      assert.equal(
        Object.hasOwn(keysOf(was), key),
        false,
        `${at}: ${key} was in the snapshot: a key that moved is never passed off as one added`,
      );
  }
  for (const [at, keys] of Object.entries(KEYS_CHANGED)) {
    const [folder, name] = [at.slice(0, at.lastIndexOf('/')), at.slice(at.lastIndexOf('/') + 1)];
    const was = keysOf(BEFORE[folder].find((s) => s.name === name)!);
    for (const [key, value] of Object.entries(keys)) {
      assert.equal(Object.hasOwn(was, key), true, `${at}: ${key} was not in the snapshot: a key added is never passed off as one changed`);
      assert.notDeepEqual(was[key], value, `${at}: ${key} is as the snapshot had it`);
    }
  }
  assert.deepEqual(moved.sort(), [...BODIES_REWORDED].sort(), 'the bodies that moved are exactly the reworded ones');
  assert.deepEqual(named, AGENTS, 'each shipped step names the agent it was written from');
});
