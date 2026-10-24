/**
 * The board's reads and writes decode the api's answers where they enter (`get` and `send`, src/lib/api/read.ts): an answer that does not
 * decode is refused with the route, the first wrong key, what was there and the fix; a key the board does not know is dropped; a refusal of
 * the api's stays in its words. No read or write in the board's source passes no schema (`unschemedReads`), and no schema leaves through
 * the barrel.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as api from '../src/lib/api.ts';
import { ReadRefusal, UnreadAnswer } from '../src/lib/api/read.ts';
import { openRunsQuery, runsQuery, type OpenRuns, type RunSummary } from '../src/lib/api/runs.ts';

const DIR = path.resolve(import.meta.dirname, '../src/lib/api');

/** Every read answering `body` as JSON, with `status`, for the length of the test. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200) {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.after(() => {
    globalThis.fetch = before;
  });
}

/** A row of `GET /api/runs` as the api answers it: every key the board reads, each shape the unions have. */
const row = (extra: object = {}): RunSummary => ({
  id: 'r-1',
  repo: '/work/repo',
  factory: 'nemia',
  place: 'repository',
  work: null,
  brief: 'Decode the reads',
  workflowDir: '/work/workflows/build',
  workflowPage: null,
  try: null,
  createdAt: '2026-09-30T05:00:00.000Z',
  startedAt: null,
  cancelledAt: null,
  pruned: { said: 'removed 2 worktrees' },
  after: ['r-0'],
  waiting: {
    runs: [{ run: 'r-0', missing: false, cancelledAt: null, gone: [] }],
    word: 'waiting on r-0',
    advice: 'wait',
    onYou: false,
  },
  context: [],
  holdUntil: [],
  holding: {
    at: '2026-09-30T05:00:00.000Z',
    runs: [{ run: 'r-0', missing: false, cancelledAt: null, gone: [], landed: false }],
    word: 'held until r-0 lands',
    advice: 'wf hold r-1 --off',
    onYou: true,
  },
  status: 'running',
  phase: 'pending',
  reason: 'Waiting',
  on: 'run',
  via: null,
  moving: true,
  cost: { usd: 4.2, measured: 1, unmeasured: 0, said: '$4.20' },
  atWork: { ms: 1_920_000, since: null, endedAt: '2026-09-30T05:40:00.000Z' },
  tokens: {
    total: 3_040_000,
    input: 3_000_000,
    output: 40_000,
    cacheRead: 2_700_000,
    cacheWrite: 230_000,
    uncached: 70_000,
    measured: 2,
    unmeasured: 0,
    said: '3.04M tokens',
    split: '2.7M read from the cache · 230k written to it · 70k uncached · 40k out',
  },
  steps: [
    {
      name: 'implement',
      taskId: 't-1',
      branch: 'wf/r-1/implement',
      phase: 'waiting',
      reason: 'AwaitingAnswer',
      on: null,
      via: 'closeout',
      message: 'succeeded · BLOCKED',
      verdict: null,
      status: 'succeeded · BLOCKED',
      note: 'try 1',
      roundDue: false,
      agent: null,
      since: null,
      needs: 'a decision',
      blockedByHarness: false,
      waitingFor: { words: 'a permission', advice: 'answer it' },
      approve: null,
      denied: { words: 'denied: Skill(look)', calls: ['Skill(look)'] },
      sessionUnread: "`ae/t-1/1`'s output cannot be read",
    },
  ],
  graph: {
    roots: ['implement'],
    edges: [
      { from: 'implement', to: 'review', kind: 'after' },
      { from: 'review', to: 'implement', kind: 'loop', rounds: 3 },
    ],
  },
  waitingOnYou: ['implement'],
  onYou: ['implement'],
  toDecide: {
    kind: 'approve',
    step: 'ship',
    says: null,
    filed: false,
    back: ['implement'],
    onto: 'main',
    said: 'approve ship',
    command: 'wf approve r-1 ship',
  },
  unreadable: null,
  ...extra,
});

const readRuns = runsQuery.queryFn as unknown as () => Promise<RunSummary[]>;

/** Whether `err` is an `UnreadAnswer` whose message names the route, `at`, what was found there and the fix. */
const unread = (at: string, found: string) => (err: unknown) => {
  assert.ok(err instanceof UnreadAnswer, String(err));
  assert.ok(err.message.startsWith('GET /api/runs answered what this board does not read'), err.message);
  assert.ok(err.message.includes(`at ${at}, `), err.message);
  assert.ok(err.message.includes(found), err.message);
  assert.ok(
    err.message.endsWith('restart the api (npm run dev) and rebuild the board (npm run build), then reload the page.'),
    err.message,
  );
  assert.equal(err.route, 'GET /api/runs');
  return true;
};

/** The light answer read for `factory`, or for every factory, with no context of a query's. */
const readOpen = (factory?: string) => (openRunsQuery(factory).queryFn as unknown as () => Promise<OpenRuns>)();

test("the light answer decodes what the api gives, a waiting run with its clock and its steps' costs, asks for one factory by its name encoded, and keeps no key it does not read", async (t) => {
  const asked: string[] = [];
  const before = globalThis.fetch;
  const clock = { wallMs: 5, sessionsMs: 1, checksMs: 1, personMs: 1, slotMs: 1, restMs: 1 };
  const stepCosts = [
    { step: 'plan', cost: { usd: 1.5, measured: 1, unmeasured: 0, said: '$1.50' } },
    { step: 'land', cost: null },
  ];
  const listed = { wallMs: 5, finishedAt: null, clock };
  const answer = {
    asOf: '2026-10-12T12:00:00.000Z',
    counts: { waiting: 1, inFlight: 1, finished: 7 },
    waiting: [{ ...row(), ...listed, clock, stepCosts, waitingSince: '2026-10-12T11:57:00.000Z' }],
    inFlight: [{ ...row({ id: 'r-2' }), ...listed }],
  };
  globalThis.fetch = async (input) => {
    asked.push(String(input));
    return new Response(
      JSON.stringify({
        ...answer,
        unknown: 1,
        waiting: answer.waiting.map((run) => ({ ...run, page: 1 })),
        inFlight: answer.inFlight.map((run) => ({ ...run, stepCosts, page: 1 })),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  assert.deepEqual(await readOpen(), answer);
  assert.deepEqual(await readOpen('a b'), answer);
  assert.deepEqual(asked, ['/api/runs-open', '/api/runs-open?ofFactory=a%20b']);
  assert.deepEqual(openRunsQuery().queryKey, ['runs-open']);
  assert.deepEqual(openRunsQuery('a b').queryKey, ['runs-open', 'a b']);
});

test('the Runs list decodes an answer the api gives, each union in its every shape', async (t) => {
  const result = row({ toDecide: { kind: 'result', branches: ['wf/r-1/implement'], said: 'merge', command: 'git merge' } });
  answering(t, [row(), result, row({ place: 'folder', waiting: null, holding: null, cost: null, toDecide: null, pruned: null })]);
  const runs = await readRuns();
  assert.equal(runs.length, 3);
  assert.deepEqual(runs[0], row());
  assert.deepEqual(runs[1], result);
});

test('REFUSED: a row whose status is no word the board knows', async (t) => {
  answering(t, [row(), row({ status: 'nonsense' })]);
  await assert.rejects(
    readRuns(),
    unread('[1].status', '"nonsense", where the board reads "running" | "succeeded" | "failed" | "cancelled"'),
  );
});

test('REFUSED: a row whose steps are not an array', async (t) => {
  answering(t, [row({ steps: { implement: 'blocked' } })]);
  await assert.rejects(readRuns(), unread('[0].steps', '{"implement":"blocked"}, where the board reads array'));
});

test('REFUSED: a step without a key the board reads, and a value quoted to 60 characters', async (t) => {
  const [step] = row().steps;
  const { blockedByHarness: _, ...without } = step;
  answering(t, [row({ steps: [without] })]);
  await assert.rejects(readRuns(), unread('[0].steps[0].blockedByHarness', 'is missing'));

  const { via: __, ...unqualified } = step;
  answering(t, [row({ steps: [unqualified] })]);
  await assert.rejects(readRuns(), unread('[0].steps[0].via', 'is missing'));
  const { on: ___, ...runUnqualified } = row();
  answering(t, [runUnqualified]);
  await assert.rejects(readRuns(), unread('[0].on', 'is missing'));
  answering(t, [row({ on: 'slot' })]);
  await assert.rejects(readRuns(), unread('[0].on', '"slot", where'));

  answering(t, [row({ brief: 7 })]);
  await assert.rejects(readRuns(), unread('[0].brief', '7, where'));
  answering(t, [row({ graph: 'x'.repeat(100) })]);
  await assert.rejects(readRuns(), unread('[0].graph', `"${'x'.repeat(58)}…, where`));
});

test('REFUSED: an answer that is no list at all is refused at the answer itself', async (t) => {
  answering(t, { runs: [] });
  await assert.rejects(readRuns(), unread('the answer', '{"runs":[]}, where the board reads array'));
});

test('a key the board does not know is dropped, not refused', async (t) => {
  answering(t, [row({ colour: 'blue', steps: [{ ...row().steps[0], mood: 'calm' }] })]);
  const [run] = await readRuns();
  assert.equal(Object.hasOwn(run, 'colour'), false);
  assert.equal(Object.hasOwn(run.steps[0], 'mood'), false);
  assert.deepEqual(run, row());
});

test("a read the api refused still rejects in the api's words and status, not as an answer unread", async (t) => {
  answering(t, { error: 'no run x' }, 404);
  const err: unknown = await readRuns().then(
    () => assert.fail('a 404 was read'),
    (e: unknown) => e,
  );
  assert.ok(err instanceof ReadRefusal && !(err instanceof UnreadAnswer), String(err));
  assert.equal(err.status, 404);
  assert.equal(err.message, 'no run x');
});

/**
 * What `unschemedReads` found: a line per read or write that passes no schema, how many reads through `get` or a wrapper of it pass one
 * (`schemed`), and how many writes through `send` or a wrapper of it do (`sent`).
 */
type ReadScan = { faults: string[]; schemed: number; sent: number };

/** Whether `module` names read.ts, as a file under src/ imports it: `./read.ts`, `./api/read`, `@/lib/api/read`. */
const isReadModule = (module: string) => /(^|\/)read(\.ts)?$/.test(module);

/** Whether `call` is a `fetch`, called bare or off an object (`globalThis.fetch`, `window.fetch`). */
const isFetch = (call: ts.CallExpression) =>
  (ts.isIdentifier(call.expression) && call.expression.text === 'fetch') ||
  (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'fetch');

/** Whether a `fetch` is a write: its options an object literal whose `method` is a variable, or a word other than GET. */
const isWrite = (call: ts.CallExpression) => {
  const options = call.arguments[1];
  if (!options || !ts.isObjectLiteralExpression(options)) return false;
  return options.properties.some(
    (p) =>
      (ts.isShorthandPropertyAssignment(p) && p.name.text === 'method') ||
      (ts.isPropertyAssignment(p) &&
        ts.isIdentifier(p.name) &&
        p.name.text === 'method' &&
        !(ts.isStringLiteralLike(p.initializer) && p.initializer.text.toUpperCase() === 'GET')),
  );
};

/** `argument` without the parentheses, casts and assertions around it (`(x)`, `x as T`, `x!`, `x satisfies T`), as a scan reads it. */
const bare = (argument: ts.Expression | undefined): ts.Expression | undefined =>
  argument &&
  (ts.isParenthesizedExpression(argument) ||
  ts.isAsExpression(argument) ||
  ts.isTypeAssertionExpression(argument) ||
  ts.isNonNullExpression(argument) ||
  ts.isSatisfiesExpression(argument)
    ? bare(argument.expression)
    : argument);

/** Whether `argument` decodes nothing: `Schema.Unknown` or `Schema.Any`, which take any answer as read, however cast. */
const decodesNothing = (argument: ts.Expression | undefined) => {
  const schema = bare(argument);
  return !schema || (ts.isPropertyAccessExpression(schema) && ['Unknown', 'Any'].includes(schema.name.text));
};

/** The names `seam` of read.ts (`get` or `send`) is bound to in `source`: the seam's own, or what `import { get as … }` calls it. */
function readNames(source: ts.SourceFile, seam: 'get' | 'send'): Set<string> {
  const names = new Set<string>();
  for (const s of source.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || !isReadModule(s.moduleSpecifier.text)) continue;
    const bindings = s.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const e of bindings.elements) if ((e.propertyName ?? e.name).text === seam) names.add(e.name.text);
  }
  return names;
}

/**
 * A function a read or write is called through, by the name `source` calls it: read.ts's `get` or `send`, or a wrapper that hands its
 * schema on to one (`wraps`). `word` names it in a fault, `kind` says whether it reads or writes, and `at` is the index of its schema
 * argument.
 */
type Seam = { word: string; kind: 'get' | 'send'; at: number; wraps: boolean };

/** Whether `name` binds `text`: as the name itself (`plain`), or anywhere inside an object or array pattern. */
const binds = (name: ts.BindingName, text: string): 'plain' | 'destructured' | undefined => {
  if (ts.isIdentifier(name)) return name.text === text ? 'plain' : undefined;
  const inner = name.elements.some((e) => !ts.isOmittedExpression(e) && binds(e.name, text) !== undefined);
  return inner ? 'destructured' : undefined;
};

/**
 * The function around `call` whose parameters bind `text`, the nearest first: the function, the index of the parameter, and whether that
 * parameter is the name itself or destructured. Undefined when no function around the call takes `text` as a parameter.
 */
function bindingParameter(call: ts.CallExpression, text: string) {
  for (let node: ts.Node = call.parent; !ts.isSourceFile(node); node = node.parent) {
    if (!ts.isFunctionLike(node)) continue;
    for (const [index, p] of node.parameters.entries()) {
      const how = binds(p.name, text);
      if (how) return { fn: node, index, how };
    }
  }
  return undefined;
}

/** The name `fn` has of its own in its file, and its declaration: a function declaration's, or the variable an arrow or function is. */
function ownName(fn: ts.SignatureDeclaration): { name: string; declaration: ts.Declaration } | undefined {
  if (ts.isFunctionDeclaration(fn)) return fn.name && { name: fn.name.text, declaration: fn };
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return undefined;
  const at = fn.parent;
  return ts.isVariableDeclaration(at) && at.initializer === fn && ts.isIdentifier(at.name)
    ? { name: at.name.text, declaration: at }
    : undefined;
}

/** Whether `name`, declared at `declaration`, leaves its file: an `export` on it, an `export { … }` or an `export default` of it. */
function exported({ name, declaration }: { name: string; declaration: ts.Declaration }, source: ts.SourceFile): boolean {
  if (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) return true;
  return source.statements.some(
    (s) =>
      (ts.isExportAssignment(s) && ts.isIdentifier(s.expression) && s.expression.text === name) ||
      (ts.isExportDeclaration(s) &&
        !s.moduleSpecifier &&
        s.exportClause !== undefined &&
        ts.isNamedExports(s.exportClause) &&
        s.exportClause.elements.some((e) => (e.propertyName ?? e.name).text === name)),
  );
}

/**
 * Where a call of `seam` takes its schema from, when that schema is a parameter of a function around it: the wrapper the scan follows,
 * by its name and the index of that parameter, or `'unfollowed'` for a function it cannot follow (no name of its own, exported, or the
 * parameter destructured). Undefined when the schema is no parameter.
 */
function handedOn(call: ts.CallExpression, seam: Seam, source: ts.SourceFile): { wrapper: string; at: number } | 'unfollowed' | undefined {
  const schema = bare(call.arguments[seam.at]);
  if (!schema || !ts.isIdentifier(schema)) return undefined;
  const bound = bindingParameter(call, schema.text);
  if (!bound) return undefined;
  const own = ownName(bound.fn);
  if (bound.how !== 'plain' || !own || exported(own, source)) return 'unfollowed';
  return { wrapper: own.name, at: bound.index };
}

/** The seam `node` calls, when it is a call of one by name. */
const seamOf = (node: ts.Node, seams: ReadonlyMap<string, Seam>) =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) ? seams.get(node.expression.text) : undefined;

/**
 * The seams of `source`: the names read.ts's `get` and `send` are bound to, and every wrapper of one, of a wrapper of one, and so on, that
 * hands a schema parameter on to it, with its schema at that parameter's index.
 */
function seamsOf(source: ts.SourceFile): Map<string, Seam> {
  const seams = new Map<string, Seam>();
  for (const name of readNames(source, 'get')) seams.set(name, { word: 'get', kind: 'get', at: 1, wraps: false });
  for (const name of readNames(source, 'send')) seams.set(name, { word: 'send', kind: 'send', at: 2, wraps: false });
  for (let grew = true; grew;) {
    grew = false;
    const visit = (node: ts.Node): void => {
      const seam = seamOf(node, seams);
      const from = seam && ts.isCallExpression(node) ? handedOn(node, seam, source) : undefined;
      if (seam && typeof from === 'object' && !seams.has(from.wrapper)) {
        seams.set(from.wrapper, { word: from.wrapper, kind: seam.kind, at: from.at, wraps: true });
        grew = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return seams;
}

/**
 * Whether `name` is a function used as a value: anywhere but the callee of a call, its own declaration's name, or a property's name
 * (`api.write`, `{ write: … }`), as an alias, a property's value or an argument is.
 */
function usedAsValue(name: ts.Identifier): boolean {
  const at = name.parent;
  if (ts.isCallExpression(at) && at.expression === name) return false;
  if ((ts.isVariableDeclaration(at) || ts.isFunctionDeclaration(at)) && at.name === name) return false;
  return !((ts.isPropertyAccessExpression(at) || ts.isPropertyAssignment(at)) && at.name === name);
}

const GET_FIX = 'decode the read through `get(path, schema)` (lib/api/read.ts), with a schema beside its type';
const SEND_FIX = 'decode the answer through `send(method, path, schema, how)` (lib/api/read.ts), with a schema beside its type';

/**
 * Every read or write in `texts` (a file's path under src/ to its text) that passes no schema: any `fetch` outside read.ts, a GET or a
 * write; a `get` of read.ts with no schema or one that decodes nothing, a `send` of read.ts the same by its third argument, and any
 * `getUndecoded`. A wrapper in the same file that hands its schema parameter on to `get` or `send` is held the same at each of its calls,
 * by that argument, and its call inside is counted nowhere; a schema parameter handed on from a function the scan cannot follow — no name
 * of its own, exported, or destructured — is refused where it is handed on, and a wrapper used as a value where it is so used. Each fault
 * names the file and the line, and says to decode through `get(path, schema)` or `send(method, path, schema, how)`.
 */
export function unschemedReads(texts: ReadonlyMap<string, string>): ReadScan {
  const scan: ReadScan = { faults: [], schemed: 0, sent: 0 };
  for (const [file, text] of texts) {
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const seams = seamsOf(source);
    const fault = (node: ts.Node, what: string, fix: string) =>
      scan.faults.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${what}: ${fix}`);
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && node.text === 'getUndecoded') fault(node, 'getUndecoded reads an answer undecoded', GET_FIX);
      if (ts.isCallExpression(node) && isFetch(node) && file !== 'lib/api/read.ts') {
        if (isWrite(node)) fault(node, 'a write by fetch reads its answer undecoded', SEND_FIX);
        else fault(node, 'a GET by fetch reads an answer undecoded', GET_FIX);
      }
      const seam = seamOf(node, seams);
      if (seam && ts.isCallExpression(node)) judge(node, seam);
      const named = ts.isIdentifier(node) ? seams.get(node.text) : undefined;
      if (named?.wraps && ts.isIdentifier(node) && usedAsValue(node)) {
        const [answer, fix] = named.kind === 'get' ? ['an answer', GET_FIX] : ['its answer', SEND_FIX];
        fault(node, `a ${named.word} used as a value is a wrapper the scan cannot follow, and reads ${answer} undecoded`, fix);
      }
      ts.forEachChild(node, visit);
    };
    const judge = (call: ts.CallExpression, seam: Seam) => {
      const [answer, fix] = seam.kind === 'get' ? ['an answer', GET_FIX] : ['its answer', SEND_FIX];
      const from = handedOn(call, seam, source);
      if (typeof from === 'object') return;
      if (from === 'unfollowed') {
        const cannot = 'whose schema is a parameter of a function the scan cannot follow (no name of its own, exported, or destructured)';
        fault(call, `a ${seam.word} ${cannot} reads ${answer} undecoded`, fix);
      } else if (decodesNothing(call.arguments[seam.at]))
        fault(call, `a ${seam.word} that passes no schema, or one that decodes nothing, reads ${answer} undecoded`, fix);
      else if (seam.kind === 'get') scan.schemed += 1;
      else scan.sent += 1;
    };
    visit(source);
  }
  return scan;
}

test('REFUSED: a GET by fetch, bare or off globalThis, a get with no schema or one decoding nothing, and getUndecoded', () => {
  const texts = new Map([
    ['lib/api/a.ts', "export const a = () => fetch('/api/x').then((r) => r.json());"],
    ['lib/api/b.ts', 'export const b = (path: string, headers: Headers) => fetch(path, { headers });'],
    ['lib/api/c.ts', "export const c = (path: string) => fetch(path, { method: 'GET' });"],
    ['lib/d.ts', "export const d = () => globalThis.fetch('/api/x');"],
    ['lib/api/e.ts', "import { get } from './read.ts';\nexport const e = () => get('/api/x');"],
    [
      'lib/api/f.ts',
      "import { get as read } from './read.ts';\nimport { Schema } from 'effect';\nexport const f = () => read('/api/x', Schema.Unknown);",
    ],
    [
      'routes/g.tsx',
      "import { get } from '@/lib/api/read';\nimport { Schema } from 'effect';\nexport const g = () => get('/api/x', Schema.Any);",
    ],
    ['lib/api/h.ts', "import { getUndecoded } from './read.ts';"],
    ['lib/api/i.ts', "export const i = () => getUndecoded<X>('/api/x');"],
  ]);
  const { faults } = unschemedReads(texts);
  assert.deepEqual(
    faults.map((f) => f.slice(0, f.indexOf(': decode'))),
    [
      'lib/api/a.ts:1: a GET by fetch reads an answer undecoded',
      'lib/api/b.ts:1: a GET by fetch reads an answer undecoded',
      'lib/api/c.ts:1: a GET by fetch reads an answer undecoded',
      'lib/d.ts:1: a GET by fetch reads an answer undecoded',
      'lib/api/e.ts:2: a get that passes no schema, or one that decodes nothing, reads an answer undecoded',
      'lib/api/f.ts:3: a get that passes no schema, or one that decodes nothing, reads an answer undecoded',
      'routes/g.tsx:3: a get that passes no schema, or one that decodes nothing, reads an answer undecoded',
      'lib/api/h.ts:1: getUndecoded reads an answer undecoded',
      'lib/api/i.ts:1: getUndecoded reads an answer undecoded',
    ],
  );
  assert.ok(
    faults.every((f) => f.endsWith(`: ${GET_FIX}`)),
    faults.join('\n'),
  );
});

test('REFUSED: a write by fetch, bare, off globalThis or with its method in a variable, and a send with no schema or one decoding nothing', () => {
  const texts = new Map([
    ['lib/api/a.ts', 'export const a = (route: string, method: string, headers: Headers) => fetch(route, { method, headers });'],
    ['lib/api/b.ts', "export const b = (route: string) => fetch(route, { method: 'POST' });"],
    ['lib/c.ts', "export const c = (url: string) => globalThis.fetch(url, { method: 'DELETE' });"],
    ['lib/api/d.ts', "import { send } from './read.ts';\nexport const d = () => send('POST', '/api/x');"],
    [
      'routes/e.tsx',
      "import { send as write } from '@/lib/api/read';\nimport { Schema } from 'effect';\nexport const e = () => write('PUT', '/api/x', Schema.Unknown, how);",
    ],
    [
      'lib/api/f.ts',
      "import { send } from './read.ts';\nimport { Schema } from 'effect';\nexport const f = () => send('DELETE', '/api/x', Schema.Any, how);",
    ],
  ]);
  const { faults } = unschemedReads(texts);
  assert.deepEqual(
    faults.map((f) => f.slice(0, f.indexOf(': decode'))),
    [
      'lib/api/a.ts:1: a write by fetch reads its answer undecoded',
      'lib/api/b.ts:1: a write by fetch reads its answer undecoded',
      'lib/c.ts:1: a write by fetch reads its answer undecoded',
      'lib/api/d.ts:2: a send that passes no schema, or one that decodes nothing, reads its answer undecoded',
      'routes/e.tsx:3: a send that passes no schema, or one that decodes nothing, reads its answer undecoded',
      'lib/api/f.ts:3: a send that passes no schema, or one that decodes nothing, reads its answer undecoded',
    ],
  );
  assert.ok(
    faults.every((f) => f.endsWith(`: ${SEND_FIX}`)),
    faults.join('\n'),
  );
});

test('a get and a send with their schema, and the fetch inside read.ts, are no unschemed read', () => {
  const texts = new Map([
    ['lib/api/c.ts', "import { get } from './read.ts';\nexport const c = () => get('/api/x', XSchema);"],
    ['lib/api/e.ts', "import { send } from './read.ts';\nexport const e = () => send('POST', '/api/x', XSchema, { may: 'M.' });"],
    ['lib/api/read.ts', "export const answer = (path: string, init?: RequestInit) => fetch(path, { ...init, method: 'POST' });"],
    ['lib/api/d.ts', "import { get, send } from '@tanstack/whatever';\nexport const d = () => [get('/api/x'), send('POST', '/x')];"],
  ]);
  assert.deepEqual(unschemedReads(texts), { faults: [], schemed: 1, sent: 1 });
});

/** A file's wrapper of `send`, as agents.ts writes one: its schema is its third parameter, handed on to `send`. */
const AGENT_WRITE = [
  "import { send } from './read.ts';",
  "import { Schema } from 'effect';",
  'const agentWrite = <T>(method: string, route: string, schema: Schema.Decoder<T>, body: unknown) =>',
  "  send(method, route, schema, { body, may: 'M.' });",
].join('\n');

test('REFUSED: a wrapper that hands its schema to send, called with Schema.Unknown and with Schema.Any, at each call', () => {
  const texts = new Map([
    [
      'lib/api/w.ts',
      `${AGENT_WRITE}
export const a = (route: string, body: unknown) => agentWrite('DELETE', route, Schema.Unknown, body);
export const b = () => agentWrite('PUT', '/api/x', Schema.Any, {});`,
    ],
    [
      'lib/api/o.ts',
      `import { send } from './read.ts';
const outer = <T>(schema: Schema.Decoder<T>) => agentWrite('POST', '/api/y', schema, {});
${AGENT_WRITE.split('\n').slice(1).join('\n')}
export const c = () => outer(Schema.Unknown);`,
    ],
  ]);
  const { faults } = unschemedReads(texts);
  assert.deepEqual(
    faults.map((f) => f.slice(0, f.indexOf(': decode'))),
    [
      'lib/api/w.ts:5: a agentWrite that passes no schema, or one that decodes nothing, reads its answer undecoded',
      'lib/api/w.ts:6: a agentWrite that passes no schema, or one that decodes nothing, reads its answer undecoded',
      'lib/api/o.ts:6: a outer that passes no schema, or one that decodes nothing, reads its answer undecoded',
    ],
  );
  assert.ok(
    faults.every((f) => f.endsWith(`: ${SEND_FIX}`)),
    faults.join('\n'),
  );
});

test('REFUSED: a function that hands its schema to get, called with no schema', () => {
  const texts = new Map([
    [
      'lib/api/r.ts',
      `import { get } from './read.ts';
function read<T>(path: string, schema: Schema.Decoder<T>) {
  return get(path, schema);
}
export const r = () => read('/api/x');`,
    ],
  ]);
  assert.deepEqual(unschemedReads(texts), {
    faults: [`lib/api/r.ts:5: a read that passes no schema, or one that decodes nothing, reads an answer undecoded: ${GET_FIX}`],
    schemed: 0,
    sent: 0,
  });
});

test('REFUSED: a schema cast, parenthesised or asserted on its way to send, by a wrapper or its caller', () => {
  const texts = new Map([
    [
      'lib/api/c.ts',
      `import { send } from './read.ts';
import { Schema } from 'effect';
const cast = <T>(route: string, schema: Schema.Decoder<T>) => send('PUT', route, (schema as Schema.Decoder<T>), how);
export const a = () => cast('/api/x', Schema.Unknown);
export const b = () => cast('/api/x', Schema.Any as never);
const sure = <T>(schema: Schema.Decoder<T>) => send('PUT', '/api/x', schema!, how);
export const c = () => sure((Schema.Unknown));
export const d = () => send('POST', '/api/x', Schema.Unknown satisfies unknown, how);`,
    ],
  ]);
  const { faults } = unschemedReads(texts);
  assert.deepEqual(
    faults.map((f) => f.slice(0, f.indexOf(': decode'))),
    [
      'lib/api/c.ts:4: a cast that passes no schema, or one that decodes nothing, reads its answer undecoded',
      'lib/api/c.ts:5: a cast that passes no schema, or one that decodes nothing, reads its answer undecoded',
      'lib/api/c.ts:7: a sure that passes no schema, or one that decodes nothing, reads its answer undecoded',
      'lib/api/c.ts:8: a send that passes no schema, or one that decodes nothing, reads its answer undecoded',
    ],
  );
});

test('REFUSED: a wrapper used as a value, by an alias, a property or a shorthand, where it is used', () => {
  const texts = new Map([
    [
      'lib/api/u.ts',
      `${AGENT_WRITE}
const w = agentWrite;
export const x = () => w('DELETE', '/api/x', Schema.Unknown, {});
const api = { write: agentWrite };
export const y = () => api.write('PUT', '/api/x', Schema.Any, {});
export const z = { agentWrite };`,
    ],
  ]);
  const value = 'a agentWrite used as a value is a wrapper the scan cannot follow, and reads its answer undecoded';
  assert.deepEqual(unschemedReads(texts), {
    faults: [`lib/api/u.ts:5: ${value}: ${SEND_FIX}`, `lib/api/u.ts:7: ${value}: ${SEND_FIX}`, `lib/api/u.ts:9: ${value}: ${SEND_FIX}`],
    schemed: 0,
    sent: 0,
  });
});

test('a wrapper that hands its schema to get or send, called with a named schema, is no fault and counts one read or write', () => {
  const texts = new Map([
    ['lib/api/w.ts', `${AGENT_WRITE}\nexport const a = () => agentWrite('PUT', '/api/x', AgentSavedSchema, {});`],
    [
      'lib/api/r.ts',
      `import { get } from './read.ts';
function read<T>(path: string, schema: Schema.Decoder<T>) {
  return get(path, schema);
}
export const r = () => read('/api/x', XSchema);`,
    ],
  ]);
  assert.deepEqual(unschemedReads(texts), { faults: [], schemed: 1, sent: 1 });
});

test('REFUSED: a schema parameter handed to get or send from a function the scan cannot follow', () => {
  const texts = new Map([
    [
      'lib/api/x.ts',
      `import { send } from './read.ts';
export const write = <T>(schema: Schema.Decoder<T>) => send('POST', '/api/x', schema, how);`,
    ],
    ['lib/api/y.ts', "import { get } from './read.ts';\nexport const y = () => [XSchema].map((schema) => get('/api/x', schema));"],
    [
      'lib/api/z.ts',
      `import { send } from './read.ts';
const w = ({ schema }: { schema: Schema.Decoder<unknown> }) => send('POST', '/api/x', schema, how);
export const z = () => w({ schema: XSchema });`,
    ],
    [
      'lib/api/v.ts',
      `import { send } from './read.ts';
function put<T>(schema: Schema.Decoder<T>) {
  return send('PUT', '/api/v', schema, how);
}
export { put };`,
    ],
  ]);
  const cannot = 'whose schema is a parameter of a function the scan cannot follow (no name of its own, exported, or destructured)';
  assert.deepEqual(unschemedReads(texts), {
    faults: [
      `lib/api/x.ts:2: a send ${cannot} reads its answer undecoded: ${SEND_FIX}`,
      `lib/api/y.ts:2: a get ${cannot} reads an answer undecoded: ${GET_FIX}`,
      `lib/api/z.ts:2: a send ${cannot} reads its answer undecoded: ${SEND_FIX}`,
      `lib/api/v.ts:3: a send ${cannot} reads its answer undecoded: ${SEND_FIX}`,
    ],
    schemed: 0,
    sent: 0,
  });
});

/** Every `.ts` and `.tsx` under `dir`, by its path from src/. */
const sources = (dir: string, under = ''): Array<[string, string]> =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e): Array<[string, string]> => {
    const at = path.join(dir, e.name);
    const name = under ? `${under}/${e.name}` : e.name;
    if (e.isDirectory()) return sources(at, name);
    return /\.tsx?$/.test(e.name) ? [[name, fs.readFileSync(at, 'utf8')]] : [];
  });

test("every read and write the board's source makes passes a schema", () => {
  const texts = new Map(sources(path.resolve(DIR, '..', '..')));
  assert.ok(texts.has('lib/api/runs.ts') && texts.has('lib/api/read.ts') && texts.has('routes/__root.tsx'), [...texts.keys()].join(', '));
  const { faults, schemed, sent } = unschemedReads(texts);
  assert.ok(schemed >= 15, `the walk counted ${schemed} reads through get with a schema`);
  assert.deepEqual(faults, []);
  assert.ok(sent >= 16, `the walk counted ${sent} writes through send with a schema`);
});

test('read.ts hands out its read, its write and their three refusals, and nothing else', async () => {
  assert.deepEqual(Object.keys(await import('../src/lib/api/read.ts')).sort(), [
    'ReadRefusal',
    'UnreadAnswer',
    'WriteRefusal',
    'get',
    'send',
  ]);
});

test('the barrel hands out no schema: the mirror stays types, queries and writes', () => {
  const names = Object.keys(api);
  assert.ok(
    names.includes('runsQuery') && names.includes('UnreadAnswer') && names.includes('ReadRefusal') && names.includes('WriteRefusal'),
    names.join(', '),
  );
  assert.deepEqual(
    names.filter((n) => n.endsWith('Schema')),
    [],
    'export the file with `export type *` in src/lib/api.ts: a component reads a type, never a schema',
  );
});
