/**
 * The board's gate components (`src/components/gate/`), rendered to markup as a server renders them: what a
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
import { test } from 'vitest';
import assert from 'node:assert/strict';
import './tsx.ts';
import {
  at,
  atGate,
  commandsOf,
  cut,
  needing,
  offersMarkup,
  planCloseout,
  proposalIn,
  routedWith,
  textsOf,
  unescaped,
  UNMEASURED,
  WAIT,
  where,
  withClient,
  withProposal,
  kitBoxes,
  cutPresses,
  kitButtons,
  kitChoices,
  kitRadios,
} from './markup.fixture.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { Chips, DecideSection, DiffFileView, GroupBar, LessonChip, TouchedBranch } = await import('../src/components/gate/Decide.tsx');
const { OFFERS } = await import('../src/lib/words.ts');
const { instantWhole } = await import('../src/lib/instant.ts');
type Decidable = import('../src/lib/api/decision.ts').Decidable;
const { FieldWidgetView } = await import('../src/components/field/widgets/FieldWidgetView.tsx');
const facts = await import('../src/components/step/Facts.tsx');
type StepCloseout = import('../src/lib/api/tries.ts').StepCloseout;
const { RecommendButton } = await import('../src/components/gate/Questions.tsx');
type Question = import('../src/lib/api/tries.ts').Question;
const Answering = await import('../src/components/gate/Decide.tsx');
const { container, ringed } = await import('../src/lib/meaning.ts');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const Gates = await import('../src/components/gate/Gate.tsx');
const { Gate } = await import('../src/components/gate/Gate.tsx');

/** Each bar's added and removed widths, in the order the bars are drawn. */
const barsOf = (html: string) =>
  [
    ...html.matchAll(
      /<span data-added="true"[^>]*style="width:([\d.]+)%"[^>]*><\/span><span data-removed="true"[^>]*style="width:([\d.]+)%"/g,
    ),
  ].map((m) => [Number(m[1]), Number(m[2])]) satisfies Array<[number, number]>;

const group = (name: string, files: number, added: number, removed: number, binary = 0) => ({ name, files, added, removed, binary });

/** A branch that touched a package and a test in it, the root's CLAUDE.md and package.json, and a binary logo. */
function radiusWith(lists: { agentFacing?: string[]; checkAffecting?: string[] } = {}) {
  return {
    changes: [
      { path: 'CLAUDE.md', added: 2, removed: 0 },
      { path: 'logo.png', added: null, removed: null },
      { path: 'packages/x/test/add.test.ts', added: 450, removed: 0 },
    ],
    groups: [group('(root)', 2, 2, 0, 1), group('assets', 1, 0, 0, 1), group('packages/x', 2, 453, 1)],
    agentFacing: lists.agentFacing ?? [],
    checkAffecting: lists.checkAffecting ?? [],
    lessons: [],
  };
}

test("each group's bar is its share of the most lines a group changed: the largest fills the track, a binary-only group draws none", () => {
  assert.deepEqual(barsOf(renderToStaticMarkup(createElement(GroupBar, { group: { added: 30, removed: 10 }, most: 80 }))), [[37.5, 12.5]]);

  const html = renderToStaticMarkup(createElement(TouchedBranch, { touched: { branch: 'wf/r-1/implement', radius: radiusWith() } }));
  assert.deepEqual(
    barsOf(html),
    [
      [0.44, 0],
      [0, 0],
      [99.78, 0.22],
    ],
    '(root) +2 −0, assets binary only, packages/x +453 −1 — which is the most, and fills the track',
  );
  assert.match(html, /data-group="packages\/x"[\s\S]*?>2 files<[\s\S]*?>\+453<\/span> <span[^>]*>−1<\/span>/);
  assert.match(html, /data-group="assets"[\s\S]*?>binary<\/span>/);
  assert.match(html, /data-group="\(root\)"[\s\S]*?>−0<\/span><span[^>]*> · 1 binary<\/span>/);
});

test("the agent-facing files are the kit's outlined Tag in its hairline and the check-affecting ones outlined in yours, each titled with why — and neither is drawn when there are none", () => {
  const both = renderToStaticMarkup(
    createElement(Chips, { agentFacing: ['CLAUDE.md'], checkAffecting: ['package.json', 'packages/x/test/add.test.ts'] }),
  );
  const chips = [
    ...both.matchAll(
      /<span data-slot="tag" data-variant="([^"]+)"[^>]*data-chip="([^"]+)" title="([^"]+)" class="([^"]+)">[\s\S]*?<span class="[^"]*font-mono[^"]*">([^<]+)<\/span>/g,
    ),
  ].map((m) => ({ variant: m[1], kind: m[2], title: m[3], cls: m[4], file: m[5] }));
  assert.deepEqual(
    chips.map(({ kind, title, file }) => [kind, title, file]),
    [
      ['agent-facing', 'the next agent reads this', 'CLAUDE.md'],
      ['check-affecting', 'could make its check pass', 'package.json'],
      ['check-affecting', 'could make its check pass', 'packages/x/test/add.test.ts'],
    ],
    both,
  );
  assert.ok(
    chips.every((chip) => chip.variant === 'outlined'),
    "each is the kit's outlined Tag",
  );
  assert.ok(holds(chips[0].cls, 'border-outline-variant text-on-surface-variant'), 'a note: the hairline, at rest');
  for (const chip of chips.slice(1)) {
    assert.ok(holds(chip.cls, 'border-yours text-yours'), 'what a person weighs: yours, drawn light');
    assert.doesNotMatch(chip.cls, /\bborder-outline-variant\b|\btext-on-surface-variant\b/, "yours takes the hairline's place");
    assert.doesNotMatch(chip.cls, /\bbg-/, 'an outline, not a fill');
  }

  assert.equal(renderToStaticMarkup(createElement(Chips, { agentFacing: [], checkAffecting: [] })), '');
  const onlyCheck = renderToStaticMarkup(createElement(Chips, { agentFacing: [], checkAffecting: ['package.json'] }));
  assert.doesNotMatch(onlyCheck, /agent-facing/);
  assert.match(onlyCheck, /data-chip="check-affecting"/);
  const plain = renderToStaticMarkup(createElement(TouchedBranch, { touched: { branch: 'wf/r-1/implement', radius: radiusWith() } }));
  assert.doesNotMatch(
    plain,
    /data-chip|agent-facing|check-affecting/,
    "on a branch with neither, the branch's rows are drawn and no chip is",
  );
  const unread = renderToStaticMarkup(
    createElement(TouchedBranch, {
      touched: { branch: 'wf/gone', radius: { error: 'what this run changed is not known: the place has no branch wf/gone in /r' } },
    }),
  );
  assert.match(
    unread,
    />what this run changed is not known: the place has no branch wf\/gone in \/r</,
    'a branch the place did not say says so, in the sentence the api gave',
  );
  assert.doesNotMatch(unread, /data-bar|data-group/, 'and draws no row');
});

test('the lesson chip is sage with what was written, a grey ring when nothing was, and dashed when a branch could not be read', () => {
  const chip = (lesson: { said: string; state: 'written' | 'nothing' | 'unknown' }) => {
    const m = /<span (?=[^>]*data-lesson="(\w+)" title="[^"]*")[^>]*class="([^"]+)"[^>]*>([^<]+)<\/span>/.exec(
      renderToStaticMarkup(createElement(LessonChip, { lesson })),
    );
    assert.ok(m, lesson.state);
    return { state: m[1], cls: m[2], text: m[3] };
  };
  const written = chip({ said: 'CLAUDE.md +2 −0', state: 'written' });
  assert.deepEqual([written.state, written.text], ['written', 'lesson · CLAUDE.md +2 −0']);
  assert.ok(holds(written.cls, container.sage));
  assert.doesNotMatch(written.cls, /\bring-/);

  const nothing = chip({ said: 'nothing written where the next agent reads', state: 'nothing' });
  assert.deepEqual([nothing.state, nothing.text], ['nothing', 'nothing written where the next agent reads']);
  assert.ok(holds(nothing.cls, ringed.grey));
  assert.doesNotMatch(nothing.cls, /\bbg-/);

  const unknown = chip({ said: 'not known — wf/gone could not be read', state: 'unknown' });
  assert.equal(unknown.text, 'lesson not known — wf/gone could not be read');
  assert.match(unknown.cls, /\bborder-dashed\b/);
  assert.doesNotMatch(unknown.cls, /\bbg-|\bring-/);
});

test('a diff is folded under its file, coloured by line, and a capped one says how many more lines `wf decide` prints', () => {
  const lines = [
    'diff --git a/package.json b/package.json',
    '--- a/package.json',
    '+++ b/package.json',
    '@@ -1 +1 @@',
    '-{"a":1}',
    '+{"a":2}',
    ' }',
  ];
  const capped = renderToStaticMarkup(
    createElement(DiffFileView, { file: { path: 'package.json', lines, cut: 26 }, counts: { added: 1, removed: 1 } }),
  );
  assert.match(capped, /^<details data-diff="package\.json"/, 'collapsed: a details element with no open attribute');
  assert.doesNotMatch(capped, /<details[^>]*\bopen\b/);
  assert.match(capped, /<summary[^>]*>.*package\.json.*\+1<\/span> <span[^>]*>−1<\/span>/);
  assert.deepEqual(
    [...capped.matchAll(/data-line="(\w+)"/g)].map((m) => m[1]),
    ['meta', 'meta', 'meta', 'hunk', 'removed', 'added', 'context'],
  );
  assert.match(capped, /<p [^>]*data-cut="26"[^>]*>26 more lines — the command line&#x27;s decide prints them all<\/p>/);

  const whole = renderToStaticMarkup(createElement(DiffFileView, { file: { path: 'package.json', lines, cut: 0 } }));
  assert.doesNotMatch(whole, /data-cut|more line/);
  assert.match(
    renderToStaticMarkup(createElement(DiffFileView, { file: { path: 'package.json', lines, cut: 1 } })),
    />1 more line — the command line/,
  );
});

test('the Decide section copies its commands and runs none: a button per command, and each only copies', () => {
  const commands = [
    {
      label: 'once more',
      command: 'wf retry r-1 implement',
      said: 'implement: succeeded · BLOCKED. Continue its session, told what happened:  wf retry r-1 implement  (--fresh, or --model <m>, for a new session)',
      step: 'implement',
    },
    { label: 'merge it', command: 'git -C /code/app merge --no-ff wf/r-1/implement', said: null, step: null },
    { label: 'drop it', command: 'git -C /code/app branch -D wf/r-1/implement', said: null, step: null },
  ] as const;
  const decision: Decidable = {
    standings: [],
    touched: [{ branch: 'wf/r-1/implement', radius: radiusWith({ agentFacing: ['CLAUDE.md'] }) }],
    lesson: { said: 'CLAUDE.md +2 −0', state: 'written' },
    sensitive: [
      { branch: 'wf/r-1/implement', files: [{ path: 'packages/x/test/add.test.ts', lines: ['@@ -1 +1,451 @@'], cut: 3 }], error: null },
    ],
    used: {},
    total: {
      ...UNMEASURED,
      usage: { toolCalls: 34 },
      used: 'responses not measured · 34 tool calls · tokens in not measured · tokens out not measured',
    },
    cost: null,
    overBudget: null,
    collisions: null,
    commands: [...commands],
    awaiting: null,
  };
  const html = renderToStaticMarkup(createElement(DecideSection, { runId: 'r-1', decision }));
  assert.match(html, /^<section aria-label="Decide"/);
  const buttons = [...html.matchAll(/<button [^>]*>/g)].map((m) => m[0]);
  assert.equal(buttons.length, commands.length, html);
  for (const [i, button] of buttons.entries()) {
    assert.match(button, /\bdata-copy="true"/);
    assert.ok(button.includes(`aria-label="Copy: ${commands[i].command}"`), button);
  }
  for (const { command } of commands) assert.ok(html.includes(`>${command}</code>`), command);
  assert.match(
    html,
    />implement: succeeded · BLOCKED\. Continue its session, told what happened {2}\(--fresh, or --model &lt;m&gt;, for a new session\)</,
    "the once-more line's words, without the command that follows it on the line below",
  );
  assert.match(html, /<dt[^>]*>used<\/dt><dd[^>]*>responses not measured · 34 tool calls/, "the run's total, in `wf decide`'s words");
  assert.match(html, /<dt[^>]*>cost<\/dt><dd[^>]*>not measured<\/dd>/, 'never a 0 for what nobody measured');
  assert.match(
    html,
    /data-diff="packages\/x\/test\/add\.test\.ts"[\s\S]*?\+450<\/span> <span[^>]*>−0<\/span>[\s\S]*?3 more lines/,
    "the capped file, with the file's lines off the branch's radius in its summary",
  );
});

/** Whether the class list `cls` carries every class of the drawn form `form`. */
const holds = (cls: string, form: string) => form.split(' ').every((c) => cls.split(' ').includes(c));

/** Whether the class list `cls` carries any class of the drawn form `form`. */
const touches = (cls: string, form: string) => form.split(' ').some((c) => cls.split(' ').includes(c));

/** Whether `cls` is drawn as a wait on a person: the yours container whole, and nothing of a failure's. */
const drawnYours = (cls: string) => holds(cls, container.yours) && !touches(cls, container.failure);

test("the answers: a box for a step that asks, Try again for a refused check with a recheck, its box closed while a recheck is chosen — and a try asked, `wf ls`'s note", () => {
  const html = offersMarkup(
    [
      { step: 'implement', case: 'answer', kind: 'retry', needs: 'Which database?', questions: [] },
      { step: 'theme', case: 'try-again', kind: 'retry', recheck: true, unfinished: false },
      { step: 'lint', case: 'try-again', kind: 'retry', recheck: true, unfinished: true },
      { step: 'docs', case: 'try-again', kind: 'retry', recheck: false, unfinished: false },
    ],
    [{ step: 'plan', try: 2, note: 'try 2 asked (--continue, with your answer) — the next tick files it' }],
  );
  assert.match(html, /^<section aria-label="Answer"/);
  const rows = new Map(
    [
      ...html.matchAll(
        /<li [^>]*?(?:data-offer="([^"]+)" data-kind="([^"]+)"|data-asked="true") data-step="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g,
      ),
    ].map((m) => [m[3], { offer: m[1] ? [m[1], m[2]] : 'asked', html: m[4] }]),
  );
  assert.deepEqual(
    [...rows].map(([name, { offer }]) => [name, offer]),
    [
      ['implement', ['answer', 'retry']],
      ['theme', ['try-again', 'retry']],
      ['lint', ['try-again', 'retry']],
      ['docs', ['try-again', 'retry']],
      ['plan', 'asked'],
    ],
  );
  const said = (name: string) => textsOf(/<(p|div) data-said="true"[^>]*>([\s\S]*?)<\/\1>/.exec(rows.get(name)!.html)![2]).join(' ');
  const buttons = (name: string) => kitButtons(rows.get(name)!.html);
  const radios = (name: string) => kitRadios(rows.get(name)!.html);
  const boxes = (name: string) => [...rows.get(name)!.html.matchAll(/<textarea /g)].length;
  const closed = (name: string) => /<textarea [^>]*\bdisabled=""/.test(rows.get(name)!.html);

  assert.equal(said('implement'), 'implement asks: Which database?', 'an answer: what it asks, a question as its markdown under `asks:`');
  assert.equal(boxes('implement'), 1, 'a box');
  assert.deepEqual(buttons('implement'), [['submit', true, 'Answer and continue']], 'and a button that waits for an answer');
  assert.deepEqual(
    radios('implement'),
    [
      ['continue', true],
      ['fresh', false],
    ],
    'a nudge unless a new session is chosen (a server render writes `checked` before `value`)',
  );
  assert.deepEqual(kitBoxes(rows.get('implement')!.html), [['Your answer to implement', false]], 'the box named for what it holds');

  assert.equal(said('theme'), `theme ${OFFERS['try-again'].said.refused}`, 'any need but a question is a sentence: a refused check');
  assert.equal(boxes('theme'), 1, 'a refused check: something to tell it if you like');
  assert.deepEqual(buttons('theme'), [['submit', false, 'Try again']]);
  assert.deepEqual(
    radios('theme'),
    [
      ['continue', true],
      ['fresh', false],
      ['recheck', false],
    ],
    'and its check again',
  );
  assert.deepEqual(
    radios('lint'),
    [
      ['continue', false],
      ['fresh', false],
      ['recheck', true],
    ],
    'the check first where it did not finish',
  );
  assert.equal(
    closed('lint'),
    true,
    `a recheck files no session, so a message on it is refused (\`messageRefusal\`): its box is closed while it is chosen\n${rows.get('lint')!.html}`,
  );
  assert.ok(rows.get('lint')!.html.includes(`placeholder="${OFFERS['try-again'].recheck.placeholder}"`), rows.get('lint')!.html);
  assert.deepEqual([closed('implement'), closed('theme'), closed('docs')], [false, false, false]);
  assert.equal(unescaped(said('docs')), `docs ${OFFERS['try-again'].said.unsigned}`, 'an unsigned step: no closeout the run accepts');
  assert.equal(said('lint'), `lint ${OFFERS['try-again'].said.unfinished}`, 'a check that did not finish');
  assert.deepEqual(radios('docs'), [
    ['continue', true],
    ['fresh', false],
  ]);

  assert.deepEqual(
    textsOf(rows.get('plan')!.html),
    ['plan', 'try 2 asked (--continue, with your answer) — the next tick files it'],
    'asked: what `wf ls` says of it',
  );
  assert.deepEqual(buttons('plan'), [], 'and nothing to press');

  assert.equal(boxes('plan'), 0);
  assert.doesNotMatch(html, /data-refused/);
});

test('a step `denials: fail` stopped is offered Try again with a new session first, as `wf decide` offers it, and its row names the calls it was denied', () => {
  const html = offersMarkup([
    { step: 'notes', case: 'denied', kind: 'retry', calls: 'denied: Write(/tmp/w/notes.md)' },
    { step: 'bare', case: 'denied', kind: 'retry', calls: null },
  ]);
  const rows = new Map(
    [...html.matchAll(/<li [^>]*?data-offer="denied" data-kind="retry" data-step="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  const said = (name: string) => unescaped(textsOf(/<p [^>]*data-said="true"[^>]*>([\s\S]*?)<\/p>/.exec(rows.get(name)!)![1]).join(' '));
  assert.equal(said('notes'), `notes ${OFFERS.denied.said('denied: Write(/tmp/w/notes.md)')}`, 'the calls the api named');
  assert.equal(said('bare'), `bare ${OFFERS.denied.said(null)}`, 'and none where it named none');
  assert.notEqual(OFFERS.denied.said('x'), OFFERS.denied.said(null), 'the calls are in the sentence');
  assert.deepEqual(
    kitRadios(rows.get('notes')!),
    [
      ['fresh', true],
      ['continue', false],
    ],
    'a new session first, and no recheck: no check of it ran',
  );
  assert.match(rows.get('notes')!, /<form aria-label="Try notes again"/);
  assert.deepEqual(kitButtons(rows.get('notes')!), [['submit', false, 'Try again']]);
});

test('a step asking questions as data is answered by choosing: radios where it takes one, checkboxes where several, the recommended marked, nothing chosen, and a button that waits for every answer', () => {
  const html = offersMarkup([
    { step: 'design', case: 'answer', kind: 'retry', needs: 'Two questions.', questions: [cut, where] },
    { step: 'spec', case: 'answer', kind: 'retry', needs: 'One question.', questions: [where] },
  ]);
  const rows = new Map(
    [
      ...html.matchAll(/<li [^>]*?data-offer="answer" data-kind="retry" data-questions="true" data-step="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g),
    ].map((m) => [m[1], m[2]]),
  );
  const design = rows.get('design')!;
  assert.ok(design, html);
  assert.deepEqual(
    [...design.matchAll(/<fieldset data-question="([^"]+)"/g)].map((m) => unescaped(m[1])),
    [cut.title, where.title],
  );
  assert.deepEqual(
    kitChoices([...design.matchAll(/<fieldset data-question[\s\S]*?<\/fieldset>/g)].map((m) => m[0]).join('')),
    [
      ['option:0', 'radio', false],
      ['option:1', 'radio', false],
      ['way:else', 'radio', false],
      ['way:none', 'radio', false],
      ['option:0', 'checkbox', false],
      ['option:1', 'checkbox', false],
      ['way:else', 'checkbox', false],
      ['way:none', 'checkbox', false],
    ],
    'nothing is chosen until the person chooses, and each question offers its two ways out after its options',
  );
  assert.equal([...design.matchAll(/data-recommended="true"/g)].length, 1, 'the one recommended option is marked');
  assert.match(design, /data-option="a"[\s\S]*?a<\/span>[\s\S]*?data-recommended="true"[\s\S]*?The shape and the board first\./);
  for (const way of ['else', 'none'])
    assert.equal([...design.matchAll(new RegExp(`data-way="${way}"`, 'g'))].length, 2, `${way} on each question`);
  assert.match(design, /<strong>big<\/strong>/, 'a body is its markdown');
  const buttons = kitButtons;
  assert.deepEqual(buttons(design), [
    ['button', false, 'Add your words'],
    ['button', false, 'Add your words'],
    ['submit', true, 'Answer and continue'],
    ['button', false, 'Choose the recommended answers'],
  ]);
  assert.match(
    design,
    /<span title="Not answered: How is the card cut\? · Where do the answers go\?" class="inline-flex"><button data-slot="button"[^>]*disabled=""/,
    'Approve says on hover what is not answered',
  );
  assert.doesNotMatch(design, /data-own="true"/, 'no box for words until a way out is taken or words are asked for');
  assert.equal([...design.matchAll(/data-add-words="true"/g)].length, 2, 'each question offers to add words');
  assert.deepEqual(
    buttons(rows.get('spec')!).filter(([, , label]) => label !== 'Add your words'),
    [['submit', true, 'Answer and continue']],
    'no recommended answers to choose where none is recommended',
  );
  assert.doesNotMatch(html, /--recheck/, 'a recheck files no session to read answers');
});

test('a question that takes several marks each label it recommends as a list, and offers to choose them', () => {
  const many: Question = { ...where, recommended: ['retry', 'gate'] };
  const html = renderToStaticMarkup(createElement(RecommendButton, { questions: [many], draft: {}, onDraft: () => {} }));
  assert.match(html, /data-recommend-all/);
  const read = renderToStaticMarkup(
    createElement(FieldWidgetView, { name: 'open', widget: 'questions', value: [many], given: true, questions: [many] }),
  );
  assert.equal([...read.matchAll(/data-recommended="true"/g)].length, 2);
});

test('the Decide section puts the answers first, before what there is to decide, and its commands still only copy', () => {
  const decision: Decidable = {
    standings: [],
    touched: [],
    lesson: { said: 'nothing written where the next agent reads', state: 'nothing' },
    sensitive: [],
    used: {},
    total: UNMEASURED,
    cost: null,
    overBudget: null,
    collisions: null,
    commands: [{ label: 'merge it', command: 'git -C /code/app merge --no-ff wf/r-1/implement', said: null, step: null }],
    awaiting: null,
  };
  const offers = createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    createElement(Answering.Offers, {
      runId: 'r-1',
      offers: [{ step: 'implement', case: 'answer', kind: 'retry', needs: 'Which database?', questions: [] }],
      steps: [commandsOf('implement')],
    }),
  );
  const html = renderToStaticMarkup(createElement(DecideSection, { runId: 'r-1', decision, offers }));
  assert.ok(html.indexOf('aria-label="Answer"') < html.indexOf('data-lesson'), html);
  const commands = /<section aria-label="Commands"[\s\S]*?<\/section>/.exec(html)![0];
  assert.deepEqual(
    [...commands.matchAll(/<button [^>]*>/g)].map((m) => /data-copy="true"/.test(m[0])),
    [true],
  );
  assert.match(html, />implement<\/strong> asks:<\/p> <div data-markdown="true"[^>]*><p[^>]*>Which database\?<\/p><\/div>/);
});

test('a loop out of rounds is approved as it stands from the Answer section, with a reason, by its own approve line; every Commands row only copies', () => {
  const decision: Decidable = {
    standings: [],
    touched: [],
    lesson: { said: 'nothing written where the next agent reads', state: 'nothing' },
    sensitive: [],
    used: {},
    total: UNMEASURED,
    cost: null,
    overBudget: null,
    collisions: null,
    awaiting: null,
    commands: [
      { label: 'once more', command: 'nemia retry r-1 review --round', said: null, step: 'review' },
      {
        label: 'approve',
        command: 'nemia approve r-1 review --message "<why>"',
        said: 'review: enough — go on with what is there:  nemia approve r-1 review --message "<why>"',
        step: 'review',
      },
    ],
  };
  const offers = createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    createElement(Answering.Offers, {
      runId: 'r-1',
      offers: [{ step: 'review', case: 'enough', kind: 'approve' }],
      steps: [commandsOf('review')],
    }),
  );
  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, createElement(DecideSection, { runId: 'r-1', decision, offers })),
  );
  const answer = /<section aria-label="Answer"[\s\S]*?<\/section>/.exec(html)![0];
  const row = /<li [^>]*?data-offer="enough" data-kind="approve" data-step="review"[\s\S]*?<\/li>/.exec(answer)![0];
  assert.match(
    row,
    /<code>nemia approve r-1 review --message &quot;&lt;why&gt;&quot;<\/code>/,
    "the step's approve line, with the reason a loop's requires",
  );
  assert.ok(row.includes(`<form aria-label="${OFFERS.enough.form('review')}"`), row);
  assert.match(row, new RegExp(`<textarea[^>]*aria-label="${OFFERS.enough.field('review').replace("'", '&#x27;')}"`), 'the box named');
  assert.match(
    row,
    new RegExp(`<button[^>]*type="submit"[^>]*disabled=""[^>]*>(?:(?!</button>)[\\s\\S])*>${OFFERS.enough.button}<`),
    'blank, the button waits for a reason, as `nemia approve` of a loop waits for `--message`',
  );
  const commands = /<section aria-label="Commands"[\s\S]*?<\/section>/.exec(html)![0];
  assert.deepEqual(
    [...commands.matchAll(/<button [^>]*>/g)].map((m) => /data-copy="true"/.test(m[0])),
    [true, true],
    'every Commands row only copies',
  );
  assert.doesNotMatch(commands, /<form|<textarea/);
});

/** What a piece of markup reads as, its tags gone: `textContent`, as the e2e's `hasText` reads it. */
const textContentOf = (html: string) => unescaped(html.replace(/<[^>]+>/g, ''));

test("Continue asks the tick for another try of a session the harness blocked: a box for anything to tell it, optional, and the step's retry line", () => {
  const html = withClient(createElement(Answering.Continue, { runId: 'r-1', step: 'review', line: 'nemia retry r-1 review' }));
  assert.match(html, /^<div data-continue="true"[^>]*><form aria-label="Continue review"/);
  assert.deepEqual(
    kitButtons(html).map(([type, disabled]) => [type, disabled]),
    [['submit', false]],
    'one button, enabled with nothing written: the box is optional',
  );
  assert.equal(kitBoxes(html).length, 1, 'one box, named');
  assert.ok(textsOf(html).includes('nemia retry r-1 review'), `the step's retry line, as the api answers it\n${html}`);
  assert.doesNotMatch(html, /data-copy|ae stop/, 'no commands to copy');
});

test("an agent's question is drawn as its markdown after `asks:` in the inspector", async () => {
  const needs = 'Which **database**?\n\n- one\n- two';
  const run = needing('succeeded · BLOCKED', { needs }, { waitingOnYou: ['review'] });
  const { Asked } = await import('../src/components/gate/GateBrief.tsx');
  const asked = await routedWith(createElement(Asked, { run, step: run.steps[0] }));
  assert.match(
    asked,
    /data-asked="asks"[^]*<strong>review<\/strong> asks: <div data-markdown="true"[^>]*><p[^>]*>Which <strong>database<\/strong>/,
  );
  assert.ok(textContentOf(asked).includes('review asks: Which database?'), asked);
  assert.doesNotMatch(asked, /\*\*|whitespace-pre/);

  const harness = needing('needs-human', { waitingFor: WAIT, lastLine: '**not markdown**' }, { waitingOnYou: [] });
  const blocked = await routedWith(createElement(Asked, { run: harness, step: harness.steps[0] }));
  assert.match(
    blocked,
    /data-asked="harness"[^]*<p class="[^"]*break-words[^"]*">review is blocked by the harness; [^<]*\*\*not markdown\*\*<\/p>/,
  );
  assert.doesNotMatch(blocked, /data-markdown/, "the harness's words and the session's last line are said as they are");
});

test("a result nobody decided is asked in the inspector, with the way to the run's Decide section; a run called off asks nothing", async () => {
  const { Asked } = await import('../src/components/gate/GateBrief.tsx');
  const toDecide = {
    kind: 'result' as const,
    branches: ['wf/r-1/ship'],
    said: 'merge or drop wf/r-1/ship',
    command: 'git merge wf/r-1/ship',
  };
  const run = { ...needing('succeeded', {}, { waitingOnYou: [] }), toDecide };
  const asked = await routedWith(createElement(Asked, { run, step: run.steps[0] }));
  assert.match(asked, /data-asked="result"/);
  assert.ok(textContentOf(asked).includes("The run's result waits on you: merge or drop wf/r-1/ship."), asked);
  assert.match(asked, /<a [^>]*data-answer-link="true"[^>]*href="\/runs\/r-1#decide"/);

  const called = { ...needing('succeeded', {}, { waitingOnYou: [], cancelledAt: at }), toDecide };
  assert.equal(await routedWith(createElement(Asked, { run: called, step: called.steps[0] })), '');
});

test('the gate: Approve with a box for the words, which may stay empty, and Send back — the answer box — with an objection it waits for, continuing the session or in a new one', () => {
  const html = withClient(createElement(Gates.Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan' }));
  assert.match(
    html,
    /^<div data-slot="typography" class="text-body-medium font-body-medium contents"><section aria-label="The gate of plan" data-gate="awaiting"/,
  );
  assert.match(
    html,
    /as <code>nemia approve r-1 plan<\/code> approves it: the next tick files what waits on it/,
    'beside Approve, the line it answers',
  );
  const forms = new Map([...html.matchAll(/<form aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual([...forms.keys()], ['Approve plan', 'Send plan back']);
  const buttons = (form: string) => kitButtons(forms.get(form)!);
  assert.deepEqual(
    cutPresses(forms.get('Approve plan')!),
    [['submit', false, 'Approve']],
    'Approve is enabled with no words: an approval needs none',
  );
  assert.deepEqual(
    buttons('Send plan back'),
    [['submit', true, 'Send back']],
    'Send back waits for an objection: the package refuses one with none',
  );
  assert.match(
    forms.get('Approve plan')!,
    /<textarea aria-label="Words to approve plan with, if any"[^>]*placeholder="Your words \(optional\): every step after the gate is handed them, under “Approved”\."/,
  );
  assert.ok(textsOf(forms.get('Approve plan')!).includes('nemia approve r-1 plan'), 'the line the api answers beside the button');
  assert.deepEqual(kitBoxes(forms.get('Send plan back')!), [['What to change, sent back to plan', false]]);
  const radios = kitRadios(forms.get('Send plan back')!);
  assert.deepEqual(
    radios,
    [
      ['continue', true],
      ['fresh', false],
    ],
    'no recheck: a gate held nothing a check refused',
  );
  assert.doesNotMatch(html, /data-refused/);
});

test('the approval under a step: the try, when, and the words as they were written — or that there were none', () => {
  const words = 'Ship the second reading.\nKeep the flag <b>off</b> by default.';
  const html = renderToStaticMarkup(createElement(Gates.Approved, { step: 'plan', approval: { try: 2, at, message: words } }));
  assert.match(
    html,
    /^<div data-slot="typography" class="text-body-medium font-body-medium contents"><section aria-label="The approval of plan" data-approval="2"/,
  );
  assert.ok(textsOf(html).includes('Approved'), html);
  assert.ok(html.includes(`try 2, <time dateTime="${at}" title="${instantWhole(new Date(at))}">`), html);
  assert.match(
    html,
    /<p data-words="true" class="whitespace-pre-wrap break-words">Ship the second reading\.\nKeep the flag &lt;b&gt;off&lt;\/b&gt; by default\.<\/p>/,
    'as text, never as markup',
  );
  const none = renderToStaticMarkup(createElement(Gates.Approved, { step: 'plan', approval: { try: 1, at, message: null } }));
  assert.match(none, /<p data-words="none"[^>]*>with no words<\/p>/);
  assert.ok(
    textsOf(html).join(' ').includes('every step after the gate is handed these words'),
    `a gate lets what follows through\n${html}`,
  );
  assert.ok(textsOf(none).join(' ').includes('every step after the gate is handed the approval'), none);
  assert.deepEqual(
    [
      Gates.gateWord({ awaiting: true, approval: null }),
      Gates.gateWord({ awaiting: false, approval: { try: 1, at, message: null } }),
      Gates.gateWord({ awaiting: false, approval: null }),
    ],
    ['awaiting approval', 'approved, try 1', 'holds once it has signed off'],
  );
});

test("the gate's own words: the approval's box says every step after the gate is handed them, and the word taken names the step it was about", () => {
  const held = withClient(createElement(Gates.Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan' }));
  assert.match(held, /placeholder="Your words \(optional\): every step after the gate is handed them, under “Approved”\."/);
  assert.deepEqual(Gates.takenOf({ approved: 2 }, 'plan'), {
    named: 'plan',
    said: 'approved try 2 — the next tick files what waits on it',
  });
  assert.deepEqual(Gates.takenOf({ asked: { try: 3, stopFirst: false }, step: 'plan' }, 'plan'), {
    named: 'plan',
    said: 'try 3 asked — the next tick files it',
  });
});

test('REFUSED: a gate with nothing to send back is offered the approval alone', () => {
  const alone = withClient(createElement(Gates.Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan', back: [] }));
  const forms = [...alone.matchAll(/<form aria-label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(forms, ['Approve plan'], 'the approval alone');
  assert.doesNotMatch(alone, /Send back|What to change/);
  const withWork = withClient(createElement(Gates.Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan' }));
  assert.deepEqual(
    [...withWork.matchAll(/<form aria-label="([^"]+)"/g)].map((m) => m[1]),
    ['Approve plan', 'Send plan back'],
    'with work to send back to, both are offered',
  );
});

test("the Decide section says why a step past its budget is held — `wf decide`'s OVER BUDGET line — and what every try of the run cost", () => {
  const line = 'OVER BUDGET, waiting on you: tokens ($4.25 of $3)  — the run files nothing more for it on its own; nothing after it ran';
  const decision: Decidable = {
    standings: [],
    touched: [],
    lesson: { said: 'nothing written where the next agent reads', state: 'nothing' },
    sensitive: [],
    used: {},
    total: UNMEASURED,
    cost: 'run $6.35 measured · 2 sessions not measured',
    overBudget: line,
    collisions: null,
    commands: [],
    awaiting: null,
  };
  const html = renderToStaticMarkup(createElement(DecideSection, { runId: 'r-1', decision }));
  assert.match(
    html,
    /<p data-slot="typography" class="[^"]*" data-over-budget="true">OVER BUDGET, waiting on you: tokens \(\$4\.25 of \$3\) {2}— the run files nothing more for it on its own; nothing after it ran<\/p>/,
  );
  assert.ok(
    drawnYours(/<p data-slot="typography" class="([^"]*)" data-over-budget="true"/.exec(html)![1]),
    'a step held on its budget waits on a person: yours',
  );
  assert.match(html, /<dt[^>]*>every try<\/dt><dd[^>]*>run \$6\.35 measured · 2 sessions not measured<\/dd>/);
  const none = renderToStaticMarkup(
    createElement(DecideSection, { runId: 'r-1', decision: { ...decision, overBudget: null, cost: null } }),
  );
  assert.doesNotMatch(none, /data-over-budget/, 'no step held on a budget: no line');
  assert.match(none, /<dt[^>]*>every try<\/dt><dd[^>]*>—<\/dd>/, 'nothing ended yet: a dash, not $0');
});

test('the Decide section shows its trial merges: the runs in flight and each it collides with — and none where the decision read no trial', async () => {
  const decision: Decidable = {
    standings: [],
    touched: [],
    lesson: { said: 'nothing written where the next agent reads', state: 'nothing' },
    sensitive: [],
    used: {},
    total: UNMEASURED,
    cost: null,
    overBudget: null,
    collisions: {
      onto: 'main',
      base: [],
      inFlight: ['r-2'],
      colliding: [
        {
          run: 'r-2',
          branch: 'wf/r-2/implement',
          ours: 'wf/r-1/implement',
          merge: { clean: false, conflicts: ['src/a.ts'] },
          said: "conflicts with r-2's wf/r-2/implement in 1 file: src/a.ts",
        },
      ],
      said: 'collides with 1 of the 1 run in flight on main: r-2',
    },
    commands: [],
    awaiting: null,
  };
  const html = await routedWith(createElement(DecideSection, { runId: 'r-1', decision }));
  const merges = html.match(/<section aria-label="Trial merges"[^]*?<\/section>/)?.[0] ?? '';
  assert.match(merges, /<dd data-fact="others" data-state="bad"[^>]*>collides with 1 of the 1 run in flight on main: r-2<\/dd>/);
  assert.match(
    merges,
    /<dd data-fact="collides" data-state="bad"[^>]*>wf\/r-1\/implement conflicts with r-2&#x27;s wf\/r-2\/implement in 1 file: src\/a\.ts<\/dd>/,
  );
  const none = await routedWith(createElement(DecideSection, { runId: 'r-1', decision: { ...decision, collisions: null } }));
  assert.doesNotMatch(none, /Trial merges|data-fact="(others|collides)"/, 'no trial read: nothing said of one');
});

test('what sessions read, by price: beside the cost, the peak marked at a cap or past 200k, a rebuilt cache said beneath — and no row where nothing measured it', () => {
  const { Read, readRows } = facts;
  const markup = (node: unknown) => renderToStaticMarkup(node as Parameters<typeof renderToStaticMarkup>[0]);
  const used = (read: string | null, peak: 'cap' | 'large' | null = null, rebuilt = 0) => ({
    usage: null,
    used: '',
    cost: '$3.01',
    costUsd: 3.01,
    apiMs: null,
    toolMs: null,
    read,
    peak,
    rebuilt,
  });

  assert.deepEqual(readRows(used(null)), [], 'a runner that counted its input as one number: no row, not 0');
  assert.deepEqual(readRows(null), []);

  const plain = markup(createElement(Read, { said: 'read 21.4M · wrote 412k · peak 167k', peak: null, rebuilt: 0 }));
  assert.match(plain, /data-read/);
  assert.deepEqual(textsOf(plain), ['read 21.4M', '· wrote 412k', '· peak 167k'], 'each count its own part, in the order said');
  assert.doesNotMatch(plain, /data-peak|data-rebuilt/, 'under its cap, and resumed from a warm cache: nothing marked');

  const capped = markup(
    createElement(Read, {
      said: 'read 4.4M · wrote 355k · peak 174k, compacted twice at its 200k cap · a resumed session wrote its context to the cache again instead of reading it',
      peak: 'cap',
      rebuilt: 1,
    }),
  );
  assert.match(
    capped,
    /<span data-peak="cap" class="font-semibold text-on-surface" title="It reached the step&#x27;s context: cap: Claude Code compacted[^"]*">peak 174k, compacted twice at its 200k cap<\/span>/,
  );
  const unpeaked = markup(createElement(Read, { said: 'read 900k · wrote 20k · compacted at its 100k cap', peak: 'cap', rebuilt: 0 }));
  assert.match(
    unpeaked,
    /<span data-peak="cap"[^>]*>compacted at its 100k cap<\/span>/,
    'no peak measured: the compaction is where it stands, and not dropped',
  );
  assert.match(
    capped,
    /<span data-slot="typography" class="(?=[^"]*\bblock\b)(?=[^"]*\btext-body-small\b)[^"]*" data-rebuilt="1" title="[^"]*the cache was rebuilt\.">a resumed session wrote its context to the cache again instead of reading it<\/span>/,
  );

  const large = markup(
    createElement(Read, { said: 'read 2.9M · wrote 100k · peak 250k, past 200k with no cap', peak: 'large', rebuilt: 0 }),
  );
  assert.match(large, /<span data-peak="large"[^>]*>peak 250k, past 200k with no cap<\/span>/);

  const decision: Decidable = {
    standings: [],
    touched: [],
    lesson: { said: 'nothing written where the next agent reads', state: 'nothing' },
    sensitive: [],
    used: {},
    total: used('read 7.3M · wrote 455k · peak 250k, past 200k with no cap', 'large'),
    cost: 'run $6.80',
    overBudget: null,
    collisions: null,
    commands: [],
    awaiting: null,
  };
  const html = renderToStaticMarkup(createElement(DecideSection, { runId: 'r-1', decision }));
  assert.match(
    html,
    /data-fact="cost"[^>]*>[\s\S]*?\$3\.01<\/dd><\/div><div data-fact="read"[\s\S]*?<span data-read="true"[\s\S]*?read 7\.3M</,
    "on the Decide section, beside the total's cost",
  );
});

test("a gate draws no closeout of its own: what it approves is its step's part, above it", () => {
  const html = withClient(createElement(Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan' }));
  assert.ok(html.indexOf('aria-label="Approve plan"') >= 0, html);
  assert.doesNotMatch(html, /What plan handed on|data-handed-on|data-field=|lg:grid-cols-2/);
});

/** A design's closeout at its gate, asking two questions as data in its `open` field. */
const askingCloseout: StepCloseout = {
  ...planCloseout,
  output: { approach: 'Cut it.', open: [cut, where] },
  schema: { approach: { type: 'string' }, open: { type: 'array' } },
  questions: [{ field: 'open', questions: [cut, where] }],
};

test('a gate whose step asks questions draws them before its answer, with the recommended answers offered — and Approve and Send back wait until each is answered', () => {
  const html = withClient(
    createElement(Gate, {
      runId: 'r-1',
      step: 'design',
      approveLine: 'nemia approve r-1 design',
      questions: [cut, where],
    }),
  );
  const asked = html.indexOf('aria-label="What design asks"');
  const approve = html.indexOf('aria-label="Approve design"');
  assert.ok(asked >= 0 && asked < approve, html);
  assert.doesNotMatch(html, /data-questions=/, 'the questions are drawn once, as fields, not read-only beside');
  assert.match(html, /<fieldset data-question="How is the card cut\?"/);
  assert.match(html, /<fieldset data-question="Where do the answers go\?"/);
  assert.match(
    html,
    /<button data-slot="button"[^>]*data-recommend-all="true"[^>]*>(?:(?!<\/button>)[\s\S])*>Choose the recommended answers</,
  );
  assert.match(
    html,
    /<span title="Not answered: How is the card cut\? · Where do the answers go\?" class="inline-flex"><button data-cut-button="press"[^>]*type="submit"[^>]*disabled=""(?:(?!<\/button>)[\s\S])*>Approve</,
  );
  assert.match(
    html,
    /placeholder="A note beside the answers \(optional\): every step after the gate is handed it with the answers, under “Approved”\."/,
  );
  assert.ok(
    kitButtons(html).some(([type, disabled, words]) => type === 'submit' && disabled && words === 'Send back'),
    'nothing to send back yet: no words, no answers',
  );
  const plain = withClient(createElement(Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan' }));
  assert.doesNotMatch(plain, /data-gate-questions|Not answered|data-recommend-all/);
  assert.ok(
    cutPresses(plain).some(([type, disabled, words]) => type === 'submit' && !disabled && words === 'Approve'),
    'Approve, enabled',
  );
});

test("the inspector's gate of a step that asks questions draws them too, its Approve waiting until each is answered — and a step that asks none, no fields", async () => {
  const { Asked } = await import('../src/components/gate/GateBrief.tsx');
  const run = atGate({ closeout: askingCloseout });
  const html = await routedWith(createElement(Asked, { run, step: run.steps[0] }));
  const asked = /<section aria-label="What review asks of you"[^]*$/.exec(html)?.[0] ?? '';
  assert.match(asked, /<section [^>]*aria-label="What review asks"/, html);
  assert.match(asked, /<fieldset data-question="How is the card cut\?"/);
  assert.match(asked, /<fieldset data-question="Where do the answers go\?"/);
  assert.match(
    asked,
    /<button data-slot="button"[^>]*data-recommend-all="true"[^>]*>(?:(?!<\/button>)[\s\S])*>Choose the recommended answers</,
  );
  assert.match(
    asked,
    /<span title="Not answered: How is the card cut\? · Where do the answers go\?" class="inline-flex"><button data-cut-button="press"[^>]*type="submit"[^>]*disabled=""(?:(?!<\/button>)[\s\S])*>Approve</,
  );
  const plain = atGate({ closeout: planCloseout });
  const none = await routedWith(createElement(Asked, { run: plain, step: plain.steps[0] }));
  assert.match(none, /aria-label="What review asks of you"/);
  assert.doesNotMatch(none, /data-question=|Not answered|data-recommend-all/);
  assert.ok(
    cutPresses(none).some(([type, disabled, words]) => type === 'submit' && !disabled && words === 'Approve'),
    'Approve, enabled',
  );
});

test('a raise of a step that signed off blocked asking questions as data draws them to answer by choosing, with the recommended answers and a note beside them, its button waiting for each', () => {
  const html = offersMarkup([
    {
      step: 'palette',
      case: 'raise',
      kind: 'retry',
      message: 'over budget $1.50 of $1',
      by: 'retry',
      above: 1.5,
      said: '$1.50',
      modes: ['continue', 'fresh'],
      own: 'blocked',
      needs: 'Two questions.',
      unfinished: false,
      questions: [cut, where],
    },
  ]);
  assert.match(html, /<fieldset data-question="How is the card cut\?"/);
  assert.match(html, /<fieldset data-question="Where do the answers go\?"/);
  assert.ok(
    kitButtons(html).some(([, , words]) => words === 'Choose the recommended answers'),
    'the recommended answers offered',
  );
  assert.ok(
    kitBoxes(html).some(([name]) => name === 'A note to palette beside the answers'),
    'a note beside the answers',
  );
  assert.doesNotMatch(html, /Your answer to palette/);
  assert.match(
    html,
    /<span title="Not answered: How is the card cut\? · Where do the answers go\?" class="inline-flex"><button data-slot="button"[^>]*type="submit"[^>]*disabled=""(?:(?!<\/button>)[\s\S])*>Raise the budget and answer</,
  );
});

test('a proposal the api says is not there (404) is said so, and one it could not read otherwise is a reading notice', async () => {
  const { ProposalCard } = await import('../src/components/gate/ProposalCard.tsx');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { ReadRefusal } = await import('../src/lib/api/read.ts');
  const failed = (error: Error) => {
    const client = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
    client
      .getQueryCache()
      .build(client, { queryKey: ['proposal', 'acme', 'nemia-ab12c'] })
      .setState({ status: 'error', error, fetchStatus: 'idle' });
    return renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(ProposalCard, { factory: 'acme', name: 'nemia-ab12c' })),
    );
  };
  assert.match(failed(new ReadRefusal('no such proposal', 404)), /data-no-proposal="nemia-ab12c"/);
  const down = failed(new ReadRefusal('the api is down', 502));
  assert.doesNotMatch(down, /data-no-proposal=/, 'only a 404 is a proposal gone');
  assert.match(down, /data-proposal-reading="nemia-ab12c"/);
});

test('a proposal shows its phase, its widens mark, its changes and the buttons its phase takes', async () => {
  const { ProposalCard } = await import('../src/components/gate/ProposalCard.tsx');
  const card = createElement(ProposalCard, { factory: 'acme', name: 'nemia-ab12c' });
  const waiting = await withProposal(proposalIn('waiting', true), card);
  assert.match(waiting, /data-proposal-phase="waiting"/);
  assert.match(waiting, /data-proposal-widens/);
  assert.match(waiting, /data-proposal-change="hires\/build.plan"/);
  assert.match(waiting, /data-proposal-approve=/);
  assert.match(waiting, /data-proposal-decline/);
  const approved = await withProposal(proposalIn('approved', false, 'run-end'), card);
  assert.doesNotMatch(approved, /data-proposal-approve=/, 'an approved proposal is approved no more');
  assert.match(approved, /data-proposal-decline/, 'it is declined until its run ends');
  assert.doesNotMatch(approved, /data-proposal-widens/);
  const applied = await withProposal(proposalIn('applied', true), card);
  assert.doesNotMatch(applied, /data-proposal-approve=|data-proposal-decline=/);
  assert.match(applied, />applied</);
  assert.match(applied, /data-proposal-approver/);
  assert.match(waiting, /data-proposal-widens[^>]*ring-yours/, 'waiting, the mark says it is yours to judge');
  assert.doesNotMatch(applied, /yours/, 'judged, nothing of it says it waits on you');
});
