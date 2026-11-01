/**
 * The board's agents (agents.ts): listed from both places with the nodes that name them, one read, and one of yours made, put back,
 * renamed and removed — in a scratch store and a scratch repository. Every write is read back from disk, and every refusal is made to
 * refuse, asserted on its words, with the folder as it was. The repository holds the tests' team (`team.ts`) — its agents, its skills and
 * `dev`, whose steps name them; yours holds the same, `dev` beside them.
 *
 * Two stories and three tables: a person reading the agents — the list, one by name, the card its skills make, the A2A card, what a
 * skill costs a turn, as `nemia agents` reads them — and making one of theirs; what the listing says of an agent that does not read; the
 * former keys, read under their names now and refused when a stale page sends them; and the writes the api or the package refuses.
 * Each writes what it reads and takes it back, so what follows reads the store as it was.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { TEAM } from '../../test/team.ts';
import { Layer } from 'effect';
import { COMMANDS, clearCustomInstructions, engine, writeCustomInstructions, type AgentsRead, type CardRead } from 'agent-orchestrator';
import { runWith } from '../../test/builtin-place.ts';
import { app, appOf, liveOf } from '../app.ts';
import { StoreRoot } from '../store.ts';
import { story } from '../../test/checkpoints.ts';
const repo = scratch('nemia-api-agents-repo-');
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });

type AgentListing = import('./agents.ts').AgentListing;
type AgentSaved = import('./agents.ts').AgentSaved;

const STORE = path.join(root, 'workflows');
const AGENTS = path.join(STORE, 'agents');

fs.cpSync(path.join(TEAM, 'agents'), path.join(repo, 'workflows', 'agents'), { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(repo, 'workflows', 'skills'), { recursive: true });
fs.cpSync(path.join(TEAM, 'dev'), path.join(repo, 'workflows', 'dev'), { recursive: true });
fs.cpSync(path.join(TEAM, 'agents'), AGENTS, { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(STORE, 'skills'), { recursive: true });
fs.cpSync(path.join(TEAM, 'dev'), path.join(STORE, 'dev'), { recursive: true });

const json = { 'content-type': 'application/json' };
const send = (method: string, url: string, body: unknown, headers: Record<string, string> = json) =>
  app.request(url, { method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

const snapshot = (dir: string): Record<string, string> =>
  Object.fromEntries(
    fs
      .readdirSync(dir)
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]),
  );

/** A request refused with `status` and words `pattern` matches, and yours as it was. */
async function refused(res: Response | Promise<Response>, status: number, pattern: RegExp): Promise<{ error: string; users?: string[] }> {
  const before = snapshot(AGENTS);
  const answer = await res;
  const body = (await answer.json()) as { error: string; users?: string[] };
  assert.equal(answer.status, status, body.error);
  assert.match(body.error, pattern);
  assert.deepEqual(snapshot(AGENTS), before, 'a refused write leaves yours as it was');
  return body;
}

const scribe = {
  name: 'scribe',
  description: 'Use this when a change needs its notes written.',
  keys: { model: 'sonnet', effort: 'low', tools: 'Read, Write' },
  body: 'Write the notes.',
};

async function listed(): Promise<AgentListing[]> {
  const res = await app.request('/api/agents');
  assert.equal(res.status, 200);
  return (await res.json()) as AgentListing[];
}

test('a person reads the agents: both places listed, one read by name, the card its skills make and the A2A card, what each skill costs a turn — as `nemia agents` reads them, under the app’s own root', async (t) => {
  const s = story(t);

  await s.test('the agents of both places are listed, each with its keys, body, version and the nodes that name it', async () => {
    const all = await listed();
    const reviewer = all.find((a) => a.from === 'repo' && a.name === 'reviewer')!;
    assert.ok(reviewer, "the repository's reviewer is listed");
    assert.ok(
      all.find((a) => a.from === 'yours' && a.name === 'reviewer'),
      'yours too',
    );
    assert.match(reviewer.description ?? '', /./);
    assert.equal(reviewer.keys.output, 'review.schema.json');
    assert.equal(reviewer.schema?.file, 'review.schema.json');
    assert.match(reviewer.schema?.text ?? '', /"properties"/);
    assert.match(reviewer.version, /^[0-9a-f]{16}$/);
    assert.deepEqual(reviewer.usedBy, [{ from: 'repo', workflow: 'dev', step: 'review' }]);
    assert.equal(reviewer.error, null);
    assert.ok(!all.some((a) => a.name === 'README'), 'the README is no agent');
  });

  await s.test(
    "one agent is read by name; a name that is not an agent's, or a place that is not one, is refused before a file is read",
    async () => {
      const res = await app.request('/api/agents/repo/implementer');
      assert.equal(res.status, 200);
      assert.equal(((await res.json()) as AgentListing).name, 'implementer');
      await refused(app.request('/api/agents/yours/nobody'), 404, /^Yours has no agent named 'nobody'/);
      await refused(
        app.request('/api/agents/yours/..%2Fdev%2Fplan'),
        400,
        /^`\.\.\/dev\/plan` is not an agent's name: an agent is a file in agents\//,
      );
      await refused(app.request('/api/agents/elsewhere/reviewer'), 400, /an agent is read from `repo` or `yours`/);
    },
  );

  await s.test(
    'an agent is listed with what it says it can do: its card, generated from its skills, one entry each, read off its SKILL.md',
    async () => {
      const reviewer = (await listed()).find((a) => a.from === 'repo' && a.name === 'reviewer')!;
      assert.equal(reviewer.cardError, null);
      assert.deepEqual(
        reviewer.card?.map((s) => s.id),
        ['review-a-change', 'ask-for-another-round'],
        'one entry for each skill the agent gives, in its order',
      );
      assert.deepEqual(reviewer.card?.[0], {
        id: 'review-a-change',
        name: 'Review a change',
        description: 'Reads a change against its base as a second engineer would, and says what is worth changing.',
        tags: ['code', 'review'],
        examples: ['Use this when a change is written and nobody has read it yet.'],
      });
      fs.writeFileSync(path.join(AGENTS, 'mute.md'), '---\ndescription: Says nothing.\n---\nDo it.\n');
      try {
        const mute = (await listed()).find((a) => a.name === 'mute')!;
        assert.deepEqual(
          mute.card,
          [{ id: 'mute', name: 'mute', description: 'Says nothing.', tags: ['mute'] }],
          'an agent given no skills says one thing it can do: its own description, as one entry',
        );
        assert.equal(mute.cardError, null);
      } finally {
        fs.rmSync(path.join(AGENTS, 'mute.md'));
      }
    },
  );

  await s.test(
    "a skill in the repository's .claude/skills is on the card of an agent of yours, its SKILL.md moves the agent's version, and one gone is the card's refusal, not the agent's",
    async () => {
      const skill = path.join(repo, '.claude', 'skills', 'pass-a-note');
      fs.mkdirSync(skill, { recursive: true });
      fs.writeFileSync(
        path.join(skill, 'SKILL.md'),
        '---\nname: pass-a-note\ntitle: Pass a note\ndescription: Hands a note on.\n---\nHand it on.\n',
      );
      fs.writeFileSync(
        path.join(AGENTS, 'courier.md'),
        '---\ndescription: Carries notes.\nskills: pass-a-note\ntools: Read, Skill\n---\nCarry it.\n',
      );
      try {
        const courier = (await listed()).find((a) => a.name === 'courier')!;
        assert.deepEqual(courier.card, [
          { id: 'pass-a-note', name: 'Pass a note', description: 'Hands a note on.', tags: ['pass-a-note'] },
        ]);

        fs.writeFileSync(
          path.join(skill, 'SKILL.md'),
          '---\nname: pass-a-note\ntitle: Pass a note on\ndescription: Hands a note on.\ntags: ["note"]\n---\nHand it on.\n',
        );
        const edited = (await listed()).find((a) => a.name === 'courier')!;
        assert.deepEqual(
          edited.card?.map((s) => [s.name, s.tags]),
          [['Pass a note on', ['note']]],
        );
        assert.notEqual(edited.version, courier.version, 'the SKILL.md is digested with the agent');
        await refused(
          send('PUT', '/api/agents/yours/courier', {
            name: 'courier',
            description: 'Carries notes.',
            skills: 'pass-a-note',
            keys: { tools: 'Read, Skill' },
            body: 'Carry it.',
            version: courier.version,
          }),
          409,
          /changed since it was read/,
        );

        const put = await send('PUT', '/api/agents/yours/courier', {
          name: 'courier',
          description: 'Carries notes on.',
          skills: 'pass-a-note',
          keys: { tools: 'Read, Skill' },
          body: 'Carry it.',
          version: edited.version,
        });
        assert.equal(
          put.status,
          200,
          `at the version just listed a save goes through: the writer reads the version with the skills the listing found it with. ${await put.clone().text()}`,
        );
        const saved = (await put.json()) as { agent: { version: string } };
        const relisted = (await listed()).find((a) => a.name === 'courier')!;
        assert.equal(relisted.description, 'Carries notes on.');
        assert.equal(saved.agent.version, relisted.version);
        const gone = await send('DELETE', '/api/agents/yours/courier', { version: relisted.version });
        assert.equal(gone.status, 200, `and so does a removal. ${await gone.clone().text()}`);
        assert.equal(fs.existsSync(path.join(AGENTS, 'courier.md')), false);

        fs.writeFileSync(
          path.join(AGENTS, 'courier.md'),
          '---\ndescription: Carries notes.\nskills: pass-a-note\ntools: Read, Skill\n---\nCarry it.\n',
        );
        fs.rmSync(skill, { recursive: true });
        const lost = (await listed()).find((a) => a.name === 'courier')!;
        assert.equal(lost.error, null, 'the agent still reads: the skill is refused where loaded');
        assert.equal(lost.card, null);
        assert.match(lost.cardError ?? '', /^agents\/courier\.md gives the skill `pass-a-note`, and no skills folder has it/);
        await refused(
          app.request('/api/agents/yours/courier/card'),
          422,
          /^agents\/courier\.md gives the skill `pass-a-note`, and no skills folder has it/,
        );
      } finally {
        fs.rmSync(path.join(repo, '.claude'), { recursive: true, force: true });
        fs.rmSync(path.join(AGENTS, 'courier.md'), { force: true });
      }
    },
  );

  await s.test('an agent is answered as an A2A Agent Card, with what it leaves out said beside it and never inside it', async () => {
    const res = await app.request('/api/agents/repo/reviewer/card');
    assert.equal(res.status, 200, await res.clone().text());
    const answer = (await res.json()) as import('./agents.ts').AgentCardAnswer;
    assert.equal(answer.servedOverA2A, false);
    assert.match(answer.why, /Nothing here serves reviewer over A2A/);
    assert.match(answer.why, /`supportedInterfaces` REQUIRED/);
    assert.deepEqual(
      Object.keys(answer.card).sort(),
      ['capabilities', 'defaultInputModes', 'defaultOutputModes', 'description', 'name', 'skills', 'version'],
      "A2A's required fields but the interfaces nothing here has: the card is the card, and the sentence about it is not in it",
    );
    assert.deepEqual(answer.card.capabilities, { streaming: false, pushNotifications: false, extendedAgentCard: false });
    const listing = (await listed()).find((a) => a.from === 'repo' && a.name === 'reviewer')!;
    assert.equal(answer.card.version, listing.version, 'the version is the one a save is held to');
    assert.deepEqual(answer.card.skills, listing.card, 'the entries the page lists');
    assert.deepEqual(
      answer.card.skills.map((s) => s.id),
      ['review-a-change', 'ask-for-another-round'],
    );
  });

  await s.test('an agent is listed with each skill it gives, found where a start finds it, with what it costs a turn', async () => {
    const all = await listed();
    const theirs = all.find((a) => a.from === 'repo' && a.name === 'reviewer')!;
    const yours = all.find((a) => a.from === 'yours' && a.name === 'reviewer')!;
    assert.deepEqual(
      theirs.given.map((g) => [g.name, g.from]),
      [
        ['review-a-change', 'repo'],
        ['ask-for-another-round', 'repo'],
      ],
      "the repository's agent, from the skills beside it",
    );
    assert.deepEqual(
      yours.given.map((g) => [g.name, g.from]),
      [
        ['review-a-change', 'yours'],
        ['ask-for-another-round', 'yours'],
      ],
      'yours, from your library',
    );
    for (const g of [...theirs.given, ...yours.given]) {
      assert.equal(g.error, null, g.name);
      assert.equal(g.entry?.id, g.name);
      assert.ok(
        g.cost && g.cost.perTurn === g.cost.listed + (g.preload ? g.cost.body : 0) && g.cost.listed > 0,
        `${g.name} costs its listing, and its body when preloaded`,
      );
    }
    assert.deepEqual(all.find((a) => a.from === 'yours' && a.name === 'broken')?.given ?? [], [], 'none for an agent that does not read');
  });

  await s.test(
    "the listing and a card are the package's nemia agents and nemia agents card, answered with what the board adds and without a person's custom file",
    async () => {
      const AGENTS_ENTRY = COMMANDS.find((c) => c.name === 'agents')!;
      const CARD_ENTRY = COMMANDS.find((c) => c.name === 'agents card')!;
      writeCustomInstructions(root, 'reviewer', 'Say it in French.', repo);
      try {
        const all = await listed();
        assert.deepEqual(
          all.filter((a) => 'custom' in a).map((a) => `${a.from}/${a.name}`),
          [],
          "the file of a person's custom instructions is the CLI's to print, not a key of the board's",
        );
        const { agents: read } = (await runWith(engine(), AGENTS_ENTRY.handler({ repo }, process.env, root))) as AgentsRead;
        assert.ok(read.find((a) => a.name === 'reviewer' && a.from === 'yours')?.custom, 'the package read the custom file');
        const board = (one: object) => {
          const { given: _given, untried: _untried, fills: _fills, factories: _factories, ...rest } = one as Record<string, unknown>;
          return rest;
        };
        assert.deepEqual(
          all.map(board),
          read.map(({ custom: _custom, ...rest }) => rest),
        );
        const res = await app.request('/api/agents/yours/reviewer/card');
        assert.equal(res.status, 200, await res.clone().text());
        const { card } = (await runWith(
          engine(),
          CARD_ENTRY.handler({ name: 'reviewer', repo, from: 'yours' }, process.env, root),
        )) as CardRead;
        assert.deepEqual(((await res.json()) as { card: unknown }).card, card);
      } finally {
        clearCustomInstructions(root, 'reviewer', repo);
      }
    },
  );

  await s.test(
    "the listing and a card read yours under the store's root of the app they are asked through, not the package's",
    async () => {
      const home = scratch('nemia-api-agents-home-');
      fs.mkdirSync(path.join(home, 'workflows', 'agents'), { recursive: true });
      fs.writeFileSync(path.join(home, 'workflows', 'agents', 'elsewhere.md'), '---\ndescription: Lives elsewhere.\n---\nDo it.\n');
      const { app: own } = appOf(Layer.merge(liveOf(), Layer.succeed(StoreRoot)(home)));
      const yours = async (on: typeof app) =>
        ((await (await on.request('/api/agents')).json()) as AgentListing[]).filter((a) => a.from === 'yours').map((a) => a.name);
      assert.deepEqual(await yours(own), ['elsewhere'], "yours, read under the layer's root");
      assert.equal((await yours(app)).includes('elsewhere'), false, "the process's app reads yours under its own root");
      const res = await own.request('/api/agents/yours/elsewhere/card');
      assert.equal(res.status, 200, await res.clone().text());
      assert.equal(((await res.json()) as { card: { description: string } }).card.description, 'Lives elsewhere.');
    },
  );
});

test('the listing of an agent that does not read: its refusal, and its lines as written or nothing it points at — and a card it cannot have', async (t) => {
  await t.test('an agent that does not read is listed with its refusal, and its lines as written', async () => {
    fs.writeFileSync(path.join(AGENTS, 'broken.md'), '---\nmodel: opus\ncheck: npm test\n---\nDo it.\n');
    try {
      const broken = (await listed()).find((a) => a.name === 'broken')!;
      assert.match(broken.error ?? '', /^agents\/broken\.md: `check` is wiring/);
      assert.match(broken.error ?? '', /belongs on the step/);
      assert.deepEqual(broken.keys, { model: 'opus' });
      assert.equal(broken.body, 'Do it.');
    } finally {
      fs.rmSync(path.join(AGENTS, 'broken.md'));
    }
  });

  await t.test(
    'an agent that is a link is listed with its refusal alone: nothing of what it points at, outside the folder, is read',
    async () => {
      const outside = path.join(root, 'outside-agent.md');
      fs.writeFileSync(outside, '---\nmodel: opus\n---\nA secret from outside.\n');
      const outsideSchema = path.join(root, 'outside.schema.json');
      fs.writeFileSync(outsideSchema, '{"secret":true}');
      fs.symlinkSync(outside, path.join(AGENTS, 'linked.md'));
      fs.writeFileSync(path.join(AGENTS, 'schemed.md'), '---\noutput: schemed.schema.json\n---\nDo it.\n');
      fs.symlinkSync(outsideSchema, path.join(AGENTS, 'schemed.schema.json'));
      try {
        const agents = await listed();
        const linked = agents.find((a) => a.name === 'linked')!;
        assert.match(linked.error ?? '', /linked\.md is a link, and an agent's file is its own/);
        assert.equal(linked.source, '');
        assert.equal(linked.body, '');
        assert.deepEqual(linked.keys, {});
        const was = linked.version;
        fs.writeFileSync(outside, 'changed\n');
        assert.equal((await listed()).find((a) => a.name === 'linked')!.version, was, 'the version is not what the link points at');
        assert.equal(agents.find((a) => a.name === 'schemed')!.schema, null);
      } finally {
        for (const f of ['linked.md', 'schemed.md', 'schemed.schema.json']) fs.rmSync(path.join(AGENTS, f));
      }
    },
  );

  await t.test(
    'REFUSED at shipped defaults: a card for an agent that is not there, one with no description, and one whose name is not an agent’s',
    async () => {
      await refused(app.request('/api/agents/yours/nobody/card'), 404, /^Yours has no agent named 'nobody'/);
      await refused(app.request('/api/agents/yours/..%2Fdev%2Fplan/card'), 400, /is not an agent's name/);
      fs.writeFileSync(path.join(AGENTS, 'nameless.md'), '---\nmodel: opus\n---\nDo it.\n');
      try {
        await refused(
          app.request('/api/agents/yours/nameless/card'),
          422,
          /^agents\/nameless\.md has no `description:`, and the A2A protocol marks a card's description REQUIRED/,
        );
        const nameless = (await listed()).find((a) => a.name === 'nameless')!;
        assert.equal(nameless.card, null);
        assert.match(nameless.cardError ?? '', /^agents\/nameless\.md has no `description:`/);
      } finally {
        fs.rmSync(path.join(AGENTS, 'nameless.md'));
      }
    },
  );
});

test('a former key — `disallow:`, `allow:`, a codex `permissionMode:`, `card:`, `systemPrompt:` — is read under the name it has now and written so on a save, and refused when a stale page sends it', async (t) => {
  await t.test(
    'an agent that writes a list under its former name — `disallow:`, `allow:` — is listed under the name it has now, read or not; a save writes that name, and a page from before that sends the former one is refused',
    async () => {
      fs.writeFileSync(
        path.join(AGENTS, 'former.md'),
        '---\ndescription: Writes under the old names.\ndisallow: SendMessage\nallow: Edit(**)\n---\nDo it.\n',
      );
      fs.writeFileSync(
        path.join(AGENTS, 'former-broken.md'),
        '---\ndisallow: SendMessage\nallow: Edit(**)\ncheck: npm test\n---\nDo it.\n',
      );
      try {
        const agents = await listed();
        const former = agents.find((a) => a.name === 'former')!;
        assert.equal(former.error ?? null, null);
        assert.deepEqual(former.keys, { disallowedTools: 'SendMessage', allowedTools: 'Edit(**)' });
        const broken = agents.find((a) => a.name === 'former-broken')!;
        assert.match(broken.error ?? '', /`check` is wiring/);
        assert.deepEqual(
          broken.keys,
          { disallowedTools: 'SendMessage', allowedTools: 'Edit(**)' },
          'its lines as written, as the parser reads them, so the form can put it right',
        );

        await refused(
          send('PUT', '/api/agents/yours/former', {
            name: 'former',
            description: former.description,
            keys: { disallow: 'SendMessage', allow: 'Edit(**)' },
            body: former.body,
            version: former.version,
          }),
          422,
          /^agents\/former\.md: `disallow` is `disallowedTools`'s former name, .* reload it, and save again\.$/,
        );
        const put = await send('PUT', '/api/agents/yours/former', {
          name: 'former',
          description: former.description,
          keys: former.keys,
          body: former.body,
          version: former.version,
        });
        assert.equal(put.status, 200, await put.clone().text());
        assert.equal(
          fs.readFileSync(path.join(AGENTS, 'former.md'), 'utf8'),
          '---\ndescription: Writes under the old names.\nclaude:\n  fence:\n    disallowedTools: SendMessage\n    allowedTools: Edit(**)\n---\nDo it.\n',
        );
      } finally {
        fs.rmSync(path.join(AGENTS, 'former.md'), { force: true });
        fs.rmSync(path.join(AGENTS, 'former-broken.md'), { force: true });
      }
    },
  );

  await t.test(
    'a codex agent that names its sandbox as `permissionMode:`, as before 2026-09-23, is listed with its `sandbox`, read or not; a save writes `sandbox:`, and a page from before that sends `permissionMode` is refused',
    async () => {
      fs.writeFileSync(
        path.join(AGENTS, 'fenced.md'),
        '---\ndescription: Reviews on codex.\nharness: codex\npermissionMode: bypassPermissions\n---\nReview it.\n',
      );
      fs.writeFileSync(
        path.join(AGENTS, 'fenced-broken.md'),
        '---\nharness: codex\npermissionMode: read-only\ncheck: npm test\n---\nReview it.\n',
      );
      fs.writeFileSync(
        path.join(AGENTS, 'moded-broken.md'),
        '---\nharness: claude\npermissionMode: dontAsk\ncheck: npm test\n---\nDo it.\n',
      );
      try {
        const agents = await listed();
        const fenced = agents.find((a) => a.name === 'fenced')!;
        assert.equal(fenced.error ?? null, null);
        assert.deepEqual(fenced.keys, { harness: 'codex', sandbox: 'danger-full-access' });
        const broken = agents.find((a) => a.name === 'fenced-broken')!;
        assert.match(broken.error ?? '', /`check` is wiring/);
        assert.deepEqual(
          broken.keys,
          { harness: 'codex', sandbox: 'read-only' },
          'its lines as the parser reads them, so the form can put it right',
        );
        assert.deepEqual(
          agents.find((a) => a.name === 'moded-broken')!.keys,
          { harness: 'claude', permissionMode: 'dontAsk' },
          "a Claude Code agent's mode is its own",
        );

        await refused(
          send('PUT', '/api/agents/yours/fenced', {
            name: 'fenced',
            description: fenced.description,
            keys: { harness: 'codex', permissionMode: 'bypassPermissions' },
            body: fenced.body,
            version: fenced.version,
          }),
          422,
          /^agents\/fenced\.md: `permissionMode: bypassPermissions` on a step that runs on codex is the former name of `sandbox:` there, .* Send the sandbox as `sandbox:` instead: .* reload it, and save again; .* clear it, and set the sandbox\.$/,
        );
        const put = await send('PUT', '/api/agents/yours/fenced', {
          name: 'fenced',
          description: fenced.description,
          keys: fenced.keys,
          body: fenced.body,
          version: fenced.version,
        });
        assert.equal(put.status, 200, await put.clone().text());
        assert.equal(
          fs.readFileSync(path.join(AGENTS, 'fenced.md'), 'utf8'),
          '---\ndescription: Reviews on codex.\nharness: codex\ncodex:\n  fence:\n    sandbox: danger-full-access\n---\nReview it.\n',
        );
      } finally {
        for (const name of ['fenced', 'fenced-broken', 'moded-broken']) fs.rmSync(path.join(AGENTS, `${name}.md`), { force: true });
      }
    },
  );

  await t.test(
    'an agent with a leftover `card:` line is listed with the refusal saying what replaced it, and a save of it without the line reads',
    async () => {
      fs.writeFileSync(path.join(AGENTS, 'old.md'), '---\ndescription: Had a card file.\ncard: old.skills.json\n---\nDo it.\n');
      fs.writeFileSync(path.join(AGENTS, 'old.skills.json'), '[{"id":"a","name":"A","description":"Does a.","tags":["note"]}]\n');
      try {
        const old = (await listed()).find((a) => a.name === 'old')!;
        assert.match(old.error ?? '', /^agents\/old\.md: `card` names a card file/);
        assert.match(old.error ?? '', /is retired[^]*generated from its `skills:`/);
        assert.equal(old.card, null, 'nothing generated for an agent that does not read');
        const put = await send('PUT', '/api/agents/yours/old', {
          name: 'old',
          description: 'Had a card file.',
          keys: {},
          body: 'Do it.',
          version: old.version,
        });
        const saved = (await put.json()) as AgentSaved;
        assert.equal(put.status, 200, JSON.stringify(saved));
        assert.doesNotMatch(fs.readFileSync(path.join(AGENTS, 'old.md'), 'utf8'), /card:/);
        assert.deepEqual(saved.agent.card, [{ id: 'old', name: 'old', description: 'Had a card file.', tags: ['old'] }]);
        assert.deepEqual(saved.removed, [], 'a save never deletes what a person wrote: the json stays for them to remove');
      } finally {
        for (const f of ['old.md', 'old.skills.json']) fs.rmSync(path.join(AGENTS, f), { force: true });
      }
    },
  );

  await t.test(
    'REFUSED at shipped defaults: a card file sent by a page drawn before the card was generated, under any of its names, and a card file as `skills:`',
    async () => {
      for (const sent of [
        { card: 'scribe.skills.json' },
        { card: null },
        { cardText: '[]' },
        { card: 'scribe.skills.json', cardText: '[]' },
        { skillsText: '[]' },
      ]) {
        const keys = Object.keys(sent)
          .map((k) => `\`${k}\``)
          .join(' and ');
        await refused(
          send('POST', '/api/agents/yours', { ...scribe, ...sent }),
          400,
          new RegExp(
            `^POST /api/agents/yours: ${keys} named the card file beside the agent, which is retired[^]*reload it, and save again`,
          ),
        );
      }
      await refused(
        send('POST', '/api/agents/yours', { ...scribe, skills: 'scribe.skills.json' }),
        422,
        /`skills: scribe\.skills\.json` names a card file, which is retired[^]*reload it, and save again/,
      );
      assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false, 'nothing was written');
    },
  );

  await t.test(
    'REFUSED: a page from before the rename that still sends `systemPrompt`, a null among them, as stale; nothing is written',
    async () => {
      for (const sent of ['no-coding', null]) {
        await refused(
          send('POST', '/api/agents/yours', { ...scribe, systemPrompt: sent }),
          400,
          /^POST \/api\/agents\/yours: `systemPrompt` is now `harnessPrompt`[^]*A page that sends it is stale: reload it, and save again/,
        );
      }
      assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false, 'nothing was written');
    },
  );

  await t.test(
    'an agent still on the former `systemPrompt:` line is listed with its `harnessPrompt` in the word it is now, read or not',
    async () => {
      fs.writeFileSync(
        path.join(AGENTS, 'prompted.md'),
        '---\ndescription: Says own.\nsystemPrompt: own\n---\nYou are the whole prompt.\n',
      );
      fs.writeFileSync(path.join(AGENTS, 'prompted-broken.md'), '---\nsystemPrompt: own\ncheck: npm test\n---\nDo it.\n');
      try {
        const agents = await listed();
        const prompted = agents.find((a) => a.name === 'prompted')!;
        assert.equal(prompted.error ?? null, null);
        assert.equal(prompted.harnessPrompt, 'replace');
        const broken = agents.find((a) => a.name === 'prompted-broken')!;
        assert.match(broken.error ?? '', /`check` is wiring/);
        assert.equal(broken.harnessPrompt, 'replace', 'its former line as the parser reads it, so the form shows what it means');
      } finally {
        fs.rmSync(path.join(AGENTS, 'prompted.md'), { force: true });
        fs.rmSync(path.join(AGENTS, 'prompted-broken.md'), { force: true });
      }
    },
  );
});

test('a person makes an agent of theirs — with a result schema, skills, a harness prompt and MCP servers — puts it back, renames it and removes it, each read back from disk', async (t) => {
  const s = story(t);

  await s.test('an agent of yours is made, put back, renamed and removed, each read back from disk', async () => {
    const made = await send('POST', '/api/agents/yours', scribe);
    const saved = (await made.json()) as AgentSaved;
    assert.equal(made.status, 201, JSON.stringify(saved));
    assert.deepEqual(saved.written, ['scribe.md']);
    assert.equal(
      fs.readFileSync(path.join(AGENTS, 'scribe.md'), 'utf8'),
      '---\ndescription: Use this when a change needs its notes written.\nmodel: sonnet\neffort: low\nclaude:\n  fence:\n    tools: Read, Write\n---\nWrite the notes.\n',
    );

    const put = await send('PUT', '/api/agents/yours/scribe', {
      ...scribe,
      version: saved.agent.version,
      keys: { ...scribe.keys, effort: 'high', tools: null },
    });
    const edited = (await put.json()) as AgentSaved;
    assert.equal(put.status, 200, JSON.stringify(edited));
    assert.deepEqual(edited.agent.keys, { model: 'sonnet', effort: 'high' });

    const renamed = await send('PUT', '/api/agents/yours/scribe', { ...scribe, name: 'notary', version: edited.agent.version });
    const moved = (await renamed.json()) as AgentSaved;
    assert.equal(renamed.status, 200, JSON.stringify(moved));
    assert.deepEqual(moved.removed, ['scribe.md']);
    assert.ok(fs.existsSync(path.join(AGENTS, 'notary.md')));

    const gone = await send('DELETE', '/api/agents/yours/notary', { version: moved.agent.version });
    assert.equal(gone.status, 200);
    assert.equal(fs.existsSync(path.join(AGENTS, 'notary.md')), false);
  });

  await s.test('a result schema pasted with an agent is written beside it', async () => {
    const text = JSON.stringify({
      type: 'object',
      properties: { notes: { type: 'string' } },
      required: ['notes'],
      additionalProperties: false,
    });
    const res = await send('POST', '/api/agents/yours', {
      ...scribe,
      name: 'with-schema',
      keys: { output: 'with-schema.schema.json' },
      schema: { file: 'with-schema.schema.json', text },
    });
    const saved = (await res.json()) as AgentSaved;
    assert.equal(res.status, 201, JSON.stringify(saved));
    assert.equal(saved.agent.schema?.text, text);
    assert.equal(fs.readFileSync(path.join(AGENTS, 'with-schema.schema.json'), 'utf8'), text);
    const gone = await send('DELETE', '/api/agents/yours/with-schema', { version: saved.agent.version });
    assert.deepEqual(((await gone.json()) as { removed: string[] }).removed, ['with-schema.md', 'with-schema.schema.json']);
  });

  await s.test(
    "an agent is written and listed with the skills it is given and what becomes of Claude Code's prompt, each as its line writes it",
    async () => {
      const made = await send('POST', '/api/agents/yours', {
        ...scribe,
        keys: { ...scribe.keys, tools: 'Read, Write, Skill' },
        skills: ' review-a-change,implement-a-change ',
        harnessPrompt: 'no-coding',
      });
      const saved = (await made.json()) as AgentSaved;
      assert.equal(made.status, 201, JSON.stringify(saved));
      try {
        const text = fs.readFileSync(path.join(AGENTS, 'scribe.md'), 'utf8');
        assert.match(text, /^skills: review-a-change,implement-a-change$/m);
        assert.match(text, /^harnessPrompt: no-coding$/m);
        assert.equal(saved.agent.skills, 'review-a-change, implement-a-change', 'listed as the parser read it');
        assert.equal(saved.agent.harnessPrompt, 'no-coding');
        assert.deepEqual(
          saved.agent.card?.map((s) => s.id),
          ['review-a-change', 'implement-a-change'],
          'the card is the skills it gives',
        );
        assert.equal(Object.hasOwn(saved.agent.keys, 'skills'), false, 'not a role key: a step has no skills of its own');
        assert.equal(Object.hasOwn(saved.agent.keys, 'harnessPrompt'), false, 'not a role key: a step has no harness prompt of its own');
      } finally {
        await send('DELETE', '/api/agents/yours/scribe', { version: saved.agent.version });
      }
    },
  );

  await s.test(
    'an agent is written and listed with the MCP servers its sessions load, as its line writes them, and unset by null',
    async () => {
      const made = await send('POST', '/api/agents/yours', { ...scribe, mcp: ' playwright,docs ' });
      const saved = (await made.json()) as AgentSaved;
      assert.equal(made.status, 201, JSON.stringify(saved));
      let version = saved.agent.version;
      try {
        assert.match(fs.readFileSync(path.join(AGENTS, 'scribe.md'), 'utf8'), /^mcp: playwright,docs$/m);
        assert.equal(saved.agent.mcp, 'playwright, docs', 'listed as the parser read it');
        assert.equal(Object.hasOwn(saved.agent.keys, 'mcp'), false, 'not a role key: a step has no mcp line of its own');
        const unset = await send('PUT', '/api/agents/yours/scribe', { ...scribe, version, mcp: null });
        const again = (await unset.json()) as AgentSaved;
        assert.equal(unset.status, 200, JSON.stringify(again));
        version = again.agent.version;
        assert.equal(again.agent.mcp, null);
        assert.doesNotMatch(fs.readFileSync(path.join(AGENTS, 'scribe.md'), 'utf8'), /^mcp:/m);
      } finally {
        await send('DELETE', '/api/agents/yours/scribe', { version });
      }
    },
  );
});

test('a write of an agent the api or the package refuses — the repository’s, a key, a value, a name, a stale version, a type, skills or MCP servers it will not read, an agent still named — and yours as it was', async (t) => {
  await t.test("a write to the repository's agents is refused, and nothing is written into the checkout", async () => {
    const theirs = snapshot(path.join(repo, 'workflows', 'agents'));
    await refused(send('POST', '/api/agents/repo', scribe), 403, /^POST \/api\/agents\/repo refuses to write the repository's agents/);
    await refused(send('PUT', '/api/agents/repo/reviewer', { ...scribe, version: 'x' }), 403, /cp .*reviewer\.md .* starts from this one/);
    await refused(send('DELETE', '/api/agents/repo/reviewer', { version: 'x' }), 403, /refuses to write the repository's agents/);
    await refused(send('POST', '/api/agents/elsewhere', scribe), 400, /the board writes yours, at \/api\/agents\/yours/);
    assert.deepEqual(snapshot(path.join(repo, 'workflows', 'agents')), theirs);
  });

  await t.test(
    "refusals carry the package's words: a key, a value, a name, a name taken, a stale version, and an agent still named",
    async () => {
      await refused(
        send('POST', '/api/agents/yours', { ...scribe, keys: { check: 'npm test' } }),
        422,
        /^agents\/scribe\.md: `check` is wiring, and belongs on the step/,
      );
      await refused(
        send('POST', '/api/agents/yours', { ...scribe, keys: { agent: 'reviewer' } }),
        422,
        /^agents\/scribe\.md: `agent` is a step's key/,
      );
      await refused(
        send('POST', '/api/agents/yours', { ...scribe, keys: { context: 'lots' } }),
        422,
        /^agents\/scribe\.md: `context: lots` is not a number of tokens/,
      );
      await refused(send('POST', '/api/agents/yours', { ...scribe, name: 'x.md' }), 400, /^`x\.md` is not an agent's name/);
      await refused(send('POST', '/api/agents/yours', { ...scribe, keys: { model: 7 } }), 400, /`keys\.model` is written as a string/);
      await refused(send('POST', '/api/agents/yours', { ...scribe, name: 'reviewer' }), 409, /^agents\/reviewer\.md is there already/);
      await refused(
        send('PUT', '/api/agents/yours/reviewer', { ...scribe, name: 'reviewer' }),
        400,
        /takes the `version` the agent was read at/,
      );
      await refused(
        send('PUT', '/api/agents/yours/reviewer', { ...scribe, name: 'reviewer', version: '0123456789abcdef' }),
        409,
        /^agents\/reviewer\.md changed since it was read/,
      );
      await refused(
        send('PUT', '/api/agents/yours/nobody', { ...scribe, name: 'nobody', version: '0123456789abcdef' }),
        404,
        /^agents\/nobody\.md is not there/,
      );
      const reviewer = (await listed()).find((a) => a.from === 'yours' && a.name === 'reviewer')!;
      const inUse = await refused(
        send('DELETE', '/api/agents/yours/reviewer', { version: reviewer.version }),
        409,
        /^agents\/reviewer\.md is named by a step beside it — dev\/review — and removing it would/,
      );
      assert.deepEqual(inUse.users, ['dev/review']);
      await refused(
        send('PUT', '/api/agents/yours/reviewer', { ...scribe, name: 'critic', version: reviewer.version }),
        409,
        /renaming it to critic would/,
      );
      await refused(send('DELETE', '/api/agents/yours/reviewer', {}), 400, /takes the `version` the agent was read at/);
    },
  );

  await t.test(
    "REFUSED at shipped defaults: each key of a draft sent as the wrong type is a 400 in the api's words, naming the key and what to send — and nothing is written",
    async () => {
      const post = (body: unknown) => send('POST', '/api/agents/yours', body);
      await refused(post([scribe]), 400, /^POST \/api\/agents\/yours takes a JSON object: `\{ "name": "<agent>"/);
      await refused(
        post({ ...scribe, name: 7 }),
        400,
        /^POST \/api\/agents\/yours: `name` is the agent's name, a string, and this request's was 7\. Send `\{/,
      );
      await refused(
        post({ ...scribe, description: 7 }),
        400,
        /^POST \/api\/agents\/yours: `description` is a line of text, or null\. Send /,
      );
      for (const keys of [[], null, 'model: opus'])
        await refused(
          post({ ...scribe, keys }),
          400,
          /^POST \/api\/agents\/yours: `keys` is an object of the role keys the agent sets\. Send /,
        );
      await refused(
        post({ ...scribe, keys: { model: ['opus'] } }),
        400,
        /`keys\.model` is written as a string, as its line in the file is — \["opus"\] is not one\. Send /,
      );
      await refused(post({ ...scribe, body: 7 }), 400, /^POST \/api\/agents\/yours: `body` is the agent's instructions, a string\. Send /);
      for (const schema of ['scribe.schema.json', { file: 'scribe.schema.json' }, { file: 'scribe.schema.json', text: {} }])
        await refused(
          post({ ...scribe, schema }),
          400,
          /^POST \/api\/agents\/yours: `schema` is the result schema its `output:` names, `\{ "file", "text" \}`, or null\. Send /,
        );

      const reviewer = (await listed()).find((a) => a.from === 'yours' && a.name === 'reviewer')!;
      const put = (body: unknown) =>
        send('PUT', '/api/agents/yours/reviewer', { ...scribe, version: reviewer.version, ...(body as object) });
      await refused(
        put({ name: 7 }),
        400,
        /^PUT \/api\/agents\/yours\/reviewer: `name` is the agent's name, a string, and this request's was 7\. Send /,
      );
      await refused(put({ name: 'x.md' }), 400, /^`x\.md` is not an agent's name/);
      await refused(
        put({ version: 7 }),
        400,
        /^PUT \/api\/agents\/yours\/reviewer takes the `version` the agent was read at[^]*This request's was 7\.$/,
      );
      await refused(
        put({ description: false }),
        400,
        /^PUT \/api\/agents\/yours\/reviewer: `description` is a line of text, or null\. Send `\{ "version"/,
      );
      await refused(
        send('DELETE', '/api/agents/yours/reviewer', { version: 7 }),
        400,
        /^DELETE \/api\/agents\/yours\/reviewer takes the `version` the agent was read at[^]*This request's was 7\.$/,
      );
      assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false, 'nothing was written');
    },
  );

  await t.test(
    "REFUSED at shipped defaults: MCP servers not written as text, in the route's words, and names the package will not read, in its own",
    async () => {
      await refused(
        send('POST', '/api/agents/yours', { ...scribe, mcp: 3 }),
        400,
        /^POST \/api\/agents\/yours: `mcp` is the MCP servers the agent's sessions load, by the names the checkout's `\.mcp\.json` gives them/,
      );
      await refused(send('POST', '/api/agents/yours', { ...scribe, mcp: ['a'] }), 400, /`mcp` is the MCP servers/);
      await refused(send('POST', '/api/agents/yours', { ...scribe, mcp: 'a, b c' }), 422, /has `b c`, which is not a server's name/);
      await refused(send('POST', '/api/agents/yours', { ...scribe, mcp: 'a, a' }), 422, /names `a` twice/);
      assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false, 'nothing was written');
    },
  );

  await t.test(
    "REFUSED at shipped defaults: skills or a harness prompt not written as text, ones the package will not read, and skills the agent's tools could not load",
    async () => {
      await refused(
        send('POST', '/api/agents/yours', { ...scribe, skills: ['a'] }),
        400,
        /`skills` is the skills the agent is given, by name/,
      );
      await refused(
        send('POST', '/api/agents/yours', { ...scribe, harnessPrompt: 1 }),
        400,
        /`harnessPrompt` is `"keep"`, `"no-coding"` or `"replace"`/,
      );
      await refused(
        send('POST', '/api/agents/yours', { ...scribe, harnessPrompt: 'terse' }),
        422,
        /`harnessPrompt: terse` is not one of keep, no-coding, replace/,
      );
      await refused(send('POST', '/api/agents/yours', { ...scribe, skills: 'Not A Name' }), 422, /Not A Name/);
      await refused(send('POST', '/api/agents/yours', { ...scribe, skills: 'write-a-note' }), 422, /no `Skill`/);
      await refused(
        send('POST', '/api/agents/yours', { ...scribe, keys: { ...scribe.keys, harness: 'codex' }, skills: 'write-a-note' }),
        422,
        /codex/,
      );
      assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false, 'nothing was written');
    },
  );

  await t.test(
    "an agent of yours a step of the repository's workflows is given — the repository having none of that name — is refused removal and renaming, naming the repository; once it has its own, removed",
    async () => {
      fs.writeFileSync(path.join(AGENTS, 'lender.md'), '---\ndescription: Lent to the repository.\n---\nDo it.\n');
      const lent = path.join(repo, 'workflows', 'lent');
      fs.mkdirSync(lent, { recursive: true });
      fs.writeFileSync(path.join(lent, 'borrow.md'), '---\nplace: git\nagent: lender\n---\nBorrow it.\n');
      const own = path.join(repo, '.claude', 'agents', 'lender.md');
      try {
        const lender = (await listed()).find((a) => a.from === 'yours' && a.name === 'lender')!;
        const inUse = await refused(
          send('DELETE', '/api/agents/yours/lender', { version: lender.version }),
          409,
          new RegExp(
            `^agents/lender\\.md is named by a step of the repository ${repo} — lent/borrow — which has no lender of its own, so its workflows are given this one, and removing it would`,
          ),
        );
        assert.deepEqual(inUse.users, ['lent/borrow']);
        await refused(
          send('PUT', '/api/agents/yours/lender', { ...scribe, name: 'giver', version: lender.version }),
          409,
          /of the repository .* renaming it to giver would/,
        );
        fs.mkdirSync(path.dirname(own), { recursive: true });
        fs.writeFileSync(own, "---\ndescription: The repository's own.\n---\nDo it.\n");
        const res = await send('DELETE', '/api/agents/yours/lender', { version: lender.version });
        assert.equal(
          res.status,
          200,
          `the repository's own lender is what its workflows are given, so yours may go. ${await res.clone().text()}`,
        );
        assert.ok(!fs.existsSync(path.join(AGENTS, 'lender.md')));
      } finally {
        fs.rmSync(path.join(AGENTS, 'lender.md'), { force: true });
        fs.rmSync(lent, { recursive: true, force: true });
        fs.rmSync(path.join(repo, '.claude'), { recursive: true, force: true });
      }
    },
  );
});
