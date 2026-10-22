/**
 * `nemia agents`, and `nemia agents card <name>`: the two places a `nemia` reads agents from, and one agent printed in A2A's shape.
 *
 * The card is JSON on stdout and nothing else — a person pipes it — so what it is *not* goes to stderr. Held here: that
 * separation, the listing's two places, and each refusal at shipped defaults. `WF_ROOT` is set before the import, since the module
 * reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scratch } from './scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from './placed.ts';
import { heldUnasked } from './unasked.ts';

const ROOT = scratch('wf-agents-cli-');
process.env.WF_ROOT = ROOT;
const { main } = await import('../src/cli/main.ts');

const { engineOf } = await import('../src/runtime-client.ts');
const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

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
    await main(argv, noEngine());
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

test('nemia agents lists both places, each agent by what it is for and what it says it can do', async (t) => {
  const repo = repoAt('repo');
  anAgent(path.join(repo, 'workflows', 'agents'), 'scribe', 'Writes it down.');
  anAgent(YOURS, 'archivist', 'Files it away.');
  const { out } = await printedBy(t, 'agents', '--repo', repo);
  assert.match(out, /^scribe {2}repo {2}Writes it down\.$/m);
  assert.match(out, /^ {3}read-a-thing {2}Read a thing — Reads it\.$/m);
  assert.match(out, /^archivist {2}yours {2}Files it away\.$/m);
  assert.ok(out.indexOf('scribe') < out.indexOf('archivist'), `the repository's place comes first, as it does on the board:\n${out}`);
  assert.match(out, /one in A2A's shape: nemia agents card <name>/);
  fs.rmSync(path.join(YOURS, 'archivist.md'));
});

test('nemia agents lists an agent with no skills by the one thing its description says, and says why of one with no card', async (t) => {
  const repo = repoAt('bare');
  fs.writeFileSync(path.join(repo, 'workflows', 'agents', 'plain.md'), '---\ndescription: Does one thing.\n---\nDo it.\n');
  fs.writeFileSync(path.join(repo, 'workflows', 'agents', 'mute.md'), '---\nmodel: opus\n---\nDo it.\n');
  const { out } = await printedBy(t, 'agents', '--repo', repo);
  assert.match(out, /^ {3}plain {2}plain — Does one thing\.$/m);
  assert.match(out, /^ {3}says nothing it can do — agents\/mute\.md has no `description:`/m);
});

test('nemia agents card prints the card alone on stdout, and what it is not on stderr', async (t) => {
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
  assert.match(err, /^scribe \(repo\) — /m, 'the note names the agent and its place');
  assert.ok(err.includes('a card, not an address'), err);
  assert.ok(err.includes('over A2A'), err);
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
  await refused(/^no agent named ghost\. Looked in .*nemia agents lists them\.$/s, 'agents', 'card', 'ghost', '--repo', repo);
  await refused(
    /^nemia agents --from takes repo or yours, not elsewhere:/,
    'agents',
    'card',
    'twin',
    '--repo',
    repo,
    '--from',
    'elsewhere',
  );

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
    (err: Error & { exitCode?: number; _tag?: string }) => {
      assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2]);
      assert.ok(err.message.includes(path.join('read-a-thing', 'SKILL.md has no `description:`')), err.message);
      assert.ok(err.message.includes('`description: <what it does, one line>`'), 'and names the line to write');
      return true;
    },
  );
  fs.writeFileSync(
    path.join(repo, 'workflows', 'agents', 'scribe.md'),
    '---\ndescription: Writes it down.\nskills: gone-away\ntools: Read, Skill\n---\nDo it.\n',
  );
  await assert.rejects(
    () => printedBy(t, 'agents', 'card', 'scribe', '--repo', repo),
    (err: Error & { exitCode?: number; _tag?: string }) => {
      assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2]);
      assert.ok(err.message.includes('gives the skill `gone-away`'), 'yours has its own read-a-thing: the lost one is another');
      assert.ok(err.message.includes('no skills folder has it — looked in '), err.message);
      assert.ok(err.message.includes('write skills/gone-away/SKILL.md'), 'and names the file to write');
      return true;
    },
  );
});

const CUSTOM = path.join(ROOT, 'custom-instructions');

/** What `nemia agents custom` refused, run in-process: its message, with its exit code checked. */
const customRefused = async (t: Mock, ...argv: string[]): Promise<string> => {
  let said = '';
  await assert.rejects(
    () => printedBy(t, 'agents', 'custom', ...argv),
    (err: Error & { exitCode?: number }) => {
      assert.equal(err.exitCode, 2, err.message);
      said = err.message;
      return true;
    },
  );
  return said;
};

test('nemia agents custom writes your words for an agent into your store, prints them bare, lists them, and removes them with --clear', async (t) => {
  const repo = repoAt('custom');
  anAgent(path.join(repo, 'workflows', 'agents'), 'scribe', 'Writes it down.');
  const words = path.join(repo, 'words.md');
  fs.writeFileSync(words, 'Write it down in French.\n');
  const file = path.join(CUSTOM, 'scribe.md');

  assert.match((await printedBy(t, 'agents', 'custom', 'scribe', '--repo', repo)).out, /^scribe has no custom instructions\. Set them/);
  const written = (await printedBy(t, 'agents', 'custom', 'scribe', '--file', words, '--repo', repo)).out;
  assert.ok(written.includes(file) && written.includes('a run already started keeps the words it was started with'), written);
  assert.equal(fs.readFileSync(file, 'utf8'), 'Write it down in French.\n');
  assert.equal((await printedBy(t, 'agents', 'custom', 'scribe', '--repo', repo)).out, `${file}\n\nWrite it down in French.`);
  assert.ok((await printedBy(t, 'agents', '--repo', repo)).out.includes(`   custom instructions: ${file}`));

  assert.match((await printedBy(t, 'agents', 'custom', 'scribe', '--clear', '--repo', repo)).out, /^scribe: custom instructions removed/);
  assert.equal(fs.existsSync(file), false);
  assert.match(
    (await printedBy(t, 'agents', 'custom', 'scribe', '--clear', '--repo', repo)).out,
    /^scribe has no custom instructions to remove$/,
  );
  assert.equal((await printedBy(t, 'agents', '--repo', repo)).out.includes('custom instructions:'), false);
});

test("nemia agents custom nemia is accepted and says her open session is told at the keeper's next beat, never that she keeps old words", async (t) => {
  const repo = repoAt('custom-nemia');
  const words = path.join(repo, 'words.md');
  fs.writeFileSync(words, 'Answer in French.\n');
  const file = path.join(CUSTOM, 'nemia.md');
  try {
    const written = (await printedBy(t, 'agents', 'custom', 'nemia', '--file', words, '--repo', repo)).out;
    assert.ok(written.includes(file) && written.includes("her open session is told at the keeper's next beat"), written);
    assert.equal(written.includes('keeps the words it was started with'), false, written);
    assert.equal(fs.readFileSync(file, 'utf8'), 'Answer in French.\n');
    const cleared = (await printedBy(t, 'agents', 'custom', 'nemia', '--clear', '--repo', repo)).out;
    assert.match(cleared, /^nemia: custom instructions removed, .* — her open session is told at the keeper's next beat$/);
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('nemia agents custom replaces a link at the file with the words, and never writes through it', async (t) => {
  const repo = repoAt('custom-link');
  anAgent(path.join(repo, 'workflows', 'agents'), 'scribe', 'Writes it down.');
  const outside = path.join(repo, 'outside.md');
  fs.writeFileSync(outside, 'Not yours to change.\n');
  const words = path.join(repo, 'words.md');
  fs.writeFileSync(words, 'Write it down in French.\n');
  const file = path.join(CUSTOM, 'scribe.md');
  fs.mkdirSync(CUSTOM, { recursive: true });
  fs.symlinkSync(outside, file);
  try {
    await printedBy(t, 'agents', 'custom', 'scribe', '--file', words, '--repo', repo);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'Not yours to change.\n');
    assert.equal(fs.lstatSync(file).isSymbolicLink(), false);
    assert.equal(fs.readFileSync(file, 'utf8'), 'Write it down in French.\n');
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("nemia agents custom takes an agent of the repository's .claude/agents, and reads the words from stdin with --file -", () => {
  const repo = repoAt('claude');
  fs.mkdirSync(path.join(repo, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude', 'agents', 'helper.md'), '---\ndescription: Helps.\n---\nHelp.\n');
  const wf = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');
  const ran = spawnSync(process.execPath, [wf, 'agents', 'custom', 'helper', '--file', '-', '--repo', repo], {
    input: 'Help in French.\n',
    env: { ...process.env, WF_ROOT: ROOT },
    encoding: 'utf8',
  });
  assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
  assert.equal(fs.readFileSync(path.join(CUSTOM, 'helper.md'), 'utf8'), 'Help in French.\n');
  fs.rmSync(path.join(CUSTOM, 'helper.md'));
});

test('REFUSED at shipped defaults: nemia agents custom for no agent — printed, with --file or with --clear — from no file, blank, or with a frontmatter block — writing nothing', async (t) => {
  const repo = repoAt('custom-refused');
  anAgent(path.join(repo, 'workflows', 'agents'), 'scribe', 'Writes it down.');
  const text = (name: string, words: string): string => {
    const at = path.join(repo, name);
    fs.writeFileSync(at, words);
    return at;
  };
  const ghost = await customRefused(t, 'ghost', '--file', text('ghost.md', 'Boo.\n'), '--repo', repo);
  assert.ok(
    ghost.startsWith(`no agent named ghost where a run on ${repo} looks for one`) &&
      ghost.includes('The agents there: scribe.') &&
      ghost.includes('the repository it is in'),
    ghost,
  );
  assert.equal(await customRefused(t, 'ghost', '--repo', repo), ghost, 'printing the words of no agent is refused in the same words');
  assert.equal(await customRefused(t, 'ghost', '--clear', '--repo', repo), ghost, 'and so is clearing them');
  assert.match(
    await customRefused(t, 'scribe', '--file', text('both.md', 'Both.\n'), '--clear', '--repo', repo),
    /^nemia agents custom takes --file or --clear, not both/,
  );
  assert.match(
    await customRefused(t, 'scribe', '--file', path.join(repo, 'nowhere.md'), '--repo', repo),
    /^nemia agents custom cannot read .*nowhere\.md/,
  );
  assert.match(
    await customRefused(t, 'scribe', '--file', text('blank.md', ' \n\n'), '--repo', repo),
    /^the custom instructions for scribe are blank/,
  );
  const keyed = await customRefused(t, 'scribe', '--file', text('keyed.md', '---\ntools: Bash\n---\nUse Bash.\n'), '--repo', repo);
  assert.ok(keyed.includes('opens with a frontmatter block') && keyed.includes('Custom instructions only add words'), keyed);
  assert.ok(keyed.includes("Put a key in the agent's own file or on a step"), keyed);
  assert.equal(fs.existsSync(path.join(CUSTOM, 'scribe.md')), false);
  assert.equal(fs.existsSync(path.join(CUSTOM, 'ghost.md')), false);
});

test('nemia agents and nemia agents card take --repo joined as they take it apart', async (t) => {
  const repo = repoAt('joined');
  anAgent(path.join(repo, 'workflows', 'agents'), 'scribe', 'Writes it down.');
  assert.deepEqual(await printedBy(t, 'agents', `--repo=${repo}`), await printedBy(t, 'agents', '--repo', repo));
  assert.deepEqual(
    await printedBy(t, 'agents', 'card', 'scribe', `--repo=${repo}`),
    await printedBy(t, 'agents', 'card', 'scribe', '--repo', repo),
  );
});

test('nemia agents card and nemia agents custom with no name print the help', async (t) => {
  const help = (await printedBy(t)).out;
  for (const argv of [
    ['agents', 'card'],
    ['agents', 'custom'],
  ])
    assert.deepEqual(await printedBy(t, ...argv), { out: help, err: '' }, `nemia ${argv.join(' ')}`);
});

test('REFUSED at shipped defaults: nemia agents given a word that is none of its commands or flags, in its own words', async (t) => {
  const refusals: Array<[string[], string]> = [
    [
      ['agents', 'nope'],
      'nemia agents takes no argument but card <name>, custom <name>, sources, copy <file>, or write, remove and try on yours: nemia agents, nemia agents card nope, or nemia agents custom nope.',
    ],
    [['agents', '--nope'], 'nemia agents does not take --nope. It takes --repo <r>, and for a card --from repo|yours.'],
  ];
  for (const [argv, message] of refusals)
    await assert.rejects(
      () => printedBy(t, ...argv),
      (err: Error & { exitCode?: number }) => err.message === message && err.exitCode === 2,
      `nemia ${argv.join(' ')}`,
    );
});

test('REFUSED at shipped defaults: nemia agents with a flag left out, given twice, or one it does not take — in its own words', async (t) => {
  const refused = async (message: string, ...argv: string[]) => {
    await assert.rejects(
      () => printedBy(t, ...argv),
      (err: Error & { exitCode?: number }) => {
        assert.equal(err.message, message);
        assert.equal(err.exitCode, 2);
        return true;
      },
    );
  };
  const repoTakes = '--repo takes the repository whose workflows/agents to read: nemia agents --repo <r>';
  const fromTakes = '--from takes which place the agent is in: nemia agents card <name> --from repo|yours';
  await refused(repoTakes, 'agents', '--repo');
  await refused(repoTakes, 'agents', '--repo', '--from', 'repo');
  await refused(repoTakes, 'agents', '--repo', '--elsewhere');
  await refused(repoTakes, 'agents', '--repo=');
  await refused(fromTakes, 'agents', 'card', 'scribe', '--from');
  await refused(fromTakes, 'agents', 'card', 'scribe', '--from', '--repo', '.');
  await refused('nemia agents takes --repo once: an agent is read from one repository.', 'agents', '--repo', 'a', '--repo', 'b');
  await refused(
    'nemia agents takes --from once: an agent is read from one place.',
    'agents',
    'card',
    'x',
    '--from',
    'repo',
    '--from',
    'yours',
  );
  await refused(
    'nemia agents does not take --nope. It takes --repo <r>, and for a card --from repo|yours.',
    'agents',
    '--repo',
    '.',
    '--nope',
  );
  await refused(
    'nemia agents takes no argument but card <name>, custom <name>, sources, copy <file>, or write, remove and try on yours: nemia agents, nemia agents card extra, or nemia agents custom extra.',
    'agents',
    'card',
    'scribe',
    'extra',
  );
});
