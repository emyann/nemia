/**
 * The board's skill picker (skills.ts): the skills an agent of yours can be given, by place, in the order a start finds a name, and what
 * Nemia ships beside them — nothing today, so what a shipped row says is read off the tests' team (`team.ts`) handed to `listSkills` as the
 * shipped place — in a scratch store and a scratch repository. Every refusal is made to refuse, asserted on its words, with the library as
 * it was. And one skill on its own page, and one of yours
 * written on the board: made, changed at its version, its preload switched — each moving the version of every agent that gives it.
 *
 * The repository's `.claude/skills` is written first and your library after, so neither the order on disk nor the order of the names puts
 * your library first: only the lookup does.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { engine, shippedGitPlace, skillCopyCommand } from 'agent-orchestrator';
import { skillTurnCost } from 'agent-orchestrator/workflow';
import { scratch } from '../../test/scratch.ts';
import { app } from '../app.ts';
import { foundInOf, listSkills, SHIPPED_SKILLS, skillDetail } from './skills.ts';
import { TEAM } from '../../test/team.ts';
const repo = scratch('nemia-api-skills-repo-');
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });

type SkillPlace = import('./skills.ts').SkillPlace;
type SkillRow = import('./skills.ts').SkillRow;

/** What Nemia ships: `workflows/skills` of the checkout these tests run in, which is the api's own (`HOME_REPO`). Read, never written. */
const SHIPPED = SHIPPED_SKILLS;
const shipped = fs.existsSync(SHIPPED)
  ? fs
      .readdirSync(SHIPPED)
      .filter((name) => fs.existsSync(path.join(SHIPPED, name, 'SKILL.md')))
      .sort()
  : [];
/** The tests' team's skills, standing in for a shipped place where a row's `found` is read. */
const TEAM_SKILLS = path.join(TEAM, 'skills');
/** A team skill your library has, one the repository has, and one neither has. */
const [inLibrary, inRepo, toCopy] = ['ask-for-another-round', 'implement-a-change', 'review-a-change'];
const LIBRARY = path.join(root, 'workflows', 'skills');
const THEIRS = path.join(repo, '.claude', 'skills');

function skill(dir: string, name: string, text: string): void {
  fs.mkdirSync(path.join(dir, name), { recursive: true });
  fs.writeFileSync(path.join(dir, name, 'SKILL.md'), text);
}

skill(THEIRS, 'shared', "---\ndescription: The repository's.\n---\nTheirs.\n");
skill(THEIRS, 'review', '---\nname: code-review\ndescription: Reviews a change.\n---\nReview it.\n');
skill(THEIRS, 'scratch', '# Scratch\n\nNo frontmatter.\n');
skill(THEIRS, inRepo, "---\ndescription: The repository's own of a team's name.\n---\nTheirs.\n");
skill(path.join(repo, 'workflows', 'skills'), 'beside', "---\ndescription: Beside the repository's agents.\n---\nNot for yours.\n");
skill(LIBRARY, 'shared', '---\ndescription: Mine.\n---\nMine.\n');
skill(LIBRARY, 'mine', '---\ndescription: "Writes a decision."\ntags: ["decision"]\n---\n# Mine\n\nWrite it down.\n');
skill(LIBRARY, 'always', '---\ndescription: Asks when it reads two ways.\npreload: true\n---\nAsk before you guess, every time.\n');
fs.cpSync(path.join(TEAM_SKILLS, inLibrary), path.join(LIBRARY, inLibrary), { recursive: true });
fs.mkdirSync(path.join(root, 'workflows', 'agents'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'workflows', 'agents', 'scribe.md'),
  '---\ndescription: Writes notes.\nskills: mine, shared, review\ntools: Read, Skill\n---\nWrite.\n',
);
fs.writeFileSync(path.join(root, 'workflows', 'agents', 'clerk.md'), '---\ndescription: Files notes.\nskills: mine\n---\nFile.\n');
fs.writeFileSync(path.join(root, 'workflows', 'agents', 'broken.md'), '---\nskills: shared\ncheck: npm test\n---\nNope.\n');

const json = { 'content-type': 'application/json' };
const send = (url: string, body: unknown, headers: Record<string, string> = json) =>
  app.request(url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** Every file of the library, by its path in it, with what it holds. */
const snapshot = (): Record<string, string> =>
  Object.fromEntries(
    (fs.readdirSync(LIBRARY, { recursive: true }) as string[])
      .sort()
      .filter((f) => fs.statSync(path.join(LIBRARY, f)).isFile())
      .map((f) => [f, fs.readFileSync(path.join(LIBRARY, f), 'utf8')]),
  );

async function refused(res: Response | Promise<Response>, status: number, pattern: RegExp): Promise<void> {
  const before = snapshot();
  const answer = await res;
  const body = (await answer.json()) as { error: string };
  assert.equal(answer.status, status, body.error);
  assert.match(body.error, pattern);
  assert.deepEqual(snapshot(), before, 'a refused copy leaves the library as it was');
  assert.deepEqual(
    fs.readdirSync(LIBRARY).filter((n) => n.startsWith('.')),
    [],
    'with no half-copied folder in it',
  );
}

async function listed(): Promise<SkillPlace[]> {
  const res = await app.request('/api/skills');
  assert.equal(res.status, 200);
  return (await res.json()) as SkillPlace[];
}

const rowOf = (places: SkillPlace[], from: string, name: string): SkillRow | undefined =>
  places.find((p) => p.from === from)?.skills.find((s) => s.name === name);

test("the skills are listed by place — yours, the repository's, then what Nemia ships — each name where an agent of yours finds it", async () => {
  const places = await listed();
  assert.deepEqual(
    places.map((p) => [p.from, p.dir]),
    [
      ['yours', LIBRARY],
      ['repo', THEIRS],
      ['shipped', SHIPPED],
    ],
  );
  assert.deepEqual(
    places[0].skills.map((s) => s.name),
    ['always', inLibrary, 'mine', 'shared'].sort(),
  );
  assert.deepEqual(
    places[1].skills.map((s) => s.name),
    [inRepo, 'review', 'scratch'].sort(),
    'the name in both is in yours alone',
  );
  assert.deepEqual(
    places[2].skills.map((s) => s.name),
    shipped,
  );
  assert.equal(rowOf(places, 'yours', 'shared')!.entry?.description, 'Mine.', 'your library wins a name the repository has too');
  assert.equal(rowOf(places, 'yours', 'shared')!.dir, path.join(LIBRARY, 'shared'));
  assert.ok(
    !places.some((p) => p.skills.some((s) => s.name === 'beside')),
    "the repository's workflows/skills is no place an agent of yours looks",
  );
});

test('a skill is listed with its card entry, whether it is loaded every turn, what it costs a turn, and the agents of yours that give it', async () => {
  const places = await listed();
  const mine = rowOf(places, 'yours', 'mine')!;
  assert.deepEqual(mine.entry, { id: 'mine', name: 'mine', description: 'Writes a decision.', tags: ['decision'] });
  assert.equal(mine.error, null);
  assert.equal(mine.preload, false);
  assert.deepEqual(mine.cost, skillTurnCost('mine', fs.readFileSync(path.join(LIBRARY, 'mine', 'SKILL.md'), 'utf8')));
  assert.equal(mine.cost.perTurn, mine.cost.listed, 'named, it costs its listing');
  assert.deepEqual(mine.usedBy, ['clerk', 'scribe'], 'the agents of yours that give it, and not one that does not read');
  const always = rowOf(places, 'yours', 'always')!;
  assert.equal(always.preload, true);
  assert.equal(always.cost!.perTurn, always.cost!.listed + always.cost!.body, 'preloaded, its body too');
  assert.deepEqual(always.usedBy, []);
  assert.deepEqual(rowOf(places, 'repo', 'review')!.usedBy, ['scribe']);
  assert.equal(rowOf(places, 'repo', 'review')!.entry?.name, 'code-review');
});

test('a skill whose SKILL.md is no card entry is listed with the refusal, and a link is listed unread', async () => {
  const scratchRow = rowOf(await listed(), 'repo', 'scratch')!;
  assert.equal(scratchRow.entry, null);
  assert.match(scratchRow.error ?? '', /SKILL\.md has no frontmatter, and a skill's card entry is read from it/);
  const outside = scratch('nemia-api-skills-outside-');
  skill(outside, 'far', '---\ndescription: Far away.\n---\nSecret.\n');
  fs.symlinkSync(path.join(outside, 'far'), path.join(LIBRARY, 'far'));
  try {
    const far = rowOf(await listed(), 'yours', 'far')!;
    assert.equal(far.entry, null);
    assert.equal(far.cost, null, 'nothing of what it points at is read');
    assert.match(far.error ?? '', /^far is a link/);
  } finally {
    fs.rmSync(path.join(LIBRARY, 'far'));
  }
});

test('a repository skill linked inside the repository lists under repo, read, with its page; one linked outside lists there unread', async () => {
  fs.mkdirSync(path.join(repo, 'kept'), { recursive: true });
  skill(path.join(repo, 'kept'), 'inside', '---\ndescription: Kept inside.\n---\nInside.\n');
  const outside = scratch('nemia-api-skills-outside-');
  skill(outside, 'apart', '---\ndescription: Kept apart.\n---\nSecret.\n');
  fs.symlinkSync('../../kept/inside', path.join(THEIRS, 'inside'));
  fs.symlinkSync(path.join(outside, 'apart'), path.join(THEIRS, 'apart'));
  try {
    const places = await listed();
    const inside = rowOf(places, 'repo', 'inside')!;
    assert.equal(inside.error, null);
    assert.equal(inside.entry?.description, 'Kept inside.');
    const page = await skillDetail(engine(), shippedGitPlace, 'repo', 'inside', repo, root);
    assert.equal(page?.skill.entry?.description, 'Kept inside.');
    assert.match(page?.version ?? '', /^[0-9a-f]{16}$/);

    assert.equal(rowOf(places, 'yours', 'apart'), undefined, 'listed where its folder is');
    const apart = rowOf(places, 'repo', 'apart')!;
    assert.equal(apart.entry, null);
    assert.equal(apart.cost, null, 'nothing of what it points at is read');
    assert.match(apart.error ?? '', /^apart is a link, and what it points at is outside the folder of skills/);
    const refused = await skillDetail(engine(), shippedGitPlace, 'repo', 'apart', repo, root);
    assert.equal(refused?.skill.entry, null);
    const res = await app.request('/api/skills/repo/apart');
    assert.equal(res.status, 200, 'its page answers, and says the refusal');
    assert.equal(
      ((await res.json()) as import('./skills.ts').SkillDetail).skill.error,
      'apart is a link, and what it points at is outside the folder of skills: make it a folder of its own.',
    );
    assert.doesNotMatch(JSON.stringify(refused), /Secret/, 'and its page reads none of it either');
  } finally {
    fs.rmSync(path.join(THEIRS, 'inside'));
    fs.rmSync(path.join(THEIRS, 'apart'));
    fs.rmSync(path.join(repo, 'kept'), { recursive: true });
  }
});

test('a shipped skill says where an agent of yours already finds its name: in your library, in the repository, or nowhere yet', async () => {
  const places = await listSkills(engine(), shippedGitPlace, repo, root, TEAM_SKILLS);
  assert.equal(rowOf(places, 'shipped', inLibrary)!.found, 'yours');
  assert.equal(rowOf(places, 'shipped', inRepo)!.found, 'repo');
  assert.equal(rowOf(places, 'shipped', toCopy)!.found, null);
  assert.equal(rowOf(places, 'shipped', toCopy)!.error, null, 'every skill of the place reads');
  assert.ok(
    places[2].skills.every((s) => s.usedBy.length === 0),
    'no agent of yours is given a skill from where Nemia ships it',
  );
});

test("REFUSED at shipped defaults: a skill Nemia does not ship, a name that is not a skill's, and a body that names none", async () => {
  await refused(
    send('/api/skills/yours', { copy: 'no-such-skill' }),
    404,
    /has no skill named no-such-skill: a skill is a folder holding a SKILL\.md/,
  );
  await refused(
    send('/api/skills/yours', { copy: toCopy }),
    404,
    new RegExp(`has no skill named ${toCopy}: a skill is a folder holding a SKILL\\.md`),
  );
  await refused(send('/api/skills/yours', { copy: '../agents' }), 422, /^`\.\.\/agents` is not a skill's name/);
  await refused(send('/api/skills/yours', { copy: 'Bad_Name' }), 422, /^`Bad_Name` is not a skill's name/);
  await refused(send('/api/skills/yours', { copy: 7 }), 400, /`copy` is the name of the skill Nemia ships to copy, a string/);
  await refused(send('/api/skills/yours', [toCopy]), 400, /takes a JSON object: .*`{ "copy"/);
  await refused(send('/api/skills/yours', '{'), 400, /takes a JSON body/);
});

test("REFUSED at shipped defaults: a copy into the repository's skills, or anywhere but yours, and nothing is written into the checkout", async () => {
  const theirs = fs.readdirSync(THEIRS).sort();
  await refused(send('/api/skills/repo', { copy: toCopy }), 403, /^POST \/api\/skills\/repo refuses to write the repository's skills/);
  await refused(
    send('/api/skills/elsewhere', { copy: toCopy }),
    400,
    /the board writes a skill into your library, at \/api\/skills\/yours/,
  );
  assert.deepEqual(fs.readdirSync(THEIRS).sort(), theirs);
});

test('an agent is listed with each skill it gives, where it is found and what it costs, and one no place has with why', async () => {
  fs.writeFileSync(path.join(root, 'workflows', 'agents', 'lost.md'), '---\ndescription: Lost.\nskills: always, gone\n---\nLook.\n');
  try {
    const res = await app.request('/api/agents/yours/scribe');
    const scribe = (await res.json()) as import('./agents.ts').AgentListing;
    assert.deepEqual(
      scribe.given.map((g) => [g.name, g.from, g.entry?.description ?? g.error]),
      [
        ['mine', 'yours', 'Writes a decision.'],
        ['shared', 'yours', 'Mine.'],
        ['review', 'repo', 'Reviews a change.'],
      ],
    );
    const lost = (await (await app.request('/api/agents/yours/lost')).json()) as import('./agents.ts').AgentListing;
    assert.equal(lost.given[0].preload, true);
    assert.equal(lost.given[0].cost!.perTurn, lost.given[0].cost!.listed + lost.given[0].cost!.body);
    assert.deepEqual([lost.given[1].from, lost.given[1].cost], [null, null]);
    assert.match(lost.given[1].error ?? '', /^No skills folder has `gone` — looked in /);
  } finally {
    fs.rmSync(path.join(root, 'workflows', 'agents', 'lost.md'));
  }
});

type SkillDetail = import('./skills.ts').SkillDetail;
type SkillSaved = import('./skills.ts').SkillSaved;

const put = (url: string, body: unknown, headers: Record<string, string> = json) =>
  app.request(url, { method: 'PUT', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

async function detail(from: string, name: string): Promise<SkillDetail> {
  const res = await app.request(`/api/skills/${from}/${name}`);
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  return body as SkillDetail;
}

const agentVersionOf = async (name: string): Promise<string> =>
  ((await (await app.request(`/api/agents/yours/${name}`)).json()) as { version: string }).version;

const NOTES = {
  name: 'tidy-notes',
  title: 'Tidy notes',
  description: 'Rewrites notes one fact a line.',
  tags: ['notes'],
  examples: ['tidy my notes'],
  body: '# Tidy\n\nOne fact a line.',
};

test('a skill named with its folder is listed on its agent as written, found, with where the repository has it — and has no page and no pick', async () => {
  const SITE = path.join(repo, 'apps', 'site', '.claude', 'skills');
  skill(SITE, 'lay-out', '---\ndescription: Lays a page out.\n---\nLay it out.\n');
  fs.writeFileSync(
    path.join(root, 'workflows', 'agents', 'typer.md'),
    '---\ndescription: Sets type.\nskills: review, apps/site:lay-out, apps/site:no-such\n---\nSet.\n',
  );
  try {
    const typer = (await (await app.request('/api/agents/yours/typer')).json()) as import('./agents.ts').AgentListing;
    assert.deepEqual(
      typer.given.map((g) => [g.name, g.from, g.foundIn, g.entry?.description ?? null]),
      [
        ['review', 'repo', null, 'Reviews a change.'],
        ['apps/site:lay-out', null, 'apps/site/.claude/skills/lay-out', 'Lays a page out.'],
        ['apps/site:no-such', null, null, null],
      ],
    );
    assert.equal(typer.given[1].error, null);
    assert.ok(typer.given[2].error?.includes('holds no SKILL.md'), `one its folder has not keeps the refusal: ${typer.given[2].error}`);
    assert.deepEqual(
      (await listed()).flatMap((place) => place.skills.filter((row) => row.name.includes(':')).map((row) => row.name)),
      [],
      'the picker lists none of them',
    );
    for (const name of ['apps%2Fsite:lay-out', 'site:lay-out']) {
      const res = await app.request(`/api/skills/repo/${name}`);
      const body = (await res.json()) as { error: string };
      assert.equal(res.status, 400, body.error);
    }
  } finally {
    fs.rmSync(path.join(root, 'workflows', 'agents', 'typer.md'));
    fs.rmSync(path.join(repo, 'apps'), { recursive: true });
  }
});

test('REFUSED: where a skill was found is said for none the board pages, nor the repository itself, nor a folder outside it', () => {
  assert.equal(foundInOf(path.join(repo, 'apps', 'site', '.claude', 'skills', 'lay-out'), repo, root), 'apps/site/.claude/skills/lay-out');
  assert.equal(foundInOf(path.join(LIBRARY, 'mine'), repo, root), null, 'yours has a page');
  assert.equal(foundInOf(path.join(THEIRS, 'review'), repo, root), null, "the repository's has a page");
  assert.equal(foundInOf(path.join(repo, 'workflows', 'skills', 'beside'), repo, root), null, 'and the one beside its agents');
  assert.equal(foundInOf(repo, repo, root), null, 'the repository itself');
  assert.equal(
    foundInOf(`${repo}-twin/apps/site/.claude/skills/lay-out`, repo, root),
    null,
    "a sibling whose name starts with the repository's",
  );
  assert.equal(foundInOf(path.join(path.dirname(repo), 'lay-out'), repo, root), null, 'a folder outside it');
});

test("a skill's page names every agent that gives it where the repository's two places for skills are one folder", async () => {
  const team = path.join(repo, 'workflows', 'skills');
  skill(team, 'joined', '---\ndescription: One folder under both.\n---\nJoined.\n');
  fs.symlinkSync('../../workflows/skills/joined', path.join(THEIRS, 'joined'));
  fs.mkdirSync(path.join(repo, 'workflows', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'workflows', 'agents', 'joiner.md'), '---\ndescription: Joins.\nskills: joined\n---\nJoin.\n');
  fs.writeFileSync(path.join(root, 'workflows', 'agents', 'mine-too.md'), '---\ndescription: Joins too.\nskills: joined\n---\nJoin.\n');
  try {
    assert.deepEqual((await detail('repo', 'joined')).users, [
      { from: 'repo', name: 'joiner' },
      { from: 'yours', name: 'mine-too' },
    ]);
  } finally {
    fs.rmSync(path.join(root, 'workflows', 'agents', 'mine-too.md'));
    fs.rmSync(path.join(repo, 'workflows', 'agents'), { recursive: true });
    fs.rmSync(path.join(THEIRS, 'joined'));
    fs.rmSync(path.join(team, 'joined'), { recursive: true });
  }
});

test("a skill's page says what it says, what it costs a turn, the agents of either place that give this very folder, and how to move it", async () => {
  fs.mkdirSync(path.join(repo, 'workflows', 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 'workflows', 'agents', 'theirs.md'),
    "---\ndescription: The repository's.\nskills: mine, shared\n---\nWork.\n",
  );
  try {
    const mine = await detail('yours', 'mine');
    assert.deepEqual(mine.draft, {
      name: 'mine',
      title: null,
      description: 'Writes a decision.',
      tags: ['decision'],
      examples: null,
      preload: false,
      body: '# Mine\n\nWrite it down.',
    });
    assert.match(mine.version, /^[0-9a-f]{16}$/);
    assert.deepEqual(mine.users, [
      { from: 'repo', name: 'theirs' },
      { from: 'yours', name: 'clerk' },
      { from: 'yours', name: 'scribe' },
    ]);
    assert.deepEqual(mine.skill.cost, skillTurnCost('mine', fs.readFileSync(path.join(LIBRARY, 'mine', 'SKILL.md'), 'utf8')));
    assert.equal(mine.copyHint, `mkdir -p '${THEIRS}' && cp -r '${path.join(LIBRARY, 'mine')}' '${THEIRS}/'`);
    assert.deepEqual(
      (await detail('yours', 'shared')).users,
      [{ from: 'yours', name: 'scribe' }],
      '`shared` is in both places: an agent of yours finds yours',
    );
    const theirs = await detail('repo', 'shared');
    assert.deepEqual(theirs.users, [{ from: 'repo', name: 'theirs' }], "and the repository's agent finds its own first");
    assert.equal(theirs.copyHint, `mkdir -p '${LIBRARY}' && cp -r '${path.join(THEIRS, 'shared')}' '${LIBRARY}/'`);
    const broken = await detail('repo', 'scratch');
    assert.equal(broken.draft, null);
    assert.equal(broken.body, '# Scratch\n\nNo frontmatter.');
    assert.match(broken.skill.error ?? '', /has no frontmatter/);
    assert.equal(
      (await skillDetail(engine(), shippedGitPlace, 'shipped', toCopy, repo, root, TEAM_SKILLS))?.copyHint,
      null,
      'a shipped skill is copied with the board, not by hand',
    );
  } finally {
    fs.rmSync(path.join(repo, 'workflows', 'agents'), { recursive: true });
  }
  assert.equal((await app.request('/api/skills/yours/no-such')).status, 404);
  assert.equal((await app.request('/api/skills/yours/Bad_Name')).status, 400);
  assert.equal((await app.request('/api/skills/elsewhere/mine')).status, 400);
});

test('a skill written on the board is made in your library, read back as its page reads it, and listed', async () => {
  const res = await send('/api/skills/yours', { skill: NOTES });
  const made = (await res.json()) as SkillSaved;
  assert.equal(res.status, 201, JSON.stringify(made));
  assert.deepEqual(made.written, ['SKILL.md']);
  assert.deepEqual(made.draft, { ...NOTES, preload: false });
  assert.equal(made.skill.dir, path.join(LIBRARY, 'tidy-notes'));
  assert.deepEqual(made.skill.entry, {
    id: 'tidy-notes',
    name: 'Tidy notes',
    description: NOTES.description,
    tags: ['notes'],
    examples: ['tidy my notes'],
  });
  assert.equal(
    fs.readFileSync(path.join(LIBRARY, 'tidy-notes', 'SKILL.md'), 'utf8'),
    '---\nname: tidy-notes\ntitle: "Tidy notes"\ndescription: "Rewrites notes one fact a line."\ntags: ["notes"]\nexamples: ["tidy my notes"]\n---\n# Tidy\n\nOne fact a line.\n',
  );
  assert.ok(rowOf(await listed(), 'yours', 'tidy-notes'));
});

test('a change of a skill moves the version of every agent that gives it, and the preload switch alone does too', async () => {
  const before = { scribe: await agentVersionOf('scribe'), clerk: await agentVersionOf('clerk') };
  const { version } = await detail('yours', 'mine');
  const res = await put('/api/skills/yours/mine', {
    version,
    skill: { name: 'mine', description: 'Writes a decision down.', tags: ['decision'], body: 'Write it down, dated.' },
  });
  const changed = (await res.json()) as SkillSaved;
  assert.equal(res.status, 200, JSON.stringify(changed));
  assert.equal(changed.draft!.description, 'Writes a decision down.');
  assert.notEqual(changed.version, version);
  const after = { scribe: await agentVersionOf('scribe'), clerk: await agentVersionOf('clerk') };
  assert.notEqual(after.scribe, before.scribe);
  assert.notEqual(after.clerk, before.clerk);
  const on = await put('/api/skills/yours/mine', { version: changed.version, preload: true });
  const switched = (await on.json()) as SkillSaved;
  assert.equal(on.status, 200, JSON.stringify(switched));
  assert.equal(switched.skill.preload, true);
  assert.equal(switched.skill.cost!.perTurn, switched.skill.cost!.listed + switched.skill.cost!.body);
  assert.notEqual(await agentVersionOf('clerk'), after.clerk);
  const off = await put('/api/skills/yours/mine', { version: switched.version, preload: false });
  assert.equal(off.status, 200);
  assert.equal(
    fs.readFileSync(path.join(LIBRARY, 'mine', 'SKILL.md'), 'utf8'),
    '---\nname: mine\ndescription: "Writes a decision down."\ntags: ["decision"]\n---\nWrite it down, dated.\n',
  );
});

test('REFUSED at shipped defaults: a name that is not a folder-safe id, a clash with a skill of your library, a frontmatter the card reader refuses', async () => {
  await refused(send('/api/skills/yours', { skill: { ...NOTES, name: '../agents' } }), 422, /^`\.\.\/agents` is not a skill's name/);
  await refused(send('/api/skills/yours', { skill: { ...NOTES, name: 'Tidy Notes' } }), 422, /^`Tidy Notes` is not a skill's name/);
  await refused(
    send('/api/skills/yours', { skill: { ...NOTES, name: 'mine' } }),
    409,
    /^skills\/mine is there already, in .*, and a new skill would write over it\. Give it another name/,
  );
  await refused(
    send('/api/skills/yours', { skill: { ...NOTES, name: 'fresh', description: '' } }),
    422,
    /has no `description:`, and the A2A protocol marks a skill's description REQUIRED/,
  );
  await refused(send('/api/skills/yours', { skill: { ...NOTES, name: 'fresh', tags: [] } }), 422, /`tags` is an empty list/);
  await refused(
    send('/api/skills/yours', { skill: { ...NOTES, name: 'fresh', description: 'one\npreload: true' } }),
    422,
    /`description` holds a line break/,
  );
  assert.equal(fs.existsSync(path.join(LIBRARY, 'fresh')), false);
});

test('REFUSED at shipped defaults: a change at a version the skill has moved on from, of a skill not there, or under another name', async () => {
  const { version } = await detail('yours', 'always');
  fs.appendFileSync(path.join(LIBRARY, 'always', 'SKILL.md'), 'Edited by hand.\n');
  await refused(put('/api/skills/yours/always', { version, preload: false }), 409, /^skills\/always changed since it was read \(version /);
  await refused(put('/api/skills/yours/gone', { version, preload: false }), 404, /^skills\/gone is not in .*: it was removed/);
  const now = (await detail('yours', 'always')).version;
  await refused(
    put('/api/skills/yours/always', { version: now, skill: { ...NOTES, name: 'renamed' } }),
    400,
    /the skill is named always, and this request's is "renamed"/,
  );
  await refused(
    put('/api/skills/yours/always', { version: now, skill: { ...NOTES, name: 'always', examples: [] } }),
    422,
    /`examples` is an empty list/,
  );
  await refused(
    put('/api/skills/yours/always', { version: now }),
    400,
    /takes one of `skill` .* and `preload` .* and this request sent neither/,
  );
  await refused(put('/api/skills/yours/always', { version: now, preload: true, skill: NOTES }), 400, /this request sent both/);
  await refused(put('/api/skills/yours/always', { preload: true }), 400, /takes the `version` the skill was read at/);
  await refused(put('/api/skills/yours/always', { version: now, preload: 'yes' }), 400, /`preload` is true or false/);
  await refused(
    send('/api/skills/yours', { copy: toCopy, skill: NOTES }),
    400,
    /takes one of `copy` .* and `skill` .* and this request sent both/,
  );
  await refused(
    send('/api/skills/yours', { skill: { ...NOTES, name: 'fresh', tags: 'notes' } }),
    400,
    /`tags` is a list of lines of text, or null/,
  );
  await refused(send('/api/skills/yours', { skill: { ...NOTES, name: 'fresh', color: 'red' } }), 400, /`color` is no key of a skill's/);
});

test("REFUSED at shipped defaults: each key of a skill sent as the wrong type is a 400 in the api's words, word for word, a key no skill has only once the rest are read — and a body sending both or neither is refused as such before either is read", async () => {
  const route = 'POST /api/skills/yours';
  const shape =
    '`{ "copy": "<the name of a skill Nemia ships>" }`, or `{ "skill": { "name": "<a-name>", "title": "<a title, or null>", "description": "<what it does, one line>", "tags": ["<a word>"] or null, "examples": ["<what a person would ask>"] or null, "preload": true or false, "body": "<its instructions>" } }`';
  const fresh = { ...NOTES, name: 'fresh' };
  for (const [skill, said] of [
    [null, "`skill` is the skill, an object, and this request's was null"],
    ['notes', '`skill` is the skill, an object, and this request\'s was "notes"'],
    [{ ...fresh, name: 3 }, "`name` is the skill's name, its folder, a string, and this request's was 3"],
    [{ ...fresh, name: 3, color: 'red' }, "`name` is the skill's name, its folder, a string, and this request's was 3"],
    [{ ...fresh, title: 3 }, '`title` is a line of text, or null'],
    [{ ...fresh, description: ['one'] }, '`description` is a line of text, or null'],
    [{ ...fresh, tags: [1] }, '`tags` is a list of lines of text, or null'],
    [{ ...fresh, examples: 'ask' }, '`examples` is a list of lines of text, or null'],
    [{ ...fresh, preload: 'yes' }, '`preload` is true or false'],
    [{ ...fresh, preload: null }, '`preload` is true or false'],
    [{ ...fresh, body: 7 }, "`body` is the skill's instructions, a string, and this request's was 7"],
    [{ ...fresh, color: 'red', size: 2 }, "`color` and `size` are no key of a skill's"],
  ] as const) {
    const res = await send('/api/skills/yours', { skill });
    const { error } = (await res.json()) as { error: string };
    assert.equal(res.status, 400, JSON.stringify(skill));
    assert.equal(error, `${route}: ${said}. Send ${shape}.`);
  }
  await refused(send('/api/skills/yours', null), 400, /^POST \/api\/skills\/yours takes a JSON object: /);
  await refused(send('/api/skills/yours', { copy: 3, skill: fresh }), 400, /this request sent both/);
  await refused(send('/api/skills/yours', { skill: 'notes', copy: 3 }), 400, /this request sent both/);
  const { version } = await detail('yours', 'always');
  await refused(
    put('/api/skills/yours/always', { version: 7, preload: true, skill: fresh }),
    400,
    /takes the `version` the skill was read at/,
  );
  await refused(put('/api/skills/yours/always', { version, preload: 'yes', skill: 3 }), 400, /this request sent both/);
  await refused(
    put('/api/skills/yours/always', { version, skill: { ...NOTES, name: 'always', tags: [1] } }),
    400,
    /`tags` is a list of lines/,
  );
  await refused(put('/api/skills/yours/always', { version: ' ', preload: true }), 409, /^skills\/always changed since it was read/);
  assert.equal(fs.existsSync(path.join(LIBRARY, 'fresh')), false);
});

test("a skill's copy command, run as the page gives it, puts the folder under its name where the skills folder is not there yet, in a checkout whose path has a space and a quote", async () => {
  const checkout = path.join(scratch('nemia-api-skills-copy-'), "Jo's work", 'repo');
  fs.mkdirSync(path.join(checkout, '.claude'), { recursive: true });
  const into = path.join(checkout, '.claude', 'skills');
  const run = () => execFileSync('sh', ['-c', skillCopyCommand(path.join(LIBRARY, 'mine'), into)], { stdio: ['ignore', 'pipe', 'pipe'] });
  run();
  assert.deepEqual(fs.readdirSync(into), ['mine'], 'the folder is copied under its name, not spilled into skills/');
  assert.equal(
    fs.readFileSync(path.join(into, 'mine', 'SKILL.md'), 'utf8'),
    fs.readFileSync(path.join(LIBRARY, 'mine', 'SKILL.md'), 'utf8'),
  );
  run();
  assert.deepEqual(fs.readdirSync(path.join(into, 'mine')), ['SKILL.md'], 'copied again, it lands on the same folder, not inside it');
});

test("REFUSED at shipped defaults: a write of the repository's skills, naming the copy to make by hand", async () => {
  const theirs = snapshotOf(THEIRS);
  await refused(
    send('/api/skills/repo', { skill: NOTES }),
    403,
    /^POST \/api\/skills\/repo refuses to write the repository's skills .* `mkdir -p '.*' && cp -r '.*\/<name>' '/,
  );
  const hint = `\`mkdir -p '${THEIRS}' && cp -r '${path.join(LIBRARY, 'review')}' '${THEIRS}/'\``;
  const res = await put('/api/skills/repo/review', { version: 'x', preload: true });
  assert.equal(res.status, 403);
  const { error } = (await res.json()) as { error: string };
  assert.ok(error.startsWith("PUT /api/skills/repo/review refuses to write the repository's skills ") && error.includes(hint), error);
  await refused(put('/api/skills/shipped/review', { version: 'x', preload: true }), 400, /the board changes a skill of your library/);
  assert.deepEqual(snapshotOf(THEIRS), theirs, 'nothing is written into the checkout');
});

function snapshotOf(dir: string): Record<string, string> {
  return Object.fromEntries(
    (fs.readdirSync(dir, { recursive: true }) as string[])
      .sort()
      .filter((f) => fs.statSync(path.join(dir, f)).isFile())
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]),
  );
}
