/**
 * `wf agents`, and `wf agents card <name>`: the two places a `wf` reads agents from, and one agent printed in A2A's shape.
 *
 * The card is JSON on stdout and nothing else — a person pipes it — so what it is *not* goes to stderr. Held here: that
 * separation, the listing's two places, and each refusal at shipped defaults. `WF_ROOT` is set before the import, since the module
 * reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Engine } from 'agent-runtime';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-agents-cli-');
process.env.WF_ROOT = ROOT;
const { main } = await import('../src/cli/main.ts');

/** No verb here asks the engine anything. */
const NO_ENGINE = {} as Engine;

type Mock = { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } };

/** What `main` wrote, stdout and stderr apart, for one verb. */
const printedBy = async (t: Mock, ...argv: string[]): Promise<{ out: string; err: string }> => {
  const out: string[] = [];
  const err: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    out.push(args.join(' '));
  });
  const warn = t.mock.method(console, 'error', (...args: unknown[]) => {
    err.push(args.join(' '));
  });
  try {
    await main(argv, NO_ENGINE);
  } finally {
    log.mock.restore();
    warn.mock.restore();
  }
  return { out: out.join('\n'), err: err.join('\n') };
};

const SKILL =
  '---\nname: read-a-thing\ntitle: Read a thing\ndescription: Reads it.\ntags: ["note"]\nexamples: ["Use this when something must be read."]\n---\nRead it.\n';

/** An agent in a `<workflows>/agents`, composed from one skill in the `<workflows>/skills` beside it. */
const anAgent = (at: string, name: string, description: string, skill = SKILL) => {
  fs.mkdirSync(at, { recursive: true });
  fs.writeFileSync(
    path.join(at, `${name}.md`),
    `---\ndescription: ${description}\nskills: read-a-thing\ntools: Read, Skill\n---\nDo the thing.\n`,
  );
  fs.mkdirSync(path.join(at, '..', 'skills', 'read-a-thing'), { recursive: true });
  fs.writeFileSync(path.join(at, '..', 'skills', 'read-a-thing', 'SKILL.md'), skill);
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
  const { out } = await printedBy(t, 'agents', '--repo', repo);
  assert.match(out, /^scribe {2}repo {2}Writes it down\.$/m);
  assert.match(out, /^ {3}read-a-thing {2}Read a thing — Reads it\.$/m);
  assert.match(out, /^archivist {2}yours {2}Files it away\.$/m);
  assert.ok(out.indexOf('scribe') < out.indexOf('archivist'), `the repository's place comes first, as it does on the board:\n${out}`);
  assert.match(out, /one in A2A's shape: wf agents card <name>/);
  fs.rmSync(path.join(YOURS, 'archivist.md'));
});

test('wf agents lists an agent with no skills by the one thing its description says, and says why of one with no card', async (t) => {
  const repo = repoAt('bare');
  fs.writeFileSync(path.join(repo, 'workflows', 'agents', 'plain.md'), '---\ndescription: Does one thing.\n---\nDo it.\n');
  fs.writeFileSync(path.join(repo, 'workflows', 'agents', 'mute.md'), '---\nmodel: opus\n---\nDo it.\n');
  const { out } = await printedBy(t, 'agents', '--repo', repo);
  assert.match(out, /^ {3}plain {2}plain — Does one thing\.$/m);
  assert.match(out, /^ {3}says nothing it can do — agents\/mute\.md has no `description:`/m);
});

test('wf agents card prints the card alone on stdout, and what it is not on stderr', async (t) => {
  const repo = repoAt('card');
  anAgent(path.join(repo, 'workflows', 'agents'), 'scribe', 'Writes it down.');
  const { out, err } = await printedBy(t, 'agents', 'card', 'scribe', '--repo', repo);
  const card = JSON.parse(out) as { name: string; skills: Array<{ id: string }>; capabilities: Record<string, boolean>; version: string };
  assert.equal(card.name, 'scribe');
  assert.deepEqual(
    card.skills.map((s) => s.id),
    ['read-a-thing'],
  );
  assert.deepEqual(card.capabilities, { streaming: false, pushNotifications: false, extendedAgentCard: false });
  assert.match(card.version, /^[0-9a-f]{16}$/);
  assert.equal(
    out.includes('not an address'),
    false,
    "not a field of the card: it is a word to the person, not data a reader would take for the protocol's",
  );
  assert.match(err, /^scribe \(repo\) — a card, not an address: nothing here serves this agent over A2A/m);
});

test('REFUSED at shipped defaults: a card for an agent in neither place, one in both with nothing saying which, and a --from that is neither', async (t) => {
  const repo = repoAt('refused');
  anAgent(path.join(repo, 'workflows', 'agents'), 'twin', 'The repository’s.');
  const refused = async (pattern: RegExp, ...argv: string[]) => {
    await assert.rejects(
      () => printedBy(t, ...argv),
      (err: Error & { exitCode?: number }) => {
        assert.match(err.message, pattern);
        return true;
      },
    );
  };
  await refused(/^no agent named ghost\. Looked in .*wf agents lists them\.$/s, 'agents', 'card', 'ghost', '--repo', repo);
  await refused(/^wf agents --from takes repo or yours, not elsewhere:/, 'agents', 'card', 'twin', '--repo', repo, '--from', 'elsewhere');

  anAgent(YOURS, 'twin', 'Yours.');
  await refused(
    /^twin is an agent in both places — .* and .*\. Say which: --from repo or --from yours\.$/,
    'agents',
    'card',
    'twin',
    '--repo',
    repo,
  );
  const mine = JSON.parse((await printedBy(t, 'agents', 'card', 'twin', '--repo', repo, '--from', 'yours')).out) as {
    description: string;
  };
  assert.equal(mine.description, 'Yours.', 'said which, each place answers for its own');
  fs.rmSync(path.join(YOURS, 'twin.md'));
});

test('REFUSED at shipped defaults: a card for an agent whose skill says no description, or that no place has, in the reader’s own words', async (t) => {
  const repo = repoAt('broken');
  anAgent(path.join(repo, 'workflows', 'agents'), 'scribe', 'Writes it down.', '---\nname: read-a-thing\n---\nRead it.\n');
  await assert.rejects(
    () => printedBy(t, 'agents', 'card', 'scribe', '--repo', repo),
    (err: Error) => {
      assert.match(err.message, /read-a-thing\/SKILL\.md has no `description:`, and the A2A protocol marks a skill's description REQUIRED/);
      return true;
    },
  );
  fs.writeFileSync(
    path.join(repo, 'workflows', 'agents', 'scribe.md'),
    '---\ndescription: Writes it down.\nskills: gone-away\ntools: Read, Skill\n---\nDo it.\n',
  );
  await assert.rejects(
    () => printedBy(t, 'agents', 'card', 'scribe', '--repo', repo),
    (err: Error) => {
      assert.match(
        err.message,
        /gives the skill `gone-away`, and no skills folder has it — looked in /,
        'your place has a `read-a-thing` of its own, so the skill that is nowhere is another',
      );
      return true;
    },
  );
});
