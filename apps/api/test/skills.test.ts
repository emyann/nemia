/**
 * The board's skill picker (skills.ts): the skills an agent of yours can be given, by place, in the order a start finds a name, what HKB ships
 * beside them, and one shipped skill copied into your library — in a scratch store and a scratch repository. The copy is read back from disk,
 * and every refusal is made to refuse, asserted on its words, with the library as it was.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { skillTurnCost } from 'agent-orchestrator/workflow';
import { scratch } from './scratch.ts';

// agent-orchestrator locates its store when the module loads, so point it at a scratch directory first.
const root = scratch('hkb-api-skills-');
process.env.WF_ROOT = root;
const repo = scratch('hkb-api-skills-repo-');
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });

const { app } = await import('../src/app.ts');
type SkillPlace = import('../src/skills.ts').SkillPlace;
type SkillRow = import('../src/skills.ts').SkillRow;
type SkillAdded = import('../src/skills.ts').SkillAdded;

// What HKB ships: the checkout these tests run in, which is the api's own (HOME_REPO). Read, never written.
const SHIPPED = path.join(import.meta.dirname, '..', '..', '..', 'workflows', 'skills');
const shipped = fs.readdirSync(SHIPPED).filter((name) => fs.existsSync(path.join(SHIPPED, name, 'SKILL.md'))).sort();
const [inLibrary, inRepo, toCopy] = shipped as [string, string, string];
const LIBRARY = path.join(root, 'workflows', 'skills');
const THEIRS = path.join(repo, '.claude', 'skills');

function skill(dir: string, name: string, text: string): void {
  fs.mkdirSync(path.join(dir, name), { recursive: true });
  fs.writeFileSync(path.join(dir, name, 'SKILL.md'), text);
}

// The repository's `.claude/skills` is written first and your library after, so neither the order on disk nor the order of the names
// puts your library first: only the lookup does.
skill(THEIRS, 'shared', '---\ndescription: The repository\'s.\n---\nTheirs.\n');
skill(THEIRS, 'review', '---\nname: code-review\ndescription: Reviews a change.\n---\nReview it.\n');
skill(THEIRS, 'scratch', '# Scratch\n\nNo frontmatter.\n');
skill(THEIRS, inRepo, '---\ndescription: The repository\'s own of a shipped name.\n---\nTheirs.\n');
skill(path.join(repo, 'workflows', 'skills'), 'beside', '---\ndescription: Beside the repository\'s agents.\n---\nNot for yours.\n');
skill(LIBRARY, 'shared', '---\ndescription: Mine.\n---\nMine.\n');
skill(LIBRARY, 'mine', '---\ndescription: "Writes a decision."\ntags: ["decision"]\n---\n# Mine\n\nWrite it down.\n');
skill(LIBRARY, 'always', '---\ndescription: Asks when it reads two ways.\npreload: true\n---\nAsk before you guess, every time.\n');
fs.cpSync(path.join(SHIPPED, inLibrary), path.join(LIBRARY, inLibrary), { recursive: true });
fs.mkdirSync(path.join(root, 'workflows', 'agents'), { recursive: true });
fs.writeFileSync(path.join(root, 'workflows', 'agents', 'scribe.md'), '---\ndescription: Writes notes.\nskills: mine, shared, review\ntools: Read, Skill\n---\nWrite.\n');
fs.writeFileSync(path.join(root, 'workflows', 'agents', 'clerk.md'), '---\ndescription: Files notes.\nskills: mine\n---\nFile.\n');
fs.writeFileSync(path.join(root, 'workflows', 'agents', 'broken.md'), '---\nskills: shared\ncheck: npm test\n---\nNope.\n');

const json = { 'content-type': 'application/json' };
const send = (url: string, body: unknown, headers: Record<string, string> = json) =>
  app.request(url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** Every file of the library, by its path in it, with what it holds. */
const snapshot = (): Record<string, string> => Object.fromEntries((fs.readdirSync(LIBRARY, { recursive: true }) as string[]).sort()
  .filter((f) => fs.statSync(path.join(LIBRARY, f)).isFile()).map((f) => [f, fs.readFileSync(path.join(LIBRARY, f), 'utf8')]));

async function refused(res: Promise<Response>, status: number, pattern: RegExp): Promise<void> {
  const before = snapshot();
  const answer = await res;
  const body = (await answer.json()) as { error: string };
  assert.equal(answer.status, status, body.error);
  assert.match(body.error, pattern);
  assert.deepEqual(snapshot(), before, 'a refused copy leaves the library as it was');
  assert.deepEqual(fs.readdirSync(LIBRARY).filter((n) => n.startsWith('.')), [], 'with no half-copied folder in it');
}

async function listed(): Promise<SkillPlace[]> {
  const res = await app.request('/api/skills');
  assert.equal(res.status, 200);
  return (await res.json()) as SkillPlace[];
}

const rowOf = (places: SkillPlace[], from: string, name: string): SkillRow | undefined => places.find((p) => p.from === from)?.skills.find((s) => s.name === name);

test('the skills are listed by place — yours, the repository\'s, then what HKB ships — each name where an agent of yours finds it', async () => {
  const places = await listed();
  assert.deepEqual(places.map((p) => [p.from, p.dir]), [['yours', LIBRARY], ['repo', THEIRS], ['shipped', SHIPPED]]);
  assert.deepEqual(places[0]!.skills.map((s) => s.name), ['always', inLibrary, 'mine', 'shared'].sort());
  assert.deepEqual(places[1]!.skills.map((s) => s.name), [inRepo, 'review', 'scratch'].sort(), 'the name in both is in yours alone');
  assert.deepEqual(places[2]!.skills.map((s) => s.name), shipped);
  assert.equal(rowOf(places, 'yours', 'shared')!.entry?.description, 'Mine.', 'your library wins a name the repository has too');
  assert.equal(rowOf(places, 'yours', 'shared')!.dir, path.join(LIBRARY, 'shared'));
  assert.ok(!places.some((p) => p.skills.some((s) => s.name === 'beside')), "the repository's workflows/skills is no place an agent of yours looks");
});

test('a skill is listed with its card entry, whether it is loaded every turn, what it costs a turn, and the agents of yours that give it', async () => {
  const places = await listed();
  const mine = rowOf(places, 'yours', 'mine')!;
  assert.deepEqual(mine.entry, { id: 'mine', name: 'mine', description: 'Writes a decision.', tags: ['decision'] });
  assert.equal(mine.error, null);
  assert.equal(mine.preload, false);
  assert.deepEqual(mine.cost, skillTurnCost('mine', fs.readFileSync(path.join(LIBRARY, 'mine', 'SKILL.md'), 'utf8')));
  assert.equal(mine.cost!.perTurn, mine.cost!.listed, 'named, it costs its listing');
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
  const outside = scratch('hkb-api-skills-outside-');
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

test('a shipped skill says where an agent of yours already finds its name: in your library, in the repository, or nowhere yet', async () => {
  const places = await listed();
  assert.equal(rowOf(places, 'shipped', inLibrary)!.found, 'yours');
  assert.equal(rowOf(places, 'shipped', inRepo)!.found, 'repo');
  assert.equal(rowOf(places, 'shipped', toCopy)!.found, null);
  assert.equal(rowOf(places, 'shipped', toCopy)!.error, null, 'every shipped skill reads');
  assert.ok(places[2]!.skills.every((s) => s.usedBy.length === 0), 'no agent of yours is given a skill from where HKB ships it');
});

test('a shipped skill is copied into your library, byte for byte, and listed there at once', async () => {
  const res = await send('/api/skills/yours', { copy: toCopy });
  const body = (await res.json()) as SkillAdded;
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.equal(body.skill.from, 'yours');
  assert.equal(body.skill.dir, path.join(LIBRARY, toCopy));
  assert.ok(body.written.includes('SKILL.md'));
  for (const file of body.written) {
    assert.equal(fs.readFileSync(path.join(LIBRARY, toCopy, file), 'utf8'), fs.readFileSync(path.join(SHIPPED, toCopy, file), 'utf8'), file);
  }
  const places = await listed();
  assert.ok(rowOf(places, 'yours', toCopy), 'in your library');
  assert.equal(rowOf(places, 'shipped', toCopy)!.found, 'yours', 'and the shipped row says so');
  await refused(send('/api/skills/yours', { copy: toCopy }), 409, new RegExp(`^skills/${toCopy} is there already, in .*, and a copy would write over it\\.`));
});

test('REFUSED at shipped defaults: a skill HKB does not ship, a name that is not a skill\'s, and a body that names none', async () => {
  await refused(send('/api/skills/yours', { copy: 'no-such-skill' }), 404, /has no skill named no-such-skill: a skill is a folder holding a SKILL\.md/);
  await refused(send('/api/skills/yours', { copy: '../agents' }), 422, /^`\.\.\/agents` is not a skill's name/);
  await refused(send('/api/skills/yours', { copy: 'Bad_Name' }), 422, /^`Bad_Name` is not a skill's name/);
  await refused(send('/api/skills/yours', { copy: 7 }), 400, /`copy` is the name of the skill HKB ships to copy, a string/);
  await refused(send('/api/skills/yours', [toCopy]), 400, /`copy` is the name of the skill HKB ships to copy/);
  await refused(send('/api/skills/yours', '{'), 400, /takes a JSON body/);
});

test("REFUSED at shipped defaults: a copy into the repository's skills, or anywhere but yours, and nothing is written into the checkout", async () => {
  const theirs = fs.readdirSync(THEIRS).sort();
  await refused(send('/api/skills/repo', { copy: toCopy }), 403, /^POST \/api\/skills\/repo refuses to write the repository's skills/);
  await refused(send('/api/skills/elsewhere', { copy: toCopy }), 400, /the board copies a skill into your library, at \/api\/skills\/yours/);
  assert.deepEqual(fs.readdirSync(THEIRS).sort(), theirs);
});

test('REFUSED at shipped defaults: a copy is guarded as every write of the board is — another site, another host, another content type', async () => {
  const other = shipped.find((name) => ![inLibrary, inRepo, toCopy].includes(name))!;
  await refused(send('/api/skills/yours', { copy: other }, { ...json, 'sec-fetch-site': 'cross-site' }), 403, /^POST \/api\/skills\/yours refuses a request made by a page on another site/);
  await refused(send('/api/skills/yours', { copy: other }, { ...json, host: 'evil.example' }), 403, /refuses a request addressed to evil\.example/);
  await refused(send('/api/skills/yours', { copy: other }, { 'content-type': 'text/plain' }), 415, /takes its body as `content-type: application\/json`/);
  assert.equal(fs.existsSync(path.join(LIBRARY, other)), false);
});

test('an agent is listed with each skill it gives, where it is found and what it costs, and one no place has with why', async () => {
  fs.writeFileSync(path.join(root, 'workflows', 'agents', 'lost.md'), '---\ndescription: Lost.\nskills: always, gone\n---\nLook.\n');
  try {
    const res = await app.request('/api/agents/yours/scribe');
    const scribe = (await res.json()) as import('../src/agents.ts').AgentListing;
    assert.deepEqual(scribe.given.map((g) => [g.name, g.from, g.entry?.description ?? g.error]), [
      ['mine', 'yours', 'Writes a decision.'],
      ['shared', 'yours', 'Mine.'],
      ['review', 'repo', 'Reviews a change.'],
    ]);
    const lost = (await (await app.request('/api/agents/yours/lost')).json()) as import('../src/agents.ts').AgentListing;
    assert.equal(lost.given[0]!.preload, true);
    assert.equal(lost.given[0]!.cost!.perTurn, lost.given[0]!.cost!.listed + lost.given[0]!.cost!.body);
    assert.deepEqual([lost.given[1]!.from, lost.given[1]!.cost], [null, null]);
    assert.match(lost.given[1]!.error ?? '', /^No skills folder has `gone` — looked in /);
  } finally {
    fs.rmSync(path.join(root, 'workflows', 'agents', 'lost.md'));
  }
});
