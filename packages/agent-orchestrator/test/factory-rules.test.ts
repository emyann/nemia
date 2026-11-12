/**
 * A factory's rules, the fourth of an agent's five layers: what a factory tells every agent hired into it, one file kept with the factory
 * in the store (`<WF_ROOT>/factories/<name>/RULES.md`); and its instruction, Nemia's words for the factory, kept in its first folder or
 * in the store. The order a step is told its layers in — the agent's instructions, the person's custom instructions, the factory's
 * rules, the step's own note — a factory with no rules telling nothing, a step on a remote agent told none, and the words touching no
 * key are rows of the layers table in `rendering.test.ts`. Held here: a person's story on the stage (`story.ts`): rules written, told
 * as their own layer and frozen at `nemia start`, edited and cleared, reaching only later runs; the instruction kept in the folder, then
 * in the store, written from a file and cleared. And a table: rules that cannot be told stop a start in their factory.
 *
 * The rest of the area: the refusals of a write of the rules and of `nemia factory rules` as tables in `src/factory/rules/`, and the guards
 * a rules or instruction file is read through, shared, in `src/factory/instruction.store.test.ts`; a factory's removal, which takes both,
 * in `factory-start.test.ts`. The story lives here, beside the layers it proves on a run, since a start is what freezes them. The test's
 * store is its own, at `ROOT`, given as `ENV`.

 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { StepSpec } from '../src/workflow.ts';
import { headedLayers } from '../src/workflow/index.ts';
import { scratch } from 'test-kit/scratch';
import { teamCopy } from './team.ts';
import { names } from './assessed.ts';
import { staged, story } from './story.ts';
import { FACTORY_INSTRUCT, FACTORY_RULES, factoryInstruction, factoryRules, runWith as runEngine, startRun } from '../src/runner.ts';
import { addFactoryAt, attachWorkflowAt, readFactoryAt, setInstructionAt } from '../src/factory/factory.store.ts';
import { engineOf } from '../src/runtime-client.ts';
import { factoryTyped } from './factory-typed.ts';
import { runRecord } from '../src/record/record.store.ts';
import { agentFilesDir } from '../src/agents/agents.store.ts';
import { WORKFLOWS_STEP } from '../src/workflows/workflows.verb.ts';
import { clearRules, readRules, rulesAt, writeRules } from '../src/factory/rules/rules.store.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-factory-rules-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1' };
const stage = staged({ runWith: runEngine, main: factoryTyped, engineOf, env: ENV });
const { runPlaced } = stage;

const RULES = 'Reply in German.';

/** Where `text` is in `told`, which must hold it. */
const at = (told: string, text: string): number => {
  const i = told.indexOf(text);
  assert.ok(i >= 0, `told ${JSON.stringify(text)}:\n${told}`);
  return i;
};

/** A git repository with one commit on `main`, for a start. */
function aRepo(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  return repo;
}

/** The factory `pipao`, filed afresh on a repository of its own, offering the tests' team's workflow `dev`: its steps name their agents. */
function fresh(): { repo: string; dev: string; file: string } {
  fs.rmSync(path.join(ROOT, 'factories'), { recursive: true, force: true });
  const repo = aRepo();
  addFactoryAt(ROOT, { name: 'pipao', repos: [repo] });
  attachWorkflowAt(ROOT, { factory: 'pipao', workflow: 'dev' });
  return { repo, dev: path.join(teamCopy('wf-factory-rules-team-'), 'dev'), file: path.join(ROOT, 'factories', 'pipao', 'RULES.md') };
}

/** A run of `dev` started in `factory`, the default when none is named. */
const started = (here: { repo: string; dev: string }, brief: string, factory?: string) =>
  runPlaced(startRun({ brief, repo: here.repo, workflowDir: here.dev, ...(factory !== undefined && { factory }) }));

/** The steps a run froze at its start. */
const frozen = (id: string): readonly StepSpec[] => runRecord(ROOT, id).workflow ?? [];

/** The prompt rendered for a step of a run at its start. */
const promptOf = (run: Parameters<typeof agentFilesDir>[1], step: string): string =>
  fs.readFileSync(path.join(agentFilesDir(ROOT, run, step), 'prompt.md'), 'utf8');

/** The runs written under the store. */
const runsWritten = (): string[] => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')) : []);

/** `nemia factory rules` run with `args`, as the CLI and the api run it. */
const rulesOf = (args: Parameters<typeof FACTORY_RULES.handler>[0]) => stage.runWith(stage.board().e, FACTORY_RULES.handler(args));

/** What `nemia factory instruction` and `instruct` answer: the instruction read after, and whether a clear took words off. */
type Instruction = ReturnType<typeof factoryInstruction> & { removed?: boolean };

/** What `nemia <argv>` answers, run onto its entry's handler as the api calls it. */
const answeredBy = async (...argv: string[]): Promise<Instruction> => (await stage.main(argv)) as Instruction;

/** A step's keys, its words and its rules set aside: what the rules must not move. */
const keysOf = (steps: readonly StepSpec[]) =>
  steps.map(({ body: _b, agent, ...keys }) => ({ ...keys, agent: { ...agent, factoryRules: undefined } }));

test("a factory's rules and its instruction, from none to cleared: told as their own layer, frozen at the start, reaching later runs", async (t) => {
  const s = story(t);
  const here = fresh();
  const FILE = here.file;
  const record = path.join(ROOT, 'factories', 'pipao.json');
  let none = { id: '' } as Awaited<ReturnType<typeof started>>;
  let told = none;

  await s.test('a factory with no rules reads none, and a run started in it is told none: no key on a step', async () => {
    assert.equal(rulesAt(ROOT, { name: 'pipao' }), FILE);
    assert.deepEqual(readRules(FILE), { words: null, error: null }, 'no file: no rules, and nothing wrong');
    const read = await rulesOf({ factory: 'pipao' });
    assert.deepEqual(read, { name: 'pipao', file: FILE, words: null, error: null });
    none = await started(here, 'no rules', 'pipao');
    for (const step of frozen(none.id)) assert.equal('factoryRules' in step.agent!, false, step.name);
  });

  await s.test('`nemia factory rules` writes them trimmed, and reads them back', async () => {
    const written = await rulesOf({ factory: 'pipao', words: '\n\nBefore: never push on a Friday.\n\n' });
    assert.deepEqual(written, { name: 'pipao', file: FILE, words: 'Before: never push on a Friday.', error: null });
    assert.equal(fs.readFileSync(FILE, 'utf8'), 'Before: never push on a Friday.\n');
    assert.deepEqual(factoryRules(ROOT, 'pipao'), written);
  });

  await s.test("`nemia start` freezes them on every step, after the agent's own, and they are all that was added", async () => {
    told = await started(here, 'freeze the rules', 'pipao');
    const steps = frozen(told.id);
    assert.deepEqual(
      steps.map((st) => st.name),
      ['implement', 'review', 'ship'],
    );
    for (const step of steps) {
      assert.equal(step.agent?.factoryRules, 'Before: never push on a Friday.', step.name);
      const own = step.agent?.instructions;
      assert.ok(own, `${step.name}: its agent's instructions are frozen`);
      assert.ok(at(step.body, own) < at(step.body, 'Before: never push'), `${step.name}: after the agent's own`);
    }
    const layer = `\n\n${headedLayers([['factory', 'Before: never push on a Friday.']])}`;
    assert.equal(promptOf(told, 'implement').replace(layer, ''), promptOf(none, 'implement'), 'the rules are all that was added');
    assert.deepEqual(keysOf(frozen(told.id)), keysOf(frozen(none.id)), 'and no key of a step moved');
  });

  await s.test('an edit, then a clear, after the start reach no step of the run started', async () => {
    writeRules(ROOT, { name: 'pipao' }, 'After: push whenever.');
    for (const when of ['after an edit', 'after a removal']) {
      for (const step of frozen(told.id)) {
        assert.equal(step.agent?.factoryRules, 'Before: never push on a Friday.', `${step.name}, ${when}`);
        assert.ok(step.body.includes('Before: never push') && !step.body.includes('After:'), `${step.name}, ${when}: ${step.body}`);
      }
      const prompt = promptOf(told, 'implement');
      assert.ok(prompt.includes('Before: never push on a Friday.') && !prompt.includes('After:'), `${when}: ${prompt}`);
      const cleared = await rulesOf({ factory: 'pipao', clear: true });
      assert.deepEqual(
        [cleared.removed, cleared.words, fs.existsSync(FILE)],
        [when === 'after an edit', null, false],
        'nothing to remove twice',
      );
    }
  });

  await s.test('a run started after them is told the rules written since', async () => {
    writeRules(ROOT, { name: 'pipao' }, 'After: push whenever.');
    const later = await started(here, 'the later rules', 'pipao');
    for (const step of frozen(later.id)) assert.equal(step.agent?.factoryRules, 'After: push whenever.', step.name);
    assert.ok(promptOf(later, 'implement').includes('After: push whenever.'));
  });

  await s.test("a run in the default factory is told none, a RULES.md under factories/default being no factory's", async () => {
    fs.mkdirSync(path.join(ROOT, 'factories', 'default'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'factories', 'default', 'RULES.md'), `${RULES}\n`);
    const inDefault = await started(here, 'the default factory');
    for (const step of frozen(inDefault.id)) {
      assert.equal('factoryRules' in step.agent!, false, step.name);
      assert.equal(step.body.includes('German'), false, `${step.name}: ${step.body}`);
    }
    assert.equal(promptOf(none, 'implement'), promptOf(inDefault, 'implement'), 'the prompt byte for byte');
    fs.rmSync(path.join(ROOT, 'factories', 'default'), { recursive: true });
  });

  await s.test(
    "a factory's page of a step loads it with the rules, and leaves out rules that cannot be told, refusing nothing",
    async () => {
      const step = async (): Promise<StepSpec> => {
        const args = { from: 'yours', name: 'dev', step: 'implement', dir: here.dev, factory: 'pipao' };
        return (await stage.runWith(stage.board().e, WORKFLOWS_STEP.handler(args))).step!;
      };
      clearRules(ROOT, { name: 'pipao' });
      assert.equal((await step()).agent?.factoryRules, undefined);
      writeRules(ROOT, { name: 'pipao' }, RULES);
      const loaded = await step();
      assert.equal(loaded.agent?.factoryRules, RULES);
      assert.ok(at(loaded.body, 'Make the change you were asked for') < at(loaded.body, RULES), loaded.body);
      fs.writeFileSync(FILE, '---\ntools: Bash\n---\nUse Bash.\n');
      const refused = await step();
      assert.equal(refused.agent?.factoryRules, undefined, 'a listing refuses nothing: the start will');
      assert.equal(refused.body.includes('Use Bash'), false, refused.body);
    },
  );

  await s.test('rules that cannot be told are read with why; cleared, they are gone', async () => {
    fs.writeFileSync(FILE, '---\nmodel: opus\n---\n');
    const read = await rulesOf({ factory: 'pipao' });
    names(read.error, 'frontmatter');
    assert.equal(clearRules(ROOT, { name: 'pipao' }), true);
  });

  await s.test(
    'the instruction, kept in the folder by default: NEMIA.md in its first folder, no words while no file is there',
    async () => {
      assert.deepEqual(factoryInstruction(ROOT, 'pipao'), {
        name: 'pipao',
        path: null,
        store: false,
        file: path.join(here.repo, 'NEMIA.md'),
        words: null,
        error: null,
        stored: false,
      });
      fs.writeFileSync(path.join(here.repo, 'NEMIA.md'), 'Ship small.\n');
      assert.equal(factoryInstruction(ROOT, 'pipao').words, 'Ship small.\n');
      const read = await answeredBy('factory', 'instruction', 'pipao');
      assert.deepEqual([read.file, read.store, read.words], [path.join(here.repo, 'NEMIA.md'), false, 'Ship small.\n']);
    },
  );

  await s.test('`nemia factory instruction` writes where it is kept, a path or the store, every other key of the file kept', () => {
    const others = JSON.parse(fs.readFileSync(record, 'utf8'));
    setInstructionAt(ROOT, { factory: 'pipao', at: { path: 'docs/../docs/X.md' } });
    assert.deepEqual(JSON.parse(fs.readFileSync(record, 'utf8')), { ...others, instruction: { path: 'docs/X.md' } });
    setInstructionAt(ROOT, { factory: 'pipao', at: { store: true } });
    assert.deepEqual(JSON.parse(fs.readFileSync(record, 'utf8')), { ...others, instruction: { store: true } });
    assert.deepEqual(readFactoryAt(ROOT, 'pipao').instruction, { store: true });
  });

  await s.test('kept in the store: `nemia factory instruct` writes its words trimmed, and the words a file holds', async () => {
    const written = await stage.runWith(
      stage.board().e,
      FACTORY_INSTRUCT.handler({ factory: 'pipao', words: '  Ship small.  ', clear: false }),
    );
    const kept = path.join(ROOT, 'factories', 'pipao', 'NEMIA.md');
    assert.equal(written.words, 'Ship small.\n');
    assert.equal(fs.readFileSync(kept, 'utf8'), 'Ship small.\n');
    const again = await stage.runWith(stage.board().e, FACTORY_INSTRUCT.handler({ factory: 'pipao', words: 'Be brief.\n' }));
    assert.deepEqual([again.file, again.removed], [kept, undefined]);
    assert.equal(factoryInstruction(ROOT, 'pipao').words, 'Be brief.\n');
  });

  await s.test('moved out of the store, the stored words are kept unread; back, they are read', () => {
    setInstructionAt(ROOT, { factory: 'pipao', at: undefined });
    const moved = factoryInstruction(ROOT, 'pipao');
    assert.deepEqual([moved.store, moved.words, moved.stored], [false, 'Ship small.\n', true], "the folder's file is read");
    setInstructionAt(ROOT, { factory: 'pipao', at: { store: true } });
    assert.equal(factoryInstruction(ROOT, 'pipao').words, 'Be brief.\n');
  });

  await s.test('`nemia factory instruct --clear` removes the words; a clear of where it is kept removes the key, never null', async () => {
    const kept = path.join(ROOT, 'factories', 'pipao', 'NEMIA.md');
    const cleared = await answeredBy('factory', 'instruct', 'pipao', '--clear');
    assert.deepEqual([cleared.file, cleared.removed], [kept, true]);
    assert.equal(factoryInstruction(ROOT, 'pipao').stored, false);
    setInstructionAt(ROOT, { factory: 'pipao', at: undefined });
    assert.ok(!('instruction' in JSON.parse(fs.readFileSync(record, 'utf8'))), 'the key removed, never null');
  });
});

test('REFUSED at shipped defaults: rules that cannot be told stop a start in the factory, naming the file and the clear; no run written', async (t) => {
  const outside = path.join(ROOT, 'elsewhere.md');
  fs.writeFileSync(outside, 'Words from elsewhere.\n');
  const rows: Array<[string, (file: string) => void, string]> = [
    ['a frontmatter block', (file) => fs.writeFileSync(file, '---\ntools: Bash\n---\nUse Bash.\n'), 'frontmatter'],
    ['a link', (file) => fs.symlinkSync(outside, file), 'link'],
    ['a directory', (file) => fs.mkdirSync(file), 'not a file'],
  ];
  for (const [row, plant, fact] of rows)
    await t.test(row, async () => {
      const here = fresh();
      fs.mkdirSync(path.dirname(here.file), { recursive: true });
      plant(here.file);
      const before = runsWritten();
      await assert.rejects(started(here, row, 'pipao'), (err: Error & { exitCode?: number; _tag?: string }) => {
        assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2], err.message);
        names(err.message, fact, here.file, 'nemia factory rules pipao --clear');
        return true;
      });
      assert.deepEqual(runsWritten(), before, 'nothing started');
      const other = await started(here, `${row}, in the default factory`);
      assert.equal(frozen(other.id)[0]?.agent?.name, 'implementer', 'a start outside the factory is not stopped');
    });
});
