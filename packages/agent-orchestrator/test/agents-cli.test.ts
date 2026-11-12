/**
 * `nemia agents`, its card and a person's custom instructions for an agent, as their handlers answer them (`AGENTS`, `AGENT_CARD`,
 * `AGENTS_CUSTOM`), told as a person's story: the two places agents are read from, each with what it can do; one agent's card and the
 * place it was found in; and custom instructions written, read, listed and cleared. The client (`apps/cli`) prints these and its test
 * (`apps/cli/test/definitions.test.ts`) holds the lines. And a table: each refusal of a handler at shipped defaults, by its exit code and
 * what it names. The test's store is its own, at `ROOT`, given as `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { AGENTS_RUN_WORDS } from 'objects';
import { names } from './assessed.ts';
import { story } from './story.ts';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from './placed.ts';
import { heldUnasked } from './unasked.ts';
import { handled, typed } from './typed.ts';
import { Effect, Layer } from 'effect';
import { anAgent as aDraft } from './agent-walks.ts';
import { clearCustomInstructions, writeCustomInstructions } from '../src/custom/custom.store.ts';
import { AGENTS_CUSTOM } from '../src/custom/custom.verb.ts';
import { Invalid } from '../src/refusal/refusal.ts';
import { agentsRead } from '../src/roster/roster.store.ts';
import type { AgentsRead, CardRead } from '../src/roster/roster.ts';
import { AgentDoor } from '../src/agents/agent-door.store.ts';
import { agentDoorMemory, MEMORY_AGENTS, MEMORY_ROOT } from '../src/agents/agent-memory.store.ts';
import { skillDoorMemory } from '../src/skills/skill-memory.store.ts';
import { AgentName } from '../src/agents/agents.model.ts';
import { TRY_BUDGET } from '../src/try/try.ts';
import { engineOf } from '../src/runtime-client.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-agents-cli-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };

const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

/** What the handler of the entry `argv` names answers, read by its words (`typed`) over this test's engine and store. */
const asked = <D>(...argv: string[]): Promise<D> => typed(argv, noEngine(), undefined, undefined, ENV) as Promise<D>;

/** What `nemia agents custom`'s handler answers to `input`, words given as the client sends them. */
const custom = (input: { name: string; repo?: string; words?: string; clear?: true }) =>
  handled(AGENTS_CUSTOM, input, { e: noEngine(), env: ENV });

/** `work` refused with exit 2 (and as `tag`, where given), its words naming each of `facts`; the words. */
const refusedBy = async (work: () => Promise<unknown>, tag: string | undefined, ...facts: string[]): Promise<string> => {
  let said = '';
  await assert.rejects(work, (err: Error & { exitCode?: number; _tag?: string }) => {
    assert.equal(err.exitCode, 2, err.message);
    if (tag !== undefined) assert.equal(err._tag, tag, err.message);
    names(err.message, ...facts);
    said = err.message;
    return true;
  });
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

test("nemia agents' handlers: both places read with what each agent can do, one card with its place, and the person's custom words written, read, listed and cleared", async (t) => {
  const s = story(t);
  const repo = repoAt('repo');
  const theirs = path.join(repo, 'workflows', 'agents');
  anAgent(theirs, 'scribe', 'Writes it down.');
  const file = path.join(CUSTOM, 'scribe.md');
  const one = (read: AgentsRead, name: string) => read.agents.find((a) => a.name === name);

  await s.test(
    'nemia agents reads both places, the repository first, each agent by what it is for and what it says it can do',
    async () => {
      anAgent(YOURS, 'archivist', 'Files it away.');
      const read = await asked<AgentsRead>('agents', '--repo', repo);
      assert.deepEqual(
        read.agents.map(({ name, from, description }) => ({ name, from, description })),
        [
          { name: 'scribe', from: 'repo', description: 'Writes it down.' },
          { name: 'archivist', from: 'yours', description: 'Files it away.' },
        ],
        "the repository's place comes first, as it does on the board",
      );
      assert.deepEqual(
        one(read, 'scribe')?.card?.map(({ id, name, description }) => ({ id, name, description })),
        [{ id: 'read-a-thing', name: 'Read a thing', description: 'Reads it.' }],
      );
      fs.rmSync(path.join(YOURS, 'archivist.md'));
    },
  );

  await s.test('nemia agents reads through the Agent door: an agent its memory holds is listed, though no disk has its file', async () => {
    const read = await Effect.runPromise(
      Effect.gen(function* () {
        const door = yield* AgentDoor;
        yield* door.agents.write(AgentName.read('courier'), aDraft('courier'), undefined, { dir: MEMORY_AGENTS });
        return yield* agentsRead({ repo, home: MEMORY_ROOT });
      }).pipe(Effect.provide(Layer.merge(agentDoorMemory(), skillDoorMemory()))),
    );
    assert.deepEqual(
      read.agents.map(({ from, name, error, description }) => ({ from, name, error, description })),
      [{ from: 'yours', name: 'courier', error: null, description: 'Use courier when a change needs its notes written.' }],
    );
    assert.equal(fs.existsSync(path.join(MEMORY_AGENTS, 'courier.md')), false, 'read from the door, not from a file');
  });

  await s.test(
    'an agent with no skills is carded by the one thing its description says; one with no card says why; the servers an agent loads, and none for one naming none',
    async () => {
      fs.writeFileSync(path.join(theirs, 'plain.md'), '---\ndescription: Does one thing.\n---\nDo it.\n');
      fs.writeFileSync(path.join(theirs, 'mute.md'), '---\nmodel: opus\n---\nDo it.\n');
      anAgent(theirs, 'scout', 'Looks.', SKILL, 'mcp: playwright, docs\n');
      const read = await asked<AgentsRead>('agents', '--repo', repo);
      assert.deepEqual(
        one(read, 'plain')?.card?.map(({ id, name, description }) => ({ id, name, description })),
        [{ id: 'plain', name: 'plain', description: 'Does one thing.' }],
      );
      names(one(read, 'mute')?.cardError ?? '', 'agents/mute.md has no `description:`');
      assert.deepEqual(
        read.agents.filter((a) => a.mcp !== null).map((a) => [a.name, a.mcp]),
        [['scout', 'playwright, docs']],
      );
      for (const agent of ['plain', 'mute', 'scout']) fs.rmSync(path.join(theirs, `${agent}.md`));
    },
  );

  await s.test("nemia agents card answers the card in A2A's shape, and the place it was found in", async () => {
    const { card, from } = await asked<CardRead>('agents', 'card', 'scribe', '--repo', repo);
    assert.equal(from, 'repo');
    assert.equal(card.name, 'scribe');
    assert.deepEqual(
      card.skills.map((s) => s.id),
      ['read-a-thing'],
    );
    assert.deepEqual(card.capabilities, { streaming: false, pushNotifications: false, extendedAgentCard: false });
    assert.match(card.version, /^[0-9a-f]{16}$/);
  });

  await s.test('nemia agents and nemia agents card take --repo joined as they take it apart', async () => {
    assert.deepEqual(await asked('agents', `--repo=${repo}`), await asked('agents', '--repo', repo));
    assert.deepEqual(await asked('agents', 'card', 'scribe', `--repo=${repo}`), await asked('agents', 'card', 'scribe', '--repo', repo));
  });

  await s.test(
    'nemia agents custom writes your words for an agent into your store, reads them bare, lists them, and removes them with --clear',
    async () => {
      assert.deepEqual(await asked('agents', 'custom', 'scribe', '--repo', repo), { name: 'scribe', file, words: null, error: null });
      const written = await custom({ name: 'scribe', repo, words: 'Write it down in French.\n' });
      assert.deepEqual(written, { name: 'scribe', file, words: 'Write it down in French.', error: null });
      assert.equal(fs.readFileSync(file, 'utf8'), 'Write it down in French.\n');
      assert.deepEqual(await asked('agents', 'custom', 'scribe', '--repo', repo), written);
      assert.equal(one(await asked<AgentsRead>('agents', '--repo', repo), 'scribe')?.custom, file);
      assert.deepEqual(await asked('agents', 'custom', 'scribe', '--clear', '--repo', repo), { name: 'scribe', file, removed: true });
      assert.equal(fs.existsSync(file), false);
      assert.deepEqual(await asked('agents', 'custom', 'scribe', '--clear', '--repo', repo), { name: 'scribe', file, removed: false });
      assert.equal(one(await asked<AgentsRead>('agents', '--repo', repo), 'scribe')?.custom, null);
    },
  );

  await s.test('a link at the file is replaced with the words, never written through', async () => {
    const outside = path.join(repo, 'outside.md');
    fs.writeFileSync(outside, 'Not yours to change.\n');
    fs.mkdirSync(CUSTOM, { recursive: true });
    fs.symlinkSync(outside, file);
    await custom({ name: 'scribe', repo, words: 'Write it down in French.\n' });
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

  await s.test("an agent of the repository's .claude/agents is given words", async () => {
    fs.mkdirSync(path.join(repo, '.claude', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.claude', 'agents', 'helper.md'), '---\ndescription: Helps.\n---\nHelp.\n');
    await custom({ name: 'helper', repo, words: 'Help in French.\n' });
    assert.equal(fs.readFileSync(path.join(CUSTOM, 'helper.md'), 'utf8'), 'Help in French.\n');
    fs.rmSync(path.join(CUSTOM, 'helper.md'));
  });

  await s.test('nemia agents custom nemia is accepted, though no place names her: her words written and cleared', async () => {
    const nemia = path.join(CUSTOM, 'nemia.md');
    assert.equal((await custom({ name: 'nemia', repo, words: 'Answer in French.\n' })).file, nemia);
    assert.equal(fs.readFileSync(nemia, 'utf8'), 'Answer in French.\n');
    assert.deepEqual(await custom({ name: 'nemia', repo, clear: true }), { name: 'nemia', file: nemia, removed: true });
    assert.equal(fs.existsSync(nemia), false);
  });

  await s.test('the words of nemia agents run say the dollars a try is capped at, the budget a try is started with', () => {
    assert.ok(
      AGENTS_RUN_WORDS.help.some((line) => line.includes(`$${TRY_BUDGET}`)),
      AGENTS_RUN_WORDS.help.join(' '),
    );
  });
});

test('REFUSED at shipped defaults: nemia agents, its card and its custom words, each by its exit code and what it names, writing nothing', async (t) => {
  const repo = repoAt('refused');
  const theirs = path.join(repo, 'workflows', 'agents');
  anAgent(theirs, 'twin', 'The repository’s.');
  anAgent(theirs, 'scribe', 'Writes it down.');
  const row = (name: string, argv: string[], tag: string | undefined, ...facts: string[]) =>
    t.test(name, async () => void (await refusedBy(() => asked(...argv), tag, ...facts)));

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
  await t.test('a card for an agent in both places with nothing saying which; said which, each place answers for its own', async () => {
    anAgent(YOURS, 'twin', 'Yours.');
    await refusedBy(
      () => asked('agents', 'card', 'twin', '--repo', repo),
      undefined,
      'twin is an agent in both places',
      'Say which: --from repo or --from yours',
    );
    const mine = await asked<CardRead>('agents', 'card', 'twin', '--repo', repo, '--from', 'yours');
    assert.equal(mine.card.description, 'Yours.');
    fs.rmSync(path.join(YOURS, 'twin.md'));
  });
  await t.test('a card for an agent whose skill says no description, naming the line to write', async () => {
    const broken = repoAt('broken');
    anAgent(path.join(broken, 'workflows', 'agents'), 'scribe', 'Writes it down.', '---\nname: read-a-thing\n---\nRead it.\n');
    await refusedBy(
      () => asked('agents', 'card', 'scribe', '--repo', broken),
      'Invalid',
      path.join('read-a-thing', 'SKILL.md has no `description:`'),
      '`description: <what it does, one line>`',
    );
  });
  await t.test('a card for an agent whose skill no place has, naming the file to write', async () => {
    const lost = repoAt('lost');
    fs.writeFileSync(
      path.join(lost, 'workflows', 'agents', 'scribe.md'),
      '---\ndescription: Writes it down.\nskills: gone-away\ntools: Read, Skill\n---\nDo it.\n',
    );
    await refusedBy(
      () => asked('agents', 'card', 'scribe', '--repo', lost),
      'Invalid',
      'gives the skill `gone-away`',
      'no skills folder has it — looked in ',
      'write skills/gone-away/SKILL.md',
    );
  });
  await t.test('custom words for no agent — written, read or cleared — in the same words', async () => {
    const ghost = await refusedBy(
      () => custom({ name: 'ghost', repo, words: 'Boo.\n' }),
      undefined,
      `no agent named ghost where a run on ${repo} looks for one`,
      'The agents there: scribe, twin.',
      'the repository it is in',
    );
    assert.equal(
      await refusedBy(() => asked('agents', 'custom', 'ghost', '--repo', repo), undefined),
      ghost,
      'reading the words of no agent',
    );
    assert.equal(await refusedBy(() => custom({ name: 'ghost', repo, clear: true }), undefined), ghost, 'and clearing them');
  });
  await row(
    'custom words given --file and --clear both',
    ['agents', 'custom', 'scribe', '--file', path.join(repo, 'both.md'), '--clear', '--repo', repo],
    undefined,
    'nemia agents custom takes --file or --clear, not both',
  );
  await t.test('custom words that are blank', async () => {
    await refusedBy(() => custom({ name: 'scribe', repo, words: ' \n\n' }), undefined, 'the custom instructions for scribe are blank');
  });
  await t.test('custom words with a frontmatter block', async () => {
    await refusedBy(
      () => custom({ name: 'scribe', repo, words: '---\ntools: Bash\n---\nUse Bash.\n' }),
      undefined,
      'opens with a frontmatter block',
      'Custom instructions only add words',
      "Put a key in the agent's own file or on a step",
    );
  });
  await t.test('and no custom words were written by any of them', () => {
    assert.equal(fs.existsSync(path.join(CUSTOM, 'scribe.md')), false);
    assert.equal(fs.existsSync(path.join(CUSTOM, 'ghost.md')), false);
  });
});
