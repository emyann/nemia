/**
 * An upgrade of sdlc that changes implement's check, merged into a factory's tree by `nemia factory diff` on a scratch store, as an
 * operator previews it. The template's next version adds a script to the check line of `build` and of `quick` and names it in the
 * sentence of build's implement note that lists the check's scripts. A factory that spliced a check of its own into that line and
 * that sentence, by hand, conflicts on both; a factory that set its own check by the `implementCheck` parameter, and changed only a
 * line of its own elsewhere, merges with no conflict.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copyOf, nemia, rendered, SDLC, storeEnv } from './template.ts';

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

/** What `nemia factory diff <name> --to` the next version prints: its exit, the count of conflicts, and the lines that name one. */
function diffOf(name: string): { code: number | null; conflicts: number; at: string[]; out: string } {
  const { env } = factory(name);
  const ran = nemia(env, 'factory', 'diff', name, '--to', NEXT);
  const count = /^conflicts: (\d+)$/m.exec(ran.out);
  assert.ok(count, `nemia factory diff ${name} says its conflicts:\n${ran.out}\n${ran.err}`);
  return {
    code: ran.code,
    conflicts: Number(count[1]),
    at: ran.out.split('\n').flatMap((line) => (/^ {2}\S/.test(line) && line.includes('workflows/') ? [line.trim()] : [])),
    out: ran.out,
  };
}

test("REFUSED: a check of its own spliced into sdlc's check line and sentence conflicts where the next version changes them", () => {
  const diff = diffOf('spliced');
  assert.equal(diff.code, 0, diff.out);
  for (const at of ['workflows/build/implement.md#check', 'workflows/quick/implement.md#check'])
    assert.ok(diff.at.includes(at), `${at} conflicts:\n${diff.out}`);
  assert.ok(
    diff.at.some((at) => at.startsWith('workflows/build/implement.md:')),
    `and so does the sentence that lists the scripts:\n${diff.out}`,
  );
});

test('a check of its own set by implementCheck merges with no conflict when the next version changes the check line and its sentence', () => {
  const diff = diffOf('parameter');
  assert.equal(diff.code, 0, diff.out);
  assert.equal(diff.conflicts, 0, diff.out);
  for (const workflow of ['build', 'quick'])
    assert.match(
      diff.out,
      new RegExp(`^ {2}workflows/${workflow}/implement\\.md\\s+from the template$`, 'm'),
      `${workflow}'s change merges in`,
    );
  assert.match(diff.out, /^ {2}RULES\.md\s+from your tree$/m, 'and the line of its own stays');
});
