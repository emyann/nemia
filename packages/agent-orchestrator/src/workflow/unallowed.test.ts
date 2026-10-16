/**
 * A step given a tool nothing its session gets allows is refused (`unallowedRefusal`), and each fixture here breaks one rule of what
 * counts: the fence word, the allow lists a session gets, the tools the harness runs with no rule, and the place a step works in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { unallowedRefusal } from './unallowed.ts';
import { loadWorkflows } from '../folder/folder.store.ts';
import { scratch } from '../../test/scratch.ts';

/** An agent file's frontmatter keys, as its file writes them. */
type Keys = Readonly<Record<string, string>>;

/** The frontmatter of `keys` and a line of body, as a step file or an agent file is written. */
const fileOf = (keys: Keys, body: string): string =>
  `---\n${Object.entries(keys)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n\n${body}\n`;

/**
 * A workflow folder of one step, in a scratch holder with `agents/` beside it: the step's own keys, and the agent's where there is one
 * (`agent` named on the step by the caller). The folder's steps, loaded as a start freezes them.
 */
function stepsOf(step: Keys, agent?: Keys) {
  const holder = scratch('wf-unallowed-');
  const dir = path.join(holder, 'wf');
  fs.mkdirSync(dir, { recursive: true });
  if (agent) {
    fs.mkdirSync(path.join(holder, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(holder, 'agents', 'seldon.md'), fileOf({ role: 'Architect', ...agent }, 'Design the change.'));
  }
  fs.writeFileSync(path.join(dir, 'design.md'), fileOf({ place: 'git', ...step }, 'Write the spec.'));
  return loadWorkflows(dir, {});
}

/** The agent of the card that prompted this guard: held to its directory, given the web and allowed none of it. */
const HELD = { harness: 'claude', permissionMode: 'dontAsk', tools: 'Read, Grep, Glob, Bash, Skill, WebFetch' };

/** The repository's own allow rules, as a checkout that allows the web gives them. */
const REPO_ALLOWS = ['Bash(npm test)', 'WebSearch', 'WebFetch'];

/** The rules of a repository that allows no web call, as the one the card's refusals happened in gives them. */
const NO_WEB = ['Bash(npm test)', 'Bash(git log:*)'];

test('a step held to its rules and given a tool no rule of its session names is refused, naming the step, the tool, the fence and the fixes', () => {
  const steps = stepsOf({ agent: 'seldon' }, HELD);
  const why = unallowedRefusal(steps, NO_WEB);
  assert.ok(why, 'a tool nothing allows is refused');
  assert.match(why, /^design: /);
  assert.match(why, /`WebFetch`/);
  assert.match(why, /`dontAsk`/);
  assert.match(why, /agents\/seldon\.md/);
  assert.match(why, /allowedTools: WebFetch/);
  assert.match(why, /take `WebFetch` off `tools:`/);
  assert.match(why, /checkout's own settings/);
});

test("an allow list that exists and names another tool is no allow for this one: the agent's `allowedTools:` is read rule by rule", () => {
  const steps = stepsOf({ agent: 'seldon' }, { ...HELD, allowedTools: 'WebSearch, Bash(npm test)' });
  assert.match(unallowedRefusal(steps, NO_WEB) ?? '', /gives its session `WebFetch`/);
});

test('the repository allowing the tool is what makes the step pass, bare or scoped: the rules the session gets are counted', () => {
  const steps = stepsOf({ agent: 'seldon' }, HELD);
  assert.equal(unallowedRefusal(steps, REPO_ALLOWS), undefined);
  assert.equal(unallowedRefusal(steps, ['WebFetch(domain:example.com)', 'Bash(npm test)']), undefined);
});

test("the agent's own allow passes it, whatever the repository says, and so does a step that is its own fence", () => {
  assert.equal(
    unallowedRefusal(stepsOf({ agent: 'seldon' }, { ...HELD, allowedTools: 'WebFetch(domain:example.com), Bash' }), []),
    undefined,
  );
  const own = { ...HELD, allowedTools: 'WebFetch(domain:example.com), Bash(npm test)' };
  assert.equal(unallowedRefusal(stepsOf(own), []), undefined);
  const refused = unallowedRefusal(stepsOf({ ...HELD, allowedTools: 'Bash(npm test)' }), []);
  assert.match(refused ?? '', /not this step's `allowedTools:`/);
  assert.ok(!/agents\//.test(refused ?? ''), 'a step that is its own fence names no agent file');
});

test('a step that works in a folder the run makes counts no rule of the repository, which its session never reads', () => {
  const steps = stepsOf({ agent: 'seldon', place: 'folder' }, { ...HELD, allowedTools: 'Bash' });
  const why = unallowedRefusal(steps, REPO_ALLOWS);
  assert.match(why ?? '', /gives its session `WebFetch`/);
  assert.match(why ?? '', /no checkout whose settings could allow it/);
  assert.equal(unallowedRefusal(stepsOf({ agent: 'seldon', place: 'folder' }, { ...HELD, allowedTools: 'WebFetch, Bash' }), []), undefined);
});

test('the tools the harness runs with no rule need none: the three that read and a skill load pass with no rule anywhere', () => {
  assert.equal(unallowedRefusal(stepsOf({ agent: 'seldon' }, { ...HELD, tools: 'Read, Grep, Glob, Skill' }), []), undefined);
  assert.match(unallowedRefusal(stepsOf({ agent: 'seldon' }, { ...HELD, tools: 'Read, Grep, Glob, Skill, Bash' }), []) ?? '', /`Bash`/);
});

test('a fence word that asks about a call no rule reaches refuses nothing, named or left to the default', () => {
  assert.equal(unallowedRefusal(stepsOf({ agent: 'seldon' }, { ...HELD, permissionMode: 'auto' }), NO_WEB), undefined);
  const { permissionMode: _mode, ...asks } = HELD;
  assert.equal(unallowedRefusal(stepsOf({ agent: 'seldon' }, asks), NO_WEB), undefined);
});

test("a harness fenced by a sandbox takes no allow rule, so none of its steps' tools is judged against one", () => {
  const steps = stepsOf({ agent: 'seldon' }, { harness: 'codex', sandbox: 'read-only' });
  assert.equal(unallowedRefusal(steps, NO_WEB), undefined);
  const tooled = steps.map((step) => ({ ...step, tools: ['Read', 'WebFetch'] }));
  assert.equal(unallowedRefusal(tooled, NO_WEB), undefined, 'a tool list a sandboxed step cannot even have is judged against no rule');
});

test('the trust of the repository is said only where the guard refuses, and asked only then', () => {
  let asked = 0;
  const note = () => {
    asked += 1;
    return 'Check too that the harness trusts /srv/repo.';
  };
  assert.equal(unallowedRefusal(stepsOf({ agent: 'seldon' }, HELD), REPO_ALLOWS, note), undefined);
  assert.equal(asked, 0, 'a passing set reads the harness file not at all');
  assert.match(unallowedRefusal(stepsOf({ agent: 'seldon' }, HELD), NO_WEB, note) ?? '', /trusts \/srv\/repo\.$/);
  assert.equal(asked, 1);
});

test('the first step of the set is the one refused, and a set whose every step is callable is refused nothing', () => {
  const holder = scratch('wf-unallowed-set-');
  const dir = path.join(holder, 'wf');
  fs.mkdirSync(path.join(holder, 'agents'), { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(holder, 'agents', 'seldon.md'), fileOf({ role: 'Architect', ...HELD }, 'Design.'));
  fs.writeFileSync(path.join(dir, 'design.md'), fileOf({ place: 'git', agent: 'seldon' }, 'Write the spec.'));
  fs.writeFileSync(path.join(dir, 'implement.md'), fileOf({ place: 'git', after: 'design', agent: 'seldon' }, 'Build it.'));
  const steps = loadWorkflows(dir, {});
  assert.equal(steps.length, 2);
  assert.match(unallowedRefusal(steps, NO_WEB) ?? '', /^design: /);
  assert.equal(unallowedRefusal(steps, REPO_ALLOWS), undefined);
});
