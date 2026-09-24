/**
 * `wf agents`, and `wf agents card <name>`: the two places a `wf` reads agents from, and one agent printed in A2A's shape.
 *
 * The card is JSON on stdout and nothing else — a person pipes it — so what it is *not* goes to stderr. Held here: that
 * separation, the listing's two places, and each refusal at shipped defaults.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Engine } from 'agent-runtime';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-agents-cli-');
// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { main } = await import('../src/cli.ts');

/** No verb here asks the engine anything. */
const NO_ENGINE = {} as Engine;

type Mock = { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } };

/** What `main` wrote, stdout and stderr apart, for one verb. */
const printedBy = async (t: Mock, ...argv: string[]): Promise<{ out: string; err: string }> => {
  const out: string[] = [];
  const err: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { out.push(args.join(' ')); });
  const warn = t.mock.method(console, 'error', (...args: unknown[]) => { err.push(args.join(' ')); });
  try { await main(argv, NO_ENGINE); } finally { log.mock.restore(); warn.mock.restore(); }
  return { out: out.join('\n'), err: err.join('\n') };
};

const SKILL = { id: 'read-a-thing', name: 'Read a thing', description: 'Reads it.', tags: ['note'], examples: ['Use this when something must be read.'] };

/** An agent in a `<workflows>/agents`, with its skills beside it. */
const anAgent = (at: string, name: string, description: string, skills: unknown[] = [SKILL]) => {
  fs.mkdirSync(at, { recursive: true });
  fs.writeFileSync(path.join(at, `${name}.md`), `---\ndescription: ${description}\nskills: ${name}.skills.json\n---\nDo the thing.\n`);
  fs.writeFileSync(path.join(at, `${name}.skills.json`), `${JSON.stringify(skills, null, 2)}\n`);
};

const YOURS = path.join(ROOT, 'workflows', 'agents');
const repoAt = (name: string) => {
  const repo = fs.mkdtempSync(path.join(ROOT, `${name}-`));
  fs.mkdirSync(path.join(repo, 'workflows', 'agents'), { recursive: true });
  return repo;
};

test('wf agents lists both places, each agent by what it is for and what it says it can do', async (t) => {
  const repo = repoAt('repo');
  anAgent(path.join(repo, 'workflows', 'agents'), 'scribe', 'Writes it down.');
  anAgent(YOURS, 'archivist', 'Files it away.');
  const { out } = await printedBy(t as Mock, 'agents', '--repo', repo);
  assert.match(out, /^scribe {2}repo {2}Writes it down\.$/m);
  assert.match(out, /^ {3}read-a-thing {2}Read a thing — Reads it\.$/m);
  assert.match(out, /^archivist {2}yours {2}Files it away\.$/m);
  // The repository's place comes first, as it does on the board.
  assert.ok(out.indexOf('scribe') < out.indexOf('archivist'), out);
  assert.match(out, /one in A2A's shape: wf agents card <name>/);
  fs.rmSync(path.join(YOURS, 'archivist.md'));
  fs.rmSync(path.join(YOURS, 'archivist.skills.json'));
});

test('wf agents says so of an agent with no skills, rather than leaving it looking like one that can do nothing', async (t) => {
  const repo = repoAt('bare');
  fs.writeFileSync(path.join(repo, 'workflows', 'agents', 'mute.md'), '---\ndescription: Says nothing.\n---\nDo it.\n');
  const { out } = await printedBy(t as Mock, 'agents', '--repo', repo);
  assert.match(out, /says nothing it can do — give it a skills: file beside it/);
});

test('wf agents card prints the card alone on stdout, and what it is not on stderr', async (t) => {
  const repo = repoAt('card');
  anAgent(path.join(repo, 'workflows', 'agents'), 'scribe', 'Writes it down.');
  const { out, err } = await printedBy(t as Mock, 'agents', 'card', 'scribe', '--repo', repo);
  const card = JSON.parse(out) as { name: string; skills: Array<{ id: string }>; capabilities: Record<string, boolean>; version: string };
  assert.equal(card.name, 'scribe');
  assert.deepEqual(card.skills.map((s) => s.id), ['read-a-thing']);
  assert.deepEqual(card.capabilities, { streaming: false, pushNotifications: false, extendedAgentCard: false });
  assert.match(card.version, /^[0-9a-f]{16}$/);
  // Not a field of the card: the honesty about it is a word to the person, not data a reader would take for the protocol's.
  assert.equal(out.includes('not an address'), false);
  assert.match(err, /^scribe \(repo\) — a card, not an address: nothing here serves this agent over A2A/m);
});

test('REFUSED at shipped defaults: a card for an agent in neither place, one in both with nothing saying which, and a --from that is neither', async (t) => {
  const repo = repoAt('refused');
  anAgent(path.join(repo, 'workflows', 'agents'), 'twin', 'The repository’s.');
  const refused = async (pattern: RegExp, ...argv: string[]) => {
    await assert.rejects(() => printedBy(t as Mock, ...argv), (err: Error & { exitCode?: number }) => {
      assert.match(err.message, pattern);
      return true;
    });
  };
  await refused(/^no agent named ghost\. Looked in .*wf agents lists them\.$/s, 'agents', 'card', 'ghost', '--repo', repo);
  await refused(/^wf agents --from takes repo or yours, not elsewhere:/, 'agents', 'card', 'twin', '--repo', repo, '--from', 'elsewhere');

  anAgent(YOURS, 'twin', 'Yours.');
  await refused(/^twin is an agent in both places — .* and .*\. Say which: --from repo or --from yours\.$/, 'agents', 'card', 'twin', '--repo', repo);
  // Said which, each place answers for its own.
  const mine = JSON.parse((await printedBy(t as Mock, 'agents', 'card', 'twin', '--repo', repo, '--from', 'yours')).out) as { description: string };
  assert.equal(mine.description, 'Yours.');
  fs.rmSync(path.join(YOURS, 'twin.md'));
  fs.rmSync(path.join(YOURS, 'twin.skills.json'));
});

test('REFUSED at shipped defaults: a card for an agent whose skills file does not read, in the parser’s own words', async (t) => {
  const repo = repoAt('broken');
  anAgent(path.join(repo, 'workflows', 'agents'), 'scribe', 'Writes it down.');
  fs.writeFileSync(path.join(repo, 'workflows', 'agents', 'scribe.skills.json'), '[]\n');
  await assert.rejects(() => printedBy(t as Mock, 'agents', 'card', 'scribe', '--repo', repo), (err: Error) => {
    assert.match(err.message, /^agents\/scribe\.md: `skills: scribe\.skills\.json` is an empty list, and an agent with no skills says nothing it can do\./);
    return true;
  });
});
