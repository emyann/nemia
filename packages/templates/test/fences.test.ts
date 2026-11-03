/**
 * sdlc's agents carry their fences with them, as a factory's tree gets them rendered: what the root `CLAUDE.md`, *Agents in this
 * repository*, says of the team it was taken from holds of the template.
 *
 * - The four read-only agents (Seldon, Agora, Iris, Argus) run `dontAsk`, name the place's `git` skill, allow one and the same read-only
 *   set of git's questions and text tools (`READ_SET`), and deny beside it what that set would let git write a file, run a program or
 *   read outside the repository by (`READ_SET_DENIES`).
 * - Every agent is refused an edit and a write of the store's factories, workflows and inbox, under the store the factory names
 *   (`storeRoot`), and none of its runs: a step writes its own run's folder.
 * - The two writers, Grace and Otto, each deny `git push`, a forced branch delete, a kill by name, every `gh`, a session started by
 *   hand and an edit of a harness's settings, one and the same list (`WRITER_DENIES`), as today's do.
 *
 * Each rule is first refused on a copy of sdlc with one line of an agent cut, rendered beside sdlc itself on one store, and the refusal
 * names the agent and the rule; then sdlc as it ships is read. The deny lists are held by the rule as written: what a rule reaches is
 * `packages/agent-orchestrator/test/agent-fences.test.ts`'s to say.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { splitFrontmatter } from 'agent-orchestrator/workflow';
import { copyOf, rendered, SDLC } from './template.ts';

/** The store a factory names, set so the rendered rules show it. */
const STORE = '/srv/nemia-store';

/** The agents of the team that read the repository and never write it. */
const READ_ONLY = ['agora', 'argus', 'iris', 'seldon'];

/** The writers, whose fences refuse what no run of theirs may do. */
const WRITERS = ['grace', 'otto'];

/** Git's read-only questions and the text tools each read-only agent allows itself, the same on each. */
const READ_SET = [
  'Bash(git diff:*)',
  'Bash(git diff-tree:*)',
  'Bash(git log:*)',
  'Bash(git show:*)',
  'Bash(git show-ref:*)',
  'Bash(git status:*)',
  'Bash(git blame:*)',
  'Bash(git grep:*)',
  'Bash(git ls-files:*)',
  'Bash(git ls-tree:*)',
  'Bash(git cat-file:*)',
  'Bash(git rev-parse:*)',
  'Bash(git rev-list:*)',
  'Bash(git merge-base:*)',
  'Bash(git merge-tree:*)',
  'Bash(git shortlog:*)',
  'Bash(git describe:*)',
  'Bash(git name-rev:*)',
  'Bash(git for-each-ref:*)',
  'Bash(git check-ignore:*)',
  'Bash(git branch)',
  'Bash(git branch --list:*)',
  'Bash(git branch --contains:*)',
  'Bash(git worktree list:*)',
  'Bash(wc:*)',
  'Bash(cut:*)',
  'Bash(head:*)',
  'Bash(tail:*)',
  'Bash(cat:*)',
  'Bash(ls:*)',
];

/**
 * What the read set would let git write a file, run a program or read outside the repository by, and `wc` read a list of paths by:
 * `git grep`'s pager option, git's environment, `--output`, `--no-index`, `blame --contents`, `grep -f`, `wc --files0-from`.
 */
const READ_SET_DENIES = [
  'Bash(git grep *O*)',
  'Bash(git grep *--op*)',
  'Bash(*GIT_*)',
  'Bash(git *--output*)',
  'Bash(git *--no-ind*)',
  'Bash(git blame *--con*)',
  'Bash(git grep -f*)',
  'Bash(git grep * -f*)',
  'Bash(wc *--f*)',
];

/** The store's folders no agent edits or writes, under `root`: its factories, its workflows and its inbox. */
const storeDenies = (root: string): string[] =>
  ['Edit', 'Write'].flatMap((tool) => ['factories', 'workflows', 'inbox'].map((folder) => `${tool}(${root}/${folder}/**)`));

/** What each writer denies, Grace's and Otto's alike. */
const WRITER_DENIES = [
  'SendMessage',
  'CronCreate',
  'CronDelete',
  'RemoteTrigger',
  'Bash(git push)',
  'Bash(git push:*)',
  'Bash(gh)',
  'Bash(gh:*)',
  'Bash(git branch -D:*)',
  'Bash(git branch --delete --force:*)',
  'Bash(pkill:*)',
  'Bash(killall:*)',
  'mcp__playwright__browser_run_code_unsafe',
  'Bash(claude *--bg*)',
  'Bash(claude *--background*)',
  'Bash(claude *remote-control*)',
  'Edit(//**/.claude/settings.local.json)',
  'Edit(~/.claude/settings.json)',
  'Edit(~/.claude.json)',
];

/** An agent's fence as its rendered file says it. */
type Fence = { mode: unknown; skills: string[]; allowed: string[]; denied: string[] };

/** A rule list as a rendered file writes it, one comma string: each rule, a comma inside parentheses kept. */
const rulesOf = (line: unknown): string[] =>
  typeof line === 'string'
    ? line
        .split(/,(?![^()]*\))/)
        .map((rule) => rule.trim())
        .filter(Boolean)
    : [];

/** The fence of each agent of the rendered tree `tree`, by name. */
function fencesIn(tree: string): Record<string, Fence> {
  const dir = path.join(tree, 'workflows', 'agents');
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((leaf) => leaf.endsWith('.md'))
      .map((leaf) => {
        const { block } = splitFrontmatter(leaf, fs.readFileSync(path.join(dir, leaf), 'utf8'));
        const front = (yaml.load(block ?? '') ?? {}) as {
          skills?: string;
          claude?: { fence?: { permissionMode?: string; allowedTools?: string; disallowedTools?: string } };
        };
        const fence = front.claude?.fence ?? {};
        return [
          leaf.slice(0, -'.md'.length),
          {
            mode: fence.permissionMode,
            skills: rulesOf(front.skills),
            allowed: rulesOf(fence.allowedTools),
            denied: rulesOf(fence.disallowedTools),
          },
        ];
      }),
  );
}

/** What the fences `fences` fall short of, a line each, `<agent>: <what>`, the store being `root`. */
function shortOf(fences: Record<string, Fence>, root: string): string[] {
  const fence = (agent: string): Fence => fences[agent] ?? { mode: undefined, skills: [], allowed: [], denied: [] };
  const lacks = (agent: string, rules: readonly string[], list: string[], what: string): string[] =>
    rules.filter((rule) => !list.includes(rule)).map((rule) => `${agent}: ${what} ${rule}`);
  return [
    ...READ_ONLY.flatMap((agent) => {
      const { mode, skills, allowed, denied } = fence(agent);
      return [
        ...(mode === 'dontAsk' ? [] : [`${agent}: runs ${String(mode)}`]),
        ...(skills.includes('git') ? [] : [`${agent}: names no git skill`]),
        ...lacks(agent, READ_SET, allowed, 'allows no'),
        ...lacks(agent, READ_SET_DENIES, denied, 'denies no'),
      ];
    }),
    ...Object.keys(fences)
      .sort()
      .flatMap((agent) => [
        ...lacks(agent, storeDenies(root), fence(agent).denied, 'denies no'),
        ...fence(agent)
          .denied.filter((rule) => rule.includes(`${root}/runs`))
          .map((rule) => `${agent}: denies its runs, ${rule}`),
      ]),
    ...WRITERS.flatMap((agent) => lacks(agent, WRITER_DENIES, fence(agent).denied, 'denies no')),
  ];
}

/** sdlc as it ships, and a copy with one line cut from three agents' fences, rendered on one store with the store `STORE`. */
const TREES = await rendered([
  { name: 'shipped', template: copyOf(SDLC), sets: [`storeRoot=${STORE}`] },
  {
    name: 'cut',
    template: copyOf(SDLC, {
      'agents/otto/agent.yaml': (text) => text.replace('        - Write(${{ parameters.storeRoot }}/inbox/**)\n', ''),
      'agents/agora/agent.yaml': (text) => text.replace('        - Bash(git *--output*)\n', ''),
      'agents/iris/agent.yaml': (text) => text.replace('        - Bash(git merge-base:*)\n', ''),
      'agents/grace/agent.yaml': (text) => text.replace('        - Bash(git push:*)\n', ''),
    }),
    sets: [`storeRoot=${STORE}`],
  },
]);

/** The fences of the rendered factory `name`. */
const fencesOf = (name: string): Record<string, Fence> => {
  const tree = TREES[name]?.tree;
  assert.ok(tree, `${name} was rendered: ${JSON.stringify(TREES[name]?.conditions)}`);
  return fencesIn(tree);
};

test('REFUSED: an agent with a line of its fence cut is named, with the rule it lost', () => {
  assert.deepEqual(shortOf(fencesOf('cut'), STORE).sort(), [
    `agora: denies no Bash(git *--output*)`,
    `grace: denies no Bash(git push:*)`,
    `iris: allows no Bash(git merge-base:*)`,
    `otto: denies no Write(${STORE}/inbox/**)`,
  ]);
});

test('REFUSED: a deny over the runs, and a read-only agent in another mode or with no git skill, are named', () => {
  const fences = fencesOf('shipped');
  const seldon = fences.seldon;
  const planted = {
    ...fences,
    seldon: { ...seldon, mode: 'auto', skills: seldon.skills.filter((skill) => skill !== 'git') },
    otto: { ...fences.otto, denied: [...fences.otto.denied, `Edit(${STORE}/runs/**)`] },
  };
  assert.deepEqual(shortOf(planted, STORE), [
    'seldon: runs auto',
    'seldon: names no git skill',
    `otto: denies its runs, Edit(${STORE}/runs/**)`,
  ]);
});

test("sdlc's six agents carry their fences: the read set and its denies, the store's denies, and the writers' refusals", () => {
  const fences = fencesOf('shipped');
  assert.deepEqual(Object.keys(fences).sort(), ['agora', 'argus', 'grace', 'iris', 'otto', 'seldon']);
  assert.deepEqual(shortOf(fences, STORE), []);
});

test('the four read-only agents allow one and the same read set, and nothing else of git', () => {
  const fences = fencesOf('shipped');
  for (const agent of READ_ONLY)
    assert.deepEqual(
      fences[agent].allowed.filter((rule) => /^Bash\((?:git|wc|cut|head|tail|cat|ls)\b/.test(rule)),
      READ_SET,
      agent,
    );
});
