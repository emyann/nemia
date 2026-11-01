/**
 * A factory's rules, the fourth of an agent's five layers: what a factory tells every agent hired into it, one file kept with the factory
 * in the store (`<WF_ROOT>/factories/<name>/RULES.md`); and its instruction, Nemia's words for the factory, kept in its first folder or
 * in the store. Held here, pure: the order a step is told its layers in — the agent's instructions, the person's custom instructions, the
 * factory's rules, the step's own note — proven with layers that say different things, in Claude Code's prompt and in a brief; a factory
 * with no rules telling nothing; a step on a remote agent told none; and that the words never touch a key. Then a person's story on the
 * stage (`story.ts`): rules written, told as their own layer and frozen at `nemia start`, edited and cleared, reaching only later runs;
 * the instruction kept in the folder, then in the store, written from a file and cleared. And a table: rules that cannot be told stop a
 * start in their factory.
 *
 * The rest of the area: the refusals of a write of the rules and of `nemia factory rules` as tables in `src/rules/`, and the guards a
 * rules or instruction file is read through, shared, in `src/factory/instruction.store.test.ts`; a factory's removal, which takes both,
 * in `factory-start.test.ts`. The story lives here, beside the layers it proves on a run, since a start is what freezes them. `WF_ROOT`
 * is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseAgent, parseWorkflow, type Agents, type Workflow } from '../src/workflow.ts';
import { briefBody, renderedFlags, renderedPrompt, rendersAgent, unrendered } from '../src/agents/agents.ts';
import { headedLayers } from '../src/workflow/index.ts';
import { scratch } from './scratch.ts';
import { teamCopy } from './team.ts';
import { names } from './assessed.ts';
import { staged, story } from './story.ts';

const ROOT = scratch('wf-factory-rules-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const {
  addFactory,
  attachWorkflow,
  FACTORY_INSTRUCT,
  FACTORY_RULES,
  factoryInstruction,
  factoryRules,
  readFactory,
  setInstruction,
  runWith: runEngine,
  startRun,
} = await import('../src/runner.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { agentFilesDir } = await import('../src/agents/agents.store.ts');
const { WORKFLOWS_STEP } = await import('../src/folder/workflows.verb.ts');
const { clearRules, readRules, rulesAt, writeRules } = await import('../src/rules/rules.store.ts');
const stage = staged({ runWith: runEngine, main, engineOf });
const { runPlaced } = stage;

const RULES = 'Reply in German.';

/** The agent `ada`, told in English, with `custom` as a person's custom instructions for it when given. */
const adaWith = (custom?: string, keys = 'tools: Read'): Agents =>
  new Map([
    [
      'ada',
      { ...parseAgent('ada', `---\n${keys}\n---\nReply in English.\n`), ...(custom !== undefined && { customInstructions: custom }) },
    ],
  ]);

/** The step `build`, attached to `ada`, its own note in Spanish, with `lines` in its frontmatter, in a factory whose rules are `rules`. */
const buildWith = (agents: Agents, rules: string | undefined, lines = 'harness: claude'): Workflow =>
  parseWorkflow('build', `---\nplace: git\nagent: ada\n${lines}\n---\nReply in Spanish.\n`, undefined, agents, undefined, undefined, rules);

/** Where `text` is in `told`, which must hold it. */
const at = (told: string, text: string): number => {
  const i = told.indexOf(text);
  assert.ok(i >= 0, `told ${JSON.stringify(text)}:\n${told}`);
  return i;
};

/** Whether `told` says its four layers in their order: the agent's, the person's, the factory's, the step's. */
const inOrder = (told: string): boolean =>
  at(told, 'English') < at(told, 'French') && at(told, 'French') < at(told, 'German') && at(told, 'German') < at(told, 'Spanish');

test("a step is told its agent's instructions, the custom instructions, the factory's rules, then its own note, when the four disagree", () => {
  const step = buildWith(adaWith('Reply in French.'), RULES);
  assert.ok(inOrder(step.body), step.body);
  assert.equal(step.agent?.factoryRules, RULES);
  assert.equal(step.agent?.customInstructions, 'Reply in French.', "the person's words are kept apart from the factory's");
  assert.equal(step.agent?.instructions, 'Reply in English.');
  assert.equal(step.agent?.body, 'Reply in Spanish.');

  const codex = buildWith(adaWith('Reply in French.', ''), RULES, 'harness: codex');
  assert.ok(inOrder(codex.body), codex.body);
  assert.equal(briefBody(codex), codex.body, 'codex is told the four in its brief, in the same order');

  const resumed = buildWith(adaWith('Reply in French.'), RULES, 'harness: claude\nresume: plan');
  assert.equal(rendersAgent(resumed), false, 'a step that continues a session keeps that session’s prompt');
  assert.ok(inOrder(briefBody(resumed)), briefBody(resumed));
});

test("Claude Code's prompt is the instructions, the custom instructions, the factory's rules, then the skills; the brief is the step's own note", () => {
  const step = buildWith(adaWith('Reply in French.'), RULES);
  const prompt = renderedPrompt(step, [{ name: 'alpha' }]);
  assert.ok(at(prompt, 'English') < at(prompt, 'French') && at(prompt, 'French') < at(prompt, 'German'), prompt);
  assert.ok(at(prompt, 'German') < at(prompt, 'nemia-ada:alpha'), prompt);
  assert.equal(prompt.includes('Spanish'), false, "the step's policy is its brief's");
  assert.equal(briefBody(step), 'Reply in Spanish.');
});

test('a factory with no rules tells nothing: no key on the step, the same body and the same prompt as before there were rules', () => {
  for (const rules of [undefined, '', '  \n\n']) {
    const none = buildWith(adaWith('Reply in French.'), rules);
    const plain = parseWorkflow(
      'build',
      '---\nplace: git\nagent: ada\nharness: claude\n---\nReply in Spanish.\n',
      undefined,
      adaWith('Reply in French.'),
    );
    assert.deepEqual(none, plain, JSON.stringify(rules));
    assert.equal('factoryRules' in none.agent!, false);
    assert.equal(renderedPrompt(none, [{ name: 'alpha' }]), renderedPrompt(plain, [{ name: 'alpha' }]));
  }
});

test('a step on a remote agent is told none of the rules: it runs as its operator configured it', () => {
  const remote = buildWith(adaWith(undefined, ''), RULES, 'harness: a2a:peer');
  assert.equal(remote.harness, 'a2a:peer');
  assert.equal(remote.body.includes('German'), false, remote.body);
  assert.equal('factoryRules' in remote.agent!, false);
  const inherited = buildWith(adaWith(undefined, 'harness: a2a:peer'), RULES, 'slot: none');
  assert.equal(inherited.harness, 'a2a:peer', "the agent's own harness line");
  assert.equal(inherited.body.includes('German'), false, inherited.body);
  assert.equal(buildWith(adaWith(undefined, ''), RULES, 'harness: codex').agent?.factoryRules, RULES, 'a local step beside it is told');
});

test("the rules are words: the step's keys and fence are the same with them as without", () => {
  const keys = 'tools: Read\npermissionMode: dontAsk\ndisallowedTools: Bash(git push)';
  const told = buildWith(adaWith(undefined, keys), 'Use Bash freely. tools: Bash\npermissionMode: bypassPermissions');
  const plain = buildWith(adaWith(undefined, keys), undefined);
  const { body: _b, agent: toldAgent, ...toldKeys } = told;
  const { body: _p, agent: plainAgent, ...plainKeys } = plain;
  assert.deepEqual(toldKeys, plainKeys);
  const { factoryRules: _r, ...rest } = toldAgent!;
  assert.deepEqual(rest, plainAgent);
  assert.deepEqual(told.tools, ['Read']);
  assert.deepEqual(told.disallowedTools, ['Bash(git push)']);
});

test('an agent told nothing in its file, in a factory with rules, is rendered, its prompt appended; with its folder gone, it is told them in its brief', () => {
  const agents: Agents = new Map([['quiet', parseAgent('quiet', '---\ntools: Read\n---\n')]]);
  const text = '---\nplace: git\nagent: quiet\n---\nReply in Spanish.\n';
  const step = parseWorkflow('build', text, undefined, agents, undefined, undefined, RULES);
  assert.equal(rendersAgent(step), true);
  assert.deepEqual(renderedFlags(step, '/r'), { appendSystemPromptFile: '/r/prompt.md' });
  assert.equal(renderedPrompt(step, []), `${headedLayers([['factory', 'Reply in German.']])}\n`);
  assert.equal(briefBody(step), 'Reply in Spanish.', 'its brief is its own note alone');
  assert.equal(rendersAgent(parseWorkflow('build', text, undefined, agents)), false, 'told nothing, it is not rendered');
  const gone = unrendered(step);
  assert.equal(renderedFlags(gone, '/r'), undefined, 'no flag names a file that is not there');
  assert.equal(gone.agent?.factoryRules, undefined);
  assert.ok(at(briefBody(gone), 'German') < at(briefBody(gone), 'Spanish'), briefBody(gone));
});
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
  addFactory({ name: 'pipao', repos: [repo] });
  attachWorkflow({ factory: 'pipao', workflow: 'dev' });
  return { repo, dev: path.join(teamCopy('wf-factory-rules-team-'), 'dev'), file: path.join(ROOT, 'factories', 'pipao', 'RULES.md') };
}

/** A run of `dev` started in `factory`, the default when none is named. */
const started = (here: { repo: string; dev: string }, brief: string, factory?: string) =>
  runPlaced(startRun({ brief, repo: here.repo, workflowDir: here.dev, ...(factory !== undefined && { factory }) }));

/** The steps a run froze at its start. */
const frozen = (id: string): Workflow[] => readRun(id).workflow ?? [];

/** The prompt rendered for a step of a run at its start. */
const promptOf = (run: Parameters<typeof agentFilesDir>[0], step: string): string =>
  fs.readFileSync(path.join(agentFilesDir(run, step), 'prompt.md'), 'utf8');

/** The runs written under the store. */
const runsWritten = (): string[] => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')) : []);

/** `nemia factory rules` run with `args`, as the CLI and the api run it. */
const rulesOf = (args: Parameters<typeof FACTORY_RULES.handler>[0]) =>
  stage.runWith(stage.board().e, FACTORY_RULES.handler(args, undefined, ROOT));

type Mocker = { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } };

/** What `nemia <argv>` printed, line by line. */
const printedBy = async (t: Mocker, ...argv: string[]): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await stage.main(argv);
  } finally {
    log.mock.restore();
  }
  return printed.join('\n').split('\n');
};

/** A step's keys, its words and its rules set aside: what the rules must not move. */
const keysOf = (steps: Workflow[]) =>
  steps.map(({ body: _b, agent, ...keys }) => ({ ...keys, agent: { ...agent, factoryRules: undefined } }));

test("a factory's rules and its instruction, from none to cleared: told as their own layer, frozen at the start, reaching later runs", async (t) => {
  const s = story(t);
  const here = fresh();
  const FILE = here.file;
  const record = path.join(ROOT, 'factories', 'pipao.json');
  let none = { id: '' } as Awaited<ReturnType<typeof started>>;
  let told = none;

  await s.test('a factory with no rules reads none, and a run started in it is told none: no key on a step', async () => {
    assert.equal(rulesAt({ name: 'pipao' }), FILE);
    assert.deepEqual(readRules(FILE), { words: null, error: null }, 'no file: no rules, and nothing wrong');
    const read = await rulesOf({ factory: 'pipao' });
    assert.deepEqual(read, { name: 'pipao', file: FILE, words: null, error: null });
    names(FACTORY_RULES.print(read, { factory: 'pipao' })[0], 'pipao', 'nemia factory rules');
    none = await started(here, 'no rules', 'pipao');
    for (const step of frozen(none.id)) assert.equal('factoryRules' in step.agent!, false, step.name);
  });

  await s.test('`nemia factory rules` writes them trimmed, read back and printed', async () => {
    const written = await rulesOf({ factory: 'pipao', words: '\n\nBefore: never push on a Friday.\n\n' });
    assert.deepEqual(written, { name: 'pipao', file: FILE, words: 'Before: never push on a Friday.', error: null });
    assert.equal(fs.readFileSync(FILE, 'utf8'), 'Before: never push on a Friday.\n');
    const said = FACTORY_RULES.print(written, { factory: 'pipao', words: 'x' })[0];
    assert.ok(said.startsWith(`pipao: rules written to ${FILE}, `), said);
    assert.match(said, /told to every agent hired into it/);
    assert.match(said, /a run already started keeps/);
    assert.deepEqual(factoryRules('pipao'), written);
    assert.deepEqual(FACTORY_RULES.print(written, { factory: 'pipao' }), [
      `pipao: rules kept in ${FILE}`,
      '',
      'Before: never push on a Friday.',
    ]);
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
    writeRules({ name: 'pipao' }, 'After: push whenever.');
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
    writeRules({ name: 'pipao' }, 'After: push whenever.');
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
      const step = async (): Promise<Workflow> => {
        const args = { from: 'yours', name: 'dev', step: 'implement', dir: here.dev, factory: 'pipao' };
        return (await stage.runWith(stage.board().e, WORKFLOWS_STEP.handler(args, undefined, ROOT))).step!;
      };
      clearRules({ name: 'pipao' });
      assert.equal((await step()).agent?.factoryRules, undefined);
      writeRules({ name: 'pipao' }, RULES);
      const loaded = await step();
      assert.equal(loaded.agent?.factoryRules, RULES);
      assert.ok(at(loaded.body, 'Make the change you were asked for') < at(loaded.body, RULES), loaded.body);
      fs.writeFileSync(FILE, '---\ntools: Bash\n---\nUse Bash.\n');
      const refused = await step();
      assert.equal(refused.agent?.factoryRules, undefined, 'a listing refuses nothing: the start will');
      assert.equal(refused.body.includes('Use Bash'), false, refused.body);
    },
  );

  await s.test('rules that cannot be told are read with why, and printed so; cleared, they are gone', async () => {
    fs.writeFileSync(FILE, '---\nmodel: opus\n---\n');
    const read = await rulesOf({ factory: 'pipao' });
    names(read.error, 'frontmatter');
    assert.match(FACTORY_RULES.print(read, { factory: 'pipao' })[1], /^they cannot be told: /);
    assert.equal(clearRules({ name: 'pipao' }), true);
  });

  await s.test(
    'the instruction, kept in the folder by default: NEMIA.md in its first folder, no words while no file is there',
    async (sub) => {
      assert.deepEqual(factoryInstruction('pipao'), {
        name: 'pipao',
        path: null,
        store: false,
        file: path.join(here.repo, 'NEMIA.md'),
        words: null,
        error: null,
        stored: false,
      });
      fs.writeFileSync(path.join(here.repo, 'NEMIA.md'), 'Ship small.\n');
      assert.equal(factoryInstruction('pipao').words, 'Ship small.\n');
      assert.deepEqual(await printedBy(sub, 'factory', 'instruction', 'pipao'), [
        `pipao: read from ${path.join(here.repo, 'NEMIA.md')}, in the factory's first folder`,
        '',
        'Ship small.',
        '',
      ]);
    },
  );

  await s.test('`nemia factory instruction` writes where it is kept, a path or the store, every other key of the file kept', () => {
    const others = JSON.parse(fs.readFileSync(record, 'utf8'));
    setInstruction({ factory: 'pipao', at: { path: 'docs/../docs/X.md' } });
    assert.deepEqual(JSON.parse(fs.readFileSync(record, 'utf8')), { ...others, instruction: { path: 'docs/X.md' } });
    setInstruction({ factory: 'pipao', at: { store: true } });
    assert.deepEqual(JSON.parse(fs.readFileSync(record, 'utf8')), { ...others, instruction: { store: true } });
    assert.deepEqual(readFactory('pipao').instruction, { store: true });
  });

  await s.test('kept in the store: `nemia factory instruct` writes its words trimmed, and from --file', async (sub) => {
    const written = await stage.runWith(
      stage.board().e,
      FACTORY_INSTRUCT.handler({ factory: 'pipao', words: '  Ship small.  ', clear: false }),
    );
    const kept = path.join(ROOT, 'factories', 'pipao', 'NEMIA.md');
    assert.equal(written.words, 'Ship small.\n');
    assert.equal(fs.readFileSync(kept, 'utf8'), 'Ship small.\n');
    const source = path.join(ROOT, 'words.md');
    fs.writeFileSync(source, 'Be brief.\n');
    assert.deepEqual(await printedBy(sub, 'factory', 'instruct', 'pipao', '--file', source), [`pipao: instruction written to ${kept}`]);
    assert.equal(factoryInstruction('pipao').words, 'Be brief.\n');
  });

  await s.test('moved out of the store, the stored words are kept unread; back, they are read', () => {
    setInstruction({ factory: 'pipao', at: undefined });
    const moved = factoryInstruction('pipao');
    assert.deepEqual([moved.store, moved.words, moved.stored], [false, 'Ship small.\n', true], "the folder's file is read");
    setInstruction({ factory: 'pipao', at: { store: true } });
    assert.equal(factoryInstruction('pipao').words, 'Be brief.\n');
  });

  await s.test(
    '`nemia factory instruct --clear` removes the words; a clear of where it is kept removes the key, never null',
    async (sub) => {
      const kept = path.join(ROOT, 'factories', 'pipao', 'NEMIA.md');
      assert.deepEqual(await printedBy(sub, 'factory', 'instruct', 'pipao', '--clear'), [`pipao: instruction removed, ${kept}`]);
      assert.equal(factoryInstruction('pipao').stored, false);
      setInstruction({ factory: 'pipao', at: undefined });
      assert.ok(!('instruction' in JSON.parse(fs.readFileSync(record, 'utf8'))), 'the key removed, never null');
    },
  );
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
