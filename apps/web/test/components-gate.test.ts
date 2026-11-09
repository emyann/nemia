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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coded } from './run-fixtures.ts';
import './tsx.ts';
import {
  at,
  atGate,
  closeoutSaying,
  commandsOf,
  cut,
  endingRun,
  LOGIN,
  needing,
  offersMarkup,
  planCloseout,
  proposalIn,
  ranOnce,
  routedWith,
  textsOf,
  threeTries,
  toShip,
  unescaped,
  UNMEASURED,
  WAIT,
  where,
  withClient,
  withProposal,
} from './markup-fixtures.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { Chips, DecideSection, DiffFileView, GroupBar, LessonChip, TouchedBranch } = await import('../src/components/gate/Decide.tsx');
const { OFFERS } = await import('../src/lib/words.ts');
const { instantWhole } = await import('../src/lib/instant.ts');
type RunView = import('../src/lib/runView.ts').RunView;
type Decidable = import('../src/lib/api.ts').Decidable;
const { TryCloseouts } = await import('../src/components/step/Closeout.tsx');
const facts = await import('../src/components/step/Facts.tsx');
type StepCloseout = import('../src/lib/api.ts').StepCloseout;
const { RecommendButton } = await import('../src/components/gate/Questions.tsx');
type Question = import('../src/lib/api.ts').Question;
const Answering = await import('../src/components/gate/Decide.tsx');
const { NeedsBanner, ToDecideBanner } = await import('../src/components/gate/Needs.tsx');
const { container, hairline, ringed } = await import('../src/lib/meaning.ts');
const { decisionStamp } = await import('../src/lib/decide.ts');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const Gates = await import('../src/components/gate/Gate.tsx');
const { Gate } = await import('../src/components/gate/Gate.tsx');

/** Each bar's added and removed widths, in the order the bars are drawn. */
const barsOf = (html: string): Array<[number, number]> =>
  [
    ...html.matchAll(
      /<span data-added="true"[^>]*style="width:([\d.]+)%"[^>]*><\/span><span data-removed="true"[^>]*style="width:([\d.]+)%"/g,
    ),
  ].map((m) => [Number(m[1]), Number(m[2])]);

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

test('the agent-facing chips are a hairline at rest and the check-affecting ones ringed in yours, each titled with why — and neither is drawn when there are none', () => {
  const both = renderToStaticMarkup(
    createElement(Chips, { agentFacing: ['CLAUDE.md'], checkAffecting: ['package.json', 'packages/x/test/add.test.ts'] }),
  );
  const chips = [...both.matchAll(/<span data-chip="([^"]+)" title="([^"]+)" class="([^"]+)">([^<]+)<\/span>/g)].map((m) => ({
    kind: m[1],
    title: m[2],
    cls: m[3],
    file: m[4],
  }));
  assert.deepEqual(
    chips.map(({ kind, title, file }) => [kind, title, file]),
    [
      ['agent-facing', 'the next agent reads this', 'CLAUDE.md'],
      ['check-affecting', 'could make its check pass', 'package.json'],
      ['check-affecting', 'could make its check pass', 'packages/x/test/add.test.ts'],
    ],
  );
  assert.ok(holds(chips[0].cls, hairline), 'a note: at rest');
  for (const chip of chips.slice(1)) {
    assert.ok(holds(chip.cls, ringed.yours), 'what a person weighs: yours, drawn light');
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
    const m = /<span data-lesson="(\w+)" title="[^"]*" class="([^"]+)">([^<]+)<\/span>/.exec(
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
  assert.match(capped, /<p data-cut="26"[^>]*>26 more lines — the command line&#x27;s decide prints them all<\/p>/);

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
    { label: 'land it', command: 'git -C /code/app merge --no-ff wf/r-1/implement', said: null, step: null },
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
const holds = (cls: string, form: string): boolean => form.split(' ').every((c) => cls.split(' ').includes(c));

/** Whether the class list `cls` carries any class of the drawn form `form`. */
const touches = (cls: string, form: string): boolean => form.split(' ').some((c) => cls.split(' ').includes(c));

/** Whether `cls` is drawn as a wait on a person: the yours container whole, and nothing of an amount's or a failure's. */
const drawnYours = (cls: string): boolean =>
  holds(cls, container.yours) && !touches(cls, container.money) && !touches(cls, container.failure);

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
    [...html.matchAll(/<li (?:data-offer="([^"]+)" data-kind="([^"]+)"|data-asked="true") data-step="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map(
      (m) => [m[3], { offer: m[1] ? [m[1], m[2]] : 'asked', html: m[4] }],
    ),
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
  const buttons = (name: string) =>
    [...rows.get(name)!.html.matchAll(/<button type="(\w+)"( disabled="")?[^>]*>([^<]*)<\/button>/g)].map((m) => [
      m[1],
      Boolean(m[2]),
      m[3],
    ]);
  const radios = (name: string) =>
    [...rows.get(name)!.html.matchAll(/<input type="radio" name="[^"]*"( checked="")? value="(\w+)"/g)].map((m) => [m[2], Boolean(m[1])]);
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
  assert.match(rows.get('implement')!.html, /<label for="[^"]+" class="sr-only">Your answer to implement<\/label>/);

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
    [...html.matchAll(/<li data-offer="denied" data-kind="retry" data-step="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[1], m[2]]),
  );
  const said = (name: string) => unescaped(textsOf(/<p data-said="true"[^>]*>([\s\S]*?)<\/p>/.exec(rows.get(name)!)![1]).join(' '));
  assert.equal(said('notes'), `notes ${OFFERS.denied.said('denied: Write(/tmp/w/notes.md)')}`, 'the calls the api named');
  assert.equal(said('bare'), `bare ${OFFERS.denied.said(null)}`, 'and none where it named none');
  assert.notEqual(OFFERS.denied.said('x'), OFFERS.denied.said(null), 'the calls are in the sentence');
  const radios = [...rows.get('notes')!.matchAll(/<input type="radio" name="[^"]*"( checked="")? value="(\w+)"/g)].map((m) => [
    m[2],
    Boolean(m[1]),
  ]);
  assert.deepEqual(
    radios,
    [
      ['fresh', true],
      ['continue', false],
    ],
    'a new session first, and no recheck: no check of it ran',
  );
  assert.match(rows.get('notes')!, /<form aria-label="Try notes again"/);
  assert.match(rows.get('notes')!, /<button type="submit"[^>]*>Try again<\/button>/);
});

test('a step asking questions as data is answered by choosing: radios where it takes one, checkboxes where several, the recommended marked, nothing chosen, and a button that waits for every answer', () => {
  const html = offersMarkup([
    { step: 'design', case: 'answer', kind: 'retry', needs: 'Two questions.', questions: [cut, where] },
    { step: 'spec', case: 'answer', kind: 'retry', needs: 'One question.', questions: [where] },
  ]);
  const rows = new Map(
    [...html.matchAll(/<li data-offer="answer" data-kind="retry" data-questions="true" data-step="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map(
      (m) => [m[1], m[2]],
    ),
  );
  const design = rows.get('design')!;
  assert.ok(design, html);
  assert.deepEqual(
    [...design.matchAll(/<fieldset data-question="([^"]+)"/g)].map((m) => unescaped(m[1])),
    [cut.title, where.title],
  );
  const choices = [
    ...design.matchAll(/<input type="(radio|checkbox)" class="[^"]*" name="[^"]*-choice"( checked="")? value="([^"]+)"/g),
  ].map((m) => [m[3], m[1], Boolean(m[2])]);
  assert.deepEqual(
    choices,
    [
      ['a', 'radio', false],
      ['b', 'radio', false],
      ['retry', 'checkbox', false],
      ['gate', 'checkbox', false],
    ],
    'nothing is chosen until the person chooses',
  );
  assert.equal([...design.matchAll(/data-recommended="true"/g)].length, 1, 'the one recommended option is marked');
  assert.match(
    design,
    /<strong class="font-medium">a<\/strong> <span[^>]*>— The shape and the board first\.<\/span><span data-recommended="true"[^>]*>recommended<\/span>/,
  );
  assert.match(design, /<strong>big<\/strong>/, 'a body is its markdown');
  const buttons = (row: string) =>
    [...row.matchAll(/<button type="(\w+)"( disabled="")?[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], Boolean(m[2]), m[3]]);
  assert.deepEqual(buttons(design), [
    ['submit', true, 'Answer and continue'],
    ['button', false, 'Choose the recommended answers'],
  ]);
  assert.match(design, /<button type="submit" disabled="" title="Not answered: How is the card cut\? · Where do the answers go\?"/);
  assert.equal([...design.matchAll(/<textarea [^>]*data-own="true"/g)].length, 2, "a line for each question's own words");
  assert.deepEqual(
    buttons(rows.get('spec')!),
    [['submit', true, 'Answer and continue']],
    'no recommended answers to choose where none is recommended',
  );
  assert.doesNotMatch(html, /--recheck/, 'a recheck files no session to read answers');
});

test('a question that takes several marks each label it recommends as a list, and offers to choose them', () => {
  const many: Question = { ...where, recommended: ['retry', 'gate'] };
  const html = renderToStaticMarkup(createElement(RecommendButton, { questions: [many], draft: {}, onDraft: () => {} }));
  assert.match(html, /data-recommend-all/);
  const said = closeoutSaying('A design.', { output: { open: [many] }, questions: [{ field: 'open', questions: [many] }] });
  const tries = [{ ...threeTries[2], attempts: ranOnce, closeout: said }];
  const read = renderToStaticMarkup(createElement(TryCloseouts, { tries, selected: tries[0], none: '-' }));
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
    commands: [{ label: 'land it', command: 'git -C /code/app merge --no-ff wf/r-1/implement', said: null, step: null }],
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
  const row = /<li data-offer="enough" data-kind="approve" data-step="review"[\s\S]*?<\/li>/.exec(answer)![0];
  assert.match(
    row,
    /<code>nemia approve r-1 review --message &quot;&lt;why&gt;&quot;<\/code>/,
    "the step's approve line, with the reason a loop's requires",
  );
  assert.ok(row.includes(`<form aria-label="${OFFERS.enough.form('review')}"`), row);
  const label = new RegExp(`<label for="([^"]+)"[^>]*>${OFFERS.enough.field('review').replace("'", '&#x27;')}</label>`).exec(row);
  assert.ok(label, row);
  assert.match(row, new RegExp(`<textarea id="${label[1]}"`));
  assert.match(
    row,
    new RegExp(`<button type="submit" disabled=""[^>]*>${OFFERS.enough.button}</button>`),
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

/** The banner, rendered inside the query client its Continue asks with. */
const bannerMarkup = (run: RunView) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(NeedsBanner, { run })));

test("the banner continues a session the harness blocked: Continue, and a box for anything to tell it, where the commands to copy were — and once asked, the step's note in `wf ls`'s words", () => {
  const base = needing('needs-human', { waitingFor: WAIT, lastLine: LOGIN }, { waitingOnYou: [] });
  const asks = {
    ...base.steps[0],
    name: 'implement',
    taskId: 't-2',
    ...coded('succeeded · BLOCKED'),
    needs: 'Which database?',
    waitingFor: null,
    lastLine: null,
  };
  const run: RunView = { ...base, waitingOnYou: ['implement'], waitingOnYouWords: ['implement'], steps: [asks, base.steps[0]] };
  const html = bannerMarkup(run);

  assert.match(html, /^<section aria-label="Waiting on you"/);
  const texts = textsOf(html);
  assert.ok(textContentOf(html).includes('implement asks: Which database?'), html);
  assert.ok(
    texts.includes(`is blocked by the harness: ${WAIT.words} · ${LOGIN}`),
    `after the step's name, which is a tag of its own\n${html}`,
  );
  const items = new Map([...html.matchAll(/<li data-need="(\w+)" data-step="(\w+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[2], m[3]]));
  assert.doesNotMatch(items.get('implement')!, /<form|<button|<textarea/, 'a question is answered from the Decide section, not the banner');
  const review = items.get('review')!;
  assert.match(
    review,
    /^<p [^>]*>[\s\S]*?<\/p><p data-advice="true" class="break-words text-body-small">answer it in Claude Code: claude agents, session ae\/t-1\/1<\/p><div data-continue="true"[^>]*><form aria-label="Continue review"/,
    'under the wait, where a person answers it, which this board does not; then a form that asks the tick for another try, and nothing else',
  );
  assert.deepEqual(
    [...review.matchAll(/<button type="(\w+)"( disabled="")?[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], Boolean(m[2]), m[3]]),
    [['submit', false, 'Continue']],
    'one button, enabled with nothing written: the box is optional',
  );
  assert.match(review, /<label for="[^"]+" class="sr-only">What to tell review, if anything<\/label>/);
  assert.match(review, /<textarea [^>]*placeholder="Anything to tell it \(optional\): the next try is told it\."/);
  assert.ok(textsOf(review).includes('nemia retry r-1 review'), `the step's retry line, as the api answers it\n${review}`);
  assert.doesNotMatch(
    html,
    /data-copy|data-unblock|ae stop|cannot continue/,
    'no commands to copy, and no sentence that the board cannot continue it',
  );

  const note = 'try 2 asked (--continue) — stopping its blocked session, then the tick files it';
  const held = { ...base.steps[0], note, asked: { try: 2, mode: 'continue' as const, model: null, message: null, stopFirst: true } };
  const asked = bannerMarkup({ ...run, steps: [asks, held] });
  assert.ok(
    asked.includes(`<p data-note="true" class="font-mono text-body-small">${note}</p></li>`),
    `asked: what the tick does with it, in \`wf ls\`'s words\n${asked}`,
  );
  assert.doesNotMatch(/<li data-need="harness"[\s\S]*?<\/li>/.exec(asked)![0], /<form|<button|<textarea/, 'and nothing to press');
  assert.doesNotMatch(
    /<li data-need="harness"[\s\S]*?<\/li>/.exec(asked)![0],
    /data-advice/,
    'no advice to answer the prompt in that session: the next tick stops it, so the line would send a person to a session about to go',
  );
  assert.ok(
    textsOf(asked).includes(`is blocked by the harness: ${WAIT.words} · ${LOGIN}`),
    `the wait is still said, in the need's own line\n${asked}`,
  );

  const mute = bannerMarkup({ ...run, steps: [asks, { ...base.steps[0], waitingFor: null }] });
  assert.ok(
    textsOf(mute).includes(`is blocked by the harness: ${LOGIN}`),
    `a harness that says nothing about what for: the need alone\n${mute}`,
  );
  assert.doesNotMatch(mute, /data-advice/, 'with no empty line under it');
});

/** What a piece of markup reads as, its tags gone: `textContent`, as the e2e's `hasText` reads it. */
const textContentOf = (html: string): string => unescaped(html.replace(/<[^>]+>/g, ''));

test("an agent's question is drawn as its markdown after `asks:`, in the banner and in the inspector; the banner's hover keeps it plain", async () => {
  const needs = 'Which **database**?\n\n- one\n- two';
  const run = needing('succeeded · BLOCKED', { needs }, { waitingOnYou: ['review'] });
  const item = /<li data-need="asks"[^]*?<\/li>/.exec(bannerMarkup(run))![0];
  assert.match(item, /<strong>review<\/strong> asks: <div data-markdown="true"[^>]*><p[^>]*>Which <strong>database<\/strong>\?<\/p>\s*<ul/);
  assert.match(item, /class="[^"]*max-h-40 overflow-y-auto[^"]*"/, 'a long question scrolls in a box of its own');
  assert.match(item, new RegExp(`title="asks: Which \\*\\*database\\*\\*\\?\\n\\n- one`));
  assert.ok(textContentOf(item).startsWith('review asks: Which database?'), item);

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
  assert.match(asked, /<a data-answer-link="true"[^>]*href="\/runs\/r-1#decide"/);

  const called = { ...needing('succeeded', {}, { waitingOnYou: [], cancelledAt: at }), toDecide };
  assert.equal(await routedWith(createElement(Asked, { run: called, step: called.steps[0] })), '');
});

test('REFUSED: the banner offers no Continue for a session still at work, which the harness did not block, nor on a run called off', () => {
  assert.equal(bannerMarkup(needing('running (working)', {}, { waitingOnYou: [] })), '', 'nothing needed: no banner');
  const held = needing('needs-human', { waitingFor: WAIT, lastLine: LOGIN }, { waitingOnYou: [] });
  assert.match(bannerMarkup(held), /<form aria-label="Continue review"/);
  assert.equal(bannerMarkup({ ...held, cancelledAt: at }), '', 'called off: nobody waits for the session');
});

test("the banner says who the run waits on as `wf ls` does — `approve review`, linked to the step's section, where Approve is — beside a step it names by its name", () => {
  const theme = { ...atGate().steps[0], name: 'theme', ...coded('failed ✗ check (exit 1)'), approve: null, gate: null };
  const run = atGate({}, { waitingOnYou: ['review', 'theme'], waitingOnYouWords: ['approve review', 'theme'] });
  const both = bannerMarkup({ ...run, steps: [run.steps[0], theme] });
  const line = /<p>(Waiting on you:[\s\S]*?)<\/p>/.exec(both)![1];
  assert.equal(
    textsOf(line).join(''),
    `Waiting on you:approve review, theme— signed off blocked, unsigned, refused by its check, denied a call, waiting at its gate, out of rounds, or past its budget —nemia decide r-1`,
  );
  assert.match(
    line,
    /<strong><a href="#step-review" data-approve="review" class="underline underline-offset-2">approve review<\/a>, theme<\/strong>/,
  );
  assert.doesNotMatch(
    both,
    /<li |<form|<button/,
    "the need is the banner's line: no question to list under it, and nothing to press in the banner",
  );
});

test("in the frame's bar, the banners name a step by a button that opens the step's bar, where a hash would point nowhere", () => {
  const theme = { ...atGate().steps[0], name: 'theme', ...coded('failed ✗ check (exit 1)'), approve: null, gate: null };
  const run = atGate({}, { waitingOnYou: ['review', 'theme'], waitingOnYouWords: ['approve review', 'theme'] });
  const onStep = () => {};
  const needs = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(NeedsBanner, { run: { ...run, steps: [run.steps[0], theme] }, onStep }),
    ),
  );
  assert.doesNotMatch(needs, /href="#step-/);
  assert.match(
    needs,
    /<strong><button type="button" data-approve="review" class="underline underline-offset-2">approve review<\/button>, theme<\/strong>/,
  );
  const decide = withClient(createElement(ToDecideBanner, { run: endingRun(), onStep }));
  assert.doesNotMatch(decide, /href="#step-/);
  assert.match(decide, /<button type="button" data-approve="ship" class="underline underline-offset-2">/);
});

test('the gate: Approve with a box for the words, which may stay empty, and Send back — the answer box — with an objection it waits for, continuing the session or in a new one', () => {
  const html = withClient(createElement(Gates.Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan' }));
  assert.match(html, /^<section aria-label="The gate of plan" data-gate="awaiting"/);
  assert.match(
    html,
    /as <code>nemia approve r-1 plan<\/code> approves it: the next tick files what waits on it/,
    'beside Approve, the line it answers',
  );
  const forms = new Map([...html.matchAll(/<form aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual([...forms.keys()], ['Approve plan', 'Send plan back']);
  const buttons = (form: string) =>
    [...forms.get(form)!.matchAll(/<button type="(\w+)"( disabled="")?[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], Boolean(m[2]), m[3]]);
  assert.deepEqual(buttons('Approve plan'), [['submit', false, 'Approve']], 'Approve is enabled with no words: an approval needs none');
  assert.deepEqual(
    buttons('Send plan back'),
    [['submit', true, 'Send back']],
    'Send back waits for an objection: the package refuses one with none',
  );
  assert.match(
    forms.get('Approve plan')!,
    /<label for="[^"]+" class="sr-only">Words to approve plan with, if any<\/label><textarea [^>]*placeholder="Your words \(optional\): every step after the gate is handed them, under “Approved”\."/,
  );
  assert.ok(textsOf(forms.get('Approve plan')!).includes('nemia approve r-1 plan'), 'the line the api answers beside the button');
  assert.match(forms.get('Send plan back')!, /<label for="[^"]+" class="sr-only">What to change, sent back to plan<\/label>/);
  const radios = [...forms.get('Send plan back')!.matchAll(/<input type="radio" name="[^"]*"( checked="")? value="(\w+)"/g)].map((m) => [
    m[2],
    Boolean(m[1]),
  ]);
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
  assert.match(html, /^<section aria-label="The approval of plan" data-approval="2"/);
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
  const ending = renderToStaticMarkup(
    createElement(Gates.Approved, { step: 'ship', approval: { try: 1, at, message: words }, ends: true }),
  );
  assert.ok(
    textsOf(ending).join(' ').includes('your approval filed it, and the step is handed these words as the terms it acts on'),
    `an ending's approval files the step itself, and the words are the terms it acts on\n${ending}`,
  );
  const bare = renderToStaticMarkup(createElement(Gates.Approved, { step: 'ship', approval: { try: 1, at, message: null }, ends: true }));
  assert.ok(textsOf(bare).join(' ').includes('your approval filed it, and the step is handed it as the terms it acts on'), bare);
  assert.doesNotMatch(ending, /every step after the gate/);
  assert.deepEqual(
    [
      Gates.gateWord({ awaiting: true, approval: null }),
      Gates.gateWord({ awaiting: false, approval: { try: 1, at, message: null } }),
      Gates.gateWord({ awaiting: false, approval: null }),
    ],
    ['awaiting approval', 'approved, try 1', 'holds once it has signed off'],
  );
});

/** The run's decision as the api gives it, cut to what the panel reads: where the result branch stands, and how much it changed. */
const decidedAs = (standings: unknown[]) => ({
  standings,
  touched: [],
  lesson: { said: '', state: 'nothing' },
  sensitive: [],
  used: {},
  total: {},
  cost: null,
  overBudget: null,
  commands: [],
});

/**
 * A component rendered with the run's decision already read, as the Decide section on the same page has read it for this state of the run.
 */
function withDecision(run: RunView, decision: unknown, element: ReturnType<typeof createElement>): string {
  const client = new QueryClient();
  client.setQueryData(['runs', run.id, 'decision', decisionStamp(run)], decision);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, element));
}

test("the to-decide banner says what `wf ls` says after `→ to decide:`, and links an ending step's gate to its section — and nothing where there is nothing to decide", () => {
  const run = endingRun();
  const html = withClient(createElement(ToDecideBanner, { run }));
  assert.match(html, /^<section aria-label="To decide" data-to-decide="approve"/);
  assert.deepEqual(textsOf(html), ['To decide:', toShip.said]);
  assert.match(html, /<a href="#step-ship" data-approve="ship" class="underline underline-offset-2">/);

  const branch = {
    kind: 'result' as const,
    branches: ['wf/r-1/implement'],
    said: 'wf/r-1/implement is ahead of main, and nothing has merged it — wf decide r-1',
    command: 'wf decide r-1',
  };
  const ahead = withClient(createElement(ToDecideBanner, { run: { ...run, toDecide: branch } }));
  assert.match(ahead, /data-to-decide="result"/);
  assert.deepEqual(textsOf(ahead), ['To decide:', branch.said], 'a branch nobody merged: the words, and the command in them');
  assert.doesNotMatch(ahead, /<a /, 'it names no step to link to');

  assert.equal(withClient(createElement(ToDecideBanner, { run: { ...run, toDecide: null } })), '', 'nothing to decide: no banner');
  assert.equal(
    withClient(createElement(ToDecideBanner, { run: { ...run, toDecide: undefined as unknown as null } })),
    '',
    'and none from an api that carries none',
  );
});

test("the ending step's own gate is not asked for twice: the to-decide banner says it, and the banner below has nothing left to say", () => {
  const run = endingRun();
  assert.equal(bannerMarkup(run), '', 'the whole of what it waits on is the decision');
  const theme = { ...run.steps[0], name: 'theme', ...coded('failed ✗ check (exit 1)'), closeout: null, approve: null, gate: null };
  const both = bannerMarkup({
    ...run,
    steps: [...run.steps, theme],
    waitingOnYou: ['ship', 'theme'],
    waitingOnYouWords: ['approve ship', 'theme'],
  });
  assert.match(both, /^<section aria-label="Waiting on you"/, 'another step waiting on you is still said, beside the decision');
  const line = /<p>(Waiting on you:[\s\S]*?)<\/p>/.exec(both)![1];
  assert.equal(
    textsOf(line).join(''),
    'Waiting on you:theme— signed off blocked, unsigned, refused by its check, denied a call, waiting at its gate, out of rounds, or past its budget —nemia decide r-1',
    'and only it',
  );
});

test('the step that ends the run in the checkout is known by its `workspace`, and its gate says where it holds — not that it holds once the step has signed off', async () => {
  const [implement, ship] = endingRun().steps;
  assert.equal(Gates.endsTheRun(ship), true, "it works in the repository's own checkout");
  assert.equal(Gates.endsTheRun(implement), false, 'the work does not');
  assert.equal(Gates.endsTheRun({ spec: null }), false, 'nor a step nothing defines any more');
  assert.equal(Gates.endsTheRun({ spec: { ...ship.spec!, workspace: null } }), false, 'nor one in a worktree of the run');

  const held = { awaiting: false, approval: null };
  assert.equal(
    Gates.gateWord(held, true),
    'holds once the work has handed on, and your approval files it',
    'its gate holds before the step is filed, so the word for a gate not yet held is about the work, never about this step signing off',
  );

  assert.equal(Gates.gateWord(held), 'holds once it has signed off', "§6's gate, which holds what its step handed on");
  assert.deepEqual(
    [
      Gates.gateWord({ awaiting: true, approval: null }, true),
      Gates.gateWord({ awaiting: false, approval: { try: 1, at, message: null } }, true),
    ],
    ['awaiting approval', 'approved, try 1'],
    "at it, and approved, both gates read the same: the word is the run's state, not the step's kind",
  );
});

test("what an ending step would act on, beside its gate: the branch's standing and counts, and each work step's closeout with its files", () => {
  const run = endingRun();
  const standing = {
    branch: 'wf/r-1/implement',
    where: 'ahead',
    commits: 3,
    said: 'wf/r-1/implement is ahead of main by 3 commits',
    stat: '4 files: +456 −2',
  };
  const html = withDecision(run, decidedAs([standing]), createElement(Gates.ActsOn, { run, step: run.steps[1] }));
  assert.match(html, /^<section aria-label="What ship would act on"/);
  assert.match(html, /data-standing="ahead"/);
  const texts = textsOf(html);
  assert.ok(texts.includes(standing.said), html);
  assert.ok(texts.includes(standing.stat), 'how much it changed, as `wf decide` prints it');
  assert.ok(texts.includes('implement'), `the work it waits on, off the graph\n${html}`);
  assert.match(html, /<h4[^>]*>What changed<\/h4>/, 'its closeout rendered as the markdown it is');
  assert.ok(texts.includes('the cap on runs in flight'), html);
  assert.match(html, /aria-label="Artifacts of implement"/, 'and the files it named');
  assert.ok(texts.includes('RESPONSE.md'), html);

  const none = withDecision(run, decidedAs([]), createElement(Gates.ActsOn, { run, step: run.steps[1] }));
  assert.ok(
    textsOf(none).includes('No result branch of its own: the work is on the base branch.'),
    `a run with no result branch of its own: said, not left blank\n${none}`,
  );
});

test("a result branch whose place was not heard reads unread beside an ending's gate, in the package's words — never on the base, nor ahead", () => {
  const run = endingRun();
  const why = 'the place was not heard: timed out';
  const standing = {
    branch: 'wf/r-1/implement',
    where: 'unread',
    why,
    said: `wf/r-1/implement: where it stands is not read (${why})`,
    stat: null,
  };
  const html = withDecision(run, decidedAs([standing]), createElement(Gates.ActsOn, { run, step: run.steps[1] }));
  assert.match(html, /data-standing="unread"/);
  assert.ok(textsOf(html).includes(standing.said), html);
  assert.doesNotMatch(html, /data-standing="(on|ahead|gone)"|data-stat/, 'no standing of its own, and no counts');
});

test('the gate of an ending step says approving is what files it, and its send-back goes to the work — never to the step at the gate, which `wf retry` refuses', () => {
  const html = withClient(
    createElement(Gates.Gate, { runId: 'r-1', step: 'ship', approveLine: 'nemia approve r-1 ship', back: ['implement'], acts: true }),
  );
  const texts = textsOf(html).join(' ');
  assert.match(
    texts,
    /ship waits at its gate: nothing of it runs until you approve it — your approval is what files it — or you send implement back\./,
  );
  assert.ok(texts.includes('nemia approve r-1 ship'), html);
  assert.match(texts, /the next tick files it(?! what)/);
  const forms = [...html.matchAll(/<form aria-label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(forms, ['Approve ship', 'Send implement back'], 'the send-back names the step it goes to');
  assert.match(html, /What to change, sent back to implement<\/label>/);
  const wide = withClient(
    createElement(Gates.Gate, {
      runId: 'r-1',
      step: 'ship',
      approveLine: 'nemia approve r-1 ship',
      back: ['implement', 'docs'],
      acts: true,
    }),
  );
  assert.deepEqual(
    [...wide.matchAll(/<form aria-label="([^"]+)"/g)].map((m) => m[1]),
    ['Approve ship', 'Send the work back'],
    'several work steps: one send-back form',
  );
  const to = [...wide.matchAll(/<input type="radio" name="[^"]*-to"( checked="")? value="(\w+)"/g)].map((m) => [m[2], Boolean(m[1])]);
  assert.deepEqual(
    to,
    [
      ['implement', true],
      ['docs', false],
    ],
    'the objection picks one, since one is enough to hold the gate again',
  );
  const held = withClient(createElement(Gates.Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan' }));
  assert.match(
    textsOf(held).join(' '),
    /plan waits at its gate: nothing after it is filed until you approve what it handed on, or send it back\./,
    'a gate that is no ending holds what its step handed on',
  );
  assert.doesNotMatch(held, /name="[^"]*-to"/, "and its send-back is the step's own");
});

test("the second press at an ending's gate reads the ending's warning, on its base branch, then the press that approves it", () => {
  const onMain = textsOf(renderToStaticMarkup(createElement(Gates.EndingConfirm, { step: 'ship', onto: 'main' }))).join(' ');
  assert.match(
    onMain,
    /runs ship in the repository's own checkout on main, and it cannot be taken back\. Press Run ship now to approve it\.$/,
  );
  const unknown = textsOf(renderToStaticMarkup(createElement(Gates.EndingConfirm, { step: 'ship', onto: null }))).join(' ');
  assert.match(unknown, /own checkout, and it cannot be taken back\. Press Run ship now/, 'no branch is named where the run knows none');
});

test("the gate's own words at an ending: the approval's box says the step is handed them, and the word taken names the step it was about", () => {
  const html = withClient(
    createElement(Gates.Gate, { runId: 'r-1', step: 'ship', approveLine: 'nemia approve r-1 ship', back: ['review'], acts: true }),
  );
  assert.match(
    html,
    /placeholder="Your words \(optional\): the step is handed them as the terms it acts on, under “Approved”\."/,
    "the words go to the step itself, as its brief's `## Approved` hands them: nothing follows an ending to be handed anything",
  );
  const held = withClient(createElement(Gates.Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan' }));
  assert.match(held, /placeholder="Your words \(optional\): every step after the gate is handed them, under “Approved”\."/);

  assert.deepEqual(
    Gates.takenOf({ approved: 1 }, 'ship', true),
    { named: 'ship', said: 'approved try 1 — the next tick files it' },
    "the panel shown the moment a word is taken: an approval is the gated step's, and files it where nothing follows it",
  );
  assert.deepEqual(Gates.takenOf({ approved: 2 }, 'plan', false), {
    named: 'plan',
    said: 'approved try 2 — the next tick files what waits on it',
  });
  assert.deepEqual(
    Gates.takenOf({ asked: { try: 2, stopFirst: false }, step: 'review' }, 'ship', true),
    { named: 'review', said: 'try 2 asked — the next tick files it' },
    "a send-back is about the step its try was asked for: the work at an ending's gate, never the step at the gate",
  );
  assert.deepEqual(Gates.takenOf({ asked: { try: 3, stopFirst: false }, step: 'plan' }, 'plan', false), {
    named: 'plan',
    said: 'try 3 asked — the next tick files it',
  });
});

test('REFUSED: an ending that waits on nothing is offered no send-back, since a try of the unfiled step is refused — the approval is the only word there is', () => {
  const alone = withClient(
    createElement(Gates.Gate, { runId: 'r-1', step: 'ship', approveLine: 'nemia approve r-1 ship', back: [], acts: true }),
  );
  const forms = [...alone.matchAll(/<form aria-label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(forms, ['Approve ship'], "the approval alone, as `wf ls`'s gate note prints it for such a step");
  assert.doesNotMatch(alone, /Send back|What to change/);
  assert.ok(
    textsOf(alone).join(' ').includes('ship waits at its gate: nothing of it runs until you approve it — your approval is what files it.'),
    alone,
  );
  const withWork = withClient(
    createElement(Gates.Gate, { runId: 'r-1', step: 'ship', approveLine: 'nemia approve r-1 ship', back: ['review'], acts: true }),
  );
  assert.deepEqual(
    [...withWork.matchAll(/<form aria-label="([^"]+)"/g)].map((m) => m[1]),
    ['Approve ship', 'Send review back'],
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
    /<p data-over-budget="true" class="[^"]*">OVER BUDGET, waiting on you: tokens \(\$4\.25 of \$3\) {2}— the run files nothing more for it on its own; nothing after it ran<\/p>/,
  );
  assert.ok(drawnYours(/<p data-over-budget="true" class="([^"]*)"/.exec(html)![1]), 'a step held on its budget waits on a person: yours');
  assert.match(html, /<dt[^>]*>every try<\/dt><dd[^>]*>run \$6\.35 measured · 2 sessions not measured<\/dd>/);
  const none = renderToStaticMarkup(
    createElement(DecideSection, { runId: 'r-1', decision: { ...decision, overBudget: null, cost: null } }),
  );
  assert.doesNotMatch(none, /data-over-budget/, 'no step held on a budget: no line');
  assert.match(none, /<dt[^>]*>every try<\/dt><dd[^>]*>—<\/dd>/, 'nothing ended yet: a dash, not $0');
});

test('the Decide section of an ending whose landing its check refused shows its trial merges: the runs in flight, each it collides with, and the semantic conflict, linked to the step — and none where the decision read no trial', async () => {
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
      semantic: { step: 'ship', check: 't-check', sha: 'b'.repeat(40), said: "ship's landing check refused the merged tree" },
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
  assert.match(
    merges,
    /<dd data-fact="semantic" data-state="bad"[^>]*><a data-fact-link="ship"[^>]*href="\/runs\/r-1#step-ship"[^>]*>ship&#x27;s landing check refused the merged tree<\/a><\/dd>/,
  );
  const none = await routedWith(createElement(DecideSection, { runId: 'r-1', decision: { ...decision, collisions: null } }));
  assert.doesNotMatch(none, /Trial merges|data-fact="(others|collides|semantic)"/, 'no trial read: nothing said of one');
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
    /<span data-peak="cap" class="[^"]*text-money[^"]*" title="It reached the step&#x27;s context: cap: Claude Code compacted[^"]*">peak 174k, compacted twice at its 200k cap<\/span>/,
  );
  const unpeaked = markup(createElement(Read, { said: 'read 900k · wrote 20k · compacted at its 100k cap', peak: 'cap', rebuilt: 0 }));
  assert.match(
    unpeaked,
    /<span data-peak="cap"[^>]*>compacted at its 100k cap<\/span>/,
    'no peak measured: the compaction is where it stands, and not dropped',
  );
  assert.match(
    capped,
    /<span data-rebuilt="1" class="block text-body-small [^"]*" title="[^"]*the cache was rebuilt\.">a resumed session wrote its context to the cache again instead of reading it<\/span>/,
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

test("the run page's gate draws what is being approved beside Approve and Send back; the inspector's, whose Output tab has it, does not", () => {
  const html = withClient(
    createElement(Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan', closeout: planCloseout }),
  );
  const handed = html.indexOf('aria-label="What plan handed on"');
  assert.ok(handed >= 0, html);
  assert.ok(handed < html.indexOf('aria-label="Approve plan"'), 'what it handed on comes before the answer: read, then decided');
  assert.match(html, /data-field="approach"/);
  assert.match(html, /lg:grid-cols-2/, 'beside the answer where the page is wide');
  const bare = withClient(createElement(Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan', framed: false }));
  assert.doesNotMatch(bare, /handed on, which you approve|data-handed-on|lg:grid-cols-2/);
});

/** A design's closeout at its gate, asking two questions as data in its `open` field. */
const askingCloseout: StepCloseout = {
  ...planCloseout,
  output: { approach: 'Cut it.', open: [cut, where] },
  schema: { approach: { type: 'string' }, open: { type: 'array' } },
  questions: [{ field: 'open', questions: [cut, where] }],
};

test('a gate whose step asks questions draws them in the answer column, after what it handed on, with the recommended answers offered — and Approve and Send back wait until each is answered', () => {
  const html = withClient(
    createElement(Gate, {
      runId: 'r-1',
      step: 'design',
      approveLine: 'nemia approve r-1 design',
      closeout: askingCloseout,
      questions: [cut, where],
    }),
  );
  const handed = html.indexOf('aria-label="What design handed on"');
  const asked = html.indexOf('aria-label="What design asks"');
  const approve = html.indexOf('aria-label="Approve design"');
  assert.ok(handed >= 0 && handed < asked && asked < approve, html);
  assert.doesNotMatch(html.slice(handed, asked), /data-questions=/, 'the questions are drawn once, as fields, not read-only beside');
  assert.match(html, /<fieldset data-question="How is the card cut\?"/);
  assert.match(html, /<fieldset data-question="Where do the answers go\?"/);
  assert.match(html, /<button type="button" data-recommend-all[^>]*>Choose the recommended answers<\/button>/);
  assert.match(
    html,
    /<button type="submit" disabled="" title="Not answered: How is the card cut\? · Where do the answers go\?"[^>]*>Approve<\/button>/,
  );
  assert.match(
    html,
    /placeholder="A note beside the answers \(optional\): every step after the gate is handed it with the answers, under “Approved”\."/,
  );
  assert.match(html, /<button type="submit" disabled=""[^>]*>Send back<\/button>/, 'nothing to send back yet: no words, no answers');
  const plain = withClient(
    createElement(Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan', closeout: planCloseout }),
  );
  assert.doesNotMatch(plain, /data-gate-questions|Not answered|data-recommend-all/);
  assert.match(plain, /<button type="submit"[^>]*>Approve<\/button>/);
  assert.doesNotMatch(plain, /<button type="submit" disabled=""[^>]*>Approve<\/button>/);
});

test("the inspector's gate of a step that asks questions draws them too, its Approve waiting until each is answered — and a step that asks none, no fields", async () => {
  const { Asked } = await import('../src/components/gate/GateBrief.tsx');
  const run = atGate({ closeout: askingCloseout });
  const html = await routedWith(createElement(Asked, { run, step: run.steps[0] }));
  const asked = /<section aria-label="What review asks of you"[^]*$/.exec(html)?.[0] ?? '';
  assert.match(asked, /<section [^>]*aria-label="What review asks"/, html);
  assert.match(asked, /<fieldset data-question="How is the card cut\?"/);
  assert.match(asked, /<fieldset data-question="Where do the answers go\?"/);
  assert.match(asked, /<button type="button" data-recommend-all[^>]*>Choose the recommended answers<\/button>/);
  assert.match(
    asked,
    /<button type="submit" disabled="" title="Not answered: How is the card cut\? · Where do the answers go\?"[^>]*>Approve<\/button>/,
  );
  const plain = atGate({ closeout: planCloseout });
  const none = await routedWith(createElement(Asked, { run: plain, step: plain.steps[0] }));
  assert.match(none, /aria-label="What review asks of you"/);
  assert.doesNotMatch(none, /data-question=|Not answered|data-recommend-all/);
  assert.match(none, /<button type="submit"[^>]*>Approve<\/button>/);
  assert.doesNotMatch(none, /<button type="submit" disabled=""[^>]*>Approve<\/button>/);
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
  assert.match(html, /data-recommend-all[^>]*>Choose the recommended answers</);
  assert.match(html, /class="sr-only">A note to palette beside the answers<\/label>/);
  assert.doesNotMatch(html, /Your answer to palette/);
  assert.match(
    html,
    /<button type="submit" disabled="" title="Not answered: How is the card cut\? · Where do the answers go\?"[^>]*>Raise the budget and answer<\/button>/,
  );
});

test("REFUSED: a banner that says a person is waited on is drawn in an amount's colour or a failure's — Waiting on you and To decide both read yours", () => {
  const waiting = bannerMarkup(needing('needs-human', { waitingFor: WAIT, lastLine: LOGIN }, { waitingOnYou: [] }));
  const decide = withClient(createElement(ToDecideBanner, { run: endingRun() }));
  for (const [label, html] of [
    ['Waiting on you', waiting],
    ['To decide', decide],
  ]) {
    const m = new RegExp(`<section aria-label="${label}"[^>]*class="([^"]*)"`).exec(html);
    assert.ok(m, `${label} is drawn`);
    assert.equal(drawnYours(m[1]), true, `${label}: ${m[1]}`);
  }
  assert.equal(drawnYours(`rounded ${container.money}`), false, 'the amber of an amount is no wait');
  assert.equal(drawnYours(`rounded ${container.yours} ${container.failure}`), false);
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
