/**
 * A harness's fence under its block, and what a step may override of its agent (`overridable:`): the block read into the same fields as
 * the top-level keys it replaces, which are still read as its former spelling; a block for another harness, and a key written both ways,
 * refused; a step that sets what its agent does not offer refused at load, whether it names its agent or is hired one; an agent with no
 * line offering everything, with a hint at `nemia start`; and a board save that does not send the line keeping it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseAgent, parseWorkflow, WorkflowError, type Agent } from '../src/workflow.ts';
import { formerKeyLines } from '../src/folder/folder.store.ts';
import { formerFenceLine, overridableLine } from '../src/former/former.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-overrides-');
process.env.WF_ROOT = ROOT;
const { writeAgent } = await import('../src/runner.ts');
const { agentVersion } = await import('../src/agents/read.store.ts');

/** The agents a step may name, each parsed from its file's text. */
const agentsOf = (files: Record<string, string>): Map<string, Agent | WorkflowError> =>
  new Map(Object.entries(files).map(([name, text]) => [name, parseAgent(name, text)]));

/** Step `review`, from `text`, over `agents`, hired its agent by a factory where `hired` names one. */
const step = (text: string, agents: Map<string, Agent | WorkflowError>, hired?: string) =>
  parseWorkflow(
    'review',
    text,
    undefined,
    agents,
    undefined,
    hired === undefined ? undefined : { agent: hired, factory: 'acme', step: 'dev/review' },
  );

/** What `run` threw, as a refusal of the package: its message. Fails the test where it did not throw one. */
function refusal(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    assert.ok(err instanceof WorkflowError, `refused as a WorkflowError, not ${String(err)}`);
    return err.message;
  }
  return assert.fail('expected a refusal');
}

const FLAT =
  '---\npermissionMode: dontAsk\ntools: Read, Bash\nallowedTools: Bash(git log:*)\ndisallowedTools: Bash(cd:*)\n---\nYou review.\n';
const BLOCK =
  '---\nclaude:\n  fence:\n    permissionMode: dontAsk\n    tools: [Read, Bash]\n    allowedTools: Bash(git log:*)\n    disallowedTools: Bash(cd:*)\n---\nYou review.\n';

test("the fence under its harness's block reads as the top-level keys did, which are still read", async (t) => {
  await t.test('an agent: the same keys either way', () => {
    assert.deepEqual(parseAgent('reviewer', BLOCK).keys, parseAgent('reviewer', FLAT).keys);
    assert.equal(parseAgent('reviewer', BLOCK).keys.permissionMode, 'dontAsk');
  });
  await t.test("a step: its block's deny adds to its agent's, as the top-level line did", () => {
    const agents = agentsOf({ reviewer: BLOCK });
    const blocked = step('---\nplace: git\nagent: reviewer\nclaude:\n  fence:\n    disallowedTools: Bash(npm test)\n---\n', agents);
    const flat = step('---\nplace: git\nagent: reviewer\ndisallowedTools: Bash(npm test)\n---\n', agents);
    assert.deepEqual(blocked.disallowedTools, ['Bash(npm test)', 'Bash(cd:*)']);
    assert.deepEqual(blocked.disallowedTools, flat.disallowedTools);
    assert.deepEqual(blocked.agent?.keys, flat.agent?.keys, "the step's own keys name the fence key, either way");
  });
  await t.test("a codex step: its block's sandbox", () => {
    const read = step('---\nplace: git\nharness: codex\ncodex:\n  fence:\n    sandbox: read-only\n---\nReview.\n', new Map());
    assert.equal(read.sandbox, 'read-only');
  });
  await t.test('`nemia start` names a top-level fence key as the former spelling, and nothing of the block', () => {
    const dir = path.join(ROOT, 'former');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'review.md'), '---\nplace: git\npermissionMode: plan\n---\nReview.\n');
    fs.writeFileSync(path.join(dir, 'write.md'), '---\nplace: git\nclaude:\n  fence:\n    permissionMode: plan\n---\nWrite.\n');
    assert.deepEqual(formerKeyLines(dir), [formerFenceLine(path.join(dir, 'review.md'), 'permissionMode')]);
  });
});

test('REFUSED at load: a fence block the file cannot hold', async (t) => {
  const rows: Array<[string, string, string[]]> = [
    [
      'a claude block on a codex step',
      '---\nplace: git\nharness: codex\nclaude:\n  fence:\n    permissionMode: plan\n---\nR.\n',
      ['claude', 'codex'],
    ],
    [
      'a key both at the top level and in the block',
      '---\nplace: git\npermissionMode: plan\nclaude:\n  fence:\n    permissionMode: plan\n---\nR.\n',
      ['permissionMode'],
    ],
    ["a key the harness's fence does not take", '---\nplace: git\nclaude:\n  fence:\n    sandbox: read-only\n---\nR.\n', ['sandbox']],
    ['a block holding more than its fence', '---\nplace: git\nclaude:\n  model: opus\n---\nR.\n', ['model']],
    [
      'two blocks',
      '---\nplace: git\nclaude:\n  fence:\n    tools: Read\ncodex:\n  fence:\n    sandbox: read-only\n---\nR.\n',
      ['claude', 'codex'],
    ],
  ];
  for (const [name, text, named] of rows)
    await t.test(name, () => {
      const said = refusal(() => step(text, new Map()));
      for (const word of named) assert.ok(said.includes(`\`${word}`) || said.includes(word), `${name}: names ${word}`);
    });
});

/** An agent that offers what `offers` says on its `overridable:` line, or everything with no line. */
const offering = (offers?: string): Map<string, Agent | WorkflowError> =>
  agentsOf({
    reviewer: `---\n${offers === undefined ? '' : `overridable: ${offers}\n`}model: opus\nclaude:\n  fence:\n    permissionMode: dontAsk\n    allowedTools: Bash(git log:*), Bash(git diff:*)\n---\nYou review.\n`,
  });

test('what a step may override is what its agent offers: anything else is refused at load, naming the key and the agent', async (t) => {
  await t.test('REFUSED: a model the agent does not offer', () => {
    const said = refusal(() => step('---\nplace: git\nagent: reviewer\nmodel: sonnet\n---\n', offering('skills')));
    assert.ok(said.includes('`model`') && said.includes('reviewer'), said);
  });
  await t.test('REFUSED: the same, on a step its factory hires the agent into', () => {
    const said = refusal(() => step('---\nplace: git\nmodel: sonnet\n---\nReview.\n', offering('skills'), 'reviewer'));
    assert.ok(said.includes('`model`') && said.includes('reviewer'), said);
  });
  await t.test('REFUSED: a fence the agent does not offer, even one that only narrows', () => {
    const said = refusal(() =>
      step('---\nplace: git\nagent: reviewer\nclaude:\n  fence:\n    disallowedTools: Bash(git diff:*)\n---\n', offering('skills')),
    );
    assert.ok(said.includes('fence') && said.includes('disallowedTools'), said);
  });
  await t.test('offered, a fence that narrows loads; one that widens is still refused, as it was', () => {
    const narrowed = step(
      '---\nplace: git\nagent: reviewer\nclaude:\n  fence:\n    allowedTools: Bash(git log:*)\n---\n',
      offering('skills, fence'),
    );
    assert.deepEqual(narrowed.allowedTools, ['Bash(git log:*)']);
    const said = refusal(() =>
      step('---\nplace: git\nagent: reviewer\nclaude:\n  fence:\n    allowedTools: Bash(npm test)\n---\n', offering('skills, fence')),
    );
    assert.ok(said.includes('Bash(npm test)'), said);
  });
  await t.test('with no line, the agent offers everything, and `nemia start` says to write one', () => {
    const loaded = step(
      '---\nplace: git\nagent: reviewer\nmodel: sonnet\nclaude:\n  fence:\n    allowedTools: Bash(git log:*)\n---\n',
      offering(),
    );
    assert.equal(loaded.model, 'sonnet');
    const root = path.join(ROOT, 'no-offer');
    fs.mkdirSync(path.join(root, 'dev'), { recursive: true });
    fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dev', 'review.md'), '---\nplace: git\nagent: reviewer\n---\n');
    fs.writeFileSync(path.join(root, 'agents', 'reviewer.md'), '---\nmodel: opus\n---\nYou review.\n');
    assert.deepEqual(formerKeyLines(path.join(root, 'dev')), [overridableLine(path.join(root, 'agents', 'reviewer.md'))]);
  });
  await t.test('REFUSED: a word on `overridable:` that is nothing a step may override', () => {
    const said = refusal(() => parseAgent('reviewer', '---\noverridable: model, check\n---\nYou review.\n'));
    assert.ok(said.includes('`check`'), said);
  });
});

test("a save of an agent that does not send its `overridable:` line keeps the file's; `null` takes it out", () => {
  const dir = path.join(ROOT, 'workflows', 'agents');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'reviewer.md');
  fs.writeFileSync(file, '---\noverridable: model, fence\nmodel: opus\n---\nYou review.\n');
  const draft = { name: 'reviewer', keys: { model: 'sonnet' }, body: 'You review.' };
  writeAgent(dir, draft, { version: agentVersion(dir, 'reviewer') });
  assert.deepEqual(parseAgent('reviewer', fs.readFileSync(file, 'utf8')).overridable, ['model', 'fence'], 'the line kept');
  assert.equal(parseAgent('reviewer', fs.readFileSync(file, 'utf8')).keys.model, 'sonnet', 'and the change written');
  writeAgent(dir, { ...draft, overridable: null }, { version: agentVersion(dir, 'reviewer') });
  assert.equal(parseAgent('reviewer', fs.readFileSync(file, 'utf8')).overridable, undefined, 'taken out');
});
