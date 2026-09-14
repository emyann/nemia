/**
 * The board's components, rendered to markup as a server renders them: what a person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX. The hooks below hand it the app's `.tsx` compiled
 * by `typescript`, the compiler the app is typechecked with, and resolve an import as vite does — no extension, and
 * `@/` for `src/`. Registered before the components are imported, so every import below is dynamic. `npm run e2e`
 * looks at the same components on the pages.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const SRC = path.resolve(import.meta.dirname, '..', 'src');

registerHooks({
  resolve(specifier, context, nextResolve) {
    const named = specifier.startsWith('@/') ? pathToFileURL(path.join(SRC, specifier.slice(2))).href : specifier;
    if ((named.startsWith('.') || named.startsWith('file:')) && !path.extname(named)) {
      for (const extension of ['.ts', '.tsx']) {
        try {
          return nextResolve(named + extension, context);
        } catch {
          // Not this one: the next extension, then the specifier as written, which fails with Node's own message.
        }
      }
    }
    return nextResolve(named, context);
  },
  load(url, context, nextLoad) {
    if (!url.endsWith('.tsx')) return nextLoad(url, context);
    const fileName = fileURLToPath(url);
    const { outputText } = ts.transpileModule(fs.readFileSync(fileName, 'utf8'), {
      fileName,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  },
});

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { StatusChip, StepNote } = await import('../src/components/StatusChip.tsx');
const { StepInspector } = await import('../src/components/StepInspector.tsx');
const { StepNode } = await import('../src/components/StepNode.tsx');
const { cardEdges, stepData, stepEdges } = await import('../src/components/stepGraph.ts');
const { LoopEdge } = await import('../src/components/LoopEdge.tsx');
const { Chips, DecideSection, DiffFileView, GroupBar, LessonChip, TouchedBranch } = await import('../src/components/Decide.tsx');
const { LOOP_SOURCE, LOOP_TARGET } = await import('../src/lib/canvas.ts');
const { ReactFlowProvider } = await import('@xyflow/react');
const { stateMeaning } = await import('../src/lib/status.ts');
type RunDetail = import('../src/lib/api.ts').RunDetail;

const exhaustedNote = 'round 3 of 3, and it asked again — once more: wf round r-1 review';

/** The one element's `title`, unescaped as a browser reads it. */
const titleOf = (html: string): string | undefined =>
  /title="([^"]*)"/.exec(html)?.[1]?.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

test("a chip carries the step's note after what its state means, on hover — and only a note it was given", () => {
  const withNote = renderToStaticMarkup(createElement(StatusChip, { status: 'rounds exhausted', runCancelled: false, note: exhaustedNote }));
  assert.match(withNote, /data-state="exhausted"/);
  assert.equal(titleOf(withNote), `${stateMeaning.exhausted}\n${exhaustedNote}`);

  for (const note of [null, undefined, '']) {
    const without = renderToStaticMarkup(createElement(StatusChip, { status: 'rounds exhausted', runCancelled: false, note }));
    assert.equal(titleOf(without), stateMeaning.exhausted, String(note));
  }
});

test('a note under a chip is the note as `wf ls` prints it, and nothing at all for a step without one', () => {
  const html = renderToStaticMarkup(createElement(StepNote, { note: 'try 2, by retries: 1' }));
  assert.match(html, /^<p data-note="true"[^>]*>try 2, by retries: 1<\/p>$/);
  assert.equal(renderToStaticMarkup(createElement(StepNote, { note: null })), '');
});

const at = '2026-09-13T00:00:00.000Z';

/** A run of one looping step out of rounds, as GET /api/runs/:id gives it, with `note` on its step. */
function runWith(note: string | null): RunDetail {
  return {
    id: 'r-1', brief: 'Go round again', repo: '/code/app', workflowDir: '/code/app/workflow', baseRef: 'abc123', branch: 'main',
    isolate: true, createdAt: at, cancelledAt: null, status: 'failed', moving: false, waitingOnYou: ['review'], warning: null,
    graph: { roots: ['review'], edges: [] },
    steps: [{
      name: 'review', spec: null, body: 'Review it.', told: null, taskId: 't-1', workspace: null, branch: 'wf/r-1/implement',
      status: 'rounds exhausted', note, closeout: null, check: null,
      attempts: { count: 1, latest: { startedAt: at, ended: 'done', endedAt: at, reason: 'harness' } },
      used: { usage: null, used: 'not measured', cost: 'not measured' },
    }],
  };
}

test("the inspector's Details show a step's note under its chip", () => {
  const run = runWith(exhaustedNote);
  const html = renderToStaticMarkup(createElement(StepInspector, { run, step: run.steps[0]!, onClose: () => {} }));
  const chip = html.indexOf('data-state="exhausted"');
  const note = html.indexOf(`<p data-note="true"`);
  assert.ok(chip >= 0, 'the chip is in the Details');
  assert.ok(note > chip, `the note comes after the chip: ${html}`);
  assert.ok(html.slice(note).startsWith(`<p data-note="true"`) && html.includes(`>${exhaustedNote}</p>`), html);

  const bare = runWith(null);
  assert.doesNotMatch(renderToStaticMarkup(createElement(StepInspector, { run: bare, step: bare.steps[0]!, onClose: () => {} })), /data-note/);
});

/** The run of one step, `review`, with the word and note `wf ls` gives it, and who the api says is waited on. */
function runOf(status: string, { note = null, waitingOnYou, cancelledAt = null }: { note?: string | null; waitingOnYou: string[]; cancelledAt?: string | null }): RunDetail {
  const run = runWith(note);
  return { ...run, cancelledAt, waitingOnYou, steps: [{ ...run.steps[0]!, status }] };
}

/**
 * The run's step as a canvas draws it — its node's data read off the run by `stepData`, as the run's page and the Factory
 * both read it — inside the provider its handles read. A server render of the whole canvas draws no node: React Flow puts
 * its nodes in its store in an effect.
 */
function nodeMarkup(run: RunDetail): string {
  const props = {
    id: 'review', type: 'step' as const, data: stepData(run, 0), selected: false, dragging: false, zIndex: 0,
    isConnectable: false, positionAbsoluteX: 0, positionAbsoluteY: 0, selectable: false, deletable: false, draggable: false,
  };
  return renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(StepNode, props)));
}

const gateDrawn = (html: string) => />human gate</.test(html) || />waiting on you</.test(html) || /border-amber-500/.test(html);

test('a loop out of rounds is drawn as a human gate on the canvas, as a blocked step is — and on a cancelled run, not', () => {
  for (const status of ['rounds exhausted', 'succeeded · BLOCKED']) {
    const gate = nodeMarkup(runOf(status, { waitingOnYou: ['review'] }));
    assert.match(gate, />human gate</, status);
    assert.match(gate, />waiting on you</, status);
    assert.match(gate, /border-amber-500/, status);

    // As the api gives a cancelled run, nobody waited on; and with the step still named, which the cancellation refuses all the same.
    for (const waitingOnYou of [[], ['review']]) {
      const cancelled = nodeMarkup(runOf(status, { waitingOnYou, cancelledAt: at }));
      assert.equal(gateDrawn(cancelled), false, `${status}, on a cancelled run, waiting on [${waitingOnYou}]: ${cancelled}`);
      assert.match(cancelled, />step 01</, `${status}, on a cancelled run`);
    }
  }
  // Waiting on you too, but work to try again rather than a decision: not a gate.
  for (const status of ['unsigned', 'failed ✗ check (exit 1)']) assert.equal(gateDrawn(nodeMarkup(runOf(status, { waitingOnYou: ['review'] }))), false, status);
});

test('a step a person has sent round or asked to retry is no gate from the moment they ask: the canvas draws what the api says', () => {
  // As the api gives the two while the ask waits for a tick: the step keeps its word, with a note, and nobody is waited on.
  const asked: Array<[status: string, note: string]> = [
    ['rounds exhausted', 'round 4 asked (wf round) — the next tick files implement'],
    ['succeeded · BLOCKED', 'try 2 asked (--nudge) — the next tick files it'],
  ];
  for (const [status, note] of asked) {
    const pending = nodeMarkup(runOf(status, { note, waitingOnYou: [] }));
    assert.equal(gateDrawn(pending), false, `${status}, an ask pending: ${pending}`);
    assert.match(pending, />step 01</, `${status}, an ask pending`);
    // The same step with nothing asked yet is the gate: the one fact that differs is the api's.
    assert.equal(gateDrawn(nodeMarkup(runOf(status, { note, waitingOnYou: ['review'] }))), true, `${status}, nothing asked`);
  }
});

/**
 * A loop as the api gives it: review loops back to implement, both signed off, with the notes `wf ls` prints. Neither step
 * has a spec — as when the api could not read one — so what is drawn is the api's graph, and nothing a step's spec says.
 */
function loopRun(notes: { implement: string | null; review: string | null }): RunDetail {
  const base = runWith(null);
  const step = { ...base.steps[0]!, status: 'unverified · done', spec: null };
  return {
    ...base, status: 'running', waitingOnYou: [],
    graph: {
      roots: ['implement'],
      edges: [{ from: 'implement', to: 'review', kind: 'after' }, { from: 'review', to: 'implement', kind: 'loop', rounds: 3 }],
    },
    steps: [{ ...step, name: 'implement', note: notes.implement }, { ...step, name: 'review', note: notes.review }],
  };
}

test("the card's edge reaches only the root, and the loop's edge goes back to its target, whatever the steps' specs lack", () => {
  const run = loopRun({ implement: 'round 3 of 3', review: 'round 3 of 3, and it asked again — once more: wf round r-1 review' });

  assert.deepEqual(cardEdges(run, 'r-1', 'r-1/').map(({ id, source, target }) => ({ id, source, target })), [
    { id: 'r-1/->implement', source: 'r-1', target: 'r-1/implement' },
  ]);

  const edges = stepEdges(run, 'r-1/');
  assert.deepEqual(edges.map(({ id, source, target, type, sourceHandle, targetHandle, label }) => ({ id, source, target, type, sourceHandle, targetHandle, label })), [
    // An `after` edge takes each node's handle on its side: no type, no handle named.
    { id: 'r-1/implement->review', source: 'r-1/implement', target: 'r-1/review', type: undefined, sourceHandle: undefined, targetHandle: undefined, label: undefined },
    { id: 'r-1/loop:review->implement', source: 'r-1/review', target: 'r-1/implement', type: 'loop', sourceHandle: LOOP_SOURCE, targetHandle: LOOP_TARGET, label: 'round 3 of 3' },
  ]);
  // Out of rounds, nothing is due: the edge back is still.
  assert.equal(edges[1]!.className, undefined);

  const due = stepEdges(loopRun({ implement: null, review: 'round 2 of 3 due — review asked again, and the next tick files implement' }));
  assert.deepEqual([due[1]!.label, due[1]!.className], ['round 2 of 3', 'pulsing']);
  const first = stepEdges(loopRun({ implement: null, review: null }));
  assert.deepEqual([first[1]!.type, first[1]!.label, first[1]!.className], ['loop', undefined, undefined]);

  // A run with no loop draws no edge back, and its card still reaches every root it has.
  const chain = { ...run, graph: { roots: ['implement', 'review'], edges: [] } };
  assert.deepEqual(stepEdges(chain), []);
  assert.deepEqual(cardEdges(chain, 'r-1', 'r-1/').map((e) => e.target), ['r-1/implement', 'r-1/review']);
});

test("a loop's edge is drawn from under its looping step, dashed, into its target with the arrow and the round beside it", () => {
  const props = {
    id: 'loop:review->implement', source: 'review', target: 'implement', sourceX: 524, sourceY: 110, targetX: 112, targetY: 110,
    sourcePosition: 'bottom', targetPosition: 'bottom', markerEnd: "url('#arrow')", label: 'round 3 of 3', selectable: false, deletable: false,
  } as unknown as Parameters<typeof LoopEdge>[0];
  const html = renderToStaticMarkup(createElement('svg', null, createElement(LoopEdge, props)));
  const d = /<path [^>]*\bd="([^"]+)"[^>]*class="react-flow__edge-path"/.exec(html)?.[1];
  assert.ok(d?.startsWith('M 524,110 C 524,'), html);
  assert.ok(d?.endsWith(' 112,110'), `it ends at implement, where the arrow is: ${d}`);
  assert.match(html, /marker-end="url\(&#x27;#arrow&#x27;\)"/);
  assert.match(html, /stroke-dasharray:5 4/);
  assert.match(html, />round 3 of 3<\/text>/);

  // On each node, the handles under it come after the ones on its sides, which an edge naming no handle takes.
  const node = nodeMarkup(runOf('unverified · done', { waitingOnYou: [] }));
  const handles = [...node.matchAll(/<div (?:data-handleid="([^"]*)" )?data-handlepos="(\w+)"[^>]*class="[^"]*\b(source|target)\b/g)].map((m) => [m[3], m[2], m[1] ?? null]);
  assert.deepEqual(handles, [['target', 'left', null], ['source', 'right', null], ['source', 'bottom', LOOP_SOURCE], ['target', 'bottom', LOOP_TARGET]], node);
});

test("the inspector's Details show `loop` and `rounds` beside `after` on a looping step, and not on another", () => {
  const run = runWith(null);
  const spec = { harness: 'codex', model: null, after: ['implement'], resume: null, permissionMode: null, deadlineSeconds: null, maxAttempts: null, loop: 'implement', rounds: 3 };
  const looping = { ...run.steps[0]!, spec };
  const html = renderToStaticMarkup(createElement(StepInspector, { run, step: looping, onClose: () => {} }));
  const labels = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g)].map((m) => [m[1], m[2]!.replace(/<[^>]+>/g, '')]);
  const at = (label: string) => labels.findIndex(([l]) => l === label);
  assert.deepEqual(labels.slice(at('after'), at('after') + 4), [['after', 'implement'], ['loop', 'implement'], ['rounds', '3'], ['resume', '—']], html);

  const plain = { ...looping, spec: { ...spec, loop: null, rounds: null } };
  const without = renderToStaticMarkup(createElement(StepInspector, { run, step: plain, onClose: () => {} }));
  assert.doesNotMatch(without, />loop<\/dt>|>rounds<\/dt>/);
  assert.match(without, />after<\/dt>/);
});

// ─── the decision ────────────────────────────────────────────────────────────

/** Each bar's added and removed widths, in the order the bars are drawn. */
const barsOf = (html: string): Array<[number, number]> =>
  [...html.matchAll(/<span data-added="true"[^>]*style="width:([\d.]+)%"[^>]*><\/span><span data-removed="true"[^>]*style="width:([\d.]+)%"/g)].map((m) => [Number(m[1]), Number(m[2])]);

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
  // (root) +2 −0, assets binary only, packages/x +453 −1 — which is the most, and fills the track.
  assert.deepEqual(barsOf(html), [[0.44, 0], [0, 0], [99.78, 0.22]]);
  assert.match(html, /data-group="packages\/x"[\s\S]*?>2 files<[\s\S]*?>\+453<\/span> <span[^>]*>−1<\/span>/);
  assert.match(html, /data-group="assets"[\s\S]*?>binary<\/span>/);
  assert.match(html, /data-group="\(root\)"[\s\S]*?>−0<\/span><span[^>]*> · 1 binary<\/span>/);
});

test('the agent-facing chips are amber and the check-affecting ones outlined red, each titled with why — and neither is drawn when there are none', () => {
  const both = renderToStaticMarkup(createElement(Chips, { agentFacing: ['CLAUDE.md'], checkAffecting: ['package.json', 'packages/x/test/add.test.ts'] }));
  const chips = [...both.matchAll(/<span data-chip="([^"]+)" title="([^"]+)" class="([^"]+)">([^<]+)<\/span>/g)].map((m) => ({ kind: m[1], title: m[2], cls: m[3], file: m[4] }));
  assert.deepEqual(chips.map(({ kind, title, file }) => [kind, title, file]), [
    ['agent-facing', 'the next agent reads this', 'CLAUDE.md'],
    ['check-affecting', 'could make its check pass', 'package.json'],
    ['check-affecting', 'could make its check pass', 'packages/x/test/add.test.ts'],
  ]);
  assert.match(chips[0]!.cls, /\bbg-amber-100\b/);
  for (const chip of chips.slice(1)) {
    assert.match(chip.cls, /\bring-red-400\b/);
    assert.doesNotMatch(chip.cls, /\bbg-/, 'an outline, not a fill');
  }

  assert.equal(renderToStaticMarkup(createElement(Chips, { agentFacing: [], checkAffecting: [] })), '');
  const onlyCheck = renderToStaticMarkup(createElement(Chips, { agentFacing: [], checkAffecting: ['package.json'] }));
  assert.doesNotMatch(onlyCheck, /agent-facing/);
  assert.match(onlyCheck, /data-chip="check-affecting"/);
  // On a branch with neither, the branch's rows are drawn and no chip is.
  const plain = renderToStaticMarkup(createElement(TouchedBranch, { touched: { branch: 'wf/r-1/implement', radius: radiusWith() } }));
  assert.doesNotMatch(plain, /data-chip|agent-facing|check-affecting/);
  // A branch git could not read says so, and draws no row.
  const unread = renderToStaticMarkup(createElement(TouchedBranch, { touched: { branch: 'wf/gone', radius: { error: 'git could not diff abc...wf/gone' } } }));
  assert.match(unread, />not read: git could not diff abc\.\.\.wf\/gone</);
  assert.doesNotMatch(unread, /data-bar|data-group/);
});

test('the lesson chip is green with what was written, amber when nothing was, and dashed when a branch could not be read', () => {
  const chip = (lesson: { said: string; state: 'written' | 'nothing' | 'unknown' }) => {
    const m = /<span data-lesson="(\w+)" title="[^"]*" class="([^"]+)">([^<]+)<\/span>/.exec(renderToStaticMarkup(createElement(LessonChip, { lesson })));
    assert.ok(m, lesson.state);
    return { state: m[1], cls: m[2]!, text: m[3] };
  };
  const written = chip({ said: 'CLAUDE.md +2 −0', state: 'written' });
  assert.deepEqual([written.state, written.text], ['written', 'lesson · CLAUDE.md +2 −0']);
  assert.match(written.cls, /\bbg-emerald-100\b/);
  assert.doesNotMatch(written.cls, /amber/);

  const nothing = chip({ said: 'nothing written where the next agent reads', state: 'nothing' });
  assert.deepEqual([nothing.state, nothing.text], ['nothing', 'nothing written where the next agent reads']);
  assert.match(nothing.cls, /\bbg-amber-100\b/);
  assert.doesNotMatch(nothing.cls, /emerald/);

  const unknown = chip({ said: 'not known — wf/gone could not be read', state: 'unknown' });
  assert.equal(unknown.text, 'lesson not known — wf/gone could not be read');
  assert.match(unknown.cls, /\bborder-dashed\b/);
  assert.doesNotMatch(unknown.cls, /emerald|amber/);
});

test('a diff is folded under its file, coloured by line, and a capped one says how many more lines `wf decide` prints', () => {
  const lines = ['diff --git a/package.json b/package.json', '--- a/package.json', '+++ b/package.json', '@@ -1 +1 @@', '-{"a":1}', '+{"a":2}', ' }'];
  const capped = renderToStaticMarkup(createElement(DiffFileView, { file: { path: 'package.json', lines, cut: 26 }, counts: { added: 1, removed: 1 } }));
  assert.match(capped, /^<details data-diff="package\.json"/, 'collapsed: a details element with no open attribute');
  assert.doesNotMatch(capped, /<details[^>]*\bopen\b/);
  assert.match(capped, /<summary[^>]*>.*package\.json.*\+1<\/span> <span[^>]*>−1<\/span>/);
  assert.deepEqual([...capped.matchAll(/data-line="(\w+)"/g)].map((m) => m[1]), ['meta', 'meta', 'meta', 'hunk', 'removed', 'added', 'context']);
  assert.match(capped, /<p data-cut="26"[^>]*>26 more lines — <code>wf decide<\/code> prints all<\/p>/);

  const whole = renderToStaticMarkup(createElement(DiffFileView, { file: { path: 'package.json', lines, cut: 0 } }));
  assert.doesNotMatch(whole, /data-cut|more line/);
  assert.match(renderToStaticMarkup(createElement(DiffFileView, { file: { path: 'package.json', lines, cut: 1 } })), />1 more line — <code>/);
});

test('the Decide section copies its commands and runs none: a button per command, and each only copies', () => {
  const commands = [
    { label: 'once more', command: 'wf retry r-1 implement', said: 'implement: succeeded · BLOCKED. Continue its session, told what happened:  wf retry r-1 implement  (--fresh, or --model <m>, for a new session)' },
    { label: 'ship it', command: 'git -C /code/app merge --no-ff wf/r-1/implement', said: null },
    { label: 'drop it', command: 'git -C /code/app branch -D wf/r-1/implement', said: null },
  ] as const;
  const decision = {
    touched: [{ branch: 'wf/r-1/implement', radius: radiusWith({ agentFacing: ['CLAUDE.md'] }) }],
    lesson: { said: 'CLAUDE.md +2 −0', state: 'written' as const },
    sensitive: [{ branch: 'wf/r-1/implement', files: [{ path: 'packages/x/test/add.test.ts', lines: ['@@ -1 +1,451 @@'], cut: 3 }], error: null }],
    used: {},
    total: { usage: { toolCalls: 34 }, used: 'turns not measured · 34 tool calls · tokens in not measured · tokens out not measured', cost: 'not measured' },
    commands: [...commands],
  };
  const html = renderToStaticMarkup(createElement(DecideSection, { runId: 'r-1', decision }));
  assert.match(html, /^<section aria-label="Decide"/);
  const buttons = [...html.matchAll(/<button [^>]*>/g)].map((m) => m[0]);
  assert.equal(buttons.length, commands.length, html);
  for (const [i, button] of buttons.entries()) {
    assert.match(button, /\bdata-copy="true"/);
    assert.ok(button.includes(`aria-label="Copy: ${commands[i]!.command}"`), button);
  }
  for (const { command } of commands) assert.ok(html.includes(`>${command}</code>`), command);
  // The once-more line's words, without the command it is followed by on the line below.
  assert.match(html, />implement: succeeded · BLOCKED\. Continue its session, told what happened {2}\(--fresh, or --model &lt;m&gt;, for a new session\)</);
  // The run's total, in `wf decide`'s words: never a 0 for what nobody measured.
  assert.match(html, /<dt[^>]*>used<\/dt><dd[^>]*>turns not measured · 34 tool calls/);
  assert.match(html, /<dt[^>]*>cost<\/dt><dd[^>]*>not measured<\/dd>/);
  // The capped file, and the file's lines off the branch's radius in its summary.
  assert.match(html, /data-diff="packages\/x\/test\/add\.test\.ts"[\s\S]*?\+450<\/span> <span[^>]*>−0<\/span>[\s\S]*?3 more lines/);
});

test("the inspector's Details say what a step used and what it cost beside its attempts — `not measured`, never 0", () => {
  const run = runWith(null);
  const rows = (step: RunDetail['steps'][number]) =>
    [...renderToStaticMarkup(createElement(StepInspector, { run, step, onClose: () => {} })).matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g)]
      .map((m) => [m[1], m[2]!.replace(/<[^>]+>/g, '')]);
  const labels = rows(run.steps[0]!);
  const at = (label: string) => labels.findIndex(([l]) => l === label);
  assert.deepEqual(labels.slice(at('latest took'), at('latest took') + 3).map(([l, v]) => [l, l === 'latest took' ? '…' : v]), [['latest took', '…'], ['used', 'not measured'], ['cost', 'not measured']]);

  const measured = { ...run.steps[0]!, used: { usage: { turns: 12, costUsd: 0.004 }, used: '12 turns · tool calls not measured · tokens in not measured · tokens out not measured', cost: '$0.004' } };
  const said = Object.fromEntries(rows(measured));
  assert.deepEqual([said.used, said.cost], ['12 turns · tool calls not measured · tokens in not measured · tokens out not measured', '$0.004']);
  // A step not filed consumed nothing: a dash, not a count.
  const unfiled = Object.fromEntries(rows({ ...run.steps[0]!, taskId: null, used: null }));
  assert.deepEqual([unfiled.used, unfiled.cost], ['—', '—']);
});

