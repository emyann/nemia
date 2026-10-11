/**
 * Custom instructions, the second of an agent's five layers: what a person adds to an agent they use without rewriting it, one file per
 * agent name in their store (`<WF_ROOT>/custom-instructions/<agent>.md`). Held here: the order a step is told its layers in — the agent's
 * instructions, then the custom instructions, then the step's own note — proven with layers that say different things; the freeze at
 * `nemia start`, proven with an edit after it; that the words never touch a key; and the load's refusals, each beside what still starts.
 * `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Result, Schema } from 'effect';
import { parseAgent, parseWorkflow, type Agents, type Workflow } from '../src/workflow.ts';
import { briefBody, renderedFlags, renderedPrompt, rendersAgent, unrendered } from '../src/agents/agents.ts';
import { FrozenStepSchema, loadWorkflows } from '../src/folder/folder.store.ts';
import { scratch } from './scratch.ts';
import { teamCopy } from './team.ts';
import { runGiven } from './placed.ts';

const ROOT = scratch('wf-custom-');
process.env.WF_ROOT = ROOT;
const { startRun } = await import('../src/runner.ts');
const { gitPlaceLayer } = await import('../src/place/shipped.store.ts');
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');
const { agentFilesDir } = await import('../src/agents/agents.store.ts');
const { clearCustomInstructions, customInstructionsFor, writeCustomInstructions } = await import('../src/agents/custom.store.ts');
const { Invalid, Missing } = await import('../src/refusal/refusal.ts');

/** The agent `ada`, told in English, with `custom` as a person's custom instructions for it when given. */
const adaWith = (custom?: string, keys = 'tools: Read'): Agents =>
  new Map([
    [
      'ada',
      { ...parseAgent('ada', `---\n${keys}\n---\nReply in English.\n`), ...(custom !== undefined && { customInstructions: custom }) },
    ],
  ]);

/** The step `build`, attached to `ada`, its own note in Spanish, on `harness`. */
const buildOn = (agents: Agents, harness = 'claude'): Workflow =>
  parseWorkflow('build', `---\nplace: git\nagent: ada\nharness: ${harness}\n---\nReply in Spanish.\n`, undefined, agents);

/** Where `text` is in `told`, which must hold it. */
const at = (told: string, text: string): number => {
  const i = told.indexOf(text);
  assert.ok(i >= 0, `told ${JSON.stringify(text)}:\n${told}`);
  return i;
};

/** A git repository with one commit, for a start. */
function aRepo(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
}

const CUSTOM = path.join(ROOT, 'custom-instructions');

/** Write the person's custom instructions for `agent` by hand, as the store keeps them. */
function customFor(agent: string, text: string): void {
  fs.mkdirSync(CUSTOM, { recursive: true });
  fs.writeFileSync(path.join(CUSTOM, `${agent}.md`), text);
}

test("a step is told its agent's instructions, then the custom instructions, then its own note, when the three disagree", () => {
  const step = buildOn(adaWith('Reply in French.'));
  assert.ok(at(step.body, 'English') < at(step.body, 'French') && at(step.body, 'French') < at(step.body, 'Spanish'), step.body);
  assert.equal(step.agent?.customInstructions, 'Reply in French.');
  assert.equal(step.agent?.instructions, 'Reply in English.', "the agent's own words are kept apart from the person's");
  assert.equal(step.agent?.body, 'Reply in Spanish.');

  const codex = buildOn(adaWith('Reply in French.', ''), 'codex');
  assert.ok(at(codex.body, 'English') < at(codex.body, 'French') && at(codex.body, 'French') < at(codex.body, 'Spanish'), codex.body);
  assert.equal(briefBody(codex), codex.body, 'codex is told the three in its brief, in the same order');

  const none = buildOn(adaWith());
  assert.equal(none.agent?.customInstructions, undefined);
  assert.equal(none.body.includes('French'), false);
});

test("Claude Code's prompt is the instructions, then the custom instructions, then the skills; the brief is the step's own note", () => {
  const step = buildOn(adaWith('Reply in French.'));
  const prompt = renderedPrompt(step, [{ name: 'alpha' }]);
  assert.ok(at(prompt, 'English') < at(prompt, 'French') && at(prompt, 'French') < at(prompt, 'nemia-ada:alpha'), prompt);
  assert.equal(prompt.includes('Spanish'), false, "the step's policy is its brief's");
  assert.equal(briefBody(step), 'Reply in Spanish.');
});

test('an agent told nothing in its file but given custom instructions is rendered, its prompt appended; with its folder gone, it is told them in its brief', () => {
  const agents: Agents = new Map([
    ['quiet', { ...parseAgent('quiet', '---\ntools: Read\n---\n'), customInstructions: 'Reply in French.' }],
  ]);
  const step = parseWorkflow('build', '---\nplace: git\nagent: quiet\n---\nReply in Spanish.\n', undefined, agents);
  assert.equal(rendersAgent(step), true);
  assert.deepEqual(renderedFlags(step, '/r'), { appendSystemPromptFile: '/r/prompt.md' });
  assert.equal(renderedPrompt(step, []), 'Reply in French.\n');
  const gone = unrendered(step);
  assert.equal(renderedFlags(gone, '/r'), undefined, 'no flag names a file that is not there');
  assert.equal(gone.agent?.customInstructions, undefined);
  assert.ok(at(briefBody(gone), 'French') < at(briefBody(gone), 'Spanish'), briefBody(gone));
});

test("custom instructions are words: the step's keys and fence are the same with them as without", () => {
  const keys = 'tools: Read\npermissionMode: dontAsk\ndisallowedTools: Bash(git push)';
  const told = buildOn(adaWith('Use Bash freely. tools: Bash', keys));
  const plain = buildOn(adaWith(undefined, keys));
  const { body: _b, agent: toldAgent, ...toldKeys } = told;
  const { body: _p, agent: plainAgent, ...plainKeys } = plain;
  assert.deepEqual(toldKeys, plainKeys);
  const { customInstructions: _c, ...rest } = toldAgent!;
  assert.deepEqual(rest, plainAgent);
  assert.deepEqual(told.tools, ['Read']);
});

test("a load from the store gives each step its agent's custom instructions, read from <WF_ROOT>/custom-instructions; without the store, none", () => {
  const team = teamCopy('wf-custom-team-');
  customFor('implementer', 'Write the tests in French.\n');
  try {
    const implement = loadWorkflows(path.join(team, 'dev'), { home: ROOT }).find((s) => s.name === 'implement')!;
    assert.equal(implement.agent?.customInstructions, 'Write the tests in French.');
    assert.ok(at(implement.body, 'Make the change you were asked for') < at(implement.body, 'Write the tests in French.'), implement.body);
    const away = loadWorkflows(path.join(team, 'dev')).find((s) => s.name === 'implement')!;
    assert.equal(away.agent?.customInstructions, undefined);
    assert.equal(away.body.includes('French'), false);
  } finally {
    fs.rmSync(CUSTOM, { recursive: true, force: true });
  }
});

test('`nemia start` freezes the custom instructions with the step: an edit or a removal after it reaches only a later run', async () => {
  const team = teamCopy('wf-custom-freeze-');
  const repo = aRepo();
  customFor('implementer', 'Before: French.\n');
  try {
    const run = await runPlaced(startRun({ brief: 'freeze the words', repo, workflowDir: path.join(team, 'dev') }));
    customFor('implementer', 'After: German.\n');
    const frozen = () => (readRun(run.id).workflow ?? []).find((s) => s.name === 'implement')!;
    const prompt = () => fs.readFileSync(path.join(agentFilesDir(run, 'implement'), 'prompt.md'), 'utf8');
    for (const when of ['after an edit', 'after a removal']) {
      assert.equal(frozen().agent?.customInstructions, 'Before: French.', when);
      assert.ok(frozen().body.includes('Before: French.') && !frozen().body.includes('German'), `${when}: ${frozen().body}`);
      assert.ok(prompt().includes('Before: French.') && !prompt().includes('German'), `${when}: ${prompt()}`);
      fs.rmSync(CUSTOM, { recursive: true, force: true });
    }
    customFor('implementer', 'After: German.\n');
    const later = await runPlaced(startRun({ brief: 'the later words', repo, workflowDir: path.join(team, 'dev') }));
    const step = (readRun(later.id).workflow ?? []).find((s) => s.name === 'implement')!;
    assert.equal(step.agent?.customInstructions, 'After: German.');
    assert.ok(fs.readFileSync(path.join(agentFilesDir(later, 'implement'), 'prompt.md'), 'utf8').includes('After: German.'));
  } finally {
    fs.rmSync(CUSTOM, { recursive: true, force: true });
  }
});

test('REFUSED at shipped defaults: custom instructions with a frontmatter block, a link, or a directory, stop a start of a step naming the agent; one naming another starts', async () => {
  const team = teamCopy('wf-custom-refused-');
  const solo = path.join(team, 'solo');
  fs.mkdirSync(solo);
  fs.writeFileSync(path.join(solo, 'write.md'), '---\nplace: git\nagent: reviewer\n---\nWrite it.\n');
  const repo = aRepo();
  const outside = path.join(ROOT, 'elsewhere.md');
  fs.writeFileSync(outside, 'Words from elsewhere.\n');
  const runsIn = (): number => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).length : 0);
  const refusals: Array<[string, () => void, RegExp]> = [
    ['a frontmatter block', () => customFor('implementer', '---\ntools: Bash\n---\nUse Bash.\n'), /opens with a frontmatter block/],
    [
      'a link',
      () => {
        fs.mkdirSync(CUSTOM, { recursive: true });
        fs.symlinkSync(outside, path.join(CUSTOM, 'implementer.md'));
      },
      /is a link/,
    ],
    ['a directory', () => fs.mkdirSync(path.join(CUSTOM, 'implementer.md'), { recursive: true }), /is not a file/],
  ];
  try {
    for (const [what, plant, said] of refusals) {
      plant();
      const before = runsIn();
      await assert.rejects(
        async () => await runPlaced(startRun({ brief: what, repo, workflowDir: path.join(team, 'dev') })),
        (err: Error & { exitCode?: number }) => {
          assert.match(err.message, said, what);
          assert.ok(err.message.includes(path.join(CUSTOM, 'implementer.md')), `${what}: names the file: ${err.message}`);
          assert.equal(err.exitCode, 2, what);
          return true;
        },
      );
      assert.equal(runsIn(), before, `${what}: nothing started`);
      const other = await runPlaced(startRun({ brief: `${what}, another agent`, repo, workflowDir: solo }));
      assert.equal((readRun(other.id).workflow ?? [])[0]?.agent?.name, 'reviewer', what);
      fs.rmSync(CUSTOM, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(CUSTOM, { recursive: true, force: true });
  }
});

test('a frozen step with custom instructions reads back by the schema, and so does an older one without; a value that is not words is refused', () => {
  const decode = Schema.decodeUnknownResult(FrozenStepSchema);
  for (const step of [buildOn(adaWith('Reply in French.')), buildOn(adaWith())]) {
    const frozen = JSON.parse(JSON.stringify(step)) as unknown;
    const read = decode(frozen);
    assert.ok(Result.isSuccess(read), Result.isFailure(read) ? String(read.failure) : '');
    assert.deepEqual(read.success, frozen);
  }
  const step = JSON.parse(JSON.stringify(buildOn(adaWith('Reply in French.')))) as Workflow;
  assert.ok(Result.isFailure(decode({ ...step, agent: { ...step.agent, customInstructions: 7 } })));
});

test("REFUSED: writeCustomInstructions and clearCustomInstructions for a name no place has throw Missing and write nothing; a name only the repository's .claude/agents has is written", () => {
  const home = scratch('wf-custom-home-');
  const repo = scratch('wf-custom-repo-');
  fs.mkdirSync(path.join(repo, 'workflows', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'workflows', 'agents', 'scribe.md'), '---\ndescription: Writes it down.\n---\nWrite.\n');
  const custom = path.join(home, 'custom-instructions');
  for (const [what, call] of [
    ['a write', () => writeCustomInstructions(home, 'ghost', 'Boo.', repo)],
    ['a clear', () => clearCustomInstructions(home, 'ghost', repo)],
  ] as const) {
    assert.throws(call, (err: Error) => {
      assert.ok(err instanceof Missing, `${what}: ${err.message}`);
      assert.ok(err.message.startsWith(`no agent named ghost where a run on ${repo} looks for one`), err.message);
      assert.ok(err.message.includes('The agents there: scribe.') && err.message.includes('the repository it is in'), err.message);
      return true;
    });
    assert.equal(fs.existsSync(custom), false, `${what} writes nothing`);
  }
  fs.mkdirSync(path.join(repo, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude', 'agents', 'helper.md'), '---\ndescription: Helps.\n---\nHelp.\n');
  assert.equal(writeCustomInstructions(home, 'helper', 'Help in French.', repo), path.join(custom, 'helper.md'));
  assert.equal(fs.readFileSync(path.join(custom, 'helper.md'), 'utf8'), 'Help in French.\n');
  assert.equal(clearCustomInstructions(home, 'helper', repo), true);
});

test("the store's own agent, nemia, whom no place names, has custom instructions all the same: written, read and cleared", () => {
  const home = scratch('wf-custom-home-');
  const repo = scratch('wf-custom-repo-');
  const file = path.join(home, 'custom-instructions', 'nemia.md');
  assert.equal(customInstructionsFor(home, 'nemia', repo), undefined, 'none yet, and no refusal');
  assert.equal(writeCustomInstructions(home, 'nemia', 'Write to me in French.', repo), file);
  assert.equal(customInstructionsFor(home, 'nemia', repo), 'Write to me in French.');
  assert.equal(clearCustomInstructions(home, 'nemia', repo), true);
  assert.equal(fs.existsSync(file), false);
});

test('REFUSED: writeCustomInstructions over a directory throws Invalid naming the file and the clear, and leaves the directory as it was', () => {
  const home = scratch('wf-custom-home-');
  const repo = scratch('wf-custom-repo-');
  fs.mkdirSync(path.join(repo, 'workflows', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'workflows', 'agents', 'scribe.md'), '---\ndescription: Writes it down.\n---\nWrite.\n');
  const file = path.join(home, 'custom-instructions', 'scribe.md');
  fs.mkdirSync(file, { recursive: true });
  fs.writeFileSync(path.join(file, 'keep.txt'), 'kept\n');
  assert.throws(
    () => writeCustomInstructions(home, 'scribe', 'Write in French.', repo),
    (err: Error) => {
      assert.ok(err instanceof Invalid, err.message);
      assert.ok(err.message.includes(`${file} is not a file`), err.message);
      assert.ok(err.message.includes('nemia agents custom scribe --clear'), err.message);
      return true;
    },
  );
  assert.ok(fs.statSync(file).isDirectory());
  assert.equal(fs.readFileSync(path.join(file, 'keep.txt'), 'utf8'), 'kept\n');
  assert.equal(clearCustomInstructions(home, 'scribe', repo), true);
  assert.equal(writeCustomInstructions(home, 'scribe', 'Write in French.', repo), file);
  assert.equal(fs.readFileSync(file, 'utf8'), 'Write in French.\n');
});
