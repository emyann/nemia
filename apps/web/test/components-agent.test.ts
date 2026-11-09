/**
 * The board's agent components (`src/components/agent/`), rendered to markup as a server renders them: what a
 * person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
/**
 * The board's components, rendered to markup as a server renders them: what a person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readsOf } from './run-fixtures.ts';
import './tsx.ts';
import { at, routedWith, runWith, textsOf, withClient } from './markup-fixtures.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
type RunView = import('../src/lib/runView.ts').RunView;
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

test("an agent's form shows its card read-only, generated from its skills: an entry each, no field to edit it, and the package's refusal where none can be made", async () => {
  const { AgentForm } = await import('../src/components/agent/AgentForm.tsx');
  const agent = {
    name: 'scribe',
    from: 'yours' as const,
    dir: '/store/agents',
    file: '/store/agents/scribe.md',
    role: null,
    description: 'Writes notes.',
    keys: { tools: 'Read, Skill' },
    body: 'Write.\n',
    schema: null,
    skills: 'write-a-note, file-it',
    harnessPrompt: null,
    mcp: null,
    given: [],
    source: '',
    version: 'v1',
    usedBy: [],
    error: null,
    untried: null,
    cardError: null,
    card: [
      { id: 'write-a-note', name: 'Write a note', description: 'Writes the notes of a change.', tags: ['note', 'docs'] },
      { id: 'file-it', name: 'File it away', description: 'Files a note where it belongs.', tags: ['file-it'] },
    ],
  };
  const form = (listing: typeof agent | null) =>
    withClient(createElement(AgentForm, { listing, keyForm: undefined, saving: false, refusal: null, onSave: () => {} }));
  const html = form(agent);
  assert.deepEqual(
    [...html.matchAll(/data-agent-skill="([^"]+)"/g)].map((m) => m[1]),
    ['write-a-note', 'file-it'],
    'an entry for each skill, in its order',
  );
  assert.ok(textsOf(html).includes('Write a note') && textsOf(html).includes('Files a note where it belongs.'));
  assert.doesNotMatch(html, /Card file|Its card|skills\.json/, 'no field edits it, and no card file is named');
  assert.match(html, /Generated from its skills/);
  const refused = form({
    ...agent,
    card: null,
    cardError: 'agents/scribe.md gives the skill `file-it`, and no skills folder has it',
  } as never);
  assert.match(refused, /data-card-error/);
  assert.ok(textsOf(refused).some((t) => t.startsWith('agents/scribe.md gives the skill `file-it`, and no skills folder has it')));
  assert.doesNotMatch(refused, /data-agent-skill/);
  assert.match(form(null), /data-card-generated[^>]*>[^<]*Shown once it is saved\./, 'a new agent has no card until it is saved');
});

const PLACES = [
  {
    from: 'yours',
    dir: '/store/workflows/skills',
    skills: [
      {
        name: 'write-a-note',
        from: 'yours',
        dir: '/store/workflows/skills/write-a-note',
        entry: { id: 'write-a-note', name: 'Write a note', description: 'Writes the notes of a change.', tags: ['note'] },
        error: null,
        preload: false,
        cost: { preload: false, listed: 12, body: 340, perTurn: 12 },
        usedBy: ['scribe'],
        found: null,
      },
    ],
  },
  {
    from: 'repo',
    dir: '/repo/.claude/skills',
    skills: [
      {
        name: 'scratch',
        from: 'repo',
        dir: '/repo/.claude/skills/scratch',
        entry: null,
        error: '/repo/.claude/skills/scratch/SKILL.md has no frontmatter',
        preload: false,
        cost: { preload: false, listed: 3, body: 9, perTurn: 3 },
        usedBy: [],
        found: null,
      },
      {
        name: 'ask-first',
        from: 'repo',
        dir: '/repo/.claude/skills/ask-first',
        entry: { id: 'ask-first', name: 'Ask first', description: 'Asks before it acts.', tags: ['ask-first'] },
        error: null,
        preload: true,
        cost: { preload: true, listed: 8, body: 1200, perTurn: 1208 },
        usedBy: [],
        found: null,
      },
    ],
  },
  { from: 'builtin', dir: '/hkb/workflows/skills', skills: [] },
];

/** An agent's form of yours with the skill list read already, as the picker reads it, inside a router: a given skill links to its page. */
async function agentFormWith(listing: Record<string, unknown>, readOnly = false): Promise<string> {
  const { AgentForm } = await import('../src/components/agent/AgentForm.tsx');
  const { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } = await import('@tanstack/react-router');
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory() });
  const client = new QueryClient();
  client.setQueryData(['skills'], PLACES);
  const form = createElement(AgentForm, {
    listing: listing as never,
    keyForm: undefined,
    readOnly,
    saving: false,
    refusal: null,
    onSave: () => {},
  });
  return renderToStaticMarkup(
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
    createElement(RouterContextProvider, { router, children: createElement(QueryClientProvider, { client }, form) }),
  );
}

const composing = {
  name: 'scribe',
  from: 'yours',
  dir: '/store/agents',
  file: '/store/agents/scribe.md',
  role: null,
  description: 'Writes notes.',
  keys: { tools: 'Read' },
  body: 'Write.\n',
  schema: null,
  skills: 'write-a-note, ask-first, gone',
  harnessPrompt: null,
  mcp: null,
  source: '',
  version: 'v1',
  usedBy: [],
  error: null,
  untried: null,
  cardError: null,
  card: null,
  given: [
    {
      name: 'gone',
      from: null,
      foundIn: null,
      entry: null,
      error: 'No skills folder has `gone` — looked in /store/workflows/skills, /repo/.claude/skills.',
      preload: false,
      cost: null,
    },
  ],
};

test("a skill an agent gives named with its folder is a row as written, the repository's, with the folder it is read from and no link; one found nowhere still says so", async () => {
  const { GivenSkills } = await import('../src/components/agent/AgentParts.tsx');
  const rows = [
    {
      name: 'apps/site:lay-out',
      from: null,
      foundIn: 'apps/site/.claude/skills/lay-out',
      entry: null,
      error: null,
      preload: false,
      cost: null,
    },
    { ...composing.given[0] },
  ];
  const html = await routedWith(createElement(GivenSkills, { rows, none: 'None.' }));
  const [folder, gone] = html.split('data-given-skill="gone"');
  assert.match(folder, /data-given-skill="apps\/site:lay-out"[^]*<span[^>]*font-mono[^>]*>apps\/site:lay-out<\/span>/);
  assert.match(folder, /data-skill-from="folder"[^>]*bg-muted text-muted-foreground[^>]*>this repository</);
  assert.match(folder, /data-found-in[^>]*>Read from\s*<code[^>]*>apps\/site\/\.claude\/skills\/lay-out<\/code>/);
  assert.doesNotMatch(folder, /data-skill-link|href="\/agents\/skills\/|not found/);
  assert.match(gone, /data-skill-from="none"[^>]*>not found</);
  assert.doesNotMatch(gone, /data-found-in/);
});

test('an agent of yours lists the skills it gives, each with where it is found and what it costs a turn, and a Remove each; one found nowhere says so', async () => {
  const html = await agentFormWith(composing);
  assert.deepEqual(
    [...html.matchAll(/data-given-skill="([^"]+)"/g)].map((m) => m[1]),
    ['write-a-note', 'ask-first', 'gone'],
    'in the order its line gives them',
  );
  assert.deepEqual(
    [...html.matchAll(/data-skill-from="([^"]+)"/g)].map((m) => m[1]),
    ['yours', 'repo', 'none'],
  );
  assert.deepEqual(
    [...html.matchAll(/href="([^"]+)"[^>]*data-skill-link="([^"]+)"|data-skill-link="([^"]+)"[^>]*href="([^"]+)"/g)].map(
      (m) => m[1] ?? m[4],
    ),
    ['/agents/skills/yours/write-a-note', '/agents/skills/repo/ask-first'],
    'each found skill links to its page, where it is found; the one found nowhere has no page',
  );
  const texts = textsOf(html);
  assert.ok(texts.includes('named — about 12 tokens a turn, and about 340 more in a turn that loads it'), texts.join(' | '));
  assert.ok(texts.includes('loaded every turn — about 1,208 tokens (cached)'), 'a preloaded skill costs its body every turn');
  assert.ok(
    texts.some((t) => t.startsWith('No skills folder has `gone`')),
    "the one found nowhere says why, in the api's words",
  );
  assert.equal([...html.matchAll(/aria-label="Remove [^"]+"/g)].length, 3);
  assert.match(html, />Add a skill</);
  assert.doesNotMatch(html, /aria-label="Skills"|placeholder="review-a-change/, 'no field to type the names in');
});

test('an agent whose tools leave out Skill is told so before a save is refused, with the one press that puts it right; one with no tools set is not', async () => {
  assert.match(await agentFormWith(composing), /data-skill-tool-note[\s\S]*Add Skill to its tools/);
  assert.doesNotMatch(await agentFormWith({ ...composing, keys: { tools: 'Read, Skill' } }), /data-skill-tool-note/);
  assert.doesNotMatch(
    await agentFormWith({ ...composing, keys: {} }),
    /data-skill-tool-note/,
    'unset, the harness decides, and Skill is among what it allows',
  );
  assert.match(await agentFormWith({ ...composing, keys: { disallowedTools: 'Skill' } }), /Take Skill off its denied tools/);
  assert.doesNotMatch(
    await agentFormWith({ ...composing, skills: null, given: [] }),
    /data-skill-tool-note/,
    'nor one that gives no skills',
  );
});

test("Claude Code's prompt is a choice of what the agent does, keep drawn chosen when unset, and Only my instructions kept behind For experts", async () => {
  const unset = await agentFormWith({ ...composing, skills: null, given: [] });
  assert.match(
    unset,
    /data-harness-prompt="keep"[^>]*data-selected="true"|data-selected="true"[^>]*data-harness-prompt="keep"/,
    'unset reads as keep',
  );
  assert.match(
    unset,
    /data-slot="label">Claude Code&#x27;s prompt<\/span>/,
    "the choice is labelled Claude Code's prompt, never System prompt",
  );
  assert.doesNotMatch(unset, /System prompt/);
  assert.match(
    unset,
    /harnessPrompt:<\/code> — how much of Claude Code&#x27;s own prompt its sessions keep, before the instructions\s+below\./,
    'the help line names the key and what it shapes',
  );
  assert.match(unset, /Works on code or files/);
  assert.match(unset, /Doesn&#x27;t write code/);
  assert.match(unset, /For experts/);
  assert.doesNotMatch(unset, /Only my instructions/, 'the expert choice is not drawn while its fold is shut');
  const replace = await agentFormWith({ ...composing, harnessPrompt: 'replace' });
  assert.match(
    replace,
    /data-harness-prompt="replace"[^>]*data-selected="true"|data-selected="true"[^>]*data-harness-prompt="replace"/,
    'an agent that says replace opens the fold, chosen',
  );
  assert.match(await agentFormWith({ ...composing, harnessPrompt: 'terse' }), /harnessPrompt: terse<\/code>, which is none of these/);
});

test("the repository's agent lists the skills it gives read-only: no Remove, no Add, and no list read for it", async () => {
  const html = await agentFormWith(
    {
      ...composing,
      from: 'repo',
      given: [
        {
          name: 'write-a-note',
          from: 'repo',
          entry: { id: 'write-a-note', name: 'Write a note', description: 'Writes.', tags: [] },
          error: null,
          preload: false,
          cost: { preload: false, listed: 5, body: 7, perTurn: 5 },
        },
      ],
      skills: 'write-a-note',
    },
    true,
  );
  assert.deepEqual(
    [...html.matchAll(/data-given-skill="([^"]+)"/g)].map((m) => m[1]),
    ['write-a-note'],
  );
  assert.doesNotMatch(html, /aria-label="Remove |Add a skill|data-skill-tool-note/);
});

test("a repository agent's instructions are read as markdown, under their label and hint; one of yours is typed in as written", async () => {
  const body = '## Role\n\nYou **write**.';
  const theirs = await agentFormWith({ ...composing, from: 'repo', body }, true);
  const field = /<section aria-label="Instructions" data-field-markdown="true"[^]*?<\/section>/.exec(theirs)?.[0] ?? '';
  assert.match(field, />Instructions<[^]*<h4[^>]*>Role<\/h4>[^]*<strong>write<\/strong>[^]*What every node that names it is told/);
  assert.doesNotMatch(theirs, /<textarea[^>]*>## Role/, 'no box to type in');
  assert.match(await agentFormWith({ ...composing, from: 'repo', body: '' }, true), /data-field-markdown[^]*Nothing written/);
  const mine = await agentFormWith({ ...composing, body });
  assert.match(mine, /<textarea[^>]*>## Role\n\nYou \*\*write\*\*\.<\/textarea>/);
  assert.doesNotMatch(mine, /data-field-markdown/);
});

const SKILL_DETAIL = {
  skill: PLACES[0].skills[0],
  version: 'v1',
  draft: {
    name: 'write-a-note',
    title: 'Write a note',
    description: 'Writes the notes of a change.',
    tags: ['note'],
    examples: ['Write the notes'],
    preload: false,
    body: 'Write them.\n',
  },
  body: 'Write them.\n',
  users: [{ from: 'yours', name: 'scribe' }],
  copyHint: "mkdir -p '/repo/.claude/skills' && cp -r '/store/workflows/skills/write-a-note' '/repo/.claude/skills/'",
};

async function skillForm(props: Record<string, unknown>): Promise<string> {
  const { SkillForm } = await import('../src/components/agent/SkillForm.tsx');
  return renderToStaticMarkup(createElement(SkillForm, { saving: false, refusal: null, onSave: () => {}, ...props } as never));
}

test("a new skill's form takes its name, title, description, tags, examples and instructions, and creates it", async () => {
  const html = await skillForm({ detail: null });
  assert.match(html, /aria-label="New skill"/);
  for (const label of ['Name', 'Title', 'Description', 'Tags', 'Examples', 'Instructions'])
    assert.match(html, new RegExp(`>${label}</label>`), label);
  assert.doesNotMatch(html, /readonly=""/i, 'every field is to be typed in');
  assert.match(html, />Create skill</);
});

test("a skill of yours is filled from its file, its name set once, and saved; the repository's or Nemia's is read, not saved", async () => {
  const between = (changed: boolean) => createElement('p', { 'data-between': String(changed) });
  const mine = await skillForm({ detail: SKILL_DETAIL, between });
  assert.match(mine, /readOnly=""[^>]*value="write-a-note"/, 'the name is its folder, and an agent names it by it');
  assert.match(mine, /Writes the notes of a change\./);
  assert.match(mine, />Write them\.\n<\/textarea>/);
  assert.match(mine, /data-between="false"/, 'the switch is told the form holds nothing unsaved');
  assert.match(mine, />Save</);
  const theirs = await skillForm({ detail: { ...SKILL_DETAIL, skill: { ...SKILL_DETAIL.skill, from: 'repo' } }, readOnly: true });
  assert.doesNotMatch(theirs, />Save<|>Create skill</);
  assert.equal([...theirs.matchAll(/readOnly=""/g)].length, 5, 'every field read-only, and its instructions read as markdown');
  assert.match(
    theirs,
    /<section aria-label="Instructions" data-field-markdown="true"[^>]*>[^]*<div data-markdown="true"[^>]*><p[^>]*>Write them\.<\/p>/,
  );
  assert.equal([...mine.matchAll(/readOnly=""/g)].length, 1, 'of yours, only the name');
  assert.doesNotMatch(mine, /data-field-markdown/, 'of yours, the instructions are typed in');
});

const tried = (id: string, fields: Record<string, unknown> = {}) => ({
  id,
  try: { agent: 'scribe' },
  createdAt: at,
  moving: false,
  ...fields,
});

/** A try's run as its page reads it: one step, `try`, filed, with what it spent of its dollar and the files its folder holds. */
function tryDetail(fields: Record<string, unknown> = {}): RunView {
  const run = runWith(null);
  return {
    ...run,
    id: 'r-t',
    repo: null,
    place: 'folder',
    status: 'succeeded',
    try: { agent: 'scribe' },
    holding: null,
    cancelledAt: null,
    steps: [
      {
        ...run.steps[0],
        name: 'try',
        status: 'done',
        taskId: 't-t',
        filesError: null,
        files: [{ path: 'note.md', name: 'note.md', url: '/api/runs/r-t/steps/try/files/note.md', kind: 'text', size: 120 }],
        spent: { said: '$0.12', usd: 0.12, measured: 1, unmeasured: 0 },
        budget: { usd: 1, said: '$1', of: '$0.12 of $1', over: false },
      },
    ],
    ...fields,
  } as never;
}

test('an agent of yours is tried from its page: the fence said in one line, and Try it held until there is a brief', async () => {
  const { TryAgent } = await import('../src/components/agent/TryAgent.tsx');
  const html = await routedWith(createElement(TryAgent, { agent: composing as never }), [[['runs'], []]]);
  const texts = textsOf(html);
  assert.ok(
    texts.includes(
      "A rehearsal fenced to its own folder, not the agent's own permissions: dontAsk, allowed Edit(**) in its folder and never more than the agent is, $1 to spend.",
    ),
    texts.join(' | '),
  );
  assert.match(html, /<button type="submit" disabled=""[^>]*>Try it<\/button>/, 'no brief, no try');
  assert.match(html, /data-try-held[^>]*>Write a brief to try it on\./);
  assert.doesNotMatch(html, /data-try=/, 'an agent never tried shows no try');
});

test('REFUSED: a second try while one moves — the button is held, and the latest try is drawn: its state, its spend of the dollar, its files and its run', async () => {
  const { TryAgent } = await import('../src/components/agent/TryAgent.tsx');
  const runs = [
    tried('r-old', { createdAt: '2026-09-01T00:00:00.000Z' }),
    tried('r-t', { moving: true, createdAt: '2026-09-25T00:00:00.000Z' }),
    { ...tried('r-x'), try: null },
  ];
  const html = await routedWith(createElement(TryAgent, { agent: composing as never }), [
    [['runs'], runs],
    ...readsOf(tryDetail({ status: 'running' })),
  ]);
  assert.match(html, /data-try-held[^>]*>A try is still running \(r-t\): one at a time\./);
  assert.match(html, /<button type="submit" disabled=""/);
  assert.match(html, /data-try="r-t"/, 'the newest try of this agent, not the older one');
  assert.match(html, /href="\/runs\/r-t"[^>]*data-try-run="r-t"|data-try-run="r-t"[^>]*href="\/runs\/r-t"/, 'linked to its run');
  assert.match(html, /data-try-status[^>]*>running</);
  assert.match(html, /data-try-spent[\s\S]*\$0\.12 of \$1/, 'what it spent of its budget');
  assert.match(html, /data-try-files[\s\S]*note\.md/);
});

test("a try stopped where no step broke says what stopped it, in its run's own word and with no row of the list, not a bare failed", async () => {
  const { TryAgent } = await import('../src/components/agent/TryAgent.tsx');
  const html = await routedWith(createElement(TryAgent, { agent: composing as never }), [
    [['runs'], [tried('r-t', { status: 'running' })]],
    ...readsOf(tryDetail({ status: 'blocked' })),
  ]);
  assert.match(html, /data-try-status[^>]*>blocked</);
});

test('a try not filed yet says so in place of its files', async () => {
  const { TryRun } = await import('../src/components/agent/TryAgent.tsx');
  const unfiled = tryDetail();
  (unfiled.steps[0] as { taskId: string | null }).taskId = null;
  const html = await routedWith(createElement(TryRun, { id: 'r-t' }), readsOf(unfiled));
  assert.match(html, /Not filed yet/);
  assert.doesNotMatch(html, /data-try-files/);
});

test("the repository's agent is not tried: its page says to copy it to yours, with the api's copy into the store it reads", async () => {
  const { TryYours } = await import('../src/components/agent/TryAgent.tsx');
  const copy = "mkdir -p '/tmp/e2e-store/workflows/agents' && cp '/repo/workflows/agents/critic.md' '/tmp/e2e-store/workflows/agents/'";
  const untried = { why: 'Only an agent of yours can be tried — a try runs with no repository. Copy it to yours to try it.', copy };
  const html = renderToStaticMarkup(
    createElement(TryYours, { agent: { ...composing, from: 'repo', file: '/repo/workflows/agents/critic.md', untried } as never }),
  );
  assert.match(html, /data-try-yours/);
  assert.match(html, /Copy it to yours to try it/);
  assert.ok(textsOf(html).includes(copy), `the copy as the api words it, into its own store: ${textsOf(html).join(' | ')}`);
  assert.doesNotMatch(html, /~\/\.agent-workflows/, 'no store the api may not read');
  assert.doesNotMatch(html, />Try it<\/button>/);
});

test("REFUSED: an agent of yours the try's fence does not reach says why in place of the Try it button", async () => {
  const { TryAgent } = await import('../src/components/agent/TryAgent.tsx');
  const why =
    "coder runs on `codex`, and a try is fenced by Claude Code's permission mode — `dontAsk` with `Edit(**)`, in a folder of its own — which codex does not take.";
  const html = await routedWith(
    createElement(TryAgent, { agent: { ...composing, name: 'coder', keys: { harness: 'codex' }, untried: { why, copy: null } } as never }),
    [[['runs'], []]],
  );
  assert.ok(textsOf(html).includes(why), textsOf(html).join(' | '));
  assert.match(html, /data-try-untried/);
  assert.doesNotMatch(html, /data-try-yours/, 'it is yours: nothing to copy');
  assert.doesNotMatch(html, />Try it<\/button>|<textarea/, 'no brief and no button');
});

test("an agent's face is drawn from its name, alive at all times: the same name the same face, another name another, named as a person is", async () => {
  const { AgentFace, personOf } = await import('../src/components/agent/AgentParts.tsx');
  const face = (name: string) => renderToStaticMarkup(createElement(AgentFace, { name, size: 16 }));
  const iris = face('iris');
  assert.match(iris, /^<svg [^>]*>/, "an inline drawing, which Blobatar's stylesheet moves");
  assert.doesNotMatch(iris, /<img/, 'no still image');
  const open = /^<svg [^>]*>/.exec(iris)?.[0] ?? '';
  assert.match(open, /role="img"/);
  assert.match(open, /data-agent-face="iris"/);
  assert.match(open, /aria-label="Iris"/, 'a screen reader says its name as a person is named');
  assert.doesNotMatch(open, /aria-hidden="true"/);
  assert.doesNotMatch(iris, /<title>/, 'and no title: the name is no text of the line it stands in, and no tooltip');
  assert.match(iris, /<g class="[^"]*\bmo-root\b[^"]*\bmo-always\b/, 'it moves with nothing hovering it');
  assert.equal(face('iris'), iris, 'the same name draws the same face');
  const drawing = (html: string) => html.replace(/aria-label="[^"]*"/, '').replace(/data-agent-face="[^"]*"/, '');
  assert.notEqual(drawing(face('nora')), drawing(iris), 'another name draws another face, not only another label');
  assert.equal(personOf('iris'), 'Iris');
  assert.equal(personOf('note-writer'), 'Note writer');
});

test('a face that follows the pointer is an inline drawing its driver can move, alive at all times, still named as a person is', async () => {
  const { AgentFace } = await import('../src/components/agent/AgentParts.tsx');
  const face = (name: string) => renderToStaticMarkup(createElement(AgentFace, { name, size: 36, follows: true }));
  const iris = face('iris');
  assert.match(iris, /^<svg [^>]*>/, iris);
  assert.doesNotMatch(iris, /<img/, 'no image: a driver moves only an inline drawing');
  const open = /^<svg [^>]*>/.exec(iris)?.[0] ?? '';
  assert.match(open, /role="img"/);
  assert.match(open, /data-agent-face="iris"/);
  assert.match(iris, /^<svg [^>]*><title>Iris<\/title>/, 'its name is its first child, so a screen reader says it');
  assert.match(iris, /class="[^"]*mo-eyes/, 'it has eyes a driver can move');
  assert.match(iris, /<g class="[^"]*\bmo-root\b[^"]*\bmo-always\b/, 'it moves with nothing hovering it');
  assert.equal(face('iris'), iris, 'the same name draws the same face');
  const drawing = (html: string) => html.replace(/<title>[^<]*<\/title>/, '').replace(/data-agent-face="[^"]*"/, '');
  assert.notEqual(drawing(face('nora')), drawing(iris), 'another name draws another face, not only another title');
});

test('REFUSED: a face on a plate stands on its own Blobatar backdrop, not the grey round; one without stays on the grey round', async () => {
  const { AgentFace } = await import('../src/components/agent/AgentParts.tsx');
  const backdrop = /<svg [^>]*>(?:<title>[^<]*<\/title>)?<path [^>]*><\/path><g class="mo-root/;
  const plated = renderToStaticMarkup(createElement(AgentFace, { name: 'iris', size: 112, follows: true, plate: true }));
  assert.match(plated, backdrop, 'a backdrop drawn under the face, in its own colours');
  assert.doesNotMatch(plated, /rounded-full|bg-muted/, 'and no grey round behind it');
  assert.match(
    plated,
    /^<svg [^>]*class="[^"]*dark:\[&amp;&gt;path\]:opacity-25/,
    "its backdrop, the drawing's one path of its own, dimmed in the dark theme",
  );
  const bare = renderToStaticMarkup(createElement(AgentFace, { name: 'iris', size: 112, follows: true }));
  assert.doesNotMatch(bare, backdrop);
  assert.match(bare, /class="[^"]*rounded-full bg-muted/);
  assert.match(renderToStaticMarkup(createElement(AgentFace, { name: 'iris', size: 16 })), /^<svg [^>]*class="[^"]*rounded-full bg-muted/);
});

/** An agent as the Agents page lists it, one that sets every kind of key: what a character card is drawn from. */
const character = {
  ...composing,
  name: 'iris',
  role: 'Product engineer',
  description: 'Turns an idea into an intent.',
  keys: {
    model: 'opus',
    effort: 'high',
    harness: 'claude',
    disallowedTools: 'Bash(git push)',
    permissionMode: 'auto',
    tools: 'Read, Grep',
    output: 'iris.schema.json',
  },
  skills: 'grilling',
  harnessPrompt: 'no-coding',
  mcp: null,
  card: [{ id: 'grilling', name: 'Grilling', description: 'Asks until the plan holds.', tags: ['interview'] }],
  usedBy: [{ from: 'repo', workflow: 'intake', step: 'ask' }],
};

const agentCard = async (agent: Record<string, unknown>) => {
  const { AgentCard } = await import('../src/components/agent/AgentCard.tsx');
  return routedWith(createElement(AgentCard, { agent: { ...character, ...agent } as never }));
};

test('REFUSED: a character card shows what its agent can do and its model, effort and harness, and none of its other keys', async () => {
  const html = await agentCard({});
  const stats = /<dl data-agent-stats[^>]*>([\s\S]*?)<\/dl>/.exec(html)?.[1] ?? '';
  for (const value of ['opus', 'high', 'claude']) assert.match(stats, new RegExp(`>${value}<`), `the stats hold ${value}: ${stats}`);
  assert.match(
    html,
    /data-agent-skill="grilling"[\s\S]*>Grilling<[\s\S]*line-clamp-2[^>]*>Asks until the plan holds\.</,
    'its skills, in front',
  );
  assert.doesNotMatch(html, /title=/, 'no tooltip: the name link stretched over the card would take its hover');
  assert.match(html, /data-agent-role[^>]*>Product engineer · <span[^>]*>iris<\/span>/);
  for (const hidden of ['Bash(git push)', '>auto<', 'no-coding', 'Read, Grep', 'iris.schema.json', '>interview<', '>grilling<'])
    assert.ok(!html.includes(hidden), `the card leaves ${hidden} to the agent's page`);
});

test("a character card holds one link to its agent's page, and its nodes' links beside it, never inside it", async () => {
  const html = await agentCard({});
  assert.equal([...html.matchAll(/href="\/agents\/yours\/iris"/g)].length, 1, html);
  assert.match(html, /<a [^>]*href="\/agents\/yours\/iris"[^>]*>Iris<\/a>/, "the person's name is the link");
  assert.match(html, /href="\/workflows\/repo\/intake\/ask"/);
  assert.doesNotMatch(html, /<a [^>]*>(?:(?!<\/a>)[\s\S])*<a /, 'no link inside a link');
});

test("REFUSED: a character card tags each factory its agent fills a step in, linked to its floor above the card's own link; none for none", async () => {
  const html = await agentCard({ factories: ['nemia', 'pipao'] });
  const tags = [...html.matchAll(/<a [^>]*data-factory-tag="([^"]+)"[^>]*>/g)];
  assert.deepEqual(
    tags.map(([, name]) => name),
    ['nemia', 'pipao'],
    html,
  );
  for (const [tag, name] of tags) assert.match(tag, new RegExp(`href="/factories/${name}"`), "each opens its factory's floor");
  assert.match(html, /data-factory-tags[^>]*class="[^"]*relative z-10/, "above the name's link stretched over the card");
  assert.doesNotMatch(html, /<a [^>]*>(?:(?!<\/a>)[\s\S])*<a /, 'no link inside a link');
  assert.doesNotMatch(html, /title=/, 'no tooltip: the name link stretched over the card would take its hover');
  for (const none of [await agentCard({ factories: [] }), await agentCard({})]) assert.doesNotMatch(none, /data-factory-tag/);
});

test('REFUSED: a character card draws no stats line for an agent that sets none, nor for one whose file does not read', async () => {
  const unset = await agentCard({ keys: { tools: 'Read' } });
  assert.match(unset, /data-agent-skill="grilling"/, 'the card is drawn');
  assert.doesNotMatch(unset, /data-agent-stats/);
  const broken = await agentCard({ error: 'agents/iris.md: no frontmatter.' });
  assert.match(broken, /agents\/iris\.md: no frontmatter\./);
  assert.doesNotMatch(broken, /data-agent-stats/);
});

test('a run picked to read shows what it would hand, as markdown — badged not landed, not judged where it has not landed, and unbadged where it has', async () => {
  const { ConcludedPreview } = await import('../src/components/agent/ContextPicker.tsx');
  const preview = (landed: boolean) =>
    routedWith(createElement(ConcludedPreview, { run: 'probe-b2' }), [
      [['runs', 'probe-b2', 'concluded'], { run: 'probe-b2', landed, section: '\n## From run probe-b2\n\nIt measured **the cache**.' }],
    ]);
  const inFlight = await preview(false);
  assert.match(inFlight, /data-not-landed[^>]*>not landed, not judged</);
  assert.match(inFlight, /<strong>the cache<\/strong>/);
  assert.doesNotMatch(await preview(true), /data-not-landed|not landed, not judged/);
});

test('a link to a factory definition keeps its factory and repository in its address, and a link to another origin carries none', async () => {
  const { AgentLink, SkillLink } = await import('../src/components/agent/AgentParts.tsx');
  const place = { factory: 'treed', repo: '/r' };
  const agent = await routedWith(createElement(AgentLink, { from: 'factory', name: 'drafter', place }));
  assert.match(agent, /href="\/agents\/factory\/drafter\?factory=treed&amp;repo=%2Fr"/, 'the agent link names the factory');
  const skill = await routedWith(createElement(SkillLink, { from: 'factory', name: 'outline', place }));
  assert.match(skill, /href="\/agents\/skills\/factory\/outline\?factory=treed&amp;repo=%2Fr"/, 'the skill link names the factory');
  const yours = await routedWith(createElement(AgentLink, { from: 'yours', name: 'drafter', place }));
  assert.match(yours, /href="\/agents\/yours\/drafter"/, 'a link of yours is read in default, with no factory');
});

test('a link to a factory definition given no place is read in the factory of the page it is drawn on', async () => {
  const { AgentLink } = await import('../src/components/agent/AgentParts.tsx');
  const { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } = await import('@tanstack/react-router');
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/agents?factory=treed'] }),
  });
  await router.load();
  const html = renderToStaticMarkup(
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
    createElement(RouterContextProvider, { router, children: createElement(AgentLink, { from: 'factory', name: 'drafter' }) }),
  );
  assert.match(html, /href="\/agents\/factory\/drafter\?factory=treed"/, "the page's factory is carried");
});
