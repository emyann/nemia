/**
 * An upgrade of sdlc that changes implement's check, merged into a factory's tree by `nemia factory diff` on a scratch store, as an
 * operator previews it, run on its entry's handler. The template's next version adds a script to the check line of `build` and of
 * `quick` and names it in the sentence of build's implement note that lists the check's scripts. A factory that spliced a check of its
 * own into that line and that sentence, by hand, conflicts on both; a factory that set its own check by the `implementCheck` parameter,
 * and changed only a line of its own elsewhere, merges with no conflict.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FACTORY_PLAN } from 'agent-orchestrator';
import { copyOf, handled, rendered, SDLC, storeEnv } from './template.ts';

/** The template the factories are applied from, which the test then moves to its next version in place. */
const TEMPLATE = copyOf(SDLC);

/** The end of the parts.ts clause in a workflow.yaml's check line, its quotes escaped as the YAML string writes them. */
const PARTS_END = '/parts.ts\\" check && ';

/** The end of the probe.ts clause in a rendered step file's check. */
const PROBE_END = '/probe.ts" check && ';

/** The sentence of build's implement note that lists the check's scripts on GitHub, as sdlc writes it. */
const LISTED = 'Your check runs `probe.ts`, `parts.ts` and the factory';

const TREES = await rendered([
  { name: 'spliced', template: TEMPLATE },
  { name: 'parameter', template: TEMPLATE, sets: ['implementCheck=own-check'] },
]);

/** The tree of the factory `name`, and an environment on the store it is in. */
function factory(name: string): { tree: string; env: NodeJS.ProcessEnv } {
  const at = TREES[name];
  assert.ok(at?.tree, `${name} was rendered: ${JSON.stringify(at?.conditions)}`);
  return { tree: at.tree, env: storeEnv(path.dirname(at.store)) };
}

/** `file` of `folder` with `from` replaced by `to`, which it must hold once. */
function rewrite(folder: string, file: string, from: string, to: string): void {
  const text = fs.readFileSync(path.join(folder, file), 'utf8');
  assert.equal(text.split(from).length - 1, 1, `${file} holds ${from} once`);
  fs.writeFileSync(path.join(folder, file), text.replace(from, to));
}

/** Each factory's tree as its operator left it: one spliced its own check into sdlc's line and sentence, one changed a line of its own. */
function leftByOperators(): void {
  const spliced = factory('spliced').tree;
  for (const workflow of ['build', 'quick'])
    rewrite(spliced, `workflows/${workflow}/implement.md`, PROBE_END, `${PROBE_END}{ own-check; } && `);
  rewrite(spliced, 'workflows/build/implement.md', LISTED, LISTED.replace('`probe.ts`', '`own-check`, `probe.ts`'));
  fs.appendFileSync(path.join(factory('parameter').tree, 'RULES.md'), '\nA rule of our own.\n');
}
leftByOperators();

/** The template's next version: its patch bumped, a script added to both check lines after parts.ts, and named where the note lists
 * them. */
const NEXT = (() => {
  const manifest = path.join(TEMPLATE, 'nemia.yaml');
  const version = /^ {2}version: (\d+)\.(\d+)\.(\d+)$/m.exec(fs.readFileSync(manifest, 'utf8'));
  assert.ok(version, 'nemia.yaml says its version');
  const next = `${version[1]}.${version[2]}.${Number(version[3]) + 1}`;
  rewrite(TEMPLATE, 'nemia.yaml', version[0], `  version: ${next}`);
  for (const workflow of ['build', 'quick'])
    rewrite(TEMPLATE, `workflows/${workflow}/workflow.yaml`, PARTS_END, `${PARTS_END}{ echo added; } && `);
  rewrite(TEMPLATE, 'workflows/build/implement.md', LISTED, LISTED.replace('`parts.ts`', '`parts.ts`, `added.ts`'));
  return next;
})();

/** What `nemia factory diff <name> --to` the next version previews, run on its entry's handler: each conflict's place, and what merged. */
async function diffOf(name: string): Promise<{ at: string[]; merged: string[]; said: string }> {
  const { env } = factory(name);
  const plan = await handled(env, FACTORY_PLAN, [name, '--to', NEXT]);
  if (plan.kind !== 'upgrade') return assert.fail(`nemia factory diff ${name} previews no upgrade: ${JSON.stringify(plan)}`);
  const { merge } = plan;
  return {
    at: merge.conflicts.map((c) => c.at),
    merged: merge.merged.map((m) => `${m.at} ${m.from}`),
    said: JSON.stringify({ conflicts: merge.conflicts.map((c) => c.at), merged: merge.merged }),
  };
}

test("REFUSED: a check of its own spliced into sdlc's check line and sentence conflicts where the next version changes them", async () => {
  const diff = await diffOf('spliced');
  for (const at of ['workflows/build/implement.md#check', 'workflows/quick/implement.md#check'])
    assert.ok(diff.at.includes(at), `${at} conflicts:\n${diff.said}`);
  assert.ok(
    diff.at.some((at) => at.startsWith('workflows/build/implement.md:')),
    `and so does the sentence that lists the scripts:\n${diff.said}`,
  );
});

test('a check of its own set by implementCheck merges with no conflict when the next version changes the check line and its sentence', async () => {
  const diff = await diffOf('parameter');
  assert.deepEqual(diff.at, [], diff.said);
  for (const workflow of ['build', 'quick'])
    assert.ok(diff.merged.includes(`workflows/${workflow}/implement.md template`), `${workflow}'s change merges in:\n${diff.said}`);
  assert.ok(diff.merged.includes('RULES.md factory'), `and the line of its own stays:\n${diff.said}`);
});
