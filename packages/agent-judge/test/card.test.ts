/** `judge card`: what it sends, the folder it prints, and what it refuses. Over a stub fetch and a record in a temp dir. */
import { answering, ENV, files, stub, tmp } from './hermetic.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardText, dispatch, QUESTIONS } from '../src/card.ts';
import { defaultRecord, main } from '../src/cli.ts';

const WORKFLOWS = fileURLToPath(new URL('../../../workflows/', import.meta.url));

const CARD = `---
workflow: dev-planned
repo: /home/someone/private/path
---

# Sort the inbox

Sort the inbox by date, newest first. Done when the api's test sees the order.
`;

const run = async (argv: string[], replies: Parameters<typeof stub> = [answering({})], env: Record<string, string> = ENV) => {
  const s = stub(...replies);
  const lines: string[] = [];
  const code = await main(argv, { env, out: (l) => lines.push(l), fetch: s.fetch, retries: 0 });
  return { code, lines, calls: s.calls, text: lines.join('\n') };
};

const cardFile = (text = CARD) => {
  const file = path.join(tmp('card'), 'card.md');
  fs.writeFileSync(file, text);
  return file;
};

test('the card is sent without its frontmatter, beside the fixed repository text', async () => {
  const record = tmp('card');
  const { code, calls, text } = await run(
    ['card', cardFile(), '--record', record],
    [answering({ web: 0.9, plan: 0.1, clear: 3, size: 1 })],
  );
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  const sent = calls[0]!.body.state as { card: string; repository: object };
  assert.equal(sent.card, "# Sort the inbox\n\nSort the inbox by date, newest first. Done when the api's test sees the order.");
  assert.ok(!JSON.stringify(calls[0]!.body).includes('private/path') && !JSON.stringify(calls[0]!.body).includes('workflow:'));
  assert.deepEqual(Object.keys(calls[0]!.body.questions), ['web', 'plan', 'clear', 'size']);
  assert.match(
    text,
    new RegExp(`^judge card: .*card\\.md · ${sent.card.length} characters sent, frontmatter stripped · jev-1\\.13\\.0$`, 'm'),
  );
  assert.match(text, /^ {2}web {4}P 0\.90 +yes +does it touch/m);
  assert.match(text, /^ {2}clear +score 3\.00 \/ 3 +yes/m);
  assert.match(text, /^1 request · 4 questions · 1000 input tokens · \d+ ms$/m);
  assert.match(text, new RegExp(`^record: ${record}$`, 'm'));
  assert.match(text, /^→ dev-build$/m);
  const again = await run(['card', cardFile(), '--record', record]);
  assert.equal(again.calls.length, 0);
  assert.match(again.text, /^all on record · 0 requests$/m);
  // Nothing left the machine this time, and the first line says so.
  assert.match(
    again.text,
    new RegExp(`^judge card: .*card\\.md · ${sent.card.length} characters, not sent, frontmatter stripped · jev-1\\.13\\.0$`, 'm'),
  );
  assert.match(again.text, /^→ dev-build$/m);
});

test('each shipped folder is reached, and every folder it can name is in workflows/', async () => {
  const folders = new Set<string>();
  for (const [web, plan, folder] of [
    [0.1, 0.1, 'dev'],
    [0.9, 0.1, 'dev-build'],
    [0.1, 0.9, 'dev-planned'],
    [0.9, 0.9, 'dev-planned-build'],
  ] as const) {
    const { text } = await run(['card', '--text', 'Do a thing.', '--record', tmp('card')], [answering({ web, plan, clear: 3 })]);
    assert.match(text, new RegExp(`^→ ${folder}$`, 'm'));
    folders.add(folder);
  }
  for (const folder of folders) assert.ok(fs.existsSync(path.join(WORKFLOWS, folder)), `${folder} is not a shipped folder`);
});

test('a card that does not say what done looks like stays in the inbox, whatever else it says', async () => {
  const { text } = await run(
    ['card', '--text', 'Make it better.', '--record', tmp('card')],
    [answering({ web: 0.5, plan: 0.9, clear: 1 })],
  );
  assert.match(text, /^→ stays in the inbox: says too little about what done looks like$/m);
});

test('an unsure property keeps it in the inbox, and says which', async () => {
  const one = await run(['card', '--text', 'x', '--record', tmp('card')], [answering({ web: 0.5, plan: 0.1, clear: 3 })]);
  assert.match(one.text, /^→ stays in the inbox: unsure about the web app$/m);
  const three = await run(['card', '--text', 'x', '--record', tmp('card')], [answering({ web: 0.5, plan: 0.5, clear: 2 })]);
  assert.match(three.text, /^→ stays in the inbox: unsure about the web app, planning first and what done looks like$/m);
});

test('with no key it asks nothing, records nothing, says the judge is off, and the card stays in the inbox', async () => {
  const record = tmp('card');
  const { code, calls, text } = await run(['card', '--text', 'x', '--record', record], [answering({})], {});
  assert.equal(code, 0);
  assert.equal(calls.length, 0);
  assert.match(
    text,
    /^judge card: .* · 1 characters, not sent, frontmatter stripped · /m,
    'with the judge off the card went nowhere, and the first line says so',
  );
  assert.match(text, /^ {2}web {4}no-key/m);
  assert.match(text, /^ {2}no-key: no TYPESAFE_API_KEY in the environment — the judge is off; set the key and run again$/m);
  assert.ok(!text.includes('--reask'), 'a missing key is not a failure to re-ask');
  assert.equal(text.match(/no-key:/g)!.length, 1, 'one line for the kind, not one per question');
  assert.match(text, /^0 requests$/m);
  assert.match(text, /^→ stays in the inbox: unsure about the web app, planning first and what done looks like$/m);
  assert.deepEqual(files(record), [], 'nothing is recorded');
});

test('--reask asks the failed questions again', async () => {
  const record = tmp('card');
  await run(['card', '--text', 'x', '--record', record], [{ status: 500 }]);
  const kept = await run(['card', '--text', 'x', '--record', record]);
  assert.equal(kept.calls.length, 0);
  assert.match(kept.text, /unreachable: .* — once that is fixed, run again with --reask/);
  const again = await run(['card', '--text', 'x', '--record', record, '--reask'], [answering({ web: 0.1, plan: 0.1, clear: 3 })]);
  assert.equal(again.calls.length, 1);
  assert.equal(Object.keys(again.calls[0]!.body.questions).length, 4);
  assert.match(again.text, /^→ dev$/m);
});

test('judge card refuses what it cannot ask about', async () => {
  const refuses = (argv: string[], pattern: RegExp) =>
    assert.rejects(run(argv), (e: Error & { exitCode?: number }) => e.exitCode === 2 && pattern.test(e.message));
  await refuses(['card'], /^judge card: give a card's file, or its --text, and not both/);
  await refuses(['card', cardFile(), '--text', 'x'], /^judge card: give a card's file, or its --text, and not both/);
  await refuses(['card', 'a.md', 'b.md'], /^judge card: one card at a time/);
  await refuses(['card', '--text'], /^judge card: --text takes a value/);
  await refuses(['card', '--text', 'x', '--force'], /^judge card: unknown option --force/);
  await refuses(['card', path.join(tmp('card'), 'missing.md')], /^judge card: cannot read .*missing\.md: ENOENT\.$/);
  await refuses(
    ['card', cardFile('---\nworkflow: dev\n---\n  \n')],
    /^judge card: the card says nothing once its frontmatter is taken off/,
  );
  await refuses(['card', '--text', '   '], /^judge card: the card says nothing/);
  await refuses(['ask'], /^judge: no command ask/);
  const bare = await run([]);
  assert.equal(bare.code, 2);
  assert.match(bare.text, /^judge status/);
  assert.equal((await run(['help'])).code, 0);
});

test('only the leading frontmatter is taken off, with a BOM or CRLF, and a rule later in the card stays', () => {
  assert.equal(cardText('\uFEFF---\r\nworkflow: dev\r\n---\r\nBody.'), 'Body.');
  assert.equal(cardText('Intro.\n---\nkey: value\n---\nMore.'), 'Intro.\n---\nkey: value\n---\nMore.');
  assert.equal(cardText('---\na: b\n---\nx\n---\ny'), 'x\n---\ny');
  assert.throws(
    () => cardText('---\na: b\n---'),
    (e: Error) => e.message.startsWith('judge card: the card says nothing'),
  );
});

test('dispatch reads a failure on every property as unsure about each', () => {
  const failed = (id: string) => ({ status: 'failed' as const, kind: 'refused' as const, message: 'm', key: id, at: '' });
  const answers = { web: failed('w'), plan: failed('p'), clear: failed('c'), size: failed('s') };
  assert.deepEqual(dispatch(answers as never), { inbox: 'unsure about the web app, planning first and what done looks like' });
  assert.deepEqual(Object.keys(QUESTIONS), ['web', 'plan', 'clear', 'size']);
});

test('the record defaults to $WF_ROOT/judge, then ~/.agent-workflows/judge', () => {
  assert.equal(defaultRecord({ WF_ROOT: '/srv/wf' }), '/srv/wf/judge');
  assert.equal(defaultRecord({}), path.join(os.homedir(), '.agent-workflows', 'judge'));
  assert.equal(defaultRecord({ WF_ROOT: '' }), path.join(os.homedir(), '.agent-workflows', 'judge'));
});
