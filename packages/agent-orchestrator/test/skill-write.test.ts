/**
 * A skill written (`writeSkill`, `renderSkill`, `withPreload`): what the board's skill page does, a person writing a skill of their own in
 * the store's library. What is written is read back as the card reader reads it and as YAML does, the files' own refusals — the place, a
 * link, a version moved by a file beside SKILL.md — are made to refuse at shipped defaults, asserted on their kind and with the library as
 * it was, and a write of a skill is proven to move the version of every agent that gives it. A skill made, changed at its version, made
 * twice, a name that is no skill's, a stale or gone version and a description refused are the Skill door's walks (`test/skill-walks.ts`).
 * `WF_ROOT` is set before the modules are imported, since they read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { renderSkill, skillDraftOf, skillEntryOf, splitFrontmatter, withPreload, WorkflowError, type SkillDraft } from '../src/workflow.ts';
import { agentVersion } from '../src/agents/read.store.ts';
import { preloads, skillVersion } from '../src/skills/read.store.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-skill-write-');
process.env.WF_ROOT = ROOT;
const { addFactory, writeSkill, isRefusal } = await import('../src/runner.ts');
type Refusal = import('../src/refusal/refusal.ts').Refusal;

const LIBRARY = path.join(ROOT, 'workflows', 'skills');
const AGENTS = path.join(ROOT, 'workflows', 'agents');

const DRAFT: SkillDraft = {
  name: 'tidy-notes',
  title: 'Tidy notes',
  description: 'Rewrites a folder of notes: "one fact a line".',
  tags: ['notes', 'writing'],
  examples: ['tidy my notes', 'make these notes one fact a line'],
  body: '# Tidy notes\n\nRead each note, then write it again, one fact a line.',
};

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

/** Every hidden file or folder anywhere under `dir`: what a write that failed part-way would leave. */
const hidden = (dir: string): string[] =>
  fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true }) as string[]).filter((p) => path.basename(p).startsWith('.')) : [];

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
  assert.deepEqual(hidden(LIBRARY), [], 'and no half-written file is left');
}

const fresh = (): void => fs.rmSync(LIBRARY, { recursive: true, force: true });
const read = (name: string): string => fs.readFileSync(path.join(LIBRARY, name, 'SKILL.md'), 'utf8');

test('a skill is rendered as Nemia ships its own, and read back as it was written, by the card reader and by YAML', () => {
  const text = renderSkill(DRAFT);
  assert.equal(
    text,
    [
      '---',
      'name: tidy-notes',
      'title: Tidy notes',
      `description: 'Rewrites a folder of notes: "one fact a line".'`,
      'tags: [ notes, writing ]',
      'examples: [ tidy my notes, make these notes one fact a line ]',
      '---',
      '# Tidy notes',
      '',
      'Read each note, then write it again, one fact a line.',
      '',
    ].join('\n'),
  );
  assert.deepEqual(skillEntryOf('SKILL.md', 'tidy-notes', text), {
    id: 'tidy-notes',
    name: 'Tidy notes',
    description: DRAFT.description,
    tags: ['notes', 'writing'],
    examples: DRAFT.examples,
  });
  const { block } = splitFrontmatter('SKILL.md', text);
  assert.deepEqual(yaml.load(block!), {
    name: 'tidy-notes',
    title: 'Tidy notes',
    description: DRAFT.description,
    tags: ['notes', 'writing'],
    examples: DRAFT.examples,
  });
  assert.deepEqual(skillDraftOf('SKILL.md', 'tidy-notes', text), { ...DRAFT, preload: false });
});

test('a skill given only a description is written with no title, tags or examples, and preload writes its line', () => {
  const text = renderSkill({ name: 'bare', description: 'Does one thing.', body: 'Do it.', preload: true, title: '  ', tags: null });
  assert.equal(text, '---\nname: bare\ndescription: Does one thing.\npreload: true\n---\nDo it.\n');
  assert.deepEqual(skillDraftOf('SKILL.md', 'bare', text), {
    name: 'bare',
    title: null,
    description: 'Does one thing.',
    tags: null,
    examples: null,
    preload: true,
    body: 'Do it.',
  });
});

test('an edit keeps every key the form does not write, line for line, and the preload the file had when the draft says nothing of it', () => {
  const was = [
    '---',
    'name: tidy-notes',
    '# written by hand',
    'allowed-tools: Read, Grep',
    'description: old words',
    'metadata:',
    '  owner: me',
    '  since: 2026',
    'tags:',
    '  - old',
    'preload: true',
    '---',
    'Old body.',
  ].join('\n');
  const text = renderSkill({ ...DRAFT, preload: undefined }, was);
  const { block } = splitFrontmatter('SKILL.md', text);
  assert.deepEqual(block!.split('\n'), [
    'name: tidy-notes',
    'title: Tidy notes',
    `description: 'Rewrites a folder of notes: "one fact a line".'`,
    'tags: [ notes, writing ]',
    'examples: [ tidy my notes, make these notes one fact a line ]',
    '# written by hand',
    'allowed-tools: Read, Grep',
    'metadata:',
    '  owner: me',
    '  since: 2026',
    'preload: true',
    '',
  ]);
  assert.equal(skillDraftOf('SKILL.md', 'tidy-notes', text).preload, true);
  assert.equal(renderSkill({ ...DRAFT, preload: false }, was).includes('preload'), false, 'a draft that says false takes the line away');
});

test('a draft the card reader would refuse is refused in its words, and a line break before it can make a line of its own', () => {
  const refused = (draft: SkillDraft, said: RegExp) =>
    assert.throws(
      () => renderSkill(draft),
      (err: unknown) => {
        assert.ok(err instanceof WorkflowError, String(err));
        assert.match(err.message, said);
        return true;
      },
    );
  refused({ ...DRAFT, description: '  ' }, /has no `description:`, and the A2A protocol marks a skill's description REQUIRED/);
  refused({ ...DRAFT, tags: [] }, /`tags` is an empty list, which says as little as none/);
  refused({ ...DRAFT, examples: [' '] }, /`examples` is an empty list/);
  refused({ ...DRAFT, description: 'one\npreload: true' }, /`description` holds a line break/);
  refused({ ...DRAFT, title: 'one\rtwo' }, /`title` holds a line break/);
  refused({ ...DRAFT, tags: ['a', 'b\nc'] }, /`tags` holds a line break/);
  refused({ ...DRAFT, name: 'Tidy Notes' }, /lowercase/);
});

/** A SKILL.md's frontmatter as YAML reads it. */
const keysOf = (text: string) => yaml.load(splitFrontmatter('SKILL.md', text).block!) as Record<string, unknown>;

test('withPreload changes that one key, and nothing else of the file', () => {
  const was = '---\nname: x\ndescription: "Does x."\npreload: false\nmetadata:\n  a: 1\n---\n\nBody, with its blank line above.\n';
  const on = withPreload('SKILL.md', was, true);
  assert.equal(on, '---\nname: x\ndescription: "Does x."\npreload: true\nmetadata:\n  a: 1\n---\n\nBody, with its blank line above.\n');
  assert.equal(
    withPreload('SKILL.md', on, false),
    '---\nname: x\ndescription: "Does x."\nmetadata:\n  a: 1\n---\n\nBody, with its blank line above.\n',
  );
  assert.throws(
    () => withPreload('SKILL.md', 'no frontmatter', true),
    (err: Error) => err instanceof WorkflowError && err.message.startsWith('SKILL.md has no frontmatter'),
  );
  const nested = '---\ndescription: d\nmetadata:\n  preload: true\n---\n';
  assert.deepEqual(keysOf(withPreload('SKILL.md', nested, false)), keysOf(nested), "a preload: inside another key's is not the skill's");
});

test("withPreload toggles preload and leaves every other key's reading equal: a quoted value, a YAML list, a comment", () => {
  const was = [
    '---',
    'name: x',
    '# by hand',
    "description: 'Reviews a change: what it breaks.'",
    'tags:',
    '  - code',
    '  - review',
    'allowed-tools: [Read, Grep]',
    '---',
    'Body.',
    '',
  ].join('\n');
  const on = withPreload('SKILL.md', was, true);
  const { preload, ...others } = keysOf(on);
  assert.equal(preload, true);
  assert.deepEqual(others, keysOf(was));
  assert.ok(on.includes('# by hand\n'), on);
  assert.deepEqual(skillEntryOf('SKILL.md', 'x', on), skillEntryOf('SKILL.md', 'x', was));
  const off = withPreload('SKILL.md', on, false);
  assert.deepEqual(keysOf(off), keysOf(was));
  assert.equal(skillDraftOf('SKILL.md', 'x', off).preload, false);
  assert.equal(skillDraftOf('SKILL.md', 'x', on).preload, true);
});

test('a place that is not a skills folder beside the workflows is refused, and a link is never written through', () => {
  fresh();
  refuses(
    () => writeSkill(ROOT, path.join(ROOT, 'workflows', 'elsewhere'), DRAFT, { version: null }),
    'Invalid',
    /is not a folder of skills/,
  );
  refuses(
    () => writeSkill(ROOT, path.join(scratch('wf-skill-nowhere-'), 'skills'), DRAFT, { version: null }),
    'Invalid',
    /is not the store's skills\/ .* Write it to one of the two/,
  );
  const outside = scratch('wf-skill-outside-');
  fs.mkdirSync(LIBRARY, { recursive: true });
  fs.symlinkSync(outside, path.join(LIBRARY, 'linked'));
  refuses(() => writeSkill(ROOT, LIBRARY, { ...DRAFT, name: 'linked' }, { version: null }), 'Invalid', /is a link/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('REFUSED at shipped defaults: a skill written into the workflows/ of a checkout no factory names; written once one names it', () => {
  const checkout = scratch('wf-skill-checkout-');
  fs.mkdirSync(path.join(checkout, '.git'));
  const library = path.join(checkout, 'workflows', 'skills');
  refuses(
    () => writeSkill(ROOT, library, DRAFT, { version: null }),
    'Invalid',
    /skills is not the store's skills\/ .* nor a repository's the store knows .* give its repository to a factory \(nemia factory add <name> --repo <repo>\)/,
  );
  assert.equal(fs.existsSync(path.join(library, DRAFT.name)), false, 'a .git beside it makes no repository known');
  addFactory({ name: 'skill-known', repos: [checkout] });
  writeSkill(ROOT, library, DRAFT, { version: null });
  assert.ok(fs.existsSync(path.join(library, DRAFT.name, 'SKILL.md')), "a factory's repository");
});

test('a file added beside SKILL.md moves its version: a change at the version read before it is a Conflict, the skill as it was', () => {
  fresh();
  const { version } = writeSkill(ROOT, LIBRARY, DRAFT, { version: null });
  fs.writeFileSync(path.join(LIBRARY, 'tidy-notes', 'reference.md'), 'more');
  refuses(() => writeSkill(ROOT, LIBRARY, { name: 'tidy-notes', preload: true }, { version }), 'Conflict', /changed since it was read/);
});

test('the switch writes preload alone, and the run reads it', () => {
  fresh();
  const dir = path.join(LIBRARY, 'tidy-notes');
  const { version } = writeSkill(ROOT, LIBRARY, DRAFT, { version: null });
  assert.equal(preloads(dir), false);
  const on = writeSkill(ROOT, LIBRARY, { name: 'tidy-notes', preload: true }, { version });
  assert.equal(preloads(dir), true);
  assert.equal(read('tidy-notes'), renderSkill({ ...DRAFT, preload: true }));
  writeSkill(ROOT, LIBRARY, { name: 'tidy-notes', preload: false }, { version: on.version });
  assert.equal(preloads(dir), false);
  assert.equal(read('tidy-notes'), renderSkill(DRAFT));
});

test('a skill that no longer reads can be mended by a write, and its version is read without reading it', () => {
  fresh();
  fs.mkdirSync(path.join(LIBRARY, 'broken'), { recursive: true });
  fs.writeFileSync(path.join(LIBRARY, 'broken', 'SKILL.md'), '---\ndescription: |\n  two\n  lines\n---\nBody.\n');
  const version = skillVersion(path.join(LIBRARY, 'broken'))!;
  assert.match(version, /^[0-9a-f]{16}$/);
  writeSkill(ROOT, LIBRARY, { ...DRAFT, name: 'broken' }, { version });
  assert.equal(skillEntryOf('SKILL.md', 'broken', read('broken')).description, DRAFT.description);
  assert.equal(skillVersion(path.join(LIBRARY, 'nothing-here')), null);
});

test('a write of a skill moves the version of every agent that gives it, and of no agent that does not', () => {
  fresh();
  fs.rmSync(AGENTS, { recursive: true, force: true });
  fs.mkdirSync(AGENTS, { recursive: true });
  fs.writeFileSync(path.join(AGENTS, 'scribe.md'), '---\nskills: tidy-notes\n---\nYou write.\n');
  fs.writeFileSync(path.join(AGENTS, 'clerk.md'), '---\nskills: tidy-notes, other\n---\nYou file.\n');
  fs.writeFileSync(path.join(AGENTS, 'porter.md'), '---\nskills: other\n---\nYou carry.\n');
  writeSkill(ROOT, LIBRARY, { ...DRAFT, name: 'other' }, { version: null });
  const { version } = writeSkill(ROOT, LIBRARY, DRAFT, { version: null });
  const versions = () => Object.fromEntries(['scribe', 'clerk', 'porter'].map((name) => [name, agentVersion(AGENTS, name)]));
  const before = versions();
  const changed = writeSkill(ROOT, LIBRARY, { ...DRAFT, description: 'Something else.' }, { version });
  const after = versions();
  assert.notEqual(after.scribe, before.scribe);
  assert.notEqual(after.clerk, before.clerk);
  assert.equal(after.porter, before.porter);
  writeSkill(ROOT, LIBRARY, { name: 'tidy-notes', preload: true }, { version: changed.version });
  assert.notEqual(versions().scribe, after.scribe, 'and so does the switch');
});
