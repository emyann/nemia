/**
 * `nemia agents` at the terminal, told as a person's story: the two places a `nemia` reads agents from, listed with what each can do,
 * one agent's card printed in A2A's shape — JSON alone on stdout, since a person pipes it, and what it is *not* on stderr — and the
 * person's custom instructions for an agent written, printed, listed and cleared. And a table: each refusal at shipped defaults, by its
 * exit code and what it names. `WF_ROOT` is set before the import, since the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scratch } from './scratch.ts';
import { names } from './assessed.ts';
import { story } from './story.ts';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from './placed.ts';
import { heldUnasked } from './unasked.ts';

const ROOT = scratch('wf-agents-cli-');
process.env.WF_ROOT = ROOT;
const { main } = await import('../src/cli/main.ts');
const { clearCustomInstructions, writeCustomInstructions } = await import('../src/custom/custom.store.ts');
const { Invalid } = await import('../src/refusal/refusal.ts');

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

/** `nemia <argv>` refused with exit 2 (and as `tag`, where given), its words naming each of `facts`; the words. */
const refusedBy = async (t: Mock, argv: string[], tag: string | undefined, ...facts: string[]): Promise<string> => {
  let said = '';
  await assert.rejects(
    () => printedBy(t, ...argv),
    (err: Error & { exitCode?: number; _tag?: string }) => {
      assert.equal(err.exitCode, 2, err.message);
      if (tag !== undefined) assert.equal(err._tag, tag, err.message);
      names(err.message, ...facts);
      said = err.message;
      return true;
    },
  );
  return said;
};

const SKILL =
  '---\nname: read-a-thing\ntitle: Read a thing\ndescription: Reads it.\ntags: ["note"]\nexamples: ["Use this when something must be read."]\n---\nRead it.\n';

/** An agent in a `<workflows>/agents`, composed from one skill in the `<workflows>/skills` beside it. */
const anAgent = (at: string, name: string, description: string, skill = SKILL, extra = '') => {
  fs.mkdirSync(at, { recursive: true });
  fs.writeFileSync(
    path.join(at, `${name}.md`),
    `---\ndescription: ${description}\nskills: read-a-thing\ntools: Read, Skill\n${extra}---\nDo the thing.\n`,
  );
  fs.mkdirSync(path.join(at, '..', 'skills', 'read-a-thing'), { recursive: true });
  fs.writeFileSync(path.join(at, '..', 'skills', 'read-a-thing', 'SKILL.md'), skill);
};

const YOURS = path.join(ROOT, 'workflows', 'agents');
const CUSTOM = path.join(ROOT, 'custom-instructions');
const repoAt = (name: string) => {
  const repo = fs.mkdtempSync(path.join(ROOT, `${name}-`));
  fs.mkdirSync(path.join(repo, 'workflows', 'agents'), { recursive: true });
  return repo;
};

test("nemia agents at the terminal: both places listed with what each agent can do, one card alone on stdout, and the person's custom words written, printed, listed and cleared", async (t) => {
  const s = story(t);
  const repo = repoAt('repo');
  const theirs = path.join(repo, 'workflows', 'agents');
  anAgent(theirs, 'scribe', 'Writes it down.');
  const file = path.join(CUSTOM, 'scribe.md');
  const words = path.join(repo, 'words.md');
  fs.writeFileSync(words, 'Write it down in French.\n');

  await s.test(
    'nemia agents lists both places, the repository first, each agent by what it is for and what it says it can do',
    async (sub) => {
      anAgent(YOURS, 'archivist', 'Files it away.');
      const { out } = await printedBy(sub, 'agents', '--repo', repo);
      assert.match(out, /^scribe {2}repo {2}Writes it down\.$/m);
      assert.match(out, /^ {3}read-a-thing {2}Read a thing — Reads it\.$/m);
      assert.match(out, /^archivist {2}yours {2}Files it away\.$/m);
      assert.ok(out.indexOf('scribe') < out.indexOf('archivist'), `the repository's place comes first, as it does on the board:\n${out}`);
      assert.match(out, /one in A2A's shape: nemia agents card <name>/);
      fs.rmSync(path.join(YOURS, 'archivist.md'));
    },
  );

  await s.test(
    'an agent with no skills is listed by the one thing its description says; one with no card says why; the servers an agent loads, and none for one naming none',
    async (sub) => {
      fs.writeFileSync(path.join(theirs, 'plain.md'), '---\ndescription: Does one thing.\n---\nDo it.\n');
      fs.writeFileSync(path.join(theirs, 'mute.md'), '---\nmodel: opus\n---\nDo it.\n');
      anAgent(theirs, 'scout', 'Looks.', SKILL, 'mcp: playwright, docs\n');
      const { out } = await printedBy(sub, 'agents', '--repo', repo);
      assert.match(out, /^ {3}plain {2}plain — Does one thing\.$/m);
      assert.match(out, /^ {3}says nothing it can do — agents\/mute\.md has no `description:`/m);
      assert.deepEqual(
        out.split('\n').filter((l) => /MCP/.test(l)),
        ['   loads the MCP servers playwright, docs'],
      );
      for (const agent of ['plain', 'mute', 'scout']) fs.rmSync(path.join(theirs, `${agent}.md`));
    },
  );

  await s.test('nemia agents card prints the card alone on stdout, and what it is not on stderr', async (sub) => {
    const { out, err } = await printedBy(sub, 'agents', 'card', 'scribe', '--repo', repo);
    const card = JSON.parse(out) as { name: string; skills: Array<{ id: string }>; capabilities: Record<string, boolean>; version: string };
    assert.equal(card.name, 'scribe');
    assert.deepEqual(
      card.skills.map((s) => s.id),
      ['read-a-thing'],
    );
    assert.deepEqual(card.capabilities, { streaming: false, pushNotifications: false, extendedAgentCard: false });
    assert.match(card.version, /^[0-9a-f]{16}$/);
    assert.equal(out.includes('not an address'), false, "not a field of the card: a word to the person, not data taken for the protocol's");
    assert.match(err, /^scribe \(repo\) — /m, 'the note names the agent and its place');
    names(err, 'a card, not an address', 'over A2A');
  });

  await s.test(
    'nemia agents and nemia agents card take --repo joined as they take it apart; card and custom with no name print the help',
    async (sub) => {
      assert.deepEqual(await printedBy(sub, 'agents', `--repo=${repo}`), await printedBy(sub, 'agents', '--repo', repo));
      assert.deepEqual(
        await printedBy(sub, 'agents', 'card', 'scribe', `--repo=${repo}`),
        await printedBy(sub, 'agents', 'card', 'scribe', '--repo', repo),
      );
      const help = (await printedBy(sub)).out;
      for (const argv of [
        ['agents', 'card'],
        ['agents', 'custom'],
      ])
        assert.deepEqual(await printedBy(sub, ...argv), { out: help, err: '' }, `nemia ${argv.join(' ')}`);
    },
  );

  await s.test(
    'nemia agents custom writes your words for an agent into your store, prints them bare, lists them, and removes them with --clear',
    async (sub) => {
      assert.match(
        (await printedBy(sub, 'agents', 'custom', 'scribe', '--repo', repo)).out,
        /^scribe has no custom instructions\. Set them/,
      );
      const written = (await printedBy(sub, 'agents', 'custom', 'scribe', '--file', words, '--repo', repo)).out;
      names(written, file, 'a run already started keeps the words it was started with');
      assert.equal(fs.readFileSync(file, 'utf8'), 'Write it down in French.\n');
      assert.equal((await printedBy(sub, 'agents', 'custom', 'scribe', '--repo', repo)).out, `${file}\n\nWrite it down in French.`);
      assert.ok((await printedBy(sub, 'agents', '--repo', repo)).out.includes(`   custom instructions: ${file}`));
      assert.match(
        (await printedBy(sub, 'agents', 'custom', 'scribe', '--clear', '--repo', repo)).out,
        /^scribe: custom instructions removed/,
      );
      assert.equal(fs.existsSync(file), false);
      assert.match(
        (await printedBy(sub, 'agents', 'custom', 'scribe', '--clear', '--repo', repo)).out,
        /^scribe has no custom instructions to remove$/,
      );
      assert.equal((await printedBy(sub, 'agents', '--repo', repo)).out.includes('custom instructions:'), false);
    },
  );

  await s.test('a link at the file is replaced with the words, never written through', async (sub) => {
    const outside = path.join(repo, 'outside.md');
    fs.writeFileSync(outside, 'Not yours to change.\n');
    fs.mkdirSync(CUSTOM, { recursive: true });
    fs.symlinkSync(outside, file);
    await printedBy(sub, 'agents', 'custom', 'scribe', '--file', words, '--repo', repo);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'Not yours to change.\n');
    assert.equal(fs.lstatSync(file).isSymbolicLink(), false);
    assert.equal(fs.readFileSync(file, 'utf8'), 'Write it down in French.\n');
    fs.rmSync(file);
  });

  await s.test(
    'REFUSED: words written over a directory at the file, naming it and the clear, the directory left as it was; once cleared, written',
    () => {
      fs.mkdirSync(file, { recursive: true });
      fs.writeFileSync(path.join(file, 'keep.txt'), 'kept\n');
      assert.throws(
        () => writeCustomInstructions(ROOT, 'scribe', 'Write in French.', repo),
        (err: Error) => {
          assert.ok(err instanceof Invalid, err.message);
          names(err.message, `${file} is not a file`, 'nemia agents custom scribe --clear');
          return true;
        },
      );
      assert.ok(fs.statSync(file).isDirectory());
      assert.equal(fs.readFileSync(path.join(file, 'keep.txt'), 'utf8'), 'kept\n');
      assert.equal(clearCustomInstructions(ROOT, 'scribe', repo), true);
      assert.equal(writeCustomInstructions(ROOT, 'scribe', 'Write in French.', repo), file);
      assert.equal(fs.readFileSync(file, 'utf8'), 'Write in French.\n');
      fs.rmSync(file);
    },
  );

  await s.test("an agent of the repository's .claude/agents is given words read from stdin with --file -", () => {
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

  await s.test(
    "nemia agents custom nemia is accepted, and says her open session is told at the keeper's next beat, never that she keeps old words",
    async (sub) => {
      const nemia = path.join(CUSTOM, 'nemia.md');
      fs.writeFileSync(words, 'Answer in French.\n');
      const written = (await printedBy(sub, 'agents', 'custom', 'nemia', '--file', words, '--repo', repo)).out;
      names(written, nemia, "her open session is told at the keeper's next beat");
      assert.equal(written.includes('keeps the words it was started with'), false, written);
      assert.equal(fs.readFileSync(nemia, 'utf8'), 'Answer in French.\n');
      const cleared = (await printedBy(sub, 'agents', 'custom', 'nemia', '--clear', '--repo', repo)).out;
      assert.match(cleared, /^nemia: custom instructions removed, .* — her open session is told at the keeper's next beat$/);
      assert.equal(fs.existsSync(nemia), false);
    },
  );
});

test('REFUSED at shipped defaults: nemia agents, its card and its custom words, each by its exit code and what it names, writing nothing', async (t) => {
  const repo = repoAt('refused');
  const theirs = path.join(repo, 'workflows', 'agents');
  anAgent(theirs, 'twin', 'The repository’s.');
  anAgent(theirs, 'scribe', 'Writes it down.');
  const text = (name: string, words: string): string => {
    const at = path.join(repo, name);
    fs.writeFileSync(at, words);
    return at;
  };
  const row = (name: string, argv: string[], tag: string | undefined, ...facts: string[]) =>
    t.test(name, async (sub) => void (await refusedBy(sub, argv, tag, ...facts)));

  await row(
    'a card for an agent in neither place',
    ['agents', 'card', 'ghost', '--repo', repo],
    undefined,
    'no agent named ghost',
    'Looked in',
    'nemia agents lists them',
  );
  await row(
    'a --from that is neither place',
    ['agents', 'card', 'twin', '--repo', repo, '--from', 'elsewhere'],
    undefined,
    'nemia agents --from takes repo or yours, not elsewhere',
  );
  await t.test('a card for an agent in both places with nothing saying which; said which, each place answers for its own', async (sub) => {
    anAgent(YOURS, 'twin', 'Yours.');
    await refusedBy(
      sub,
      ['agents', 'card', 'twin', '--repo', repo],
      undefined,
      'twin is an agent in both places',
      'Say which: --from repo or --from yours',
    );
    const mine = JSON.parse((await printedBy(sub, 'agents', 'card', 'twin', '--repo', repo, '--from', 'yours')).out) as {
      description: string;
    };
    assert.equal(mine.description, 'Yours.');
    fs.rmSync(path.join(YOURS, 'twin.md'));
  });
  await t.test('a card for an agent whose skill says no description, naming the line to write', async (sub) => {
    const broken = repoAt('broken');
    anAgent(path.join(broken, 'workflows', 'agents'), 'scribe', 'Writes it down.', '---\nname: read-a-thing\n---\nRead it.\n');
    await refusedBy(
      sub,
      ['agents', 'card', 'scribe', '--repo', broken],
      'Invalid',
      path.join('read-a-thing', 'SKILL.md has no `description:`'),
      '`description: <what it does, one line>`',
    );
  });
  await t.test('a card for an agent whose skill no place has, naming the file to write', async (sub) => {
    const lost = repoAt('lost');
    fs.writeFileSync(
      path.join(lost, 'workflows', 'agents', 'scribe.md'),
      '---\ndescription: Writes it down.\nskills: gone-away\ntools: Read, Skill\n---\nDo it.\n',
    );
    await refusedBy(
      sub,
      ['agents', 'card', 'scribe', '--repo', lost],
      'Invalid',
      'gives the skill `gone-away`',
      'no skills folder has it — looked in ',
      'write skills/gone-away/SKILL.md',
    );
  });
  await t.test('custom words for no agent — written, printed or cleared — in the same words', async (sub) => {
    const ghost = await refusedBy(
      sub,
      ['agents', 'custom', 'ghost', '--file', text('ghost.md', 'Boo.\n'), '--repo', repo],
      undefined,
      `no agent named ghost where a run on ${repo} looks for one`,
      'The agents there: scribe, twin.',
      'the repository it is in',
    );
    assert.equal(await refusedBy(sub, ['agents', 'custom', 'ghost', '--repo', repo], undefined), ghost, 'printing the words of no agent');
    assert.equal(await refusedBy(sub, ['agents', 'custom', 'ghost', '--clear', '--repo', repo], undefined), ghost, 'and clearing them');
  });
  await row(
    'custom words given --file and --clear both',
    ['agents', 'custom', 'scribe', '--file', text('both.md', 'Both.\n'), '--clear', '--repo', repo],
    undefined,
    'nemia agents custom takes --file or --clear, not both',
  );
  await row(
    'custom words from no file',
    ['agents', 'custom', 'scribe', '--file', path.join(repo, 'nowhere.md'), '--repo', repo],
    undefined,
    'nemia agents custom cannot read',
    'nowhere.md',
  );
  await row(
    'custom words that are blank',
    ['agents', 'custom', 'scribe', '--file', text('blank.md', ' \n\n'), '--repo', repo],
    undefined,
    'the custom instructions for scribe are blank',
  );
  await row(
    'custom words with a frontmatter block',
    ['agents', 'custom', 'scribe', '--file', text('keyed.md', '---\ntools: Bash\n---\nUse Bash.\n'), '--repo', repo],
    undefined,
    'opens with a frontmatter block',
    'Custom instructions only add words',
    "Put a key in the agent's own file or on a step",
  );
  await t.test('and no custom words were written by any of them', () => {
    assert.equal(fs.existsSync(path.join(CUSTOM, 'scribe.md')), false);
    assert.equal(fs.existsSync(path.join(CUSTOM, 'ghost.md')), false);
  });

  const commands = 'card <name>, custom <name>, sources, copy <file>, or write, remove and try on yours';
  const takes = 'It takes --repo <r>, and for a card --from repo|yours';
  const repoTakes = ['--repo takes the repository whose workflows/agents to read', 'nemia agents --repo <r>'];
  const fromTakes = ['--from takes which place the agent is in', 'nemia agents card <name> --from repo|yours'];
  const words: ReadonlyArray<[string, string[], ...string[]]> = [
    ['a word that is none of its commands', ['agents', 'nope'], commands, 'nemia agents card nope', 'nemia agents custom nope'],
    ['a flag it does not take', ['agents', '--nope'], 'nemia agents does not take --nope', takes],
    ['--repo left out', ['agents', '--repo'], ...repoTakes],
    ['--repo followed by another flag', ['agents', '--repo', '--from', 'repo'], ...repoTakes],
    ['--repo followed by a flag it does not take', ['agents', '--repo', '--elsewhere'], ...repoTakes],
    ['--repo= with nothing', ['agents', '--repo='], ...repoTakes],
    ['--from left out', ['agents', 'card', 'scribe', '--from'], ...fromTakes],
    ['--from followed by another flag', ['agents', 'card', 'scribe', '--from', '--repo', '.'], ...fromTakes],
    ['--repo twice', ['agents', '--repo', 'a', '--repo', 'b'], 'nemia agents takes --repo once', 'one repository'],
    ['--from twice', ['agents', 'card', 'x', '--from', 'repo', '--from', 'yours'], 'nemia agents takes --from once', 'one place'],
    ['a flag it does not take after --repo', ['agents', '--repo', '.', '--nope'], 'nemia agents does not take --nope', takes],
    ['a word after the card', ['agents', 'card', 'scribe', 'extra'], commands, 'nemia agents card extra', 'nemia agents custom extra'],
  ];
  for (const [name, argv, ...facts] of words) await row(name, argv, undefined, ...facts);
});
