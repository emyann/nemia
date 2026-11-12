/**
 * An upgrade's conflicts in what an Agent, a Skill and a Hire hold, each resolved by a proposal of that object, beside a carried file's,
 * which stays the person's choice: proposed as the choices compose each, waited on by the status, approved in turn with a pass between,
 * then merged with each owner's files taken from the tree. And a choice that removes a Skill, which no proposal removes, refused with the
 * choice kept. The Factory's own conflict, its rules, is told in `upgrade-conflict.test.ts`'s story and in `upgrade.verb.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { teamCopy } from './team.ts';
import { templated as programsAt } from './templated.ts';
import { readFactoryAt } from '../src/factory/factory.store.ts';
import { readResolutions, resolutionsFile, treeDir } from '../src/factory/applied/applied.store.ts';
import { approveProgram } from '../src/approval/approve.verb.ts';
import { PERSON } from '../src/caller/caller.ts';
import { main } from '../src/cli/main.ts';
import { engineOf, runWith } from '../src/runtime-client.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-upgrade-owners-');
const FACTORIES = path.join(ROOT, 'factories');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1' };
const { exportTemplate, reconciled } = programsAt(ROOT);
const stage = staged({ runWith, main, engineOf, env: ENV });
const PLACE = { home: ROOT, repo: ROOT };

const AGENT = 'workflows/agents/reviewer.md';
const HOW = 'workflows/skills/review-a-change/notes/how.md';
const SKILL = 'workflows/skills/review-a-change/SKILL.md';
const LAND = 'workflows/carried/land.ts';
const HIRE = 'factory.json#hires.dev/review';

/** The document `file` of `dir`, its spec changed by `change`. */
function edit(dir: string, file: string, change: (spec: Record<string, any>) => void): void {
  const doc = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  change(doc.spec);
  fs.writeFileSync(path.join(dir, file), stringify(doc, { lineWidth: 0 }));
}

/** The text of `file` in `folder`. */
const textIn = (folder: string, file: string): string => fs.readFileSync(path.join(folder, file), 'utf8');

/** `file` in `folder` with `from` replaced by `to`. */
const rewrite = (folder: string, file: string, from: string, to: string): void => {
  const text = textIn(folder, file);
  assert.ok(text.includes(from), `${file} holds ${from}`);
  fs.writeFileSync(path.join(folder, file), text.replace(from, to));
};

/** `file` in `folder` written, its folders made. */
const written = (folder: string, file: string, text: string): void => {
  fs.mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
  fs.writeFileSync(path.join(folder, file), text);
};

/** What `argv` printed, line by line. */
async function printedBy(t: { mock: { method: Function } }, ...argv: string[]): Promise<string[]> {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...words: unknown[]) => printed.push(words.join(' ')));
  try {
    await stage.main(argv);
  } finally {
    log.mock.restore();
  }
  return printed.flatMap((p) => p.split('\n'));
}

/** The factory `name`, read as the controller reads it. */
const factory = (name: string) =>
  readFactoryAt(ROOT, name) as ReturnType<typeof readFactoryAt> & { template: NonNullable<ReturnType<typeof readFactoryAt>['template']> };

/** The proposal `name` of the factory `factory`, as the store holds it. */
const proposalIn = (factory: string, name: string) =>
  JSON.parse(fs.readFileSync(path.join(FACTORIES, factory, 'proposals', `${name}.json`), 'utf8'));

/** The proposals the store holds for `factory`, by name. */
const proposalsOf = (factory: string): string[] => {
  const dir = path.join(FACTORIES, factory, 'proposals');
  return fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => f.replace(/\.json$/, '')) : [];
};

/** The proposal recorded for the owner `owner` (`<Kind>/<name>`) of `factory`'s upgrade. */
const recordedFor = (factory: string, owner: string): string => readResolutions(ROOT, factory)?.proposals?.[owner] ?? '';

/**
 * A factory `name` applied from the tests' team at 0.1.0, its template carrying a note in the reviewer's skill and a carried script, the
 * person's change and the template's 0.2.0 each made by `change` to the tree and to the template, the upgrade filed: its conflicts'
 * addresses.
 */
async function upgraded(
  t: { mock: { method: Function } },
  name: string,
  change: (tree: string, template: string) => void,
): Promise<string[]> {
  const repo = scratch(`wf-upgrade-owners-${name}-repo-`);
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  stage.place().world.repository(repo, {});
  stage.place().world.commit(repo, 'base');
  const at = path.join(scratch(`wf-upgrade-owners-${name}-`), 'team');
  exportTemplate({ dir: at, from: repo });
  written(at, 'skills/review-a-change/notes/how.md', 'Name the file.\n');
  written(at, 'carried/land.ts', 'export const land = 1;\n');
  await printedBy(t, 'factory', 'apply', name, '--template', at, '--repo', repo);
  reconciled(factory(name));
  edit(at, 'nemia.yaml', (spec) => {
    spec.version = '0.2.0';
  });
  change(treeDir(ROOT, name), at);
  await printedBy(t, 'factory', 'upgrade', name, '--to', '0.2.0');
  return (reconciled(factory(name)).upgrade?.conflicts ?? []).map((c) => c.at);
}

test("an upgrade's conflicts in an Agent, a Skill and a Hire, each resolved by its proposal, and a carried file's by a choice", async (t) => {
  const s = story(t);
  const tree = () => treeDir(ROOT, 'owners');
  let conflicts: string[] = [];
  const proposed: Record<string, string> = {};
  const at = (prefix: string) => conflicts.find((c) => c.startsWith(prefix)) ?? prefix;

  await s.test(
    "the person and the template change one line of the reviewer, of its skill's note and of the carried script, and its hire",
    async (t) => {
      conflicts = await upgraded(t, 'owners', (mine, theirs) => {
        rewrite(mine, AGENT, 'Write nothing into it.', 'Write nothing into it, ever.');
        rewrite(theirs, 'agents/reviewer/instructions.md', 'Write nothing into it.', 'Write nothing into it, not a byte.');
        rewrite(mine, HOW, 'Name the file.', 'Name the file and line.');
        rewrite(theirs, 'skills/review-a-change/notes/how.md', 'Name the file.', 'Name the function.');
        rewrite(mine, LAND, 'land = 1', 'land = 2');
        rewrite(theirs, 'carried/land.ts', 'land = 1', 'land = 3');
        const wiring = JSON.parse(textIn(mine, 'factory.json'));
        wiring.hires['dev/review'] = 'shipper';
        fs.writeFileSync(path.join(mine, 'factory.json'), `${JSON.stringify(wiring, null, 2)}\n`);
        edit(theirs, 'nemia.yaml', (spec) => {
          spec.hires['dev/review'] = 'implementer';
        });
      });
      for (const prefix of [AGENT, HOW, LAND, HIRE])
        assert.ok(
          conflicts.some((c) => c.startsWith(prefix)),
          `${prefix}: ${conflicts.join(', ')}`,
        );
    },
  );

  await s.test('a carried file, which no object holds, is resolved by the choice alone: nothing is proposed', async (t) => {
    await printedBy(t, 'factory', 'resolve', 'owners', at(LAND), '--theirs');
    assert.deepEqual(proposalsOf('owners'), []);
    assert.equal(readResolutions(ROOT, 'owners')?.choices[at(LAND)], 'theirs');
  });

  await s.test("the reviewer's conflict proposes the Agent, its result schema beside its file", async (t) => {
    await printedBy(t, 'factory', 'resolve', 'owners', at(AGENT), '--theirs');
    proposed.agent = recordedFor('owners', 'Agent/reviewer');
    const [object] = proposalIn('owners', proposed.agent).spec.objects;
    assert.equal(object.kind, 'Agent');
    assert.match(object.spec.instructions, /Write nothing into it, not a byte\./);
    assert.equal(object.spec.output?.file, 'reviewer.schema.json');
    assert.equal(object.spec.output?.text, textIn(tree(), 'workflows/agents/reviewer.schema.json'));
  });

  await s.test("the skill's nested note proposes the Skill, its other files whole", async (t) => {
    await printedBy(t, 'factory', 'resolve', 'owners', at(HOW), '--ours');
    proposed.skill = recordedFor('owners', 'Skill/review-a-change');
    const [object] = proposalIn('owners', proposed.skill).spec.objects;
    assert.equal(object.kind, 'Skill');
    assert.deepEqual(object.spec.files, [{ path: 'notes/how.md', text: 'Name the file and line.\n' }]);
  });

  await s.test("the step's hire proposes the Hire, named <workflow>.<step>", async (t) => {
    await printedBy(t, 'factory', 'resolve', 'owners', HIRE, '--theirs');
    proposed.hire = recordedFor('owners', 'Hire/dev.review');
    const [object] = proposalIn('owners', proposed.hire).spec.objects;
    assert.deepEqual(
      [object.kind, object.metadata.name, object.spec],
      ['Hire', 'dev.review', { workflow: 'dev', step: 'review', agent: 'implementer' }],
    );
  });

  await s.test('while they wait the status names each conflict’s proposal; the carried file’s choice has settled it', () => {
    const waiting = reconciled(factory('owners'));
    assert.equal(waiting.version, '0.1.0');
    const kept = Object.fromEntries((waiting.upgrade?.conflicts ?? []).map((c) => [c.at, c.proposal?.name]));
    assert.deepEqual(kept, { [at(AGENT)]: proposed.agent, [at(HOW)]: proposed.skill, [HIRE]: proposed.hire });
  });

  await s.test(
    'each is approved in turn, a pass between, and applies; then the controller merges, each owner taken from the tree',
    async () => {
      for (const name of [proposed.hire, proposed.agent, proposed.skill]) {
        const applied = await stage.runWith(stage.board().e, approveProgram(PERSON, 'owners', name ?? '', PLACE));
        assert.equal(applied.status.phase, 'applied', name);
        reconciled(factory('owners'));
      }
      const merged = reconciled(factory('owners'));
      assert.equal(merged.version, '0.2.0');
      assert.equal(merged.upgrade, undefined);
      assert.match(textIn(tree(), AGENT), /Write nothing into it, not a byte\./);
      assert.equal(textIn(tree(), HOW), 'Name the file and line.\n');
      assert.equal(textIn(tree(), LAND), 'export const land = 3;\n');
      assert.equal(JSON.parse(textIn(tree(), 'factory.json')).hires['dev/review'], 'implementer');
    },
  );
});

test('a choice that removes a Skill, which no proposal removes, is refused Invalid, nothing proposed, and the choice kept', async (t) => {
  const s = story(t);
  let conflicts: string[] = [];

  await s.test('the person changes a line of the skill the template drops', async (t) => {
    conflicts = await upgraded(t, 'dropped', (mine, theirs) => {
      rewrite(mine, SKILL, 'Read the diff against the base.', 'Read the diff against its base.');
      fs.rmSync(path.join(theirs, 'skills/review-a-change'), { recursive: true });
      edit(theirs, 'agents/reviewer/agent.yaml', (spec) => {
        spec.skills = ['ask-for-another-round'];
      });
    });
    assert.ok(
      conflicts.some((c) => c.startsWith(SKILL)),
      conflicts.join(', '),
    );
  });

  await s.test('--theirs, which removes it, is refused; --ours proposes the Skill as the tree holds it', async (t) => {
    const removal = conflicts.find((c) => c.startsWith(SKILL)) ?? SKILL;
    await assert.rejects(
      stage.main(['factory', 'resolve', 'dropped', removal, '--theirs']),
      (err: { _tag?: string }) => err._tag === 'Invalid',
    );
    assert.deepEqual(proposalsOf('dropped'), []);
    assert.equal(readResolutions(ROOT, 'dropped')?.choices[removal], 'theirs', 'the choice is kept');
    await printedBy(t, 'factory', 'resolve', 'dropped', removal, '--ours');
    assert.equal(proposalIn('dropped', recordedFor('dropped', 'Skill/review-a-change')).spec.objects[0].kind, 'Skill');
    assert.ok(fs.existsSync(resolutionsFile(ROOT, 'dropped')));
  });
});
