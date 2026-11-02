/**
 * A step given skills from four places: a person's story on the stage (`story.ts`), over the tests' team (`team.ts`) and a repository
 * the test place knows. The agent `implementer` gives its own skill and one named with its folder (`apps/web:z`); the step `implement`
 * adds a skill of the team, one of a nested folder (`app:y`) and one of the repository's `.claude/skills/` linked inside the checkout
 * (`x`); `review` adds the repository's own `y`. The folder's check gives each session the agent's skills, then the step's, each once;
 * `nemia start` freezes each as files under its bare name, never a link, renders and names them, and gives each session its plugin's
 * copies and no other (`enabledSkillsOf`); the folder's version moves with every file a skill reads; a later edit changes nothing the
 * run froze.
 *
 * Then two tables: a step's own `skills:` line read beside its agent's — what it adds, what it writes back, what the record reads —
 * and its refusals at shipped defaults (`addedSkillsRefusal` and the line's own); and the skills a start and the folder's check refuse
 * by name, with no run left. The link rule itself is held beside its code (`src/skills/read.store.test.ts`), the shipped build
 * folder's kit skills in `skill-folders.test.ts`. `WF_ROOT` is set before the modules are imported, since they read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Result, Schema } from 'effect';
import { parseAgent, parseWorkflow, renderStep, splitFrontmatter, WorkflowError, type Agents, type Workflow } from '../src/workflow.ts';
import { headedLayers } from '../src/workflow/index.ts';
import { briefBody, enabledSkillsOf, pluginOf, unrendered } from '../src/agents/agents.ts';
import { scratch } from './scratch.ts';
import { TEAM, teamCopy } from './team.ts';
import { names } from './assessed.ts';
import { staged, story } from './story.ts';

const ROOT = scratch('wf-step-skills-');
process.env.WF_ROOT = ROOT;
const { runWith: runEngine, startRun, writeWorkflow } = await import('../src/runner.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const { FrozenStepSchema, loadWorkflows } = await import('../src/folder/folder.store.ts');
const { workflowVersion } = await import('../src/folder/version.store.ts');
const { skillsFor, skillVersion } = await import('../src/skills/read.store.ts');
const { agentFilesDir, renderedSkillVersions, skillsAgain, writeAgentFiles } = await import('../src/agents/agents.store.ts');
const { readRun } = await import('../src/record/record.store.ts');
const stage = staged({ runWith: runEngine, main, engineOf });
const { runPlaced } = stage;

/** A SKILL.md named `name` whose body is `body`. */
const skill = (name: string, body = 'Do it.'): string => `---\nname: ${name}\ndescription: Do the thing.\n---\n${body}\n`;

/** The files `files`, each by its path under `dir`, written with its text; `dir`. */
function written(dir: string, files: Record<string, string>): string {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

/** The runs the store holds, by what their folder lists. */
const runsNow = (): string[] => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).sort() : []);

/** The skill `name` of the folder `folder` of `repo`, where a session there finds it; the repository's own for `.`. */
const nested = (repo: string, folder: string, name: string): string => path.join(repo, folder, '.claude', 'skills', name);

/** A repository the test place knows, holding `files`: the folder. */
function repository(files: Record<string, string> = {}): string {
  const repo = written(fs.mkdtempSync(path.join(ROOT, 'repo-')), files);
  fs.mkdirSync(path.join(repo, '.claude', 'skills'), { recursive: true });
  stage.place().world.repository(repo, {});
  return repo;
}

/** The tests' team, copied, with each of `files` written over the copy's: the copy's `dev/`. */
function teamWith(files: Record<string, string>): string {
  return path.join(written(teamCopy('wf-step-skills-team-'), files), 'dev');
}

/** The team's agent `implementer`, its `skills:` line given `line`: the text of agents/implementer.md. */
function implementerGiving(line: string): string {
  const text = fs.readFileSync(path.join(TEAM, 'agents', 'implementer.md'), 'utf8');
  assert.ok(text.includes('skills: implement-a-change\n'), text);
  return text.replace('skills: implement-a-change\n', `skills: ${line}\n`);
}

/** A step of the team's `implement`, its own `skills:` line `line`. */
const implementAdding = (line: string): string => `---\nplace: git\nagent: implementer\nskills: ${line}\n---\n`;

/** The folder of skills the run froze for its step `step`, whose agent is `agent`. */
const frozen = (run: { id: string }, step: string, agent: string): string => path.join(agentFilesDir(run, step), pluginOf(agent), 'skills');

/** Every entry under `dir`, by its path in it, as what it is: `link`, `folder` or a file's text. */
const entriesOf = (dir: string): Record<string, string> =>
  Object.fromEntries(
    (fs.readdirSync(dir, { recursive: true }) as string[]).sort().map((entry) => {
      const stat = fs.lstatSync(path.join(dir, entry));
      return [entry, stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'folder' : fs.readFileSync(path.join(dir, entry), 'utf8')];
    }),
  );

/** The step `name` of `steps`. */
const stepNamed = (steps: readonly Workflow[], name: string): Workflow => steps.find((s) => s.name === name)!;

/** The team's one skill told whole after its agent's instructions (`preload: true`): the shipper's merge. */
const PRELOADED = 'trial-merge-a-branch';

/** The body of the team's skill `name`, as a prompt tells it whole. */
const teamBody = (name: string): string => {
  const file = path.join(TEAM, 'skills', name, 'SKILL.md');
  return splitFrontmatter(file, fs.readFileSync(file, 'utf8')).body;
};

test('a step given skills from four places: frozen as files under bare names, named, given alone, and moved by no later edit', async (t) => {
  const s = story(t);
  const repo = repository({
    'skills/x/SKILL.md': skill('x', 'The linked one.'),
    'skills/x/notes.md': 'Notes.\n',
    '.claude/skills/y/SKILL.md': skill('y', 'The root one.'),
    'app/.claude/skills/y/SKILL.md': skill('y', 'The nested one.'),
    'app/.claude/skills/y/notes.md': 'Nested notes.\n',
    'apps/web/.claude/skills/z/SKILL.md': skill('z'),
  });
  fs.symlinkSync('../../skills/x', nested(repo, '.', 'x'));
  const dev = teamWith({
    'agents/implementer.md': implementerGiving('implement-a-change, apps/web:z'),
    'dev/implement.md': implementAdding('review-a-change, app:y, x'),
  });
  const review = fs.readFileSync(path.join(dev, 'review.md'), 'utf8');
  fs.writeFileSync(path.join(dev, 'review.md'), review.replace('agent: reviewer\n', 'agent: reviewer\nskills: y\n'));
  let run: { id: string } = { id: '' };
  let record: Workflow[] = [];
  let files: Record<string, string> = {};

  await s.test("the folder's check gives implement its agent's skills, then its step's, each once, the step's own line kept apart", () => {
    const steps = loadWorkflows(dev, { repo });
    const implement = stepNamed(steps, 'implement');
    assert.deepEqual(implement.agent?.skills, ['implement-a-change', 'apps/web:z', 'review-a-change', 'app:y', 'x']);
    assert.deepEqual(implement.skills, ['review-a-change', 'app:y', 'x']);
    assert.deepEqual(implement.agent?.addedSkills, ['review-a-change', 'app:y', 'x']);
    assert.deepEqual(stepNamed(steps, 'review').agent?.skills, ['review-a-change', 'ask-for-another-round', 'y']);
  });

  await s.test('`nemia start` freezes each skill as files under its bare name, never a link, and nothing named for the line', async () => {
    run = await runPlaced(startRun({ brief: 'skills from four places', repo, workflowDir: dev }));
    const at = frozen(run, 'implement', 'implementer');
    assert.deepEqual(fs.readdirSync(at).sort(), ['implement-a-change', 'review-a-change', 'x', 'y', 'z']);
    assert.deepEqual(entriesOf(path.join(at, 'x')), { 'SKILL.md': skill('x', 'The linked one.'), 'notes.md': 'Notes.\n' });
    assert.deepEqual(entriesOf(path.join(at, 'y')), { 'SKILL.md': skill('y', 'The nested one.'), 'notes.md': 'Nested notes.\n' });
    assert.equal(fs.lstatSync(path.join(at, 'x')).isDirectory(), true, 'the linked skill is a folder of its own');
    for (const step of ['implement', 'review', 'ship']) {
      const all = entriesOf(agentFilesDir(run, step));
      assert.deepEqual(
        Object.keys(all).filter((entry) => all[entry] === 'link'),
        [],
        `${step}: no link is frozen`,
      );
    }
    files = entriesOf(agentFilesDir(run, 'implement'));
  });

  await s.test('the record says each skill as its line writes it, at the version of the folder it was read from', () => {
    record = readRun(run.id).workflow ?? [];
    const implement = stepNamed(record, 'implement');
    assert.deepEqual(implement.skills, ['review-a-change', 'app:y', 'x']);
    assert.deepEqual(implement.agent?.skills, ['implement-a-change', 'apps/web:z', 'review-a-change', 'app:y', 'x']);
    assert.deepEqual(implement.agent?.addedSkills, ['review-a-change', 'app:y', 'x']);
    const versions = renderedSkillVersions(run, implement);
    assert.equal(versions.get('app:y'), skillVersion(nested(repo, 'app', 'y')));
    assert.equal(versions.get('apps/web:z'), skillVersion(nested(repo, 'apps/web', 'z')));
    assert.equal(versions.get('x'), skillVersion(nested(repo, '.', 'x')));
    assert.equal(versions.has('y'), false, 'never under its bare name');
  });

  await s.test(
    "each prompt names its skills under the plugin by their bare names, a preloaded one told whole, each the source's copy",
    () => {
      for (const name of ['implement', 'review', 'ship']) {
        const step = stepNamed(record, name);
        const agent = step.agent!;
        const plugin = pluginOf(agent.name);
        const prompt = fs.readFileSync(path.join(agentFilesDir(run, name), 'prompt.md'), 'utf8');
        assert.ok(prompt.startsWith(headedLayers([['instructions', agent.instructions!]])), `${name}: the instructions first`);
        const loaded = agent.skills!.map((given) => given.slice(given.lastIndexOf(':') + 1)).filter((bare) => bare !== PRELOADED);
        const listed = `${loaded.map((bare) => `\`${plugin}:${bare}\``).join(', ')}.`;
        if (loaded.length) assert.ok(prompt.includes(listed), `${name}: the skills to load listed in order\n\n${prompt}`);
        const preloaded = `\`${plugin}:${PRELOADED}\``;
        assert.ok(![`${preloaded}.`, `${preloaded},`].some((at) => prompt.includes(at)), `${name}: one told whole is not listed`);
        for (const given of agent.skills!) {
          const bare = given.slice(given.lastIndexOf(':') + 1);
          assert.ok(prompt.includes(`\`${plugin}:${bare}\``), `${name}: ${given} named\n\n${prompt}`);
          if (!fs.existsSync(path.join(TEAM, 'skills', given))) continue;
          assert.equal(
            fs.readFileSync(path.join(frozen(run, name, agent.name), given, 'SKILL.md'), 'utf8'),
            fs.readFileSync(path.join(TEAM, 'skills', given, 'SKILL.md'), 'utf8'),
            `${name}: ${given} is the team's copy`,
          );
          const whole = prompt.includes(`## Skill \`${plugin}:${given}\`\n\n${teamBody(given)}`);
          assert.equal(whole, given === PRELOADED, `${name}: ${given} told whole only when it preloads`);
        }
        assert.ok(!prompt.includes('app:y') && !prompt.includes('apps/web:'), `${name}: no line's spelling`);
      }
    },
  );

  await s.test("each session is given its plugin's copies and no other: review's `y` is the repository's own, never implement's", () => {
    assert.deepEqual(enabledSkillsOf(stepNamed(record, 'implement')), [
      'nemia-implementer:implement-a-change',
      'nemia-implementer:z',
      'nemia-implementer:review-a-change',
      'nemia-implementer:y',
      'nemia-implementer:x',
    ]);
    assert.deepEqual(enabledSkillsOf(stepNamed(record, 'review')), [
      'nemia-reviewer:review-a-change',
      'nemia-reviewer:ask-for-another-round',
      'nemia-reviewer:y',
    ]);
    assert.equal(fs.readFileSync(path.join(frozen(run, 'review', 'reviewer'), 'y', 'SKILL.md'), 'utf8'), skill('y', 'The root one.'));
  });

  await s.test('a step whose rendered folder is gone is told every skill whole in its brief, under the name its line writes', () => {
    const found = skillsFor(dev, { repo });
    for (const step of record.filter((s) => s.agent?.skills?.length)) {
      const brief = briefBody(unrendered(step, skillsAgain(step, found)));
      assert.ok(brief.startsWith(headedLayers([['instructions', step.agent!.instructions!]])), `${step.name}: the instructions first`);
      for (const given of step.agent!.skills!) {
        const dir = found.at.get(given);
        assert.equal(typeof dir, 'string', given);
        const body = splitFrontmatter(given, fs.readFileSync(path.join(dir as string, 'SKILL.md'), 'utf8')).body;
        assert.ok(brief.includes(`## Skill \`${given}\`\n\n${body.trim()}`), `${step.name}: ${given} told whole\n\n${brief}`);
      }
    }
    const ship = stepNamed(record, 'ship');
    assert.ok(!briefBody(unrendered(ship)).includes(teamBody(PRELOADED).trim()), 'with none read, none told');
  });

  await s.test(
    "the folder's version moves with every file a skill reads: the team's, a nested folder's, and the linked one's real file",
    () => {
      for (const file of [
        path.join(path.dirname(dev), 'skills', 'review-a-change', 'SKILL.md'),
        path.join(nested(repo, 'app', 'y'), 'SKILL.md'),
        path.join(nested(repo, 'apps/web', 'z'), 'SKILL.md'),
        path.join(repo, 'skills', 'x', 'notes.md'),
      ]) {
        const before = workflowVersion(dev, { repo });
        assert.equal(workflowVersion(dev, { repo }), before);
        fs.appendFileSync(file, 'Edited.\n');
        assert.notEqual(workflowVersion(dev, { repo }), before, file);
      }
    },
  );

  await s.test('a later edit of the step and of its skills changes nothing the run froze', () => {
    fs.writeFileSync(path.join(dev, 'implement.md'), '---\nplace: git\nagent: implementer\n---\n');
    assert.deepEqual(readRun(run.id).workflow, record);
    assert.deepEqual(entriesOf(agentFilesDir(run, 'implement')), files);
  });
});

/** The agents of `files`, by name, each parsed from its file's text. */
const agentsOf = (files: Record<string, string>): Agents =>
  new Map(Object.entries(files).map(([name, text]) => [name, parseAgent(name, text)]));

/** The step `build` written with `lines` as its frontmatter, resolved with `agents`. */
const stepOf = (agents: Agents, lines: string): Workflow =>
  parseWorkflow('build', `---\nplace: git\n${lines}\n---\nDo it.\n`, undefined, agents);

/** What `fn` was refused with: a `WorkflowError`'s message, or a failed assertion when it was not refused. */
function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof WorkflowError, String(err));
    return err.message;
  }
  return assert.fail('it was not refused');
}

const AGENTS = agentsOf({
  writer: '---\nskills: alpha, beta\n---\nWork.\n',
  bare: '---\n---\nWork.\n',
  tooled: '---\ntools: Read, Bash\n---\nWork.\n',
  denied: '---\ndisallowedTools: Skill\n---\nWork.\n',
  one: '---\ndisallowedTools: Skill(look)\n---\nWork.\n',
  other: '---\ndisallowedTools: Skill(other)\n---\nWork.\n',
  able: '---\ntools: Read, Bash, Skill\n---\nWork.\n',
  folded: '---\ndisallowedTools: Skill(y)\n---\nWork.\n',
  nested: '---\nskills: a:x\n---\nWork.\n',
});

/** A factory's hire of `agent` for the step `dev/build`. */
const hire = (agent: string) => ({ agent, factory: 'acme', step: 'dev/build' });

/** A fence refusal names the step's line, the skill, the agent's file and the fix. */
const fenced = (said: string, agent: string): void =>
  names(said, 'build', '`skills: look`', `agents/${agent}.md`, "take `look` off this step's `skills:`");

test("a step's own `skills:` line, read beside its agent's: what it adds, what it writes back, and its refusals at shipped defaults", async (t) => {
  await t.test("the session is given the agent's skills, then the step's, each once; a step never takes one away", () => {
    const step = stepOf(AGENTS, 'agent: writer\nskills: beta, gamma');
    assert.deepEqual(step.agent?.skills, ['alpha', 'beta', 'gamma']);
    assert.deepEqual(step.skills, ['beta', 'gamma']);
    assert.deepEqual(stepOf(AGENTS, 'agent: writer\nskills: alpha').agent?.skills, ['alpha', 'beta'], 'naming a few gives all');
    assert.deepEqual(stepOf(AGENTS, 'agent: bare\nskills: gamma').agent?.skills, ['gamma'], 'an agent with none is given the step’s');
    assert.equal(stepOf(AGENTS, 'agent: bare').agent?.skills, undefined, 'none from either, none at all');
  });

  await t.test('the skills a line adds beyond its agent’s are frozen apart, in its order; a step with no line freezes none', () => {
    assert.deepEqual(stepOf(AGENTS, 'agent: writer\nskills: beta, gamma').agent?.addedSkills, ['gamma']);
    assert.deepEqual(stepOf(AGENTS, 'agent: writer\nskills: beta, alpha').agent?.addedSkills, [], 'only the agent’s adds none');
    assert.deepEqual(stepOf(AGENTS, 'agent: bare\nskills: gamma, delta').agent?.addedSkills, ['gamma', 'delta']);
    assert.equal(stepOf(AGENTS, 'agent: writer').agent?.addedSkills, undefined, 'no line, no key');
  });

  await t.test("a step is written back with its own line, never its agent's, and reads back as the same step", () => {
    const step = stepOf(AGENTS, 'agent: writer\nskills: beta, gamma');
    const text = renderStep(step);
    assert.equal(text, '---\nplace: git\nagent: writer\nskills: beta, gamma\n---\nDo it.\n');
    assert.ok(isDeepStrictEqual(parseWorkflow('build', text, undefined, AGENTS), step), text);
    assert.equal(renderStep(stepOf(AGENTS, 'agent: writer')), '---\nplace: git\nagent: writer\n---\nDo it.\n', 'none added, no line');
  });

  await t.test('a frozen step with its own line reads back by the schema, an older one without too; a line not a list is refused', () => {
    const step = stepOf(AGENTS, 'agent: writer\nskills: beta, gamma');
    const decode = Schema.decodeUnknownResult(FrozenStepSchema);
    for (const frozen of [step, stepOf(AGENTS, 'agent: writer')].map((s) => JSON.parse(JSON.stringify(s)) as unknown)) {
      const read = decode(frozen);
      assert.ok(Result.isSuccess(read), Result.isFailure(read) ? String(read.failure) : '');
      assert.deepEqual(read.success, frozen);
    }
    const plain = JSON.parse(JSON.stringify(step)) as Workflow;
    assert.ok(Result.isFailure(decode({ ...plain, skills: 'beta' })), 'a line that is not a list');
    assert.ok(Result.isFailure(decode({ ...plain, agent: { ...plain.agent, addedSkills: 'gamma' } })), 'added skills not a list');
  });

  await t.test('REFUSED: a skill added to an agent whose fence keeps the session from loading it, by `tools:` or a deny', () => {
    const tooled = refusal(() => stepOf(AGENTS, 'agent: tooled\nskills: look'));
    fenced(tooled, 'tooled');
    names(tooled, '`tools: Read, Bash`', 'Give tooled `Skill`');
    fenced(
      refusal(() => stepOf(AGENTS, 'agent: denied\nskills: look')),
      'denied',
    );
    const one = refusal(() => stepOf(AGENTS, 'agent: one\nskills: look'));
    fenced(one, 'one');
    names(one, '`Skill(look)`');
    assert.deepEqual(stepOf(AGENTS, 'agent: other\nskills: look').agent?.skills, ['look'], 'a deny of another skill');
    assert.deepEqual(stepOf(AGENTS, 'agent: able\nskills: look').agent?.skills, ['look'], 'an agent with `Skill`');
  });

  await t.test('REFUSED: the same skill added over a factory hire, and through writeWorkflow, which writes nothing', () => {
    fenced(
      refusal(() => parseWorkflow('build', '---\nplace: git\nskills: look\n---\nDo it.\n', undefined, AGENTS, undefined, hire('tooled'))),
      'tooled',
    );
    const dir = written(fs.mkdtempSync(path.join(ROOT, 'workflows-')), {
      'agents/tooled.md': '---\ntools: Read, Bash\n---\nWork.\n',
      'dev/build.md': '---\nplace: git\nagent: tooled\n---\n',
    });
    const folder = path.join(dir, 'dev');
    const steps = [{ name: 'build', after: [], place: 'git' as const, agent: 'tooled', skills: ['look'], body: '' }];
    fenced(
      refusal(() => writeWorkflow(folder, steps, undefined, { anywhere: true })),
      'tooled',
    );
    assert.equal(fs.readFileSync(path.join(folder, 'build.md'), 'utf8'), '---\nplace: git\nagent: tooled\n---\n', 'nothing written');
  });

  await t.test('REFUSED: `skills:` on a step with no agent, naming the fix; the same file over a factory hire loads', () => {
    names(
      refusal(() => parseWorkflow('build', '---\nplace: git\nskills: look\n---\nDo it.\n')),
      'build',
      '`skills: look`',
      '`agent: <name>`',
    );
    const hired = parseWorkflow('build', '---\nplace: git\nskills: look\n---\nDo it.\n', undefined, AGENTS, undefined, hire('writer'));
    assert.deepEqual(hired.agent?.skills, ['alpha', 'beta', 'look']);
  });

  for (const [what, lines, fact] of [
    ['codex', 'agent: bare\nharness: codex\nskills: look', 'codex'],
    ['a remote A2A agent', 'agent: bare\nharness: a2a:reviewer\nskills: look', 'A2A'],
    ['`resume:`', 'agent: bare\nresume: plan\nskills: look', '`resume: plan`'],
    ["the step's own `tools:`", 'agent: able\ntools: Read\nskills: look', 'Add `Skill` to `tools:`'],
  ] as const)
    await t.test(`REFUSED: a skill the step adds that ${what} cannot load, named for the step`, () => {
      names(
        refusal(() => stepOf(AGENTS, lines)),
        'build',
        '`skills: look`',
        fact,
      );
    });

  await t.test('REFUSED: a line naming one skill twice, or a name that is neither a skill’s nor folder:name, saying both forms', () => {
    names(
      refusal(() => stepOf(AGENTS, 'agent: writer\nskills: a, a')),
      '`skills: a, a`',
      '`a` twice',
    );
    for (const odd of ['Look', 'app:Y', '../x:y', 'a:b:y', '.claude:y'])
      names(
        refusal(() => stepOf(AGENTS, `agent: writer\nskills: ${odd}`)),
        `\`skills: ${odd}\``,
        `\`${odd}\``,
        '`folder:name`',
      );
    assert.deepEqual(stepOf(AGENTS, 'agent: writer\nskills: x, apps/web:y').agent?.skills, ['alpha', 'beta', 'x', 'apps/web:y']);
  });

  await t.test('REFUSED: two skills of one bare name in one step, on one line or across the agent’s and the step’s, naming both', () => {
    names(
      refusal(() => stepOf(AGENTS, 'agent: writer\nskills: x, app:x')),
      '`skills: x, app:x`',
      '`x`',
      '`app:x`',
    );
    names(
      refusal(() => stepOf(AGENTS, 'agent: writer\nskills: app:alpha')),
      "`alpha`, on agents/writer.md's `skills:`",
      "`app:alpha`, on this step's `skills:`",
    );
    names(
      refusal(() => stepOf(AGENTS, 'agent: nested\nskills: b:x')),
      "`a:x`, on agents/nested.md's `skills:`",
      "`b:x`, on this step's `skills:`",
    );
    assert.deepEqual(stepOf(AGENTS, 'agent: nested\nskills: a:x, b:y').agent?.skills, ['a:x', 'b:y'], 'the agent’s own again');
  });

  await t.test('REFUSED: a skill named with its folder added past an agent’s deny of its bare name, as a session calls it', () => {
    names(
      refusal(() => stepOf(AGENTS, 'agent: folded\nskills: app:y')),
      '`skills: app:y`',
      'agents/folded.md',
      '`Skill(y)`',
    );
    assert.deepEqual(stepOf(AGENTS, 'agent: other\nskills: app:y').agent?.skills, ['app:y']);
  });
});

/** The refusal the program `ran` is rejected with, by its message, and the store left with the runs it had. */
async function startRefused(ran: () => Promise<unknown>): Promise<string> {
  const before = runsNow();
  let said: string | undefined;
  try {
    await ran();
  } catch (err) {
    assert.ok(err instanceof Error, String(err));
    said = err.message;
  }
  assert.equal(typeof said, 'string', 'the start was not refused');
  assert.deepEqual(runsNow(), before, 'no run is left');
  return said!;
}

test('REFUSED at a start and at the folder’s check: a skill no session can be given, by name, and no run is left', async (t) => {
  const outside = written(scratch('wf-step-skills-outside-'), { 'x/SKILL.md': skill('x'), 'secret.md': 'Not the skill.\n' });
  const checkout = (): string =>
    repository({ 'skills/x/SKILL.md': skill('x'), 'skills/x/notes.md': 'Notes.\n', 'app/.claude/skills/y/SKILL.md': skill('y') });

  for (const [what, line, place, facts] of [
    ['a skill of .claude/skills/ linked outside the checkout', 'x', 'step', (_repo: string) => ['x is a link']],
    ['a skill linked inside that holds a link out', 'x', 'agent', (_repo: string) => ['x/far.md is a link']],
    ['a folder that holds no such skill', 'app:nope', 'step', (repo: string) => [path.join(nested(repo, 'app', 'nope'), 'SKILL.md')]],
    ['a nested folder that holds no such skill', 'app:nope', 'agent', (repo: string) => [nested(repo, 'app', 'nope')]],
  ] as const)
    await t.test(`REFUSED: ${what}, by the ${place}'s line`, async () => {
      const repo = checkout();
      if (what.includes('outside')) fs.symlinkSync(path.join(outside, 'x'), nested(repo, '.', 'x'));
      if (what.includes('link out')) {
        fs.symlinkSync(path.join(outside, 'secret.md'), path.join(repo, 'skills', 'x', 'far.md'));
        fs.symlinkSync('../../skills/x', nested(repo, '.', 'x'));
      }
      const dev = teamWith(
        place === 'step'
          ? { 'dev/implement.md': implementAdding(line) }
          : { 'agents/implementer.md': implementerGiving(`implement-a-change, ${line}`) },
      );
      const said = await startRefused(() => runPlaced(startRun({ brief: 'x', repo, workflowDir: dev })));
      names(said, 'implement', place === 'step' ? `\`skills: ${line}\`` : '`agent: implementer`', `\`${line}\``, ...facts(repo));
      assert.equal(
        refusal(() => loadWorkflows(dev, { repo })),
        said,
        'the check refuses as the start does',
      );
    });

  await t.test(
    "REFUSED at a start: a skill of the store's library that is a link, even one that points inside the repository",
    async () => {
      const repo = checkout();
      const library = path.join(ROOT, 'workflows', 'skills');
      fs.mkdirSync(library, { recursive: true });
      fs.symlinkSync(path.join(repo, 'skills', 'x'), path.join(library, 'x'));
      try {
        const dev = teamWith({ 'dev/implement.md': implementAdding('x') });
        names(await startRefused(() => runPlaced(startRun({ brief: 'x', repo, workflowDir: dev }))), '`skills: x`', 'x is a link');
      } finally {
        fs.rmSync(path.join(library, 'x'));
      }
    },
  );

  await t.test('REFUSED: a skill named with its folder read with no repository, naming the start on one', () => {
    names(
      refusal(() => loadWorkflows(teamWith({ 'dev/implement.md': implementAdding('app:y') }))),
      '`skills: app:y`',
      'no repository',
      'Start the run on that repository',
    );
  });

  await t.test('REFUSED at a start: two skills of one bare name in one step, the agent’s and the step’s, naming both', async () => {
    const repo = repository({ 'app/.claude/skills/implement-a-change/SKILL.md': skill('implement-a-change') });
    fs.mkdirSync(nested(repo, '.', 'implement-a-change'));
    const dev = teamWith({ 'dev/implement.md': implementAdding('app:implement-a-change') });
    names(
      await startRefused(() => runPlaced(startRun({ brief: 'x', repo, workflowDir: dev }))),
      "`implement-a-change`, on agents/implementer.md's `skills:`",
      "`app:implement-a-change`, on this step's `skills:`",
    );
  });

  await t.test('REFUSED: a skill the step adds that no place has, naming every place looked in and the fix; one the team has loads', () => {
    const dev = teamWith({ 'dev/implement.md': implementAdding('no-such-skill') });
    const said = refusal(() => loadWorkflows(dev));
    names(said, '`skills: no-such-skill`', "take `no-such-skill` off this step's `skills:`", ...skillsFor(dev).looked);
    const found = stepNamed(loadWorkflows(teamWith({ 'dev/implement.md': implementAdding('review-a-change') })), 'implement');
    assert.deepEqual(found.agent?.skills, ['implement-a-change', 'review-a-change']);
  });

  await t.test('REFUSED: the freeze of a skill linked outside the checkout, whatever the load found, and nothing of it is frozen', () => {
    const repo = checkout();
    fs.symlinkSync(path.join(outside, 'x'), nested(repo, '.', 'x'));
    const dev = teamWith({});
    const steps = loadWorkflows(dev, { repo }).map((step) =>
      step.name === 'implement' ? { ...step, agent: { ...step.agent!, skills: ['x'] } } : step,
    );
    const found = { ...skillsFor(dev, { repo }), at: new Map([['x', nested(repo, '.', 'x')]]) };
    const run = { id: 'step-skills-freeze' };
    names(
      refusal(() => writeAgentFiles(run, steps, found)),
      'x is a link',
    );
    const left = (fs.readdirSync(agentFilesDir(run, 'implement'), { recursive: true }) as string[]).filter(
      (entry) => path.basename(entry) === 'SKILL.md',
    );
    assert.deepEqual(left, []);
  });
});
