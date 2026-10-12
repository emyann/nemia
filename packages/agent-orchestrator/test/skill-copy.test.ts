/**
 * A skill copied into a library (`copySkill`): what the board's skill picker does with a skill from another place, so an agent of yours
 * can give it. And what a skill costs a turn (`skillTurnCost`), which the picker shows beside each.
 *
 * The copy is held byte for byte against its source, the tests' team's skills (`team.ts`), and each refusal is made to refuse at shipped
 * defaults, asserted on its message, its kind, and with the library as it was. `WF_ROOT` is set before the modules are imported, since they
 * read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { skillNameRefusal, skillTurnCost, tokensAbout } from '../src/workflow.ts';
import { preloads, skillsFor } from '../src/skills/read.store.ts';
import { scratch } from './scratch.ts';
import { TEAM } from './team.ts';

const ROOT = scratch('wf-skill-copy-');
process.env.WF_ROOT = ROOT;
const { copySkill, isRefusal } = await import('../src/runner.ts');
type Refusal = import('../src/refusal/refusal.ts').Refusal;

const SHIPPED = path.join(TEAM, 'skills');
const LIBRARY = path.join(ROOT, 'workflows', 'skills');

/** Every file under `dir`, by its path in it, with what it holds. */
function snapshot(dir: string): Record<string, string> {
  if (!fs.existsSync(dir)) return {};
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

/** `fn` refused as the kind `tag`, whose message passes `said`, and the library as it was. */
function refuses(fn: () => unknown, tag: Refusal['_tag'], said: RegExp): void {
  const before = snapshot(LIBRARY);
  assert.throws(fn, (err: unknown) => {
    assert.ok(isRefusal(err), `a refusal, not ${String(err)}`);
    assert.equal(err._tag, tag, err.message);
    assert.match(err.message, said);
    return true;
  });
  assert.deepEqual(snapshot(LIBRARY), before, 'nothing is written on a refusal');
  assert.deepEqual(
    fs.existsSync(LIBRARY) ? fs.readdirSync(LIBRARY).filter((n) => n.startsWith('.')) : [],
    [],
    'and no half-copied folder is left',
  );
}

/** A folder of skills of the test's own, outside the library, holding `skills`: each a name and its SKILL.md. */
function source(skills: Record<string, string>): string {
  const dir = path.join(scratch('wf-skill-source-'), 'skills');
  for (const [name, text] of Object.entries(skills)) {
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.writeFileSync(path.join(dir, name, 'SKILL.md'), text);
  }
  return dir;
}

test('a skill is copied whole into the library, and the store finds it there', () => {
  fs.rmSync(LIBRARY, { recursive: true, force: true });
  const name = fs.readdirSync(SHIPPED).sort()[0];
  const copied = copySkill(SHIPPED, LIBRARY, name);
  assert.equal(copied.dir, path.join(LIBRARY, name));
  assert.deepEqual(snapshot(copied.dir), snapshot(path.join(SHIPPED, name)), 'byte for byte');
  assert.ok(copied.written.includes('SKILL.md'));
  assert.equal(
    skillsFor(path.join(ROOT, 'workflows', '_'), { home: ROOT }).at.get(name),
    path.join(LIBRARY, name),
    'an agent of the store is given it now',
  );
});

test('a copy is refused where the library has the name already, and the library is left as it was', () => {
  fs.rmSync(LIBRARY, { recursive: true, force: true });
  const name = fs.readdirSync(SHIPPED).sort()[0];
  fs.mkdirSync(path.join(LIBRARY, name), { recursive: true });
  fs.writeFileSync(path.join(LIBRARY, name, 'SKILL.md'), '---\ndescription: mine\n---\nMine.\n');
  refuses(
    () => copySkill(SHIPPED, LIBRARY, name),
    'Conflict',
    new RegExp(`^skills/${name} is there already, in ${LIBRARY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, and a copy would write over it\\.`),
  );
});

test("a copy is refused for a skill the source does not have, and for a name that is not a skill's", () => {
  fs.rmSync(LIBRARY, { recursive: true, force: true });
  refuses(
    () => copySkill(SHIPPED, LIBRARY, 'no-such-skill'),
    'Missing',
    /has no skill named no-such-skill: a skill is a folder holding a SKILL\.md/,
  );
  for (const bad of ['../agents', 'Review', 'a_b', '.hidden', '', 'x'.repeat(65)]) {
    refuses(
      () => copySkill(SHIPPED, LIBRARY, bad),
      'Invalid',
      /is not a skill's name: a skill is a folder in skills\/, named in lowercase words joined by dashes/,
    );
  }
  assert.equal(skillNameRefusal('write-a-note'), undefined, 'and a name that is one passes');
  assert.equal(skillNameRefusal('x'.repeat(64)), undefined, 'at 64 characters too');
});

test('a copy is refused for a skill whose SKILL.md does not read as a card entry: no agent could be given it', () => {
  fs.rmSync(LIBRARY, { recursive: true, force: true });
  const from = source({ bare: '# Bare\n\nNo frontmatter.\n', undescribed: '---\nname: undescribed\n---\nNothing said.\n' });
  refuses(() => copySkill(from, LIBRARY, 'bare'), 'Invalid', /SKILL\.md has no frontmatter/);
  refuses(() => copySkill(from, LIBRARY, 'undescribed'), 'Invalid', /SKILL\.md has no `description:`/);
});

test('a copy is refused for a skill holding a link, and for a skill that is one: a copy would follow it out of the skill', () => {
  fs.rmSync(LIBRARY, { recursive: true, force: true });
  const from = source({ linking: '---\ndescription: Links out.\n---\nBody.\n' });
  const outside = scratch('wf-skill-outside-');
  fs.writeFileSync(path.join(outside, 'secret.txt'), "not the skill's");
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(from, 'linking', 'notes.txt'));
  refuses(() => copySkill(from, LIBRARY, 'linking'), 'Invalid', /notes\.txt is a link/);
  fs.mkdirSync(path.join(outside, 'real'));
  fs.writeFileSync(path.join(outside, 'real', 'SKILL.md'), '---\ndescription: Real.\n---\nBody.\n');
  fs.symlinkSync(path.join(outside, 'real'), path.join(from, 'linked'));
  refuses(() => copySkill(from, LIBRARY, 'linked'), 'Invalid', /linked is a link/);
});

test("a copy is refused for a skill of a checkout's .claude/skills/ linked inside the checkout, which a start is given: a copy follows no link", () => {
  fs.rmSync(LIBRARY, { recursive: true, force: true });
  const repo = scratch('wf-skill-checkout-');
  fs.mkdirSync(path.join(repo, 'skills', 'x'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'skills', 'x', 'SKILL.md'), '---\ndescription: Linked inside.\n---\nBody.\n');
  fs.mkdirSync(path.join(repo, '.claude', 'skills'), { recursive: true });
  fs.symlinkSync('../../skills/x', path.join(repo, '.claude', 'skills', 'x'));
  assert.equal(skillsFor(path.join(repo, 'workflows', 'dev'), { repo }).at.get('x'), path.join(repo, '.claude', 'skills', 'x'));
  refuses(() => copySkill(path.join(repo, '.claude', 'skills'), LIBRARY, 'x'), 'Invalid', /x is a link/);
});

test('a copy is refused into a folder that is not a skills/ the board lists, unless anywhere', () => {
  const elsewhere = path.join(scratch('wf-skill-elsewhere-'), 'skills');
  const name = fs.readdirSync(SHIPPED).sort()[0];
  assert.throws(
    () => copySkill(SHIPPED, elsewhere, name),
    (err: unknown) => isRefusal(err) && err._tag === 'Invalid' && /is not the store's skills\/ .* nor a repository's/.test(err.message),
  );
  assert.equal(fs.existsSync(elsewhere), false, 'nothing is made there');
  assert.throws(
    () => copySkill(SHIPPED, path.join(ROOT, 'workflows', 'agents'), name),
    (err: unknown) => isRefusal(err) && err._tag === 'Invalid' && /is not a folder of skills/.test(err.message),
  );
  assert.equal(copySkill(SHIPPED, elsewhere, name, { anywhere: true }).dir, path.join(elsewhere, name), 'written with anywhere');
});

test('a skill costs a turn its listing, and its body too when it is preloaded', () => {
  const named = skillTurnCost(
    'write-a-note',
    '---\nname: write-a-note\ndescription: "Writes a note."\n---\n# Write\n\nA body of some length.\n',
  );
  assert.equal(named.preload, false);
  assert.equal(named.listed, tokensAbout('write-a-note: Writes a note.'), 'the listing is its name and description, quotes read off');
  assert.equal(named.body, tokensAbout('# Write\n\nA body of some length.'));
  assert.equal(named.perTurn, named.listed, 'named, a turn carries its listing alone');
  const preloaded = skillTurnCost('ask', '---\ndescription: Asks.\npreload: true\n---\nThe whole body, every turn.\n');
  assert.equal(preloaded.preload, true);
  assert.equal(preloaded.perTurn, preloaded.listed + preloaded.body, 'preloaded, a turn carries its body too');
  assert.equal(skillTurnCost('bare', '# Bare\n').preload, false, 'no frontmatter is no preload, and no refusal');
  assert.equal(
    skillTurnCost('open', '---\ndescription: never closed\n').body,
    tokensAbout('---\ndescription: never closed\n'),
    'a frontmatter that never closes is costed as its text',
  );
  for (const name of fs.readdirSync(SHIPPED)) {
    assert.equal(
      skillTurnCost(name, fs.readFileSync(path.join(SHIPPED, name, 'SKILL.md'), 'utf8')).preload,
      preloads(path.join(SHIPPED, name)),
      `${name}: every skill of the team is read the same way the render reads it`,
    );
  }
});
