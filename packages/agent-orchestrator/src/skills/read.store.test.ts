/**
 * The one rule for a link in a skill's folder (`skillFiles`), as three tables: a skill of a checkout's `.claude/skills/` is read through
 * a link whose real target stays inside the checkout's folder, and a skill named with its folder inside that folder; every other link
 * is refused by name where it leaves, as is every link of the store's library and of a team's own folder. Held where every reader asks
 * it: what a start is given (`skillsFor`), the refusal (`skillLinkRefusal`), the version (`skillVersion`) and the copy as files
 * (`copySkillFiles`); and whether two places are one folder (`oneFolder`). Each refusal is asserted on its kind and the names it says.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { names } from '../../test/assessed.ts';
import { WorkflowError } from '../step/step.ts';
import { copySkillFiles, oneFolder, skillFiles, skillLinkRefusal, skillsFor, skillVersion } from './read.store.ts';

const SKILL = '---\nname: x\ndescription: Do the thing.\n---\nDo it.\n';

/** What a link that leaves names besides itself: that it leaves the folder, and the fix. */
const LEAVES = ['is a link', 'outside the folder of skills', 'a folder of its own'];

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

test('given: a skill read through links that stay inside the checkout, or inside the folder its line names', async (t) => {
  await t.test('a skill of .claude/skills/ linked to a folder inside the checkout, each file read from its real file', () => {
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

  await t.test(
    'a real folder whose SKILL.md alone is a link inside, and one holding a linked folder inside, walked as the folder it is',
    () => {
      const repo = checkout();
      linked(path.join(repo, 'skills', 'x', 'SKILL.md'), path.join(given(repo, 'own'), 'SKILL.md'));
      linked('../../../skills/x', path.join(given(repo, 'own'), 'more'));
      assert.equal(found(repo, 'own'), given(repo, 'own'));
      assert.deepEqual(
        skillFiles(given(repo, 'own')).map((file) => file.path),
        ['SKILL.md', 'more/SKILL.md', 'more/notes.md'],
      );
      const [entry] = skillFiles(given(repo, 'own'));
      const real = fs.realpathSync(path.join(repo, 'skills', 'x', 'SKILL.md'));
      assert.deepEqual(entry, { path: 'SKILL.md', real }, 'the linked SKILL.md read off its real file');
    },
  );

  await t.test("a skill that is a folder of its own where the repository's folder of skills is a link inside the checkout", () => {
    const repo = checkout();
    written(repo, { 'kept/skills/own/SKILL.md': SKILL });
    fs.rmSync(path.join(repo, '.claude', 'skills'), { recursive: true });
    fs.symlinkSync('../kept/skills', path.join(repo, '.claude', 'skills'));
    assert.equal(found(repo, 'own'), given(repo, 'own'));
  });

  await t.test(
    "one folder under both of a repository's places, the root's a link to the team's own, is one skill, given from the team's",
    () => {
      const repo = checkout();
      written(path.join(repo, 'workflows', 'skills', 'x'), { 'SKILL.md': SKILL });
      linked('../../workflows/skills/x', given(repo));
      assert.equal(found(repo), path.join(repo, 'workflows', 'skills', 'x'));
    },
  );

  await t.test(
    'a skill named with its folder is found in that folder alone, when asked: no walk lists it, and a bare name is never it',
    () => {
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
      written(given(repo, 'y'), { 'SKILL.md': SKILL });
      const rooted = skillsFor(path.join(repo, 'workflows', 'dev'), { repo });
      assert.equal(rooted.at.get('y'), given(repo, 'y'), "a bare name is the root's, never the folder's");
      assert.equal(rooted.at.get('../app:y'), undefined, 'neither form: no folder is looked in, nor its bare name');
    },
  );

  await t.test(
    'a nested skill’s link is followed inside the folder its line names, and a named folder linked inside the repository',
    () => {
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
      written(repo, { 'real/.claude/skills/y/SKILL.md': SKILL });
      linked(path.join(repo, 'real'), path.join(repo, 'inside'));
      assert.equal(found(repo, 'inside:y'), path.join(repo, 'inside', '.claude', 'skills', 'y'));
    },
  );

  await t.test('one folder: a link and the folder it points at; not two folders, nor one that is not there', () => {
    const repo = checkout();
    const real = path.join(repo, 'skills', 'x');
    const link = linked('../../skills/x', path.join(repo, '.claude', 'skills', 'x'));
    assert.equal(oneFolder(link, real), true);
    assert.equal(oneFolder(real, real), true);
    written(repo, { 'skills/y/SKILL.md': SKILL });
    assert.equal(oneFolder(real, path.join(repo, 'skills', 'y')), false);
    assert.equal(oneFolder(link, path.join(repo, 'skills', 'gone')), false);
    assert.equal(oneFolder(path.join(repo, 'skills', 'gone'), path.join(repo, 'skills', 'gone')), false);
  });
});

test('REFUSED by name: a link that leaves the checkout, a library or the folder its line names, or that cannot be followed', async (t) => {
  await t.test('the folder linked outside the checkout, its SKILL.md linked outside, and a file under it linked outside', () => {
    const repo = checkout();
    const outside = written(scratch('wf-skill-links-outside-'), { 'x/SKILL.md': SKILL, 'secret.md': 'Not the skill.\n' });
    linked(path.join(outside, 'x'), given(repo));
    names(refusalOf(found(repo)), 'x ', ...LEAVES);
    const walked = skillFiles(given(repo));
    assert.deepEqual(
      walked.map((file) => file.path),
      [''],
      'the walk stops at the link',
    );
    names('refused' in walked[0] ? walked[0].refused : undefined, ...LEAVES);
    linked(path.join(outside, 'x', 'SKILL.md'), path.join(given(repo, 'entry'), 'SKILL.md'));
    names(refusalOf(found(repo, 'entry')), 'entry/SKILL.md', ...LEAVES);
    written(given(repo, 'holds'), { 'SKILL.md': SKILL });
    linked(path.join(outside, 'secret.md'), path.join(given(repo, 'holds'), 'notes.md'));
    names(refusalOf(found(repo, 'holds')), 'holds/notes.md', ...LEAVES);
  });

  await t.test('a folder linked inside the checkout that holds a link out', () => {
    const repo = checkout();
    const outside = written(scratch('wf-skill-links-outside-'), { 'secret.md': 'Not the skill.\n' });
    linked(path.join(outside, 'secret.md'), path.join(repo, 'skills', 'x', 'deep', 'far.md'));
    linked('../../skills/x', given(repo));
    names(refusalOf(found(repo)), path.join('x', 'deep', 'far.md'), ...LEAVES);
  });

  await t.test("a link to a sibling folder whose path starts with the checkout's", () => {
    const repo = checkout();
    const sibling = `${repo}-other`;
    try {
      written(sibling, { 'x/SKILL.md': SKILL });
      linked(path.join(sibling, 'x'), given(repo));
      names(refusalOf(found(repo)), 'x ', ...LEAVES);
    } finally {
      fs.rmSync(sibling, { recursive: true, force: true });
    }
  });

  await t.test("every link of the store's library and of a team's own folder, one that points inside the checkout included", () => {
    const repo = checkout();
    const home = scratch('wf-skill-links-home-');
    const library = path.join(home, 'workflows', 'skills');
    linked(written(path.join(home, 'kept', 'y'), { 'SKILL.md': SKILL }), path.join(library, 'y'));
    written(path.join(library, 'tidy'), { 'SKILL.md': SKILL });
    linked(path.join(home, 'kept', 'y', 'SKILL.md'), path.join(library, 'tidy', 'notes.txt'));
    names(refusalOf(found(repo, 'y', home)), 'y ', ...LEAVES);
    names(refusalOf(found(repo, 'tidy', home)), 'tidy/notes.txt', ...LEAVES);
    written(path.join(repo, 'workflows', 'skills', 'z'), { 'SKILL.md': SKILL });
    written(repo, { 'skills/ref.md': 'Inside the checkout.\n' });
    linked('../../../skills/ref.md', path.join(repo, 'workflows', 'skills', 'z', 'ref.md'));
    names(refusalOf(found(repo, 'z')), 'z/ref.md', ...LEAVES);
  });

  await t.test('a link whose target is not there, and a linked folder that points back into the skill; the walk ends', () => {
    const repo = checkout();
    written(given(repo), { 'SKILL.md': SKILL });
    linked('nowhere.md', path.join(given(repo), 'gone.md'));
    names(refusalOf(found(repo)), 'x/gone.md is a link', 'cannot be reached', 'or remove it');
    fs.rmSync(path.join(given(repo), 'gone.md'));
    linked('.', path.join(given(repo), 'again'));
    names(refusalOf(found(repo)), 'x/again is a link', 'points back at a folder it is in', 'remove it');
  });

  for (const [what, linkedAt] of [
    ["the repository's holder of its own skills", (repo: string) => path.join(repo, '.claude')],
    ["the repository's folder of skills", (repo: string) => path.join(repo, '.claude', 'skills')],
  ] as const)
    await t.test(`a skill that is a folder of its own where ${what} is a link out of the checkout, and nothing of it is copied`, () => {
      const repo = checkout();
      const outside = written(scratch('wf-skill-links-outside-'), { 'skills/x/SKILL.md': SKILL });
      fs.rmSync(path.join(repo, '.claude'), { recursive: true });
      if (linkedAt(repo).endsWith('skills')) fs.mkdirSync(path.join(repo, '.claude'));
      fs.symlinkSync(linkedAt(repo).endsWith('skills') ? path.join(outside, 'skills') : outside, linkedAt(repo));
      assert.equal(fs.lstatSync(given(repo)).isDirectory(), true, 'the skill folder itself is no link');
      const said = refusalOf(found(repo));
      names(said, 'x is in a folder of skills reached through a link', path.join(repo, '.claude', 'skills'), 'outside the repository');
      const to = path.join(scratch('wf-skill-links-copy-'), 'x');
      assert.throws(
        () => copySkillFiles(given(repo), to),
        (err: unknown) => err instanceof WorkflowError && err.message === said,
      );
      assert.equal(fs.existsSync(to), false);
    });

  await t.test('a copy of a skill linked outside the checkout, and nothing is written', () => {
    const repo = checkout();
    const outside = written(scratch('wf-skill-links-outside-'), { 'secret.md': 'Not the skill.\n' });
    written(given(repo), { 'SKILL.md': SKILL });
    linked(path.join(outside, 'secret.md'), path.join(given(repo), 'notes.md'));
    const to = path.join(scratch('wf-skill-links-copy-'), 'x');
    assert.throws(
      () => copySkillFiles(given(repo), to),
      (err: unknown) => {
        assert.ok(err instanceof WorkflowError, String(err));
        names(err.message, 'x/notes.md', ...LEAVES);
        return true;
      },
    );
    assert.equal(fs.existsSync(to), false);
  });

  await t.test("a name both of a repository's places have as two folders, the root's a link to another", () => {
    const repo = checkout();
    written(path.join(repo, 'workflows', 'skills', 'x'), { 'SKILL.md': SKILL });
    linked('../../skills/x', given(repo));
    names(refusalOf(found(repo)), `x is a skill in both ${path.join(repo, 'workflows', 'skills', 'x')} and ${given(repo)}`, 'Keep one');
  });

  await t.test('a folder that holds no such skill, naming the skill and where it was looked for', () => {
    const repo = nestedCheckout();
    const at = path.join(repo, 'app', '.claude', 'skills', 'nope');
    names(refusalOf(found(repo, 'app:nope')), '`app:nope`', '`nope`', 'folder `app`', `${at} holds no SKILL.md`, path.join(at, 'SKILL.md'));
    names(refusalOf(found(repo, 'gone:y')), path.join(repo, 'gone', '.claude', 'skills', 'y'));
  });

  await t.test('a skill named with its folder read with no repository, the store alone or nothing', () => {
    const repo = nestedCheckout();
    for (const places of [{}, { home: repo }])
      names(
        refusalOf(skillsFor(path.join(repo, 'workflows', 'dev'), places).at.get('app:y')),
        '`app:y`',
        'no repository',
        'take `app:y` off the `skills:` line',
      );
  });

  await t.test('a named folder that is a link out of the repository, by name, and the skill it holds outside is never given', () => {
    const repo = checkout();
    const outside = written(scratch('wf-skill-folders-outside-'), { '.claude/skills/y/SKILL.md': '---\nname: y\n---\nSENTINEL\n' });
    linked(outside, path.join(repo, 'app'));
    const out = refusalOf(found(repo, 'app:y'));
    names(out, '`app:y`', `${path.join(repo, 'app')} is reached through a link`, `outside the repository ${repo}`);
    names(out, "make it a folder of the repository's own", 'take `app:y` off the `skills:` line');
    assert.ok(!out.includes('SENTINEL'));
  });

  await t.test('a nested skill’s link into a sibling folder, naming the folder that bounds it', () => {
    const repo = nestedCheckout();
    const y = path.join(repo, 'app', '.claude', 'skills', 'y');
    linked('../../../../shared/notes.md', path.join(y, 'far.md'));
    names(refusalOf(found(repo, 'app:y')), 'y/far.md', ...LEAVES, `The links of \`app:y\` stay inside ${path.join(repo, 'app')}`);
  });
});

test("a skill's version and its copy as files: digested off its real files, moved by what a link points at", async (t) => {
  await t.test(
    "a linked skill's version moves when a file of the folder it points at does, and when a linked SKILL.md's content does",
    () => {
      const repo = checkout();
      linked('../../skills/x', given(repo));
      const before = skillVersion(given(repo));
      fs.writeFileSync(path.join(repo, 'skills', 'x', 'notes.md'), 'Other notes.\n');
      assert.notEqual(skillVersion(given(repo)), before, 'a file of the linked folder');
      linked(path.join(repo, 'skills', 'x', 'SKILL.md'), path.join(given(repo, 'own'), 'SKILL.md'));
      const entry = skillVersion(given(repo, 'own'));
      fs.writeFileSync(path.join(repo, 'skills', 'x', 'SKILL.md'), SKILL.replace('Do it.', 'Do it well.'));
      assert.notEqual(skillVersion(given(repo, 'own')), entry, 'the content behind a linked SKILL.md');
    },
  );

  await t.test('the version of a skill that holds no link is the digest of its sorted files, as it was', () => {
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

  await t.test('a skill is copied as regular files, each with its content and mode, and its copy has its version', () => {
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
});
