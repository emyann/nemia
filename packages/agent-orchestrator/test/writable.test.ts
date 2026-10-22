/**
 * A step's `writable:` as its file is read: a list of the factory's folders by their directory's names, refused where a name is not one,
 * on a remote agent, and over a fence that writes nothing — the key widens where a step's writes reach, never what it may do. And
 * `stepMounts`, which files the folders a step names writable and every other read-only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseWorkflow, agentsDir } from '../src/workflow.ts';
import { loadAgents } from '../src/agents/read.store.ts';
import { stepMounts } from '../src/factory/factory.ts';
import { teamCopy } from './team.ts';
import { Invalid } from '../src/refusal/refusal.ts';

/** A step `review` with this frontmatter and a body, as a folder hands it to the parser. */
const fm = (lines: string) => parseWorkflow('review', `---\nplace: git\n${lines}\n---\nDo the work.\n`);

/** What reading a step with `lines` refuses, or `read` when it is taken. */
const said = (lines: string): string => {
  try {
    fm(lines);
    return 'read';
  } catch (err) {
    return (err as Error).message;
  }
};

test('`writable:` is read as the folder names it lists, and a step without the line has none', () => {
  assert.deepEqual(fm('writable: web, docs').writable, ['web', 'docs']);
  assert.equal(fm('permissionMode: dontAsk').writable, undefined);
});

test("REFUSED at load: a `writable:` name that is not a directory's name — a path, a hidden one — or one given twice", () => {
  const shape =
    "Each is one of the factory's folders by its directory's name, never a path, comma-separated: `writable: web, docs`; nemia factory ls lists the folders.";
  assert.equal(said('writable: web/src'), `review: \`writable: web/src\` has \`web/src\`, which is not a directory's name. ${shape}`);
  assert.equal(said('writable: ..'), `review: \`writable: ..\` has \`..\`, which is not a directory's name. ${shape}`);
  assert.equal(said('writable: web, web'), 'review: `writable: web, web` names `web` twice. Name it once.');
  assert.equal(said('writable: , ,'), `review: \`writable: , ,\` names no folder. ${shape}`);
});

test('REFUSED at load: `writable:` on a step on a remote A2A agent', () => {
  assert.match(
    said('harness: a2a:peer\nwritable: web'),
    /^review: `writable: web` gives a session on this machine a folder of the run's factory to write, and a remote agent works on another party's machine/,
  );
});

test('REFUSED at load: `writable:` over a fence that writes nothing — `plan`, codex `read-only`, a `tools:` list with no writing tool', () => {
  const rule =
    "`writable:` widens where a step's writes reach, never what it may do. Delete the line, or run the step on a fence that writes — an agent whose file allows `Edit(**)`, say.";
  assert.equal(
    said('permissionMode: plan\nwritable: web'),
    `review: \`writable: web\` lets the step write those folders, and its fence, runs in \`plan\`, which writes nothing: ${rule}`,
  );
  assert.equal(
    said('harness: codex\nsandbox: read-only\nwritable: web'),
    `review: \`writable: web\` lets the step write those folders, and its fence, runs in \`read-only\`, which writes nothing: ${rule}`,
  );
  assert.equal(
    said('tools: Read, Grep\nwritable: web'),
    `review: \`writable: web\` lets the step write those folders, and its fence, has only the tools \`Read\`, \`Grep\`, and none writes a file: ${rule}`,
  );
  assert.equal(said('permissionMode: dontAsk\nallowedTools: Edit(**)\nwritable: web'), 'read', 'a fence that writes');
  assert.equal(said('tools: Read, Edit\nwritable: web'), 'read');
  assert.equal(said('tools: Read, Bash\nwritable: web'), 'read', 'Bash writes by a redirection');
  assert.equal(said('writable: web'), 'read', "the runtime's default mode writes");
});

test('REFUSED at load: `writable:` over a mode that asks before an edit and allows no `Edit` rule, whose mount would be its first write', () => {
  const rule =
    "`writable:` widens where a step's writes reach, never what it may do. Delete the line, or run the step on a fence that writes — an agent whose file allows `Edit(**)`, say.";
  assert.equal(
    said('permissionMode: dontAsk\nallowedTools: Bash(npm test)\nwritable: web'),
    `review: \`writable: web\` lets the step write those folders, and its fence, runs in \`dontAsk\`, which asks before an edit, and allows no \`Edit\` rule, so it writes nothing: ${rule}`,
  );
  assert.equal(
    said('permissionMode: default\nwritable: web'),
    `review: \`writable: web\` lets the step write those folders, and its fence, runs in \`default\`, which asks before an edit, and allows no \`Edit\` rule, so it writes nothing: ${rule}`,
  );
  assert.equal(said('permissionMode: dontAsk\nallowedTools: Bash(npm test), Edit(src/**)\nwritable: web'), 'read', 'an edit rule writes');
  assert.equal(said('permissionMode: acceptEdits\nwritable: web'), 'read', 'a mode that edits unasked writes');
  assert.equal(said('harness: codex\nsandbox: workspace-write\nwritable: web'), 'read', 'a sandbox that writes takes no rule');
});

test("REFUSED at load: `writable:` on a step whose agent's fence writes nothing, naming the agent's file", () => {
  const team = teamCopy();
  fs.writeFileSync(path.join(team, 'agents', 'planner.md'), '---\npermissionMode: plan\n---\nPlan it.\n');
  const agents = loadAgents(agentsDir(path.join(team, 'dev')));
  assert.throws(
    () => parseWorkflow('plan', '---\nplace: git\nagent: planner\nwritable: web\n---\n', undefined, agents),
    (err: unknown) =>
      err instanceof Invalid &&
      err.exitCode === 2 &&
      err.message.startsWith('plan: `writable: web`') &&
      err.message.includes("with agents/planner.md's, runs in `plan`") &&
      err.message.includes('Delete the line') &&
      err.message.includes('allows `Edit(**)`'),
  );
});

test('stepMounts: the folders a step names writable, by their directory names, and every other read-only; none for a run that mounts none', () => {
  const mounts = [
    { path: '/srv/a', readOnly: true },
    { path: '/srv/web', readOnly: true },
  ];
  assert.deepEqual(stepMounts({ writable: ['web'] }, mounts), [
    { path: '/srv/a', readOnly: true },
    { path: '/srv/web', readOnly: false },
  ]);
  assert.deepEqual(stepMounts({}, mounts), mounts);
  assert.deepEqual(stepMounts({ writable: ['srv'] }, mounts), mounts, 'a parent folder is no folder of the factory');
  assert.equal(stepMounts({ writable: ['web'] }, undefined), undefined);
});
