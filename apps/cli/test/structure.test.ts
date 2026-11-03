/**
 * The client's structure (`docs/architecture.md`, *The layers*): `nemia` reaches the api over HTTP alone, its answers' shapes by their
 * types, the store's daemon by its lease, and the in-process path by a process. The web's boundary test (`apps/web/test/structure.test.ts`)
 * applied to the client, over every `.ts` of `src/` and `bin/` that is no test, each rule a function proven on a planted file it refuses:
 *
 * - **No package below the api** (`workspace`, `harness`): no import of `agent-orchestrator`, `agent-runtime` or a harness SDK, by any
 *   route — an import, a re-export, `import()`, `require()` or a resolve — but the one `local.ts` makes (`spawn`).
 * - **No path out of `apps/cli`** (`leaves`, `packages`), but to the api's client door: none into `packages/`.
 * - **The api's types alone, from its door** (`api-value`, `api-door`): an import of the api, by a relative path or by its name `api`, is
 *   `import type` (or `export type`), and of `apps/api/src/client/client.ts` alone.
 * - **The bins are the program's door alone** (`bin`): a file of `bin/` imports `../src/` and nothing else.
 * - **One store fact** (`store`): `daemon.json`, `.agent-workflows`, `.agent-engine`, `WF_ROOT` and `AE_ROOT` are spelled in the code of
 *   `src/where.ts` alone, which reads the lease's `url`.
 * - **One process** (`spawn`): `src/local.ts` alone names the orchestrator's CLI entries (`agent-orchestrator/bin`, `/bin/wf`), which it
 *   resolves and never imports, and alone imports `node:child_process`; the daemon on demand spawns through it.
 * - **The feed's stream under `src/watch/`** (`feed`): no other file names `/api/feed/stream` or an `EventSource`.
 * - **The moved reads are the contract's** (`READ_VERBS` in `contracts/route.contract.ts`): `routeOf` sends each to the api, and the
 *   names `src/route.ts` tests are those verbs, no more and no fewer (`routedNames`).
 *
 * The lint block for `apps/cli/src` and `apps/cli/bin` in `.oxlintrc.json` refuses the same packages as they are typed, and a value
 * import of the api; `packages/agent-orchestrator/test/contract.test.ts` holds the CLI entries' resolve across the repository. A
 * comment is no code: the store and feed rules read code alone, and a JSDoc may name what the code does not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { READ_VERBS } from '../contracts/route.contract.ts';
import { routeOf } from '../src/route.ts';

const CLI = path.join(import.meta.dirname, '..');

/** The api's one door this client reads, by its path from the repository's root. */
const DOOR = 'apps/api/src/client/client.ts';

/** The one file that reads the store, the one that spawns, and the folder that follows the feed. */
const WHERE = 'src/where.ts';
const LOCAL = 'src/local.ts';
const WATCH = 'src/watch/';

/** The harness SDKs, each the runtime's alone. */
const HARNESS = /^(?:@anthropic-ai\/claude-agent-sdk|@a2a-js\/sdk)(?:\/|$)/;

/** The workspace packages below the api. */
const BELOW = /^agent-(?:orchestrator|runtime)(?:\/|$)/;

/**
 * The two packages' names, as the planted files below spell them: a literal of either in this file's code would be read by the
 * repository's contract scans as this test reaching them (`packages/agent-orchestrator/test/contract.test.ts`).
 */
const ORCH = 'agent-orchestrator';
const RUNTIME = 'agent-runtime';

/** The orchestrator's CLI entries, which `LOCAL` resolves and spawns. */
const ENTRIES = /^agent-orchestrator\/bin(?:\/wf)?$/;

/** What a store path is spelled by: the lease, the two stores' folders and the variables that move them. */
const STORE = /daemon\.json|\.agent-workflows|\.agent-engine|\bWF_ROOT\b|\bAE_ROOT\b/;

/** What following the feed is spelled by. */
const FEED = /\/api\/feed\/stream|\bEventSource\b/;

/** The rule a break is of, one word each, named in the header. */
type Rule = 'workspace' | 'harness' | 'leaves' | 'packages' | 'api-value' | 'api-door' | 'bin' | 'store' | 'spawn' | 'feed';

/** A file of the client that breaks a rule, and what to do instead. */
type Break = { file: string; rule: Rule; fix: string };

/** How a module is named: loaded by an import or a re-export, loaded at run time, or resolved to a path and not loaded. */
type Way = 'static' | 'dynamic' | 'resolve';

/** A module a file names, how, and whether only its types are taken. */
type Named = { spec: string; way: Way; typeOnly: boolean };

/** Every `.ts` under `src` and `bin` that is no test, by its path from `apps/cli`, with its text. */
const sourceTexts = (): Map<string, string> =>
  new Map(
    ['src', 'bin']
      .flatMap((dir) =>
        fs.readdirSync(path.join(CLI, dir), { recursive: true, encoding: 'utf8' }).map((f) => `${dir}/${f.split(path.sep).join('/')}`),
      )
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(CLI, f), 'utf8')]),
  );

/** Source text with each comment line blanked: a line that opens with `//`, `/*` or `*`. */
const withoutComments = (text: string): string =>
  text
    .split('\n')
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line))
    .join('\n');

/** Whether an import or export's bindings are all types: `import type`, `export type`, or every named binding `type`. */
function typesOnly(node: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  if (ts.isExportDeclaration(node))
    return (
      node.isTypeOnly ||
      (node.exportClause !== undefined &&
        ts.isNamedExports(node.exportClause) &&
        node.exportClause.elements.length > 0 &&
        node.exportClause.elements.every((e) => e.isTypeOnly))
    );
  const clause = node.importClause;
  if (clause === undefined) return false;
  if (clause.isTypeOnly) return true;
  const named = clause.namedBindings;
  return (
    clause.name === undefined &&
    named !== undefined &&
    ts.isNamedImports(named) &&
    named.elements.length > 0 &&
    named.elements.every((e) => e.isTypeOnly)
  );
}

/** Every module a file names, read by TypeScript: imports and re-exports, `import()`, `require()`, a resolve, and `import('x').T`. */
function namedIn(file: string, text: string): Named[] {
  const out: Named[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
      out.push({ spec: node.moduleSpecifier.text, way: 'static', typeOnly: typesOnly(node) });
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal))
      out.push({ spec: node.argument.literal.text, way: 'static', typeOnly: true });
    else if (ts.isCallExpression(node)) {
      const callee = node.expression.getText();
      const way: Way | undefined =
        node.expression.kind === ts.SyntaxKind.ImportKeyword || callee === 'require'
          ? 'dynamic'
          : callee === 'import.meta.resolve' || callee === 'require.resolve'
            ? 'resolve'
            : undefined;
      if (way !== undefined) for (const arg of node.arguments) for (const spec of literalsIn(arg)) out.push({ spec, way, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
  return out;
}

/** The strings an argument can be: a literal, or each branch of a conditional of literals (`wf ? 'a/wf' : 'a'`). */
const literalsIn = (node: ts.Node): string[] =>
  ts.isStringLiteralLike(node)
    ? [node.text]
    : ts.isConditionalExpression(node)
      ? [...literalsIn(node.whenTrue), ...literalsIn(node.whenFalse)]
      : ts.isParenthesizedExpression(node)
        ? literalsIn(node.expression)
        : [];

/** The file a module names, by its path from the repository's root: a relative path resolved, the package `api` under `apps/api`. */
function targetOf(file: string, spec: string): string | undefined {
  if (spec.startsWith('.')) return path.posix.normalize(path.posix.join('apps/cli', path.posix.dirname(file), spec));
  if (spec === 'api' || spec.startsWith('api/')) return path.posix.join('apps/api', spec.slice('api'.length));
  return undefined;
}

/** What the import of `named` in `file` breaks, if any: a package below the api, a path out, the api other than by its door's types. */
function importBreak(file: string, { spec, way, typeOnly }: Named): Break | undefined {
  const target = targetOf(file, spec);
  if (ENTRIES.test(spec))
    return way === 'resolve' && file === LOCAL
      ? undefined
      : { file, rule: 'spawn', fix: `spawn ${spec} from ${LOCAL}, which resolves it and never imports it` };
  if (BELOW.test(spec))
    return { file, rule: 'workspace', fix: `ask the api over HTTP for what ${spec} gives, or run the old path through ${LOCAL}` };
  if (HARNESS.test(spec)) return { file, rule: 'harness', fix: 'only agent-runtime reaches a harness: ask the api' };
  if (spec === 'node:child_process' || spec === 'child_process')
    return file === LOCAL ? undefined : { file, rule: 'spawn', fix: `spawn through ${LOCAL}'s spawned, the client's one process` };
  if (file.startsWith('bin/') && !(target ?? '').startsWith('apps/cli/src/'))
    return { file, rule: 'bin', fix: `a bin imports ../src/ alone: import ${spec} from a file of src/` };
  if (target === undefined) return undefined;
  if (target.startsWith('packages/'))
    return { file, rule: 'packages', fix: `import no package's file: ask the api for what ${spec} gives` };
  if (target === 'apps/api' || target.startsWith('apps/api/')) {
    if (!typeOnly) return { file, rule: 'api-value', fix: `import type it from ${DOOR}, and ask the api over HTTP for the value` };
    return target === DOOR ? undefined : { file, rule: 'api-door', fix: `import type the shape from ${DOOR}, the api's one door for it` };
  }
  return target.startsWith('apps/cli/') ? undefined : { file, rule: 'leaves', fix: `${spec} leaves apps/cli: reach the api over HTTP` };
}

/** Each import of the client that reaches past the api, out of `apps/cli`, or into the api other than by its door's types. */
const importBreaks = (texts: ReadonlyMap<string, string>): Break[] =>
  [...texts].flatMap(([file, text]) => namedIn(file, text).flatMap((named) => importBreak(file, named) ?? []));

/** Each file outside `allowed` whose code, comments blanked, spells `pattern`. */
const spelledBreaks = (
  texts: ReadonlyMap<string, string>,
  pattern: RegExp,
  allowed: (file: string) => boolean,
  rule: Rule,
  fix: string,
): Break[] =>
  [...texts].filter(([file, text]) => !allowed(file) && pattern.test(withoutComments(text))).map(([file]) => ({ file, rule, fix }));

/** Each file other than `WHERE` that spells a store path. */
const storeBreaks = (texts: ReadonlyMap<string, string>): Break[] =>
  spelledBreaks(texts, STORE, (file) => file === WHERE, 'store', `read the lease through ${WHERE}'s servedAt, the one store fact`);

/** Each file other than `LOCAL` that names the orchestrator's CLI entries, in a resolve or in any string. */
const entryBreaks = (texts: ReadonlyMap<string, string>): Break[] =>
  spelledBreaks(
    texts,
    /['"`]agent-orchestrator\/bin(?:\/wf)?['"`]/,
    (file) => file === LOCAL,
    'spawn',
    `run the old path through ${LOCAL}'s spawned`,
  );

/** Each file outside `WATCH` that follows the feed. */
const feedBreaks = (texts: ReadonlyMap<string, string>): Break[] =>
  spelledBreaks(texts, FEED, (file) => file.startsWith(WATCH), 'feed', `follow the feed from ${WATCH}, which owns its stream`);

/** Every break of the client's structure. */
const breaksOf = (texts: ReadonlyMap<string, string>): Break[] => [
  ...importBreaks(texts),
  ...storeBreaks(texts),
  ...entryBreaks(texts),
  ...feedBreaks(texts),
];

/** The rule of each break, with its file: what a test asserts, never the words of the fix. */
const ruled = (breaks: Break[]): string[] => breaks.map((b) => `${b.file} ${b.rule}`).sort();

/** `texts` with one file planted, by its path from `apps/cli`. */
const plantedIn = (file: string, text: string): Map<string, string> => new Map([...sourceTexts(), [file, text]]);

/** The names `src/route.ts`'s `routeOf` compares a command's name to. */
const routedNames = (text: string): string[] => [...text.matchAll(/\bname === '([^']+)'/g)].map((m) => m[1]).sort();

test('the scan reads the client, its bins among it, and sees each way a file names a module', () => {
  const texts = sourceTexts();
  for (const file of ['bin/nemia.ts', 'bin/wf.ts', 'src/main.ts', WHERE, LOCAL]) assert.ok(texts.has(file), `the scan reads ${file}`);
  assert.ok(
    namedIn(LOCAL, texts.get(LOCAL) ?? '').some((n) => n.way === 'resolve' && ENTRIES.test(n.spec)),
    `${LOCAL} resolves the CLI`,
  );
  const text = [
    "import type { RunObject } from '../../api/src/client/client.ts';",
    "import { type A, type B } from 'api/src/client/client.ts';",
    "import { c, type D } from './c.ts';",
    "export type { E } from '../../api/src/runs/runs.ts';",
    `export * from '${RUNTIME}';`,
    "import 'node:fs';",
    `const m = await import('${ORCH}/run');`,
    "const r = require('@a2a-js/sdk');",
    `const at = import.meta.resolve(wf ? '${ORCH}/bin/wf' : '${ORCH}/bin');`,
    "type F = import('../../api/src/app.ts').App;",
    "// import { g } from 'nowhere'; in a comment is no import",
  ].join('\n');
  assert.deepEqual(
    namedIn('src/x.ts', text).map((n) => `${n.way} ${n.typeOnly ? 'type' : 'value'} ${n.spec}`),
    [
      'static type ../../api/src/client/client.ts',
      'static type api/src/client/client.ts',
      'static value ./c.ts',
      'static type ../../api/src/runs/runs.ts',
      'static value agent-runtime',
      'static value node:fs',
      'dynamic value agent-orchestrator/run',
      'dynamic value @a2a-js/sdk',
      'resolve value agent-orchestrator/bin/wf',
      'resolve value agent-orchestrator/bin',
      'static type ../../api/src/app.ts',
    ],
  );
});

test('the client breaks none of its rules', () => {
  assert.deepEqual(ruled(breaksOf(sourceTexts())), []);
});

test('REFUSED: a package below the api or a harness SDK, imported by any route', () => {
  for (const line of [
    `import { runWith } from '${ORCH}';`,
    `import type { Run } from '${ORCH}/run';`,
    `export * from '${RUNTIME}';`,
    `const v = await import('${RUNTIME}/vocabulary');`,
    `const at = import.meta.resolve('${ORCH}');`,
  ])
    assert.deepEqual(ruled(importBreaks(plantedIn('src/x.ts', line))), ['src/x.ts workspace'], line);
  for (const line of ["import { query } from '@anthropic-ai/claude-agent-sdk';", "import type { A } from '@a2a-js/sdk/client';"])
    assert.deepEqual(ruled(importBreaks(plantedIn('src/reads/x.ts', line))), ['src/reads/x.ts harness'], line);
  for (const line of ["import { Effect } from 'effect';", "import fs from 'node:fs';", "import { get } from '../client.ts';"])
    assert.deepEqual(ruled(importBreaks(plantedIn('src/reads/x.ts', line))), [], `${line} is let through`);
});

test('REFUSED: a relative path out of apps/cli, and one into packages/', () => {
  assert.deepEqual(ruled(importBreaks(plantedIn('src/x.ts', "import { x } from '../../web/src/lib/api.ts';"))), ['src/x.ts leaves']);
  assert.deepEqual(ruled(importBreaks(plantedIn('src/x.ts', "import { x } from '../../../tools/test-costs/probe.ts';"))), [
    'src/x.ts leaves',
  ]);
  for (const [file, spec] of [
    ['src/x.ts', '../../../packages/agent-orchestrator/src/run.ts'],
    ['src/reads/x.ts', '../../../../packages/agent-runtime/src/index.ts'],
  ])
    assert.deepEqual(ruled(importBreaks(plantedIn(file, `import type { X } from '${spec}';`))), [`${file} packages`], spec);
  assert.deepEqual(ruled(importBreaks(plantedIn('src/reads/x.ts', "import { x } from '../../test/helpers.ts';"))), [], 'inside apps/cli');
});

test('REFUSED: a value imported from the api, and a type imported from any file of it but its client door', () => {
  for (const [file, line] of [
    ['src/x.ts', "import { appOf } from '../../api/src/client/client.ts';"],
    ['src/reads/x.ts', "import { x } from '../../../api/src/client/client.ts';"],
    ['src/x.ts', "import { x, type Y } from 'api/src/client/client.ts';"],
    ['src/x.ts', "export * from '../../api/src/client/client.ts';"],
    ['src/x.ts', "const c = await import('../../api/src/client/client.ts');"],
  ])
    assert.deepEqual(ruled(importBreaks(plantedIn(file, line))), [`${file} api-value`], line);
  for (const [file, line] of [
    ['src/x.ts', "import type { RunObject } from '../../api/src/runs/runs.ts';"],
    ['src/x.ts', "import type { App } from 'api/src/app.ts';"],
    ['src/x.ts', "import type { App } from 'api';"],
    ['src/watch/x.ts', "export type { Feed } from '../../../api/src/factory/feed.ts';"],
  ])
    assert.deepEqual(ruled(importBreaks(plantedIn(file, line))), [`${file} api-door`], line);
  for (const [file, line] of [
    ['src/x.ts', "import type { RunObject } from '../../api/src/client/client.ts';"],
    ['src/reads/x.ts', "import type { RunObject } from '../../../api/src/client/client.ts';"],
    ['src/reads/x.ts', "import { type RunObject, type RunSummary } from 'api/src/client/client.ts';"],
    ['src/watch/x.ts', "export type { FeedEvent } from '../../../api/src/client/client.ts';"],
  ])
    assert.deepEqual(ruled(importBreaks(plantedIn(file, line))), [], `${line} is let through`);
});

test('REFUSED: a bin that imports anything but the source', () => {
  assert.deepEqual(ruled(importBreaks(plantedIn('bin/x.ts', "import { main } from '../src/main.ts';"))), []);
  assert.deepEqual(ruled(importBreaks(plantedIn('bin/x.ts', "import { Effect } from 'effect';"))), ['bin/x.ts bin']);
  assert.deepEqual(ruled(importBreaks(plantedIn('bin/x.ts', "import { x } from '../test/x.ts';"))), ['bin/x.ts bin']);
  assert.deepEqual(ruled(importBreaks(plantedIn('bin/x.ts', "import { x } from '../contracts/route.contract.ts';"))), ['bin/x.ts bin']);
});

test('REFUSED: a store path spelled outside src/where.ts; one named in a JSDoc is let through', () => {
  for (const line of [
    "const lease = path.join(root, 'daemon.json');",
    "const home = path.join(os.homedir(), '.agent-workflows');",
    "const engine = path.join(os.homedir(), '.agent-engine');",
    'const root = env.WF_ROOT;',
    "const root = process.env['AE_ROOT'];",
  ])
    assert.deepEqual(ruled(storeBreaks(plantedIn('src/reads/x.ts', line))), ['src/reads/x.ts store'], line);
  assert.deepEqual(
    ruled(storeBreaks(plantedIn('src/x.ts', '/** Reads the lease, `$WF_ROOT/daemon.json`, through where.ts. */\nexport const x = 1;\n'))),
    [],
  );
});

test("REFUSED: the orchestrator's CLI named, or a process spawned, outside src/local.ts; an import of the CLI even there", () => {
  const resolve = `const at = fileURLToPath(import.meta.resolve('${ORCH}/bin'));`;
  assert.deepEqual(ruled(importBreaks(plantedIn('src/daemon.ts', resolve))), ['src/daemon.ts spawn'], 'resolved in another file');
  assert.deepEqual(ruled(entryBreaks(plantedIn('src/daemon.ts', `const entry = '${ORCH}/bin/wf';`))), ['src/daemon.ts spawn']);
  assert.deepEqual(ruled(importBreaks(plantedIn('src/daemon.ts', "import { spawn } from 'node:child_process';"))), ['src/daemon.ts spawn']);
  assert.deepEqual(ruled(importBreaks(plantedIn(LOCAL, resolve))), [], `the resolve in ${LOCAL}`);
  assert.deepEqual(ruled(entryBreaks(plantedIn(LOCAL, resolve))), [], `the name in ${LOCAL}`);
  assert.deepEqual(ruled(importBreaks(plantedIn(LOCAL, `import '${ORCH}/bin';`))), [`${LOCAL} spawn`]);
  assert.deepEqual(ruled(importBreaks(plantedIn(LOCAL, `const m = await import('${ORCH}/bin/wf');`))), [`${LOCAL} spawn`]);
});

test('REFUSED: the feed followed outside src/watch/; one named in a JSDoc is let through', () => {
  for (const line of ["const at = urlOf(base, '/api/feed/stream', query);", 'const s = new EventSource(url);'])
    assert.deepEqual(ruled(feedBreaks(plantedIn('src/reads/x.ts', line))), ['src/reads/x.ts feed'], line);
  assert.deepEqual(ruled(feedBreaks(plantedIn('src/watch/x.ts', "const at = urlOf(base, '/api/feed/stream', query);"))), []);
  assert.deepEqual(
    ruled(feedBreaks(plantedIn('src/x.ts', '/** `watch` follows `/api/feed/stream`, from watch/. */\nexport const x = 1;\n'))),
    [],
  );
});

test("the moved reads are the contract's READ_VERBS: routeOf sends each to the api, and src/route.ts names those and no other", () => {
  for (const name of READ_VERBS) {
    assert.equal(routeOf({ name, local: false, help: false }), 'api', name);
    assert.equal(routeOf({ name, local: true, help: false }), 'process', `${name} --local`);
  }
  for (const name of ['approve', 'retry', 'say', 'inbox add', 'decide', ''])
    assert.equal(routeOf({ name, local: false, help: false }), 'process', name);
  assert.deepEqual(routedNames(fs.readFileSync(path.join(CLI, 'src/route.ts'), 'utf8')), [...READ_VERBS].sort());
});

test('REFUSED: a route that tests a name the contract does not move, or leaves one out', () => {
  const route = fs.readFileSync(path.join(CLI, 'src/route.ts'), 'utf8');
  assert.ok(route.includes("name === 'watch'"), 'the route names watch today');
  assert.notDeepEqual(routedNames(route.replace("name === 'watch'", "name === 'approve'")), [...READ_VERBS].sort());
  assert.notDeepEqual(routedNames(route.replace(" || name === 'watch'", '')), [...READ_VERBS].sort());
});
