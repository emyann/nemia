/**
 * The board's skill entries (`SKILLS_LIST`, `SKILLS_READ`, `SKILLS_WRITE`), served on the api alone: a skill written from its form, read
 * back for its page and in the list, and a builtin skill copied into your library; and a copy over a skill of that name refused in the
 * package's words whole. `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-skills-verb-root-');
process.env.WF_ROOT = ROOT;
const { SKILLS_LIST, SKILLS_READ, SKILLS_WRITE } = await import('./skills.verb.ts');
const { runWith: runEngine } = await import('../runner.ts');
const { engineOf } = await import('../runtime-client.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);

const e = () => engineOf(engine().layer);
const library = path.join(ROOT, 'workflows', 'skills');

/** A folder of builtin skills, holding the skill `name`. */
function builtinWith(name: string): string {
  const builtin = path.join(scratch('wf-skills-builtin-'), 'skills');
  fs.mkdirSync(path.join(builtin, name), { recursive: true });
  fs.writeFileSync(path.join(builtin, name, 'SKILL.md'), `---\nname: ${name}\ndescription: Tidy a change before review.\n---\nTidy it.\n`);
  return builtin;
}

test('a skill written from its form reads back for its page and in the list, at the version its write answered', async () => {
  const change = JSON.stringify({ name: 'notes', description: 'Write the notes of a change.', body: 'Write them.' });
  const made = await runWith(e(), SKILLS_WRITE.handler({ from: 'yours', library, change }));
  assert.ok('version' in made, JSON.stringify(made));
  const dir = path.join(library, 'notes');
  const page = await runWith(e(), SKILLS_READ.handler({ from: 'yours', name: 'notes', dir }));
  assert.equal(page.version, made.version);
  assert.match(page.text, /Write them\./);
  assert.equal(page.entry?.id, 'notes');
  const listed = await runWith(e(), SKILLS_LIST.handler({ skills: [dir] }));
  assert.deepEqual(Object.keys(listed), [dir]);
  assert.equal(listed[dir]?.entry?.id, 'notes');
});

test("REFUSED: a copy over a skill your library has, in the package's words whole; the copy before it is Nemia's skill whole", async () => {
  const builtin = builtinWith('tidy');
  const copied = await runWith(e(), SKILLS_WRITE.handler({ from: 'yours', library, copy: 'tidy', builtin }));
  assert.deepEqual(copied, { dir: path.join(library, 'tidy'), name: 'tidy', written: ['SKILL.md'] });
  await assert.rejects(runWith(e(), SKILLS_WRITE.handler({ from: 'yours', library, copy: 'tidy', builtin })), (err: Error) => {
    assert.equal(
      err.message,
      `skills/tidy is there already, in ${library}, and a copy would write over it. Give it as it is, or remove that folder first.`,
    );
    return true;
  });
});
