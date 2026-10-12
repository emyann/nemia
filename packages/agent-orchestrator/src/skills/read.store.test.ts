/**
 * The one rule for a link in a skill's folder (`skillFiles`): a skill of a checkout's `.claude/skills/` is read through a link whose
 * real target stays inside the checkout's folder, and refused by name where it leaves; the store's library and a team's own folder
 * refuse every link. Held where every reader asks it: what a start is given (`skillsFor`), the refusal (`skillLinkRefusal`), the
 * version (`skillVersion`) and the copy as files (`copySkillFiles`). Each refusal is made to refuse, on its exact words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { WorkflowError } from '../step/step.ts';
import { copySkillFiles, skillFiles, skillLinkRefusal, skillsFor, skillVersion } from './read.store.ts';

const SKILL = '---\nname: x\ndescription: Do the thing.\n---\nDo it.\n';

/** The words a link that leaves is refused in, after its name. */
const LEAVES = ' is a link, and what it points at is outside the folder of skills: make it a folder of its own.';

/** The files `files`, each by its path under `dir`, written with its text; `dir`. */
function written(dir: string, files: Record<string, string>): string {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

/** A link at `at` to `to`, its folder made first; `at`. */
function linked(to: string, at: string): string {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(to, at);
  return at;
}

/** A checkout holding the real skill `skills/x`, with `notes.md` beside its SKILL.md, a workflow folder and an empty `.claude/skills/`. */
function checkout(): string {
  const repo = scratch('wf-skill-links-');
  written(repo, { 'skills/x/SKILL.md': SKILL, 'skills/x/notes.md': 'Notes.\n' });
  fs.mkdirSync(path.join(repo, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'workflows', 'dev'), { recursive: true });
  return repo;
}

/** The skill `name` of the repository `repo`'s `.claude/skills/`. */
const given = (repo: string, name = 'x'): string => path.join(repo, '.claude', 'skills', name);

/** What a start of `repo`'s workflow `dev` finds under `name`. */
const found = (repo: string, name = 'x', home?: string) =>
  skillsFor(path.join(repo, 'workflows', 'dev'), { repo, ...(home ? { home } : {}) }).at.get(name);

/** The refusal `at` is, by its message; a failed assertion for a skill that is found. */
function refusalOf(at: string | WorkflowError | undefined): string {
  assert.ok(at instanceof WorkflowError, `refused, not ${String(at)}`);
  return at.message;
}

/** Every entry under `dir` that is a link, by its path in it. */
const linksUnder = (dir: string): string[] =>
  (fs.readdirSync(dir, { recursive: true }) as string[]).filter((entry) => fs.lstatSync(path.join(dir, entry)).isSymbolicLink());

test('given: a skill of .claude/skills/ linked to a folder inside the checkout, each file read from its real file', () => {
  const repo = checkout();
  linked('../../skills/x', given(repo));
  assert.equal(found(repo), given(repo));
  assert.equal(skillLinkRefusal(given(repo)), undefined);
  const real = fs.realpathSync(path.join(repo, 'skills', 'x'));
  assert.deepEqual(skillFiles(given(repo)), [
    { path: 'SKILL.md', real: path.join(real, 'SKILL.md') },
    { path: 'notes.md', real: path.join(real, 'notes.md') },
  ]);
});

test('given: a real folder whose SKILL.md alone is a link inside, and one holding a linked folder inside, walked as the folder it is', () => {
  const repo = checkout();
  linked(path.join(repo, 'skills', 'x', 'SKILL.md'), path.join(given(repo, 'own'), 'SKILL.md'));
  linked('../../../skills/x', path.join(given(repo, 'own'), 'more'));
  assert.equal(found(repo, 'own'), given(repo, 'own'));
  assert.deepEqual(
    skillFiles(given(repo, 'own')).map((file) => file.path),
    ['SKILL.md', 'more/SKILL.md', 'more/notes.md'],
  );
});

test('REFUSED by name: the folder linked outside the checkout, its SKILL.md linked outside, and a file under it linked outside', () => {
  const repo = checkout();
  const outside = written(scratch('wf-skill-links-outside-'), { 'x/SKILL.md': SKILL, 'secret.md': 'Not the skill.\n' });
  linked(path.join(outside, 'x'), given(repo));
  assert.equal(refusalOf(found(repo)), `x${LEAVES}`);
  assert.deepEqual(skillFiles(given(repo)), [{ path: '', refused: `x${LEAVES}` }], 'the walk stops at the link');

  linked(path.join(outside, 'x', 'SKILL.md'), path.join(given(repo, 'entry'), 'SKILL.md'));
  assert.equal(refusalOf(found(repo, 'entry')), `entry/SKILL.md${LEAVES}`);

  written(given(repo, 'holds'), { 'SKILL.md': SKILL });
  linked(path.join(outside, 'secret.md'), path.join(given(repo, 'holds'), 'notes.md'));
  assert.equal(refusalOf(found(repo, 'holds')), `holds/notes.md${LEAVES}`);
});

test('REFUSED by name: a folder linked inside the checkout that holds a link out', () => {
  const repo = checkout();
  const outside = written(scratch('wf-skill-links-outside-'), { 'secret.md': 'Not the skill.\n' });
  linked(path.join(outside, 'secret.md'), path.join(repo, 'skills', 'x', 'deep', 'far.md'));
  linked('../../skills/x', given(repo));
  assert.equal(refusalOf(found(repo)), `${path.join('x', 'deep', 'far.md')}${LEAVES}`);
});

test("REFUSED: a link to a sibling folder whose path starts with the checkout's", () => {
  const repo = checkout();
  const sibling = `${repo}-other`;
  try {
    written(sibling, { 'x/SKILL.md': SKILL });
    linked(path.join(sibling, 'x'), given(repo));
    assert.equal(refusalOf(found(repo)), `x${LEAVES}`);
  } finally {
    fs.rmSync(sibling, { recursive: true, force: true });
  }
});

test("REFUSED: every link of the store's library and of a team's own folder, one that points inside the checkout included", () => {
  const repo = checkout();
  const home = scratch('wf-skill-links-home-');
  const library = path.join(home, 'workflows', 'skills');
  linked(written(path.join(home, 'kept', 'y'), { 'SKILL.md': SKILL }), path.join(library, 'y'));
  written(path.join(library, 'tidy'), { 'SKILL.md': SKILL });
  linked(path.join(home, 'kept', 'y', 'SKILL.md'), path.join(library, 'tidy', 'notes.txt'));
  assert.equal(refusalOf(found(repo, 'y', home)), `y${LEAVES}`);
  assert.equal(refusalOf(found(repo, 'tidy', home)), `tidy/notes.txt${LEAVES}`);

  written(path.join(repo, 'workflows', 'skills', 'z'), { 'SKILL.md': SKILL });
  written(repo, { 'skills/ref.md': 'Inside the checkout.\n' });
  linked('../../../skills/ref.md', path.join(repo, 'workflows', 'skills', 'z', 'ref.md'));
  assert.equal(refusalOf(found(repo, 'z')), `z/ref.md${LEAVES}`);
});

test('REFUSED by name: a link whose target is not there, and a linked folder that points back into the skill; the walk ends', () => {
  const repo = checkout();
  written(given(repo), { 'SKILL.md': SKILL });
  linked('nowhere.md', path.join(given(repo), 'gone.md'));
  assert.equal(
    refusalOf(found(repo)),
    'x/gone.md is a link, and what it points at cannot be reached: point it at a file or a folder inside the repository, or remove it.',
  );
  fs.rmSync(path.join(given(repo), 'gone.md'));
  linked('.', path.join(given(repo), 'again'));
  assert.equal(
    refusalOf(found(repo)),
    "x/again is a link that points back at a folder it is in, and the skill's files would never end: remove it.",
  );
});

test("a linked skill's version moves when a file of the folder it points at does, and when a linked SKILL.md's content does", () => {
  const repo = checkout();
  linked('../../skills/x', given(repo));
  const before = skillVersion(given(repo));
  fs.writeFileSync(path.join(repo, 'skills', 'x', 'notes.md'), 'Other notes.\n');
  const after = skillVersion(given(repo));
  assert.notEqual(after, before, 'a file of the linked folder');

  linked(path.join(repo, 'skills', 'x', 'SKILL.md'), path.join(given(repo, 'own'), 'SKILL.md'));
  const entry = skillVersion(given(repo, 'own'));
  fs.writeFileSync(path.join(repo, 'skills', 'x', 'SKILL.md'), SKILL.replace('Do it.', 'Do it well.'));
  assert.notEqual(skillVersion(given(repo, 'own')), entry, 'the content behind a linked SKILL.md');
});

test('the version of a skill that holds no link is the digest of its sorted files, as it was', () => {
  const dir = written(path.join(scratch('wf-skill-links-plain-'), 'plain'), {
    'SKILL.md': SKILL,
    'a/b.md': 'B.\n',
    'a.md': 'A.\n',
    'Z.md': 'Z.\n',
  });
  const pairs = [
    ['SKILL.md', SKILL],
    ['Z.md', 'Z.\n'],
    ['a.md', 'A.\n'],
    ['a/b.md', 'B.\n'],
  ];
  assert.equal(skillVersion(dir), createHash('sha256').update(JSON.stringify(pairs)).digest('hex').slice(0, 16));
});

test('a skill is copied as regular files, each with its content and mode, and its copy has its version', () => {
  const repo = checkout();
  written(repo, { 'skills/x/bin/run.sh': '#!/bin/sh\n' });
  fs.chmodSync(path.join(repo, 'skills', 'x', 'bin', 'run.sh'), 0o755);
  linked('../../skills/x', given(repo));
  const to = path.join(scratch('wf-skill-links-copy-'), 'x');
  copySkillFiles(given(repo), to);
  assert.deepEqual(linksUnder(to), []);
  assert.equal(fs.lstatSync(to).isDirectory(), true);
  assert.equal(fs.readFileSync(path.join(to, 'SKILL.md'), 'utf8'), SKILL);
  assert.equal(fs.readFileSync(path.join(to, 'notes.md'), 'utf8'), 'Notes.\n');
  assert.equal(fs.statSync(path.join(to, 'bin', 'run.sh')).mode & 0o777, 0o755);
  assert.equal(skillVersion(to), skillVersion(given(repo)));
});

for (const [what, linkedAt] of [
  ["the repository's holder of its own skills", (repo: string) => path.join(repo, '.claude')],
  ["the repository's folder of skills", (repo: string) => path.join(repo, '.claude', 'skills')],
] as const) {
  test(`REFUSED: a skill that is a folder of its own where ${what} is a link out of the checkout, and nothing of it is copied`, () => {
    const repo = checkout();
    const outside = written(scratch('wf-skill-links-outside-'), { 'skills/x/SKILL.md': SKILL });
    fs.rmSync(path.join(repo, '.claude'), { recursive: true });
    if (linkedAt(repo).endsWith('skills')) fs.mkdirSync(path.join(repo, '.claude'));
    fs.symlinkSync(linkedAt(repo).endsWith('skills') ? path.join(outside, 'skills') : outside, linkedAt(repo));
    assert.equal(fs.lstatSync(given(repo)).isDirectory(), true, 'the skill folder itself is no link');
    const said = `x is in a folder of skills reached through a link, ${path.join(repo, '.claude', 'skills')} or the folder it is in, and what it points at is outside the repository: make it a folder of the repository's own.`;
    assert.equal(refusalOf(found(repo)), said);
    const to = path.join(scratch('wf-skill-links-copy-'), 'x');
    assert.throws(
      () => copySkillFiles(given(repo), to),
      (err: unknown) => err instanceof WorkflowError && err.message === said,
    );
    assert.equal(fs.existsSync(to), false);
  });
}

test("given: a skill that is a folder of its own where the repository's folder of skills is a link inside the checkout", () => {
  const repo = checkout();
  written(repo, { 'kept/skills/own/SKILL.md': SKILL });
  fs.rmSync(path.join(repo, '.claude', 'skills'), { recursive: true });
  fs.symlinkSync('../kept/skills', path.join(repo, '.claude', 'skills'));
  assert.equal(found(repo, 'own'), given(repo, 'own'));
});

test('REFUSED: a copy of a skill linked outside the checkout, and nothing is written', () => {
  const repo = checkout();
  const outside = written(scratch('wf-skill-links-outside-'), { 'secret.md': 'Not the skill.\n' });
  written(given(repo), { 'SKILL.md': SKILL });
  linked(path.join(outside, 'secret.md'), path.join(given(repo), 'notes.md'));
  const to = path.join(scratch('wf-skill-links-copy-'), 'x');
  assert.throws(
    () => copySkillFiles(given(repo), to),
    (err: unknown) => err instanceof WorkflowError && err.message === `x/notes.md${LEAVES}`,
  );
  assert.equal(fs.existsSync(to), false);
});

test("one folder under both of a repository's places, the root's a link to the team's own, is one skill, given from the team's", () => {
  const repo = checkout();
  written(path.join(repo, 'workflows', 'skills', 'x'), { 'SKILL.md': SKILL });
  linked('../../workflows/skills/x', given(repo));
  assert.equal(found(repo), path.join(repo, 'workflows', 'skills', 'x'));
});

test("REFUSED still: a name both of a repository's places have as two folders, the root's a link to another", () => {
  const repo = checkout();
  written(path.join(repo, 'workflows', 'skills', 'x'), { 'SKILL.md': SKILL });
  linked('../../skills/x', given(repo));
  const said = refusalOf(found(repo));
  assert.ok(said.startsWith(`x is a skill in both ${path.join(repo, 'workflows', 'skills', 'x')} and ${given(repo)}`), said);
  assert.ok(said.endsWith('Keep one of them.'), said);
});

/** A checkout (`checkout`) holding the nested skills `app:y` and `other:z` too. */
function nestedCheckout(): string {
  const repo = checkout();
  written(repo, {
    'app/.claude/skills/y/SKILL.md': SKILL,
    'app/shared/notes.md': 'Of the folder.\n',
    'shared/notes.md': 'Of the repository.\n',
    'other/.claude/skills/z/SKILL.md': SKILL,
  });
  return repo;
}

test('a skill named with its folder is found in that folder alone, when asked: no walk lists it, and a bare name is never it', () => {
  const repo = nestedCheckout();
  const skills = skillsFor(path.join(repo, 'workflows', 'dev'), { repo });
  assert.equal(skills.at.get('app:y'), path.join(repo, 'app', '.claude', 'skills', 'y'));
  assert.equal(skills.at.get('other:z'), path.join(repo, 'other', '.claude', 'skills', 'z'));
  assert.deepEqual(
    [...skills.all.keys()].filter((name) => ['y', 'z', 'app:y', 'other:z'].includes(name)),
    [],
  );
  assert.equal(skills.at.get('y'), undefined);
  assert.equal(skills.at.get('x'), undefined, 'the checkout’s skills/x is no root’s');
  assert.equal(skills.at.get('../app:y'), undefined, 'neither form: no folder is looked in');
});

test('REFUSED: a folder that holds no such skill, naming the skill and where it was looked for', () => {
  const repo = nestedCheckout();
  const at = path.join(repo, 'app', '.claude', 'skills', 'nope');
  assert.equal(
    refusalOf(found(repo, 'app:nope')),
    `\`app:nope\` is the skill \`nope\` of the repository's folder \`app\`, and ${at} holds no SKILL.md. A skill is a folder holding a SKILL.md: write ${path.join(at, 'SKILL.md')}, or take \`app:nope\` off the \`skills:\` line.`,
  );
  assert.ok(refusalOf(found(repo, 'gone:y')).includes(path.join(repo, 'gone', '.claude', 'skills', 'y')));
});

test('REFUSED: a skill named with its folder read with no repository, the store alone or nothing', () => {
  const repo = nestedCheckout();
  const said =
    "`app:y` is the skill `y` of the repository's folder `app`, and this is read with no repository: a skill named with its folder is " +
    'read from the repository a run is started on. Start the run on that repository, or take `app:y` off the `skills:` line.';
  assert.equal(refusalOf(skillsFor(path.join(repo, 'workflows', 'dev')).at.get('app:y')), said);
  assert.equal(refusalOf(skillsFor(path.join(repo, 'workflows', 'dev'), { home: repo }).at.get('app:y')), said);
});

test('REFUSED: a named folder that is a link out of the repository, by name, and the skill it holds outside is never given', () => {
  const repo = checkout();
  const outside = written(scratch('wf-skill-folders-outside-'), { '.claude/skills/y/SKILL.md': '---\nname: y\n---\nSENTINEL\n' });
  linked(outside, path.join(repo, 'app'));
  const at = found(repo, 'app:y');
  assert.equal(
    refusalOf(at),
    `\`app:y\` is the skill \`y\` of the repository's folder \`app\`, and ${path.join(repo, 'app')} is reached through a link whose target is outside the repository ${repo}: make it a folder of the repository's own, or take \`app:y\` off the \`skills:\` line.`,
  );
  assert.ok(!refusalOf(at).includes('SENTINEL'));
  written(repo, { 'real/.claude/skills/y/SKILL.md': SKILL });
  linked(path.join(repo, 'real'), path.join(repo, 'inside'));
  assert.equal(found(repo, 'inside:y'), path.join(repo, 'inside', '.claude', 'skills', 'y'), 'a folder linked inside the repository');
});

test('a nested skill’s link is followed inside the folder its line names; REFUSED into a sibling folder, naming the folder that bounds it', () => {
  const repo = nestedCheckout();
  const y = path.join(repo, 'app', '.claude', 'skills', 'y');
  linked('../../../shared/notes.md', path.join(y, 'notes.md'));
  assert.equal(found(repo, 'app:y'), y);
  assert.deepEqual(
    skillFiles(y).map((file) => ('real' in file ? [file.path, fs.readFileSync(file.real, 'utf8')] : file)),
    [
      ['SKILL.md', SKILL],
      ['notes.md', 'Of the folder.\n'],
    ],
  );
  linked('../../../../shared/notes.md', path.join(y, 'far.md'));
  assert.equal(
    refusalOf(skillsFor(path.join(repo, 'workflows', 'dev'), { repo }).at.get('app:y')),
    `y/far.md${LEAVES} The links of \`app:y\` stay inside ${path.join(repo, 'app')}, the folder its line names.`,
  );
});
