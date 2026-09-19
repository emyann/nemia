import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imagePaths, MACHINE_WORDS, MARKDOWN_AT, outcomeOf, outcomeWord, outputKind } from '../src/lib/outcome.ts';
import type { StepAttempts, StepCloseout } from '../src/lib/api.ts';

const none = new Set<string>();
const shot = '/wf/runs/r-1/artifacts/implement/runs-light.png';
const images = new Set([shot]);

// Each field of the schemas the shipped agents declare (workflows/agents/*.schema.json), as they declare it.
const findingsSchema = {
  type: 'array',
  items: { type: 'object', properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } } },
};
const filesSchema = { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, change: { type: 'string' } } } };
const strings = { type: 'array', items: { type: 'string' } };

test('an array of objects with a file and a line is findings — whatever else each says, and a null line among them', () => {
  const findings = [{ file: 'src/a.ts', line: 12, what: 'It breaks.' }, { file: 'test/a.test.ts', line: null, what: 'No test.' }];
  assert.equal(outputKind(findingsSchema, findings, none), 'findings');
  assert.equal(outputKind(undefined, [{ file: 'a', line: 1, finding: 'x' }], none), 'findings', 'with no schema, off the value alone');
  // A finding whose text is not flat is still one: the place is what makes it a finding.
  assert.equal(outputKind(undefined, [{ file: 'a', line: 1, what: { why: 'nested' } }], none), 'findings');
});

test("an array of objects with a finding and an answer is replies — the loop target's", () => {
  const replies = [{ finding: 'src/a.ts:12', answer: 'fixed', why: 'It does not.' }, { finding: 'b', answer: "won't fix", why: 'On purpose.' }];
  assert.equal(outputKind(undefined, replies, none), 'replies');
});

test("an array of flat objects that are neither is a table — a plan's files", () => {
  assert.equal(outputKind(filesSchema, [{ path: 'a.ts', change: 'New.' }, { path: 'b.ts', change: 'Gone.' }], none), 'table');
});

test('a boolean is yes or no', () => {
  assert.equal(outputKind({ type: 'boolean', description: 'Another round.' }, false, none), 'yesno');
  assert.equal(outputKind(undefined, true, none), 'yesno');
});

test('an array of strings is a list, and so is an empty array its schema says holds strings, or says nothing of', () => {
  assert.equal(outputKind(strings, ['Read it.', 'Change it.'], none), 'list');
  assert.equal(outputKind(strings, [], none), 'list');
  assert.equal(outputKind(undefined, [], none), 'list');
});

test('an empty array is what its schema declares its items to be', () => {
  assert.equal(outputKind(findingsSchema, [], none), 'findings');
  assert.equal(outputKind(filesSchema, [], none), 'table');
});

test("a string that is the path of one of the try's image artifacts is the image; the same string otherwise is text", () => {
  assert.equal(outputKind({ type: 'string' }, shot, images), 'image');
  assert.equal(outputKind({ type: 'string' }, shot, none), 'text');
  assert.equal(outputKind({ type: 'string' }, 'other.png', images), 'text');
  // `imagePaths` is what tells it: an image the api serves, not a text file nor a bare path.
  assert.deepEqual([...imagePaths([
    { path: shot, name: 'runs-light.png', url: '/x', kind: 'image', size: 1 },
    { path: '/wf/notes.md', name: 'notes.md', url: '/y', kind: 'text', size: 1 },
    { path: 'on-the-branch.png' },
  ])], [shot]);
});

test('a string of more than one line, or longer than MARKDOWN_AT, is markdown; a short one text, and so is a number', () => {
  assert.equal(outputKind({ type: 'string' }, 'First.\n\nSecond.', none), 'markdown');
  assert.equal(outputKind({ type: 'string' }, 'x'.repeat(MARKDOWN_AT + 1), none), 'markdown');
  assert.equal(outputKind({ type: 'string' }, 'x'.repeat(MARKDOWN_AT), none), 'text');
  assert.equal(outputKind({ type: 'integer' }, 3, none), 'text');
});

test('an unknown shape is json: an object, an array of arrays, a mixed array, records that are neither findings nor flat, null', () => {
  assert.equal(outputKind({ type: 'object' }, { a: 1 }, none), 'json');
  assert.equal(outputKind(undefined, [[1, 2], [3, 4]], none), 'json');
  assert.equal(outputKind(undefined, ['a', { b: 1 }], none), 'json');
  assert.equal(outputKind(undefined, [1, 2], none), 'json');
  assert.equal(outputKind(undefined, [{ name: 'a', tags: ['x'] }], none), 'json');
  assert.equal(outputKind(undefined, null, none), 'json');
});

test('a value its schema does not describe is json, though its shape alone would be drawn', () => {
  assert.equal(outputKind({ type: 'string' }, true, none), 'json');
  assert.equal(outputKind({ type: 'boolean' }, 'yes', none), 'json');
  assert.equal(outputKind(strings, 'one', none), 'json');
  assert.equal(outputKind({ type: 'integer' }, 1.5, none), 'json');
  assert.equal(outputKind({ type: ['integer', 'null'] }, null, none), 'json', 'null agrees, and still has no drawing but itself');
});

test("the kind is the value's and its schema's, never its field's name: it is not given one", () => {
  // `outputKind` takes no name at all; what a field named `findings` holds decides, and the same value under any name draws alike.
  assert.equal(outputKind.length, 3);
  assert.equal(outputKind(strings, ['src/a.ts:12 — it breaks'], none), 'list', 'a `findings` that is strings is a list');
  assert.equal(outputKind(undefined, { findings: [] }, none), 'json');
});

const ended = (reason: string, how = 'failed'): StepAttempts => ({ count: 1, latest: { startedAt: 'a', ended: how, endedAt: 'b', reason } });
const said = (outcome: 'done' | 'blocked') => ({ outcome, summary: '', needs: null, artifacts: [], output: {}, missing: [], replies: null, schema: {}, raw: {} }) satisfies StepCloseout;

test("a try's outcome is the agent's when it gave a statement — and says when the machine cut it after", () => {
  assert.deepEqual(outcomeOf({ closeout: said('blocked'), unreadable: null, attempts: ended('harness', 'done') }, '-'), { by: 'agent', outcome: 'blocked', cut: null });
  assert.deepEqual(outcomeOf({ closeout: said('done'), unreadable: null, attempts: ended('deadline') }, '-'), { by: 'agent', outcome: 'done', cut: 'then it ran past its deadline and was stopped' });
});

test("with no statement, the machine's reason says why — each reason the engine records, and a harness that ended it failed or stopped", () => {
  for (const reason of ['unsigned', 'lost', 'unstartable', 'budget', 'operator', 'deadline']) {
    const o = outcomeOf({ closeout: null, unreadable: null, attempts: ended(reason) }, '-');
    assert.deepEqual(o, { by: 'machine', reason, words: MACHINE_WORDS[reason] });
    assert.equal(outcomeWord(o), reason);
  }
  assert.deepEqual(outcomeOf({ closeout: null, unreadable: null, attempts: ended('harness', 'stopped') }, '-'), {
    by: 'machine', reason: 'stopped', words: 'Its harness ended the session stopped, and it said nothing of how it went.',
  });
});

test("a statement that could not be read is the agent's, unreadable, and says why — ahead of any reason the machine gives", () => {
  const unreadable = { error: 'not an object', raw: ['done'] };
  const o = outcomeOf({ closeout: null, unreadable, attempts: ended('harness', 'done') }, 'No closeout yet.');
  assert.deepEqual(o, { by: 'unreadable', words: 'It gave a closing statement that could not be read (not an object). Here it is as it came.' });
  assert.equal(outcomeWord(o), 'unreadable');
  assert.equal(outcomeOf({ closeout: null, unreadable, attempts: ended('budget') }, '-').by, 'unreadable', 'what it said comes first, as a statement does');
});

test("with no statement and no reason — running, not filed, a harness's done — the inspector's words", () => {
  const nobody = { by: 'nobody', words: 'No closeout yet.' };
  assert.deepEqual(outcomeOf({ closeout: null, unreadable: null, attempts: { count: 1, latest: { startedAt: 'a', ended: null, endedAt: null, reason: null } } }, 'No closeout yet.'), nobody);
  assert.deepEqual(outcomeOf({ closeout: null, unreadable: null, attempts: { count: 0, latest: null } }, 'No closeout yet.'), nobody);
  assert.deepEqual(outcomeOf({ closeout: null, unreadable: null, attempts: ended('harness', 'done') }, 'No closeout yet.'), nobody);
  assert.equal(outcomeWord(nobody as never), 'no closeout');
});
