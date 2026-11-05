/**
 * sdlc's agents carry their fences with them, as a factory's tree gets them rendered: what the root `CLAUDE.md`, *Agents in this
 * repository*, says of the team it was taken from holds of the template.
 *
 * - The four read-only agents (Seldon, Agora, Iris, Argus) run `dontAsk`, name the place's `git` skill, allow one and the same read-only
 *   set of git's questions and text tools (`READ_SET`), and deny beside it what that set would let git write a file, run a program or
 *   read outside the repository by (`READ_SET_DENIES`), an assignment before git among them.
 * - Agora, the reviewer, alone allows `gh pr view` and `gh pr checks` (`GH_READS`), on either way sdlc lands, and the four deny beside
 *   them every form of gh that opens a browser, never returns, reads beyond the answer or another repository, bundles a short option to
 *   reach one, or is typed after an assignment (`GH_DENIES`): a repository's own allow of gh reaches every step, so each is fenced.
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

/**
 * The store a factory names, set so the rendered rules show it: absolute, and so written with two slashes, as Claude Code reads an
 * absolute path in a rule.
 */
const STORE = '//srv/nemia-store';

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
 * `git grep`'s pager option, git's environment, any assignment before git (`HOME`, `XDG_CONFIG_HOME`), `--output`, `--no-index`,
 * `blame --contents`, `grep -f`, `wc --files0-from`.
 */
const READ_SET_DENIES = [
  'Bash(git grep *O*)',
  'Bash(git grep *--op*)',
  'Bash(*GIT_*)',
  'Bash(*=* git *)',
  'Bash(git *--output*)',
  'Bash(git *--no-ind*)',
  'Bash(git blame *--con*)',
  'Bash(git grep -f*)',
  'Bash(git grep * -f*)',
  'Bash(wc *--f*)',
];

/** The pull request's reads, which Agora alone allows itself. */
const GH_READS = ['Bash(gh pr view:*)', 'Bash(gh pr checks:*)'];

/**
 * What gh's reads would open, run or read beyond the answer by, each read-only agent's deny: the browser, `--watch`, a jq query or a
 * template, another repository by option or by address, a short option bundled after `-c`, and any assignment before gh.
 */
const GH_DENIES = [
  'Bash(gh *--web*)',
  'Bash(gh * -w*)',
  'Bash(gh *--watch*)',
  'Bash(gh *--jq*)',
  'Bash(gh * -q*)',
  'Bash(gh *--template*)',
  'Bash(gh * -t*)',
  'Bash(gh *--repo*)',
  'Bash(gh * -R*)',
  'Bash(gh *//*)',
  'Bash(gh * -c*)',
  'Bash(*=* gh *)',
];

/** The reviewer, the one read-only agent whose steps read the pull request. */
const READS_THE_PULL_REQUEST = 'agora';

/**
 * The store's folders no agent edits or writes, under `root`: its factories, its workflows and its inbox. An `Edit` rule alone, since
 * Claude Code matches every file-editing tool, `Write` with it, against `Edit` rules, and the agent reader refuses a `Write(…)` rule.
 */
const storeDenies = (root: string): string[] => ['factories', 'workflows', 'inbox'].map((folder) => `Edit(${root}/${folder}/**)`);

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
  'Bash(*pkill *)',
  'Bash(*killall *)',
  'Bash(*kill *pgrep*)',
  'Bash(*pgrep*kill *)',
  'Bash(*xargs kill*)',
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
        ...lacks(agent, GH_DENIES, denied, 'denies no'),
        ...(agent === READS_THE_PULL_REQUEST
          ? lacks(agent, GH_READS, allowed, 'allows no')
          : allowed.filter((rule) => rule.startsWith('Bash(gh')).map((rule) => `${agent}: allows gh, ${rule}`)),
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

/**
 * sdlc as it ships, on either way it lands, and a copy with one line cut from five agents' fences, rendered on one store with the store
 * `STORE`.
 */
const TREES = await rendered([
  { name: 'shipped', template: copyOf(SDLC), sets: [`storeRoot=${STORE}`] },
  { name: 'github', template: copyOf(SDLC), sets: [`storeRoot=${STORE}`, 'github=true'] },
  {
    name: 'cut',
    template: copyOf(SDLC, {
      'agents/otto/agent.yaml': (text) => text.replace('        - Edit(${{ parameters.storeRoot }}/inbox/**)\n', ''),
      'agents/agora/agent.yaml': (text) =>
        text.replace('        - Bash(git *--output*)\n', '').replace('        - Bash(gh pr checks:*)\n', ''),
      'agents/iris/agent.yaml': (text) => text.replace('        - Bash(git merge-base:*)\n', ''),
      'agents/seldon/agent.yaml': (text) => text.replace('        - Bash(gh *--jq*)\n', '').replace('        - Bash(*=* git *)\n', ''),
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
    `agora: allows no Bash(gh pr checks:*)`,
    `agora: denies no Bash(git *--output*)`,
    `grace: denies no Bash(git push:*)`,
    `iris: allows no Bash(git merge-base:*)`,
    `otto: denies no Edit(${STORE}/inbox/**)`,
    `seldon: denies no Bash(*=* git *)`,
    `seldon: denies no Bash(gh *--jq*)`,
  ]);
});

test('REFUSED: a deny over the runs, and a read-only agent in another mode or with no git skill, are named', () => {
  const fences = fencesOf('shipped');
  const seldon = fences.seldon;
  const planted = {
    ...fences,
    seldon: { ...seldon, mode: 'auto', skills: seldon.skills.filter((skill) => skill !== 'git') },
    otto: { ...fences.otto, denied: [...fences.otto.denied, `Edit(${STORE}/runs/**)`] },
    iris: { ...fences.iris, allowed: [...fences.iris.allowed, 'Bash(gh pr view:*)'] },
  };
  assert.deepEqual(shortOf(planted, STORE), [
    'iris: allows gh, Bash(gh pr view:*)',
    'seldon: runs auto',
    'seldon: names no git skill',
    `otto: denies its runs, Edit(${STORE}/runs/**)`,
  ]);
});

test("sdlc's six agents carry their fences: the read set and its denies, the store's denies, and the writers' refusals", () => {
  for (const way of ['shipped', 'github']) {
    const fences = fencesOf(way);
    assert.deepEqual(Object.keys(fences).sort(), ['agora', 'argus', 'grace', 'iris', 'otto', 'seldon'], way);
    assert.deepEqual(shortOf(fences, STORE), [], way);
  }
});

test("Agora allows gh's two reads and nothing else of gh, on either way sdlc lands", () => {
  for (const way of ['shipped', 'github'])
    assert.deepEqual(
      fencesOf(way).agora.allowed.filter((rule) => rule.startsWith('Bash(gh')),
      GH_READS,
      way,
    );
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
