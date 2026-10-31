/**
 * The library's writers at the command line: `nemia agents write`, `agents rm`, `agents run`, `skills write`, `workflows write` and
 * `workflows rm`, each typed as a person types it, on a file or a draft folder they wrote, into yours under a scratch `WF_ROOT`.
 * Held here: each write read back from disk, and each refusal made to refuse at shipped defaults — the place, a version left out, taken
 * or moved on from, a name, a path that is not there, a key the api alone takes — leaving yours as it was; and that the command line hands
 * each entry's handler only the keys the api's body could, read off the entry's one spec.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from './placed.ts';
import { scratch } from './scratch.ts';
import { TEAM } from './team.ts';

const ROOT = scratch('wf-writers-cli-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.NEMIA_DAEMON_START = 'off';
const { main } = await import('../src/cli/main.ts');
const { TABLE } = await import('../src/runner.ts');
type Args = import('../src/command/command.ts').Args;
type Command = import('../src/command/entry.verb.ts').Command;

const { engineOf } = await import('../src/runtime-client.ts');

/** The engine's stand-in, new for each test and with no task: every run it is asked of has filed nothing yet. */
const engine = eachTest(testEngine);

const YOURS = path.join(ROOT, 'workflows');
const DRAFTS = scratch('wf-writers-cli-drafts-');

/** What `nemia <argv>` printed on stdout, or the words it was refused with, its kind (`_tag`) and its exit code. */
async function typed(t: TestContext, ...argv: string[]): Promise<{ out: string; refused?: string; tag?: string; exitCode?: number }> {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => void out.push(args.join(' ')));
  const err = t.mock.method(console, 'error', () => undefined);
  try {
    await main(argv, engineOf(engine().layer));
    return { out: out.join('\n') };
  } catch (e) {
    const { message, _tag, exitCode } = e as Error & { _tag?: string; exitCode?: number };
    return { out: out.join('\n'), refused: message, tag: _tag, exitCode };
  } finally {
    log.mock.restore();
    err.mock.restore();
  }
}

/** Each file under `dir`, by its path there, with what it holds: yours as it stands. */
const snapshot = (dir: string): Record<string, string> =>
  fs.existsSync(dir)
    ? Object.fromEntries(
        (fs.readdirSync(dir, { recursive: true }) as string[])
          .sort()
          .filter((f) => fs.statSync(path.join(dir, f)).isFile())
          .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]),
      )
    : {};

/** The words `nemia <argv>` was refused with, and yours left as it was. */
async function refused(t: TestContext, ...argv: string[]): Promise<string> {
  const before = snapshot(YOURS);
  const { refused: words } = await typed(t, ...argv);
  assert.ok(words, `nemia ${argv.join(' ')} was refused`);
  assert.deepEqual(snapshot(YOURS), before, `a refused nemia ${argv.join(' ')} leaves yours as it was`);
  return words;
}

/**
 * The words `nemia <argv>` was refused with, refused as `tag` with exit 2, yours left as it was; asserted on by what they name — the
 * command, the flag, the folder — never as a sentence.
 */
async function refusedAs(t: TestContext, tag: 'Invalid' | 'Conflict' | 'Missing', ...argv: string[]): Promise<string> {
  const before = snapshot(YOURS);
  const { refused: words, tag: kind, exitCode } = await typed(t, ...argv);
  assert.ok(words, `nemia ${argv.join(' ')} was refused`);
  assert.equal(kind, tag, words);
  assert.equal(exitCode, 2, words);
  assert.deepEqual(snapshot(YOURS), before, `a refused nemia ${argv.join(' ')} leaves yours as it was`);
  return words;
}

/** Each of `named` is in `words`: a pattern it matches, or a token it holds. */
const names = (words: string, ...named: Array<RegExp | string>) => {
  for (const n of named) assert.ok(typeof n === 'string' ? words.includes(n) : n.test(words), `${n} in: ${words}`);
};

/** The version a line says a thing is at. */
const versionIn = (words: string): string => /version ([0-9a-f]{16})/.exec(words)?.[1] ?? assert.fail(`no version in: ${words}`);

/** A draft file `name` under the drafts, holding `text`: its path. */
function drafted(name: string, text: string): string {
  const file = path.join(DRAFTS, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

const SCRIBE =
  '---\ndescription: Use this when a change needs its notes written.\nmodel: sonnet\noutput: scribe.schema.json\n---\nWrite the notes.\n';
const SCHEMA = JSON.stringify({
  type: 'object',
  additionalProperties: false,
  required: ['notes'],
  properties: { notes: { type: 'string' } },
});

test('nemia agents write writes an agent of yours from its file with the schema beside it, changes it at its version, and renames it', async (t) => {
  const file = drafted('agents/scribe.md', SCRIBE);
  drafted('agents/scribe.schema.json', SCHEMA);
  const made = await typed(t, 'agents', 'write', 'yours', '--file', file);
  assert.equal(made.refused, undefined, made.refused);
  assert.match(
    made.out,
    new RegExp(`^scribe written in ${path.join(YOURS, 'agents')}, at version [0-9a-f]{16}: scribe\\.schema\\.json, scribe\\.md$`),
  );
  assert.equal(fs.readFileSync(path.join(YOURS, 'agents', 'scribe.md'), 'utf8'), SCRIBE);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(YOURS, 'agents', 'scribe.schema.json'), 'utf8')), JSON.parse(SCHEMA));

  fs.writeFileSync(file, SCRIBE.replace('model: sonnet', 'model: opus'));
  const changed = await typed(t, 'agents', 'write', 'yours', 'scribe', '--file', file, '--version', versionIn(made.out));
  assert.equal(changed.refused, undefined, changed.refused);
  assert.match(fs.readFileSync(path.join(YOURS, 'agents', 'scribe.md'), 'utf8'), /^model: opus$/m);

  const notary = drafted('agents/notary.md', SCRIBE.replace('output: scribe.schema.json\n', ''));
  const renamed = await typed(t, 'agents', 'write', 'yours', 'scribe', '--file', notary, '--version', versionIn(changed.out));
  assert.equal(renamed.refused, undefined, renamed.refused);
  assert.match(renamed.out, /^notary written in .*\nremoved: scribe\.md/);
  assert.equal(fs.existsSync(path.join(YOURS, 'agents', 'notary.md')), true);
  assert.equal(fs.existsSync(path.join(YOURS, 'agents', 'scribe.md')), false);
});

test('REFUSED at shipped defaults: an agent written where one is, at a version it moved on from, into the repository, or with no file', async (t) => {
  const file = drafted('agents/archivist.md', '---\ndescription: Use this to file things away.\n---\nFile it.\n');
  const made = await typed(t, 'agents', 'write', 'yours', '--file', file);
  assert.equal(made.refused, undefined, made.refused);
  const at = versionIn(made.out);

  const taken = await refused(t, 'agents', 'write', 'yours', '--file', file);
  assert.equal(
    taken,
    `agents/archivist.md is there already. Give the new agent another name, or open it and change it: it is at version ${at}, and a write given that version changes it.`,
  );
  fs.writeFileSync(file, '---\ndescription: Use this to file things away, neatly.\n---\nFile it.\n');
  const stale = await refused(t, 'agents', 'write', 'yours', 'archivist', '--file', file, '--version', '0000000000000000');
  assert.match(stale, new RegExp(`changed since it was read \\(version 0000000000000000, now ${at}\\)`));
  names(
    await refusedAs(t, 'Invalid', 'agents', 'write', 'repo', '--file', file),
    /^nemia agents write refuses /,
    "the repository's agents",
    'only yours is written',
    'copy the file into',
  );
  names(
    await refusedAs(t, 'Invalid', 'agents', 'write', 'yours'),
    /^nemia agents write takes --file/,
    'nemia agents write (yours | factory) [<name>]',
    '--file <name>.md',
    '[--factory <name>] [--version <v>]',
  );
  const nowhere = path.join(DRAFTS, 'agents', 'nobody.md');
  assert.match(
    await refused(t, 'agents', 'write', 'yours', '--file', nowhere),
    new RegExp(`^nemia agents write cannot read ${nowhere}: .*Name a file that is there\\.$`),
  );
  const unread = drafted('agents/broken.md', '---\nname: other\ndescription: Use this broken.\n---\nBroken.\n');
  assert.match(await refused(t, 'agents', 'write', 'yours', '--file', unread), new RegExp(`^${unread} does not read: `));
});

test('REFUSED at shipped defaults: a key the api alone takes, typed at the command line, in the writer’s own words', async (t) => {
  const file = drafted('agents/plain.md', '---\ndescription: Use this plainly.\n---\nDo it.\n');
  names(
    await refusedAs(t, 'Invalid', 'agents', 'write', 'yours', '--file', file, '--draft', '{}'),
    /^nemia agents write takes no --draft: /,
    'nemia agents write (yours | factory) [<name>]',
    '--file <name>.md',
  );
  names(
    await refusedAs(t, 'Invalid', 'agents', 'remove', 'yours', 'plain', '--repo', DRAFTS),
    /^nemia agents rm takes no --repo: /,
    'nemia agents rm yours <name> --version <v>',
  );
  names(
    await refusedAs(t, 'Invalid', 'skills', 'write', 'yours', '--copy', 'tidy'),
    /^nemia skills write takes no --copy: /,
    'nemia skills write (yours | factory) [<name>]',
    '--file <SKILL.md>',
  );
  names(
    await refusedAs(t, 'Invalid', 'workflows', 'write', 'yours', 'dev', '--draft', '[]'),
    /^nemia workflows write takes no --draft: /,
    'nemia workflows write (yours | factory) <name>',
    '--folder <draft>',
  );
});

test('nemia agents rm removes an agent of yours at the version it was read at; REFUSED with none, with one it moved on from, or not there', async (t) => {
  const file = drafted('agents/courier.md', '---\ndescription: Use this to carry it.\n---\nCarry it.\n');
  const at = versionIn((await typed(t, 'agents', 'write', 'yours', '--file', file)).out);
  assert.equal(
    await refused(t, 'agents', 'remove', 'yours', 'courier'),
    `agents/courier.md is at version ${at}, and a removal is checked against the version it was read at, so an agent changed since is not removed unseen. Give that version to remove it.`,
  );
  assert.match(await refused(t, 'agents', 'remove', 'yours', 'courier', '--version', '0000000000000000'), /changed since it was read/);
  assert.match(await refused(t, 'agents', 'remove', 'yours', 'nobody', '--version', at), /nobody/);
  names(
    await refusedAs(t, 'Invalid', 'agents', 'remove', 'repo', 'courier', '--version', at),
    /^nemia agents rm refuses /,
    "the repository's agents",
    'only yours is written',
    'copy the file into',
  );
  const gone = await typed(t, 'agents', 'remove', 'yours', 'courier', '--version', at);
  assert.equal(gone.refused, undefined, gone.refused);
  assert.equal(gone.out, `removed from ${path.join(YOURS, 'agents')}: courier.md`);
  assert.equal(fs.existsSync(path.join(YOURS, 'agents', 'courier.md')), false);
});

const TIDY = '---\nname: tidy\ndescription: Tidy a folder.\n---\nTidy it.\n';

test('nemia skills write writes a skill of yours from its SKILL.md, and changes it at its version', async (t) => {
  const file = drafted('skills/tidy/SKILL.md', TIDY);
  const made = await typed(t, 'skills', 'write', 'yours', '--file', file);
  assert.equal(made.refused, undefined, made.refused);
  assert.match(made.out, new RegExp(`^tidy written in ${path.join(YOURS, 'skills', 'tidy')}, at version [0-9a-f]{16}: SKILL\\.md$`));
  assert.match(
    fs.readFileSync(path.join(YOURS, 'skills', 'tidy', 'SKILL.md'), 'utf8'),
    /^name: tidy\ndescription: "?Tidy a folder\."?\n---\nTidy it\.\n$/m,
  );

  fs.writeFileSync(file, TIDY.replace('Tidy a folder.', 'Tidy a folder well.'));
  const changed = await typed(t, 'skills', 'write', 'yours', 'tidy', '--file', file, '--version', versionIn(made.out));
  assert.equal(changed.refused, undefined, changed.refused);
  assert.match(fs.readFileSync(path.join(YOURS, 'skills', 'tidy', 'SKILL.md'), 'utf8'), /Tidy a folder well\./);
});

test('REFUSED at shipped defaults: a skill written where one is, at a version it moved on from, under another name, or into the repository', async (t) => {
  const file = drafted('skills/sweep/SKILL.md', TIDY.replace('name: tidy', 'name: sweep'));
  const at = versionIn((await typed(t, 'skills', 'write', 'yours', '--file', file)).out);
  assert.match(
    await refused(t, 'skills', 'write', 'yours', '--file', file),
    new RegExp(`skills/sweep is there already.*it is at version ${at}, and a write given that version changes it\\.$`),
  );
  assert.match(await refused(t, 'skills', 'write', 'yours', 'sweep', '--file', file, '--version', '0000000000000000'), /0000000000000000/);
  assert.equal(
    await refused(t, 'skills', 'write', 'yours', 'other', '--file', file),
    `nemia skills write was asked to change other, and ${file} is the skill sweep: name the skill it is.`,
  );
  names(
    await refusedAs(t, 'Invalid', 'skills', 'write', 'repo', '--file', file),
    /^nemia skills write refuses /,
    "the repository's skills",
    'only your library is written',
    'copy its folder into the repository',
  );
  assert.match(await refused(t, 'skills', 'write', 'yours'), /^nemia skills write takes --file, /);
});

/** The tests' team's `dev` copied as a draft folder `name`, its agents and skills put in yours, where a start finds them. */
function draftWorkflow(name: string): string {
  for (const part of ['agents', 'skills']) fs.cpSync(path.join(TEAM, part), path.join(YOURS, part), { recursive: true, force: false });
  const folder = path.join(DRAFTS, 'workflows', name);
  fs.cpSync(path.join(TEAM, 'dev'), folder, { recursive: true });
  return folder;
}

test('nemia workflows write writes a draft folder into yours, changes it at its version, and nemia workflows rm removes it at its version', async (t) => {
  const folder = draftWorkflow('notes');
  const made = await typed(t, 'workflows', 'write', 'yours', 'notes', '--folder', folder);
  assert.equal(made.refused, undefined, made.refused);
  assert.equal(
    made.out,
    `notes written in ${path.join(YOURS, 'notes')}, at version ${versionIn(made.out)}: README.md, implement.md, review.md, ship.md`,
  );
  assert.deepEqual(Object.keys(snapshot(path.join(YOURS, 'notes'))), Object.keys(snapshot(folder)));

  fs.appendFileSync(path.join(folder, 'README.md'), '\nChanged.\n');
  const changed = await typed(t, 'workflows', 'write', 'yours', 'notes', '--folder', folder, '--version', versionIn(made.out));
  assert.equal(changed.refused, undefined, changed.refused);
  assert.match(fs.readFileSync(path.join(YOURS, 'notes', 'README.md'), 'utf8'), /Changed\.$/m);

  const gone = await typed(t, 'workflows', 'remove', 'yours', 'notes', '--version', versionIn(changed.out));
  assert.equal(gone.refused, undefined, gone.refused);
  assert.equal(gone.out, `removed ${path.join(YOURS, 'notes')}: README.md, implement.md, review.md, ship.md`);
  assert.equal(fs.existsSync(path.join(YOURS, 'notes')), false);
});

test('REFUSED at shipped defaults: a workflow written where one is, at a version it moved on from, by a bad name, or from no folder', async (t) => {
  const folder = draftWorkflow('review');
  const at = versionIn((await typed(t, 'workflows', 'write', 'yours', 'review', '--folder', folder)).out);
  assert.equal(
    await refused(t, 'workflows', 'write', 'yours', 'review', '--folder', folder),
    `${path.join(YOURS, 'review')} is a workflow already, at version ${at}: a write given that version changes it. Give the new one another name, or write this one with that version.`,
  );
  assert.match(
    await refused(t, 'workflows', 'write', 'yours', 'review', '--folder', folder, '--version', '0000000000000000'),
    /0000000000000000/,
  );
  assert.equal(
    await refused(t, 'workflows', 'write', 'yours', 'gone', '--folder', folder, '--version', at),
    `${path.join(YOURS, 'gone')} is not there: it was removed since it was read. Write it with no version to make it again.`,
  );
  names(
    await refusedAs(t, 'Invalid', 'workflows', 'write', 'yours', '../review', '--folder', folder),
    /^nemia workflows write: /,
    "`../review` is not a workflow's name",
  );
  names(
    await refusedAs(t, 'Invalid', 'workflows', 'write', 'repo', 'review', '--folder', folder),
    /^nemia workflows write refuses /,
    "the repository's workflows",
    'only yours is written',
    'copy the folder into',
  );
  names(
    await refusedAs(t, 'Invalid', 'workflows', 'write', 'yours', 'review'),
    /^nemia workflows write takes --folder/,
    'nemia workflows write (yours | factory) <name>',
    '--folder <draft>',
  );
  const file = path.join(folder, 'README.md');
  assert.equal(
    await refused(t, 'workflows', 'write', 'yours', 'review', '--folder', file),
    `nemia workflows write reads the folder ${file}, and it is not one. Name the draft folder.`,
  );
});

test('REFUSED at shipped defaults: a workflow removed with no version, at one it moved on from, the agents’ folder, or in the repository', async (t) => {
  const folder = draftWorkflow('triage');
  const at = versionIn((await typed(t, 'workflows', 'write', 'yours', 'triage', '--folder', folder)).out);
  assert.match(
    await refused(t, 'workflows', 'remove', 'yours', 'triage'),
    new RegExp(`is at version ${at}, and a removal is checked against the version it was read at`),
  );
  assert.match(
    await refused(t, 'workflows', 'remove', 'yours', 'triage', '--version', '0000000000000000'),
    new RegExp(`it is at version ${at}`),
  );
  names(
    await refusedAs(t, 'Invalid', 'workflows', 'remove', 'yours', 'agents', '--version', at),
    /^nemia workflows rm: agents\/ holds /,
    "Name the workflow's folder",
  );
  names(
    await refusedAs(t, 'Invalid', 'workflows', 'remove', 'repo', 'triage', '--version', at),
    /^nemia workflows rm refuses /,
    "the repository's workflows",
    'only yours is written',
    'copy the folder into',
  );
});

test('nemia agents run starts a try of an agent of yours with no repository; REFUSED while it moves, with no brief, for none there, or in the repository', async (t) => {
  const file = drafted('agents/taster.md', '---\ndescription: Use this to taste it.\nmodel: sonnet\n---\nTaste it.\n');
  await typed(t, 'agents', 'write', 'yours', '--file', file);
  const started = await typed(t, 'agents', 'try', 'yours', 'taster', '--brief', '  Taste the soup.  ');
  assert.equal(started.refused, undefined, started.refused);
  const id = /^(\S+) {2}a try of taster started: nemia ls shows how it goes/.exec(started.out)?.[1] ?? assert.fail(started.out);
  const run = JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${id}.json`), 'utf8'));
  assert.equal(run.repo, undefined, 'with no repository');
  assert.equal(run.brief, 'Taste the soup.');
  assert.equal(run.workflowDir, path.join(ROOT, 'tries', 'taster'));
  assert.equal(run.workflow[0].agent.name, 'taster');

  const runs = () => fs.readdirSync(path.join(ROOT, 'runs')).sort();
  const before = runs();
  assert.match(await refused(t, 'agents', 'try', 'yours', 'taster', '--brief', 'Once more.'), new RegExp(`still running \\(${id}\\)`));
  names(
    await refusedAs(t, 'Invalid', 'agents', 'try', 'yours', 'taster', '--brief', '  '),
    /^The brief is empty/,
    'Write what it should do',
  );
  assert.match(await refused(t, 'agents', 'try', 'yours', 'nobody', '--brief', 'Do it.'), /^Yours has no agent named 'nobody'/);
  names(
    await refusedAs(t, 'Invalid', 'agents', 'try', 'repo', 'taster', '--brief', 'Do it.'),
    /^nemia agents run refuses /,
    "the repository's agents",
    'only yours is written',
    'copy the file into',
  );
  assert.deepEqual(runs(), before, 'and no run is started by a refused try');
});

/** The keys an entry's handler may be handed by either side: its positionals, and its flags but those the command line alone takes. */
const handlerKeys = (command: Command): Set<string> =>
  new Set([
    ...command.spec.positionals.map((p) => p.key),
    ...command.spec.flags.flatMap((f) => (f.only?.side !== 'cli' && f.key !== undefined ? [f.key] : [])),
  ]);

/** The keys `handed` that `command`'s handler is never handed by the api: none, where the two sides read one spec. */
const strayKeys = (command: Command, handed: Args): string[] => Object.keys(handed).filter((key) => !handlerKeys(command).has(key));

const entry = (name: string): Command => TABLE.find((c) => c.name === name) as Command;

test('REFUSED: a key handed to a handler that its spec gives the command line alone, or gives no side', () => {
  assert.deepEqual(strayKeys(entry('agents write'), { from: 'yours', file: 'scribe.md', draft: '{}' }), ['file']);
  assert.deepEqual(strayKeys(entry('workflows write'), { from: 'yours', name: 'dev', folder: 'dev', steps: '[]' }), ['folder', 'steps']);
  assert.deepEqual(strayKeys(entry('skills write'), { from: 'yours', change: '{}', copy: 'tidy' }), []);
});

test('the command line hands each writer’s handler only what the api’s body could, read off the one spec both sides parse', async (t) => {
  const agent = drafted('agents/spec.md', SCRIBE);
  drafted('agents/scribe.schema.json', SCHEMA);
  const skill = drafted('skills/spec/SKILL.md', TIDY.replace('name: tidy', 'name: spec'));
  const typedArgs: Record<string, string[]> = {
    'agents write': ['agents', 'write', 'yours', 'spec', '--file', agent, '--version', 'v'],
    'agents rm': ['agents', 'rm', 'yours', 'spec', '--version', 'v'],
    'agents run': ['agents', 'run', 'yours', 'spec', '--brief', 'Do it.'],
    'skills write': ['skills', 'write', 'yours', 'spec', '--file', skill, '--version', 'v'],
    'workflows write': ['workflows', 'write', 'yours', 'spec', '--folder', draftWorkflow('spec'), '--version', 'v'],
    'workflows rm': ['workflows', 'rm', 'yours', 'spec', '--version', 'v'],
  };
  const writers = (TABLE as readonly Command[]).filter(
    (c) => c.writes && c.only === undefined && /^(agents|skills|workflows) (write|rm|run)$/.test(c.name),
  );
  assert.deepEqual(writers.map((c) => c.name).sort(), Object.keys(typedArgs).sort(), 'the six writers, each typed here');
  for (const command of writers) {
    const handed: Args[] = [];
    const handler = t.mock.method(command as unknown as { handler: (args: Args) => never }, 'handler', (args: Args) => {
      handed.push(args);
      throw new Error('handed');
    });
    await typed(t, ...typedArgs[command.name]);
    handler.mock.restore();
    assert.equal(handed.length, 1, `nemia ${command.name} reached its handler`);
    assert.deepEqual(strayKeys(command, handed[0]), [], `nemia ${command.name} hands its handler only what the api's body could`);
    const flagged = command.spec.flags.flatMap((f) => (f.only?.side === 'cli' && f.key !== undefined ? [f.key] : []));
    for (const key of flagged) assert.equal(handed[0][key], undefined, `nemia ${command.name} reads --${key}, and hands what it read`);
  }
});
