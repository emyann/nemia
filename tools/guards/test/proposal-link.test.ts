/**
 * The link `nemia.md` teaches Nemia to name a proposal by is one the board draws the proposal page's part for: its template
 * (`[<name>](/factories/<factory>/proposals/<name>)`), its placeholders filled, is read by the board's `proposalLinkOf`
 * (`apps/web/src/lib/proposalLink.ts`) as that factory and that proposal. Here, since the board's own tests build no path into another
 * package and the orchestrator's do not reach into the board: the guards read both. An agent that teaches another form, or a board that
 * reads another, fails it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { proposalLinkOf } from '../../../apps/web/src/lib/proposalLink.ts';
import { REPO } from './workspaces.ts';

const AGENT = 'packages/agent-orchestrator/nemia/nemia.md';

/** Every markdown link of `text` whose address names the placeholder `<name>`: the proposal templates the agent teaches. */
const templatesIn = (text: string): string[] => [...text.matchAll(/\]\(([^()\s]*<name>[^()\s]*)\)/g)].map((m) => m[1]);

/** The factory and the proposal `text`'s templates name once filled, as the board reads each. */
const readIn = (text: string) =>
  templatesIn(text).map((template) => proposalLinkOf(template.replaceAll('<factory>', 'acme').replaceAll('<name>', 'nemia-ab12c')));

test('the proposal link nemia.md teaches is one the board reads as the factory and the proposal', () => {
  const text = fs.readFileSync(path.join(REPO, AGENT), 'utf8');
  assert.ok(text.includes('propose'), 'the agent is read');
  const read = readIn(text);
  assert.ok(read.length > 0, 'the agent teaches a proposal link');
  assert.deepEqual(
    read,
    read.map(() => ({ factory: 'acme', name: 'nemia-ab12c' })),
  );
});

test('REFUSED: an agent that teaches a proposal link the board does not read is named', () => {
  const read = readIn('name the proposal by its link, `[<name>](/proposals/<name>)`.');
  assert.deepEqual(read, [undefined]);
});
