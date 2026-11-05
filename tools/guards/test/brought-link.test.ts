/**
 * The link `bring-what-waits` teaches Nemia to name a step by is one the board draws the run's page's part for: the skill's own template
 * (`[<step> of <run>](/runs/<run>?step=<step>)`), its placeholders filled, is read by the board's `broughtOf`
 * (`apps/web/src/lib/stepLink.ts`) as that run and that step. Here, since the board's own tests build no path into another package
 * and the orchestrator's do not reach into the board: the guards read both. A skill that teaches another form, or a board that reads
 * another, fails it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { broughtOf } from '../../../apps/web/src/lib/stepLink.ts';
import { REPO } from './workspaces.ts';

const SKILL = 'packages/agent-orchestrator/nemia/skills/bring-what-waits/SKILL.md';

/** Every markdown link of `text` whose address names the placeholders `<run>` and `<step>`: the templates the skill teaches. */
const templatesIn = (text: string): string[] => [...text.matchAll(/\]\(([^()\s]*<run>[^()\s]*)\)/g)].map((m) => m[1]);

/** The run and the step `text`'s templates name once filled, as the board reads each. */
const readIn = (text: string) =>
  templatesIn(text).map((template) => broughtOf(template.replace('<run>', 'cli-one-run-e4tv').replace('<step>', 'design')));

test('the step link bring-what-waits teaches is one the board reads as the run and the step', () => {
  const text = fs.readFileSync(path.join(REPO, SKILL), 'utf8');
  assert.ok(text.includes('# Bring what waits'), 'the skill is read');
  const read = readIn(text);
  assert.ok(read.length > 0, 'the skill teaches a step link');
  assert.deepEqual(
    read,
    read.map(() => ({ run: 'cli-one-run-e4tv', step: 'design' })),
  );
});

test('REFUSED: a skill that teaches a link the board does not read is named', () => {
  const read = readIn('name each step by its link, `[<step> of <run>](/runs/<run>/steps/<step>)`.');
  assert.deepEqual(read, [undefined]);
});
