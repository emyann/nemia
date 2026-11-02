/**
 * An agent written from a draft, renamed and removed at its version (`writeAgent`, `removeAgent`, and the board's entries `AGENTS_WRITE`,
 * `AGENTS_READ`, `AGENTS_REMOVE` that serve them), told as a person's story on the stage (`story.ts`): what the board's Agents page
 * saves, its result schema travelling with it. And a table: each write or removal the store refuses, by its kind and what it names, the
 * store left as it was. The render alone, `renderAgent`, is a table of `src/agents/agents.test.ts`.
 *
 * `WF_ROOT` is set before the modules are imported, since they read it as they load. With `repo`, a version read one way and checked
 * the other is refused as stale though nothing changed, and an edit of the SKILL.md between the read and the write is a change.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseAgent, renderAgent, type Agent, type AgentDraft } from '../src/workflow.ts';
import { agentUsers, loadWorkflows } from '../src/folder/folder.store.ts';
import { agentVersion, loadAgents } from '../src/agents/read.store.ts';
import { scratch } from './scratch.ts';
import { TEAM } from './team.ts';
import { names } from './assessed.ts';
import { staged, story } from './story.ts';

const ROOT = scratch('wf-agent-');
process.env.WF_ROOT = ROOT;
const { addFactory, agentSkillsFound, isRefusal, runWith: runEngine } = await import('../src/runner.ts');
const { removeAgent, writeAgent } = await import('../src/agents/agents.store.ts');
const { AGENTS_READ, AGENTS_REMOVE, AGENTS_WRITE } = await import('../src/agents/library.verb.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
type Refusal = import('../src/refusal/refusal.ts').Refusal;
const stage = staged({ runWith: runEngine, main, engineOf });

const STORE = path.join(ROOT, 'workflows');
const AGENTS = path.join(STORE, 'agents');

/** A store whose agents are the tests' team's, with `dev` beside them: its steps name them. */
function fresh(): void {
  fs.rmSync(STORE, { recursive: true, force: true });
  fs.cpSync(path.join(TEAM, 'agents'), AGENTS, { recursive: true });
  fs.cpSync(path.join(TEAM, 'skills'), path.join(STORE, 'skills'), { recursive: true });
  fs.cpSync(path.join(TEAM, 'dev'), path.join(STORE, 'dev'), { recursive: true });
}

function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() || e.isSymbolicLink())
      .map((e) => {
        const at = path.join(e.parentPath, e.name);
        return [path.relative(dir, at), e.isSymbolicLink() ? `-> ${fs.readlinkSync(at)}` : fs.readFileSync(at, 'utf8')];
      }),
  );
}

/** `fn` refused as the kind `tag`, exit 2, naming each of `facts`, and the store as it was. */
function refused(fn: () => unknown, tag: Refusal['_tag'], ...facts: string[]): Refusal {
  const before = snapshot(STORE);
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(isRefusal(caught), `expected a refusal naming ${facts.join(', ')}, got ${caught === undefined ? 'none' : String(caught)}`);
  assert.deepEqual([caught._tag, caught.exitCode], [tag, 2], caught.message);
  names(caught.message, ...facts);
  assert.deepEqual(snapshot(STORE), before, 'a refused write leaves the store as it was');
  return caught;
}

/** An agent's draft: `skills:` is the agent's own line, carried as the file writes it; what the agent can do is generated from it. */
const draftOf = (agent: Agent): AgentDraft => ({
  name: agent.name,
  role: agent.role,
  description: agent.description,
  skills: agent.skills?.join(', '),
  mcp: agent.mcp?.join(', '),
  keys: agent.keys,
  body: agent.body,
});
const plain = (agent: Agent) => ({
  name: agent.name,
  role: agent.role,
  description: agent.description,
  skills: agent.skills,
  ...(agent.mcp && { mcp: agent.mcp }),
  keys: agent.keys,
  body: agent.body,
});
const scribe: AgentDraft = {
  name: 'scribe',
  description: 'Use this when a change needs its notes written.',
  keys: { model: 'sonnet', effort: 'low', tools: 'Read, Write' },
  body: 'Write the notes.',
};
const FIELDS = JSON.stringify(
  { type: 'object', properties: { notes: { type: 'string' } }, required: ['notes'], additionalProperties: false },
  null,
  2,
);
const withOutput = { ...scribe, keys: { ...scribe.keys, output: 'scribe.schema.json' } };
const SCHEMA = { file: 'scribe.schema.json', text: FIELDS };

/** The form of an agent named `name`, as the board sends it. */
const form = (name: string, effort = 'low') =>
  JSON.stringify({ name, description: 'Use this when a change needs its notes written.', keys: { effort }, body: 'Write the notes.' });

test("write, rename and remove an agent at its version, as the board's Agents page saves it, its result schema travelling with it", async (t) => {
  const s = story(t);
  fresh();

  await s.test("every agent of the tests' team renders to a file that reads back as the same agent, and renders the same twice", () => {
    const agents = loadAgents(path.join(TEAM, 'agents'));
    assert.ok(agents.size >= 3);
    for (const [name, agent] of agents) {
      assert.ok(!(agent instanceof Error), `${name} reads`);
      const text = renderAgent(draftOf(agent));
      assert.deepEqual(plain(parseAgent(name, text, agent.read)), plain(agent), name);
      assert.equal(renderAgent(draftOf(parseAgent(name, text, agent.read))), text, `${name} renders the same twice`);
    }
  });

  await s.test('a new agent is written, reads back, and changes no workflow beside it, which still loads', () => {
    const dev = snapshot(path.join(STORE, 'dev'));
    const done = writeAgent(ROOT, AGENTS, scribe, { version: null });
    assert.deepEqual(done.written, ['scribe.md']);
    assert.equal(done.version, agentVersion(AGENTS, 'scribe'));
    assert.deepEqual(plain(loadAgents(AGENTS).get('scribe') as Agent), {
      name: 'scribe',
      role: undefined,
      description: scribe.description,
      skills: undefined,
      keys: scribe.keys,
      body: scribe.body,
    });
    assert.deepEqual(snapshot(path.join(STORE, 'dev')), dev);
    assert.ok(loadWorkflows(path.join(STORE, 'dev')).length > 0);
  });

  await s.test('a rename writes the new file and removes the old', () => {
    const done = writeAgent(ROOT, AGENTS, { ...scribe, name: 'notary' }, { version: agentVersion(AGENTS, 'scribe')!, from: 'scribe' });
    assert.deepEqual([done.written, done.removed], [['notary.md'], ['scribe.md']]);
    assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false);
    assert.equal((loadAgents(AGENTS).get('notary') as Agent).body, scribe.body);
  });

  await s.test("a result schema is written with its agent, and is part of the agent's version", () => {
    fresh();
    const done = writeAgent(ROOT, AGENTS, withOutput, { version: null, schema: SCHEMA });
    assert.deepEqual(done.written, ['scribe.schema.json', 'scribe.md']);
    assert.deepEqual((loadAgents(AGENTS).get('scribe') as Agent).read('scribe.schema.json'), FIELDS);
    fs.writeFileSync(path.join(AGENTS, 'scribe.schema.json'), FIELDS + '\n');
    assert.notEqual(agentVersion(AGENTS, 'scribe'), done.version, 'a change to the schema moves the version');
  });

  await s.test('a schema another agent names too stays when one of them goes, and goes with the last', () => {
    writeAgent(ROOT, AGENTS, { ...withOutput, name: 'notary' }, { version: null });
    assert.deepEqual(removeAgent(ROOT, AGENTS, 'scribe', { version: agentVersion(AGENTS, 'scribe')! }).removed, ['scribe.md']);
    assert.deepEqual(removeAgent(ROOT, AGENTS, 'notary', { version: agentVersion(AGENTS, 'notary')! }).removed, [
      'notary.md',
      'scribe.schema.json',
    ]);
  });

  await s.test(
    "a key's line taken off, or pointed at another file, leaves the file it named: a save never deletes what a person wrote",
    () => {
      fresh();
      const made = writeAgent(ROOT, AGENTS, withOutput, { version: null, schema: SCHEMA });
      const bare = writeAgent(ROOT, AGENTS, scribe, { version: made.version });
      assert.deepEqual(bare.removed, [], 'a field cleared on the board and saved removes nothing');
      assert.equal(fs.readFileSync(path.join(AGENTS, 'scribe.schema.json'), 'utf8'), FIELDS);
      assert.equal(parseAgent('scribe', fs.readFileSync(path.join(AGENTS, 'scribe.md'), 'utf8')).keys.output, undefined);
      fresh();
      writeAgent(ROOT, AGENTS, withOutput, { version: null, schema: SCHEMA });
      const moved = writeAgent(
        ROOT,
        AGENTS,
        { ...withOutput, keys: { ...withOutput.keys, output: 'scribe.notes.json' } },
        { version: agentVersion(AGENTS, 'scribe')!, schema: { ...SCHEMA, file: 'scribe.notes.json' } },
      );
      assert.deepEqual(moved.removed, []);
      assert.ok(fs.existsSync(path.join(AGENTS, 'scribe.notes.json')), 'the new one written');
      assert.ok(fs.existsSync(path.join(AGENTS, 'scribe.schema.json')), 'the one it named before still there');
      const gone = removeAgent(ROOT, AGENTS, 'scribe', { version: agentVersion(AGENTS, 'scribe')! }).removed.sort();
      assert.deepEqual(gone, ['scribe.md', 'scribe.notes.json'], 'the one it names now goes with it');
      assert.ok(fs.existsSync(path.join(AGENTS, 'scribe.schema.json')), 'the one it no longer names is not its to take');
    },
  );

  await s.test('a write that fails leaves not behind the schema it wrote', () => {
    fresh();
    fs.mkdirSync(path.join(AGENTS, 'scribe.md'));
    assert.throws(() => writeAgent(ROOT, AGENTS, withOutput, { version: null, schema: SCHEMA }));
    assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.schema.json')), false);
    fs.rmdirSync(path.join(AGENTS, 'scribe.md'));
  });

  await s.test("with `repo`, a write's and a removal's version is read with the skills a start there finds, as the board lists it", () => {
    fresh();
    const repo = scratch('wf-agent-repo-');
    const skill = path.join(repo, '.claude', 'skills', 'pass-a-note');
    fs.mkdirSync(skill, { recursive: true });
    fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: pass-a-note\ndescription: Hands a note on.\n---\nHand it on.\n');
    const courier: AgentDraft = {
      name: 'courier',
      description: 'Carries notes.',
      skills: 'pass-a-note',
      keys: { tools: 'Read, Skill' },
      body: 'Carry it.',
    };
    const made = writeAgent(ROOT, AGENTS, courier, { version: null, repo });
    const listed = agentVersion(AGENTS, 'courier', agentSkillsFound(AGENTS, repo));
    assert.equal(made.version, listed, 'the version a write answers is the one the listing reads');
    assert.notEqual(listed, agentVersion(AGENTS, 'courier'), 'the skill is found only in the repository, so the two readings differ');
    refused(
      () => writeAgent(ROOT, AGENTS, courier, { version: agentVersion(AGENTS, 'courier')!, repo }),
      'Conflict',
      'agents/courier.md changed since it was read',
    );
    const saved = writeAgent(ROOT, AGENTS, { ...courier, description: 'Carries notes on.' }, { version: listed!, repo });
    fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: pass-a-note\ndescription: Hands a note along.\n---\nHand it on.\n');
    refused(
      () => removeAgent(ROOT, AGENTS, 'courier', { version: saved.version, repo }),
      'Conflict',
      'agents/courier.md changed since it was read',
    );
    const now = agentVersion(AGENTS, 'courier', agentSkillsFound(AGENTS, repo))!;
    assert.deepEqual(removeAgent(ROOT, AGENTS, 'courier', { version: now, repo }).removed, ['courier.md']);
  });

  await s.test("an agent's version counts a link as where it points, not as what it points at", () => {
    const outside = path.join(ROOT, 'outside-version.md');
    fs.writeFileSync(outside, 'one\n');
    fs.symlinkSync(outside, path.join(AGENTS, 'linked.md'));
    const was = agentVersion(AGENTS, 'linked');
    fs.writeFileSync(outside, 'two\n');
    assert.equal(agentVersion(AGENTS, 'linked'), was);
    fs.rmSync(path.join(AGENTS, 'linked.md'));
  });

  const repo = scratch('wf-library-repo-');
  const board = <A, E>(program: Parameters<typeof stage.runWith<A, E>>[1]) => stage.runWith(stage.board().e, program);
  const read = async (name: string) =>
    (await board(AGENTS_READ.handler({ from: 'yours', name, dir: AGENTS, repo }, undefined, ROOT))).agent;

  await s.test(
    "the board's entries: an agent written from its form reads back for its page, renamed from the name on its path, and removed",
    async () => {
      const made = await board(
        AGENTS_WRITE.handler({ from: 'yours', dir: AGENTS, repo, draft: form('clerk'), schema: 'null' }, undefined, ROOT),
      );
      assert.deepEqual(made.written, ['clerk.md']);
      assert.equal((await read('clerk'))?.version, made.version);
      const renamed = await board(
        AGENTS_WRITE.handler(
          { from: 'yours', name: 'clerk', dir: AGENTS, repo, draft: form('archivist'), schema: 'null', version: made.version },
          undefined,
          ROOT,
        ),
      );
      assert.deepEqual([renamed.written, renamed.removed], [['archivist.md'], ['clerk.md']]);
      assert.equal(await read('clerk'), null, 'the name it was renamed from is gone');
      const removed = await board(
        AGENTS_REMOVE.handler({ from: 'yours', name: 'archivist', dir: AGENTS, repo, version: renamed.version }, undefined, ROOT),
      );
      assert.deepEqual(removed.removed, ['archivist.md']);
      assert.equal(fs.existsSync(path.join(AGENTS, 'archivist.md')), false);
    },
  );

  await s.test(
    "REFUSED: the board's write and removal of an agent changed since it was read, naming both versions, and the agent kept",
    async () => {
      const made = await board(
        AGENTS_WRITE.handler({ from: 'yours', dir: AGENTS, repo, draft: form('archivist'), schema: 'null' }, undefined, ROOT),
      );
      const edited = await board(
        AGENTS_WRITE.handler(
          { from: 'yours', name: 'archivist', dir: AGENTS, repo, draft: form('archivist', 'high'), schema: 'null', version: made.version },
          undefined,
          ROOT,
        ),
      );
      const stale = (err: Error & { _tag?: string }, ...facts: string[]) => {
        assert.equal(err._tag, 'Conflict', err.message);
        names(err.message, 'agents/archivist.md changed since it was read', `version ${made.version}, now ${edited.version}`, ...facts);
        return true;
      };
      await assert.rejects(
        board(
          AGENTS_WRITE.handler(
            { from: 'yours', name: 'archivist', dir: AGENTS, repo, draft: form('archivist'), schema: 'null', version: made.version },
            undefined,
            ROOT,
          ),
        ),
        (err: Error) => stale(err, 'Read it again, and make the change on what it holds now'),
      );
      await assert.rejects(
        board(AGENTS_REMOVE.handler({ from: 'yours', name: 'archivist', dir: AGENTS, repo, version: made.version }, undefined, ROOT)),
        (err: Error) => stale(err, 'Read it again before removing it'),
      );
      assert.equal((await read('archivist'))?.version, edited.version);
    },
  );
});

test('REFUSED: a write or a removal the store will not make, by its kind and what it names, and the store as it was', async (t) => {
  const v = { version: null };
  const ok = <T>(name: string, fn: () => T) => t.test(name, () => (fresh(), void fn()));

  await ok("what the parser refuses, in the parser's words: a context, a schema not there, wiring, `agent:`", () => {
    refused(
      () => writeAgent(ROOT, AGENTS, { ...scribe, keys: { context: 'lots' } }, v),
      'Invalid',
      'agents/scribe.md',
      '`context: lots` is not a number of tokens',
    );
    refused(
      () => writeAgent(ROOT, AGENTS, { ...scribe, keys: { output: 'nothing.schema.json' } }, v),
      'Invalid',
      '`output: nothing.schema.json` is not there',
    );
    refused(
      () => writeAgent(ROOT, AGENTS, { ...scribe, keys: { check: 'npm test' } as AgentDraft['keys'] }, v),
      'Invalid',
      '`check` is wiring',
    );
    refused(
      () => writeAgent(ROOT, AGENTS, { ...scribe, keys: { agent: 'reviewer' } as AgentDraft['keys'] }, v),
      'Invalid',
      "`agent` is a step's key",
    );
  });
  await ok("a name that is no agent's: a file name, a path out of agents/", () => {
    refused(() => writeAgent(ROOT, AGENTS, { ...scribe, name: 'x.md' }, v), 'Invalid', "`x.md` is not an agent's name");
    refused(
      () => writeAgent(ROOT, AGENTS, { ...scribe, name: '../dev/plan' }, v),
      'Invalid',
      "is not an agent's name",
      'an agent is a file in agents/',
    );
  });
  await ok('outside the two places the board lists agents from, and outside a folder of agents; let through `anywhere`', () => {
    const elsewhere = path.join(ROOT, 'elsewhere', 'agents');
    fs.mkdirSync(elsewhere, { recursive: true });
    refused(
      () => writeAgent(ROOT, elsewhere, scribe, v),
      'Invalid',
      'elsewhere/agents',
      "is not the store's agents/",
      "nor a repository's",
    );
    assert.equal(fs.existsSync(path.join(elsewhere, 'scribe.md')), false);
    refused(() => writeAgent(ROOT, path.join(STORE, 'dev'), scribe, v), 'Invalid', 'dev is not a folder of agents');
    refused(() => removeAgent(ROOT, elsewhere, 'scribe', { version: 'x' }), 'Invalid', "is not the store's agents/");
    writeAgent(ROOT, elsewhere, scribe, { version: null, anywhere: true });
    assert.ok(fs.existsSync(path.join(elsewhere, 'scribe.md')));
    fs.rmSync(path.join(ROOT, 'elsewhere'), { recursive: true });
  });
  await ok(
    'at shipped defaults: into the workflows/ of a checkout no factory names; written once one names it, or the caller does as `repo`',
    () => {
      const checkout = scratch('wf-agent-checkout-');
      fs.mkdirSync(path.join(checkout, '.git'));
      const agents = path.join(checkout, 'workflows', 'agents');
      fs.mkdirSync(agents, { recursive: true });
      refused(() => writeAgent(ROOT, agents, scribe, v), 'Invalid', 'the store knows', 'nemia factory add <name> --repo <repo>');
      assert.equal(fs.existsSync(path.join(agents, 'scribe.md')), false, 'a .git beside it makes no repository known');
      writeAgent(ROOT, agents, scribe, { version: null, repo: checkout });
      assert.ok(fs.existsSync(path.join(agents, 'scribe.md')), 'the repository the caller names');
      fs.rmSync(path.join(agents, 'scribe.md'));
      addFactory({ name: 'agent-known', repos: [checkout] });
      writeAgent(ROOT, agents, scribe, v);
      assert.ok(fs.existsSync(path.join(agents, 'scribe.md')), "a factory's repository");
    },
  );
  await ok('through a link, a write and a removal, by name', () => {
    const outside = path.join(ROOT, 'outside.md');
    fs.writeFileSync(outside, 'mine\n');
    fs.symlinkSync(outside, path.join(AGENTS, 'scribe.md'));
    refused(() => writeAgent(ROOT, AGENTS, scribe, v), 'Invalid', 'scribe.md is a link');
    refused(() => removeAgent(ROOT, AGENTS, 'scribe', { version: 'x' }), 'Invalid', 'scribe.md is a link');
    assert.equal(fs.readFileSync(outside, 'utf8'), 'mine\n');
  });
  await ok('a result schema through a link, and what the link points at left as it was', () => {
    const outside = path.join(ROOT, 'outside.schema.json');
    fs.writeFileSync(outside, '{"mine":true}\n');
    fs.symlinkSync(outside, path.join(AGENTS, 'scribe.schema.json'));
    refused(
      () => writeAgent(ROOT, AGENTS, withOutput, { version: null, schema: { ...SCHEMA, text: '{"type":"object"}\n' } }),
      'Invalid',
      'scribe.schema.json is a link',
      "a result schema is its agent's own",
    );
    assert.equal(fs.readFileSync(outside, 'utf8'), '{"mine":true}\n');
    assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false);
  });
  await ok('a result schema not its own: another file than its line names, a path, another agent’s, no schema of fields', () => {
    refused(
      () => writeAgent(ROOT, AGENTS, withOutput, { version: null, schema: { file: 'other.schema.json', text: FIELDS } }),
      'Invalid',
      'the result schema is other.schema.json',
      'names scribe.schema.json',
    );
    refused(
      () => writeAgent(ROOT, AGENTS, withOutput, { version: null, schema: { file: '../x.json', text: FIELDS } }),
      'Invalid',
      "`../x.json` is not a result schema's name",
    );
    refused(
      () =>
        writeAgent(
          ROOT,
          AGENTS,
          { ...scribe, keys: { output: 'review.schema.json' } },
          { version: null, schema: { file: 'review.schema.json', text: FIELDS } },
        ),
      'Invalid',
      'review.schema.json is the result schema of reviewer too',
    );
    refused(
      () => writeAgent(ROOT, AGENTS, withOutput, { version: null, schema: { file: 'scribe.schema.json', text: '{"type":"object"}' } }),
      'Invalid',
      '`output: scribe.schema.json` is not a schema of fields',
    );
  });
  await ok('at shipped defaults: a card sent with its agent, or sent as an own `undefined`, which is generated from its skills', () => {
    const text = '[{"id":"write-a-note","name":"Write a note","description":"Write the notes of a change.","tags":["note"]}]';
    const sent = { version: null, card: { file: 'scribe.skills.json', text } };
    const sentEmpty = { version: null, card: undefined };
    refused(() => writeAgent(ROOT, AGENTS, scribe, sent), 'Invalid', '`card` is not written with an agent', 'generated from its skills');
    refused(() => writeAgent(ROOT, AGENTS, scribe, sentEmpty), 'Invalid', '`card` is not written with an agent');
    assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.skills.json')), false);
  });
  await ok('a remove or a rename of an agent a step still names, naming the steps — one in a folder that does not load too', () => {
    const reviewer = agentVersion(AGENTS, 'reviewer')!;
    const err = refused(
      () => removeAgent(ROOT, AGENTS, 'reviewer', { version: reviewer }),
      'Conflict',
      'agents/reviewer.md is named by a step beside it',
      'dev/review',
      'removing it',
    );
    assert.deepEqual(err._tag === 'Conflict' && err.users, ['dev/review']);
    const agent = loadAgents(AGENTS).get('reviewer') as Agent;
    refused(
      () => writeAgent(ROOT, AGENTS, { ...draftOf(agent), name: 'critic' }, { version: reviewer, from: 'reviewer' }),
      'Conflict',
      'dev/review',
      'renaming it to critic',
    );
    fs.mkdirSync(path.join(STORE, 'broken'));
    fs.writeFileSync(path.join(STORE, 'broken', 'a.md'), '---\n  agent : reviewer\nafter: nowhere\n---\nx\n');
    assert.deepEqual(
      agentUsers(STORE, 'reviewer'),
      ['broken/a', 'dev/review'],
      'a folder that does not load still counts, and `agent : x` names x',
    );
    refused(
      () => removeAgent(ROOT, AGENTS, 'reviewer', { version: reviewer }),
      'Conflict',
      'named by 2 steps beside it',
      'broken/a, dev/review',
    );
  });
  await ok('a rename onto another agent, and a new agent renamed from another', () => {
    const { version } = writeAgent(ROOT, AGENTS, scribe, v);
    refused(
      () => writeAgent(ROOT, AGENTS, { ...scribe, name: 'reviewer' }, { version, from: 'scribe' }),
      'Conflict',
      'agents/reviewer.md is there already',
      'renaming scribe to it',
    );
    refused(
      () => writeAgent(ROOT, AGENTS, { ...scribe, name: 'x' }, { version: null, from: 'scribe' }),
      'Invalid',
      'a new agent is not renamed from another',
    );
  });
});
