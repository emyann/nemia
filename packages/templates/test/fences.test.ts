/**
 * sdlc's agents carry their fences with them, as a factory's tree gets them rendered: the lines several agents share are written once,
 * in `sdlc/fences/` (each with its reason beside it), and each agent names the files its role takes, as a `{ path }` item of its list.
 *
 * - The four read-only agents (Seldon, Agora, Iris, Argus) run `dontAsk`, name the place's `git` skill, and take the read set and its
 *   denies (`read-only.allow.yaml`, `read-only.deny.yaml`): git's questions and the text tools, a proposal of a change, and the denies of
 *   what those would let git write a file, run a program or read outside the repository by, and of every form of gh and of an
 *   assignment before nemia.
 * - The four read a tool's own help and version (`help.allow.yaml`): gh's by `gh help <core command>`, never `gh <x> --help`, which can
 *   run an alias or an extension, and claude's by exact lines. These are not gh's reads below: the writers keep every gh refused.
 * - Agora, the reviewer, alone allows `gh pr view` and `gh pr checks` (`GH_READS`), on either way sdlc lands.
 * - An agent that allows the browser's tools denies those that write a file (`browser.deny.yaml`), and every agent that may reach the
 *   browser, the writers among them, denies the one that runs a script in the page (`run-code.deny.yaml`).
 * - Every agent is refused an edit and a write of the store's factories, workflows and inbox, under the store the factory names
 *   (`storeRoot`), and none of its runs: a step writes its own run's folder.
 * - The two writers, Grace and Otto, take one list (`writers.deny.yaml`): a push, a forced branch delete, a kill by name, every `gh`, a
 *   session started by hand, an edit of a harness's settings and GitHub's writes of a repository.
 *
 * What each rule asks of an agent is read from the files themselves, so a line dropped from one is refused on every agent that names it.
 * Each rule is first refused on a copy of sdlc with lines cut, rendered beside sdlc itself on one store; then sdlc as it ships is read,
 * and what its rendered fences run is proven through the test kit's matcher of Claude Code's rules (`test-kit/fence`): each read open,
 * each write, program and read outside refused. What each deny refuses spelling by spelling is the orchestrator's
 * `agent-fences.test.ts`'s, on these same lines.
 *
 * Every step's prompt holds sdlc's `RULES.md`, so a rule every agent keeps is written there once: the paragraph on a refused call is in
 * it and in no agent's instructions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { splitFrontmatter } from 'agent-orchestrator/workflow';
import { bash, runsUnder, type Call } from 'test-kit/fence';
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

/** The lines of sdlc's fence file `file`, as shipped. */
const linesOf = (file: string): string[] => yaml.load(fs.readFileSync(path.join(SDLC, 'fences', file), 'utf8')) as string[];

/** A tool's help and version, which the read-only four take beside the read set; not counted as a read of gh's. */
const HELP = linesOf('help.allow.yaml');

/** The pull request's reads, which Agora alone allows itself. */
const GH_READS = ['Bash(gh pr view:*)', 'Bash(gh pr checks:*)'];

/** The reviewer, the one read-only agent whose steps read the pull request. */
const READS_THE_PULL_REQUEST = 'agora';

/**
 * The store's folders no agent edits or writes, under `root`: its factories, its workflows and its inbox. An `Edit` rule alone, since
 * Claude Code matches every file-editing tool, `Write` with it, against `Edit` rules, and the agent reader refuses a `Write(…)` rule.
 */
const storeDenies = (root: string): string[] => ['factories', 'workflows', 'inbox'].map((folder) => `Edit(${root}/${folder}/**)`);

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

/** Whether an agent allows a tool of the browser's, and so must deny those that write a file. */
const allowsTheBrowser = (fence: Fence): boolean => fence.allowed.some((rule) => rule.startsWith('mcp__playwright__'));

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
        ...lacks(agent, linesOf('read-only.allow.yaml'), allowed, 'allows no'),
        ...lacks(agent, HELP, allowed, 'allows no'),
        ...lacks(agent, linesOf('read-only.deny.yaml'), denied, 'denies no'),
        ...(agent === READS_THE_PULL_REQUEST
          ? lacks(agent, GH_READS, allowed, 'allows no')
          : allowed.filter((rule) => rule.startsWith('Bash(gh') && !HELP.includes(rule)).map((rule) => `${agent}: allows gh, ${rule}`)),
      ];
    }),
    ...Object.keys(fences)
      .sort()
      .flatMap((agent) => [
        ...(allowsTheBrowser(fence(agent))
          ? lacks(agent, [...linesOf('run-code.deny.yaml'), ...linesOf('browser.deny.yaml')], fence(agent).denied, 'denies no')
          : []),
        ...lacks(agent, storeDenies(root), fence(agent).denied, 'denies no'),
        ...fence(agent)
          .denied.filter((rule) => rule.includes(`${root}/runs`))
          .map((rule) => `${agent}: denies its runs, ${rule}`),
      ]),
    ...WRITERS.flatMap((agent) =>
      lacks(agent, [...linesOf('writers.deny.yaml'), ...linesOf('run-code.deny.yaml')], fence(agent).denied, 'denies no'),
    ),
  ];
}

/** `text` less the line `- <rule>` of a fence file or an agent's list, for each of `rules`. */
const cut =
  (...rules: string[]) =>
  (text: string): string =>
    rules.reduce((left, rule) => left.replace(new RegExp(`^ *- ${rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`, 'm'), ''), text);

/**
 * sdlc as it ships, on either way it lands, and a copy with lines cut from four fence files and from two agents' own lists, rendered on
 * one store with the store `STORE`.
 */
const TREES = await rendered([
  { name: 'shipped', template: copyOf(SDLC), sets: [`storeRoot=${STORE}`] },
  { name: 'github', template: copyOf(SDLC), sets: [`storeRoot=${STORE}`, 'github=true'] },
  {
    name: 'cut',
    template: copyOf(SDLC, {
      'fences/read-only.allow.yaml': cut('Bash(git merge-base:*)'),
      'fences/help.allow.yaml': cut('Bash(gh help pr:*)'),
      'fences/read-only.deny.yaml': cut('Bash(git *--output*)', 'Bash(*=* nemia *)'),
      'fences/writers.deny.yaml': cut('Bash(git push:*)'),
      'fences/browser.deny.yaml': cut('mcp__playwright__browser_snapshot(filename:*)'),
      'agents/otto/agent.yaml': cut('Edit(${{ parameters.storeRoot }}/inbox/**)'),
      'agents/agora/agent.yaml': cut('Bash(gh pr checks:*)'),
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

test('REFUSED: a line cut from a fence file is named on every agent that takes the file, and a line cut from an agent on it', () => {
  assert.deepEqual(
    shortOf(fencesOf('cut'), STORE).sort(),
    [
      'agora: allows no Bash(gh pr checks:*)',
      ...READ_ONLY.flatMap((agent) => [
        `${agent}: allows no Bash(git merge-base:*)`,
        `${agent}: allows no Bash(gh help pr:*)`,
        `${agent}: denies no Bash(*=* nemia *)`,
        `${agent}: denies no Bash(git *--output*)`,
      ]),
      'agora: denies no mcp__playwright__browser_snapshot(filename:*)',
      'grace: denies no Bash(git push:*)',
      'otto: denies no Bash(git push:*)',
      `otto: denies no Edit(${STORE}/inbox/**)`,
      'seldon: denies no mcp__playwright__browser_snapshot(filename:*)',
    ].sort(),
  );
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

test("sdlc's six agents carry their fences: the read set and its denies, the browser's, the store's, and the writers' refusals", () => {
  for (const way of ['shipped', 'github']) {
    const fences = fencesOf(way);
    assert.deepEqual(Object.keys(fences).sort(), ['agora', 'argus', 'grace', 'iris', 'otto', 'seldon'], way);
    assert.deepEqual(shortOf(fences, STORE), [], way);
    for (const [agent, { allowed, denied }] of Object.entries(fences))
      for (const [list, rules] of Object.entries({ allowed, denied }))
        assert.deepEqual(
          rules.filter((rule, i) => rules.indexOf(rule) !== i),
          [],
          `${way}: ${agent}'s ${list} list holds each rule once`,
        );
  }
  assert.deepEqual(
    ['agora', 'seldon'].map((agent) => allowsTheBrowser(fencesOf('shipped')[agent])),
    [true, true],
    'the browser rules are read on the two that allow it',
  );
});

test("Agora allows gh's two reads and gh's help, and nothing else of gh, on either way sdlc lands", () => {
  for (const way of ['shipped', 'github'])
    assert.deepEqual(
      fencesOf(way).agora.allowed.filter((rule) => rule.startsWith('Bash(gh') && !HELP.includes(rule)),
      GH_READS,
      way,
    );
});

/** Reads a read-only agent makes, in the spellings a session types: each runs by its own allow. */
const READS: Call[] = [
  'git diff main...HEAD',
  'git log --oneline -5',
  'git grep -n foo HEAD',
  'git merge-base --is-ancestor a HEAD',
  'git diff -U0 HEAD...main-worktree/HEAD -- a.ts',
  'git merge-tree --write-tree --name-only HEAD main-worktree/HEAD',
  'git branch --list',
  'git worktree list',
  'cat README.md',
  'wc -l README.md',
  'nemia propose -f x.yaml -n f',
  'gh help',
  'gh help auth login',
  'gh help pr merge 1',
  'gh --version',
  'claude --help',
  'claude --version',
  'claude auth --help',
].map(bash);

/** What a read-only agent must never run: a write of git's, a program or a file by an option, a read outside, a move, a dropped token. */
const NEVER_READ_ONLY: Call[] = [
  'git commit -m x',
  'git push',
  'git branch -D x',
  'git worktree add ../x',
  'git diff --output=x HEAD',
  'git grep -nOsh foo',
  'GIT_EXTERNAL_DIFF=sh git diff HEAD',
  'HOME=planted git log -p',
  'git diff --no-index /etc/hostname x',
  'wc --files0-from=list0',
  'cat /etc/hostname',
  'cd .. && git log',
  'sed -i s/a/b/ x',
  'gh pr view 1 --web',
  'gh pr merge 1',
  'WF_SESSION_TOKEN= nemia propose -f x.yaml -n f',
  'gh auth login --help',
  'gh pr co --help',
  'gh pr merge 1 --subject --help',
  'gh help myext',
  'gh help copilot',
  'gh help prx',
  'GH_PAGER=sh gh help pr',
  'claude -p x --help',
  'claude auth status',
  'claude --help --bg',
].map(bash);

/** What a writer, which runs auto, must never run: each refused by its own deny. */
const NEVER_WRITERS: Call[] = [
  ...['git push origin x', 'git branch -D x', 'gh pr merge 1', 'gh help pr merge', 'pkill -f node', 'claude --bg x'].map(bash),
  { tool: 'Edit', path: '/home/u/.claude.json' },
  { tool: 'mcp__playwright__browser_run_code_unsafe' },
  { tool: 'mcp__github__push_files' },
];

test("the read-only agents' rendered fences run every read, and no write, program, read outside or dropped token", () => {
  for (const way of ['shipped', 'github'])
    for (const agent of READ_ONLY) {
      const { allowed, denied } = fencesOf(way)[agent];
      const fence = { allow: allowed, deny: denied };
      assert.deepEqual(
        runsUnder(fence, READS),
        READS.map((call) => `Bash(${call.command})`),
        `${way}: ${agent} reads`,
      );
      assert.deepEqual(runsUnder(fence, NEVER_READ_ONLY), [], `${way}: ${agent} writes nothing`);
    }
});

test("the writers' rendered fences refuse a push, a forced delete, gh, a kill, a session by hand, a harness's settings and a script in the page", () => {
  for (const agent of WRITERS) {
    const { denied } = fencesOf('shipped')[agent];
    assert.deepEqual(runsUnder({ allow: [], deny: denied }, NEVER_WRITERS, { dontAsk: false }), [], agent);
    assert.deepEqual(runsUnder({ allow: [], deny: denied }, [bash('git commit -m x')], { dontAsk: false }), ['Bash(git commit -m x)']);
  }
});

test('REFUSED: on the fences with lines cut, a read-only agent writes a file by --output and proposes as the person, and a writer pushes', () => {
  const fences = fencesOf('cut');
  for (const agent of READ_ONLY)
    assert.deepEqual(
      runsUnder({ allow: fences[agent].allowed, deny: fences[agent].denied }, NEVER_READ_ONLY),
      ['Bash(git diff --output=x HEAD)', 'Bash(WF_SESSION_TOKEN= nemia propose -f x.yaml -n f)'],
      agent,
    );
  for (const agent of WRITERS)
    assert.deepEqual(
      runsUnder({ allow: [], deny: fences[agent].denied }, NEVER_WRITERS, { dontAsk: false }),
      ['Bash(git push origin x)'],
      agent,
    );
});

/** The paragraph every step keeps when a call it needs is refused, by its opening words. */
const REFUSED_CALL = 'When a call your work needs is refused, do not route around it in silence';

/** Which of `files` (a file's path in sdlc, its text) hold the refused-call paragraph: RULES.md alone should. */
const refusedCallCopies = (files: Map<string, string>): string[] =>
  [...files].filter(([, text]) => text.replace(/[\s*]+/g, ' ').includes(REFUSED_CALL)).map(([file]) => file);

/** RULES.md and each agent's instructions, by their path in `template`. */
const promptsOf = (template: string): Map<string, string> =>
  new Map(
    ['RULES.md', ...fs.readdirSync(path.join(template, 'agents')).map((agent) => `agents/${agent}/instructions.md`)]
      .filter((file) => fs.existsSync(path.join(template, file)))
      .map((file) => [file, fs.readFileSync(path.join(template, file), 'utf8')]),
  );

test('the refused-call paragraph is in RULES.md, which every step holds, and in no agent; REFUSED: a copy in an agent is named', () => {
  const prompts = promptsOf(SDLC);
  assert.equal(prompts.size, 7, 'RULES.md and every agent are read');
  assert.deepEqual(refusedCallCopies(prompts), ['RULES.md']);
  prompts.set('agents/argus/instructions.md', `${prompts.get('agents/argus/instructions.md')}\n${prompts.get('RULES.md')}`);
  prompts.set('RULES.md', '');
  assert.deepEqual(refusedCallCopies(prompts), ['agents/argus/instructions.md']);
});
