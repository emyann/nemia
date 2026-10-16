/**
 * A page cites only what is there: a path in backticks is a file or a folder from the repository's root, or a package's entry, and a
 * name in backticks is one the code has. The code's names are read as `comments.test.ts` reads them: every identifier and every word
 * of a string in the TypeScript under packages/, apps/, lint/ and tools/, and a string's whole text for a word with hyphens.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { scratch } from './scratch.ts';

const APP = path.join(import.meta.dirname, '..');
const ROOT = path.join(APP, '..', '..');
const PAGES = path.join(APP, 'src', 'content', 'docs');

/** A name a page may cite: an identifier, a dotted path of them, with `()` after a call. */
const NAME = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\(\))?$/;

/** A word with hyphens, as a state or a package is named: `input-required`, `agent-runtime`. */
const HYPHENED = /^[a-z][a-z\d]*(?:-[a-z\d]+)+$/;

/** The extensions that make a cited `name.ext` a file's name, not a path of names. */
const FILE_EXTENSIONS = /\.(?:ts|tsx|js|mjs|cjs|json|jsonc|md|mdx|yaml|yml|html|css|sh|txt|log|png|lock)$/;

/** A cited path, as a page writes it: segments of a file's or a folder's name, a `:line` after it at most. */
const PATH = /^[\w.@-]+(?:\/[\w.@*-]+)*\/?(?::\d+)?$/;

/**
 * Other programs' words a page may cite though the code never spells them, kept short: a word the code comes to have is taken off
 * (the test after the refusal).
 */
const ELSEWHERE = new Set<string>([]);

/** Every backticked span of a page with its line, the fences' own delimiters left out. */
const citedIn = (text: string): Array<{ line: number; span: string }> =>
  text.split('\n').flatMap((line, i) => [...line.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)].map((m) => ({ line: i + 1, span: m[1] })));

/** The workspace's package entries, as an import names them: `agent-runtime`, `agent-runtime/vocabulary`. */
const entries = (): Set<string> =>
  new Set(
    ['packages', 'apps'].flatMap((top) =>
      fs.readdirSync(path.join(ROOT, top)).flatMap((dir) => {
        const file = path.join(ROOT, top, dir, 'package.json');
        if (!fs.existsSync(file)) return [];
        const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { name: string; exports?: Record<string, unknown> };
        return [pkg.name, ...Object.keys(pkg.exports ?? {}).map((key) => path.posix.join(pkg.name, key))];
      }),
    ),
  );

type Known = { names: Set<string>; entries: Set<string>; exists: (file: string) => boolean };

/** What a cited span is wrong about, or undefined: a path that is not there, or a name the code does not have. */
const staleOf = (span: string, known: Known): string | undefined => {
  if (PATH.test(span) && (span.includes('/') || FILE_EXTENSIONS.test(span))) {
    const file = span.replace(/:\d+$/, '');
    return known.entries.has(file) || known.exists(file) ? undefined : 'a path that does not exist';
  }
  if (NAME.test(span)) {
    const parts = span.replace(/\(\)$/, '').split('.');
    return parts.every((part) => known.names.has(part) || ELSEWHERE.has(part)) ? undefined : 'a name the code does not have';
  }
  return HYPHENED.test(span) && !known.names.has(span) && !known.entries.has(span) ? 'a name the code does not have' : undefined;
};

/** Each span a page cites that is a path not there or a name the code does not have, with its line. */
const staleCitations = (file: string, text: string, known: Known): string[] =>
  citedIn(text).flatMap(({ line, span }) => {
    const stale = staleOf(span, known);
    return stale ? [`${file}:${line} cites \`${span}\`, ${stale}`] : [];
  });

/** Every name a piece of code has: its identifiers, the words of its strings, and each string's whole text. */
const namesOf = (source: ts.SourceFile, into: Set<string>): Set<string> => {
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) into.add(node.text.replace(/^#/, ''));
    else if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node)) {
      into.add(node.text);
      for (const word of node.text.match(/[A-Za-z_$][\w$-]*/g) ?? []) for (const part of [word, ...word.split('-')]) into.add(part);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return into;
};

/** Every name the TypeScript of `files`, by path from `root`, has: the docs' own tests left out, whose fixtures cite stale names. */
const namesIn = (root: string, files: string[]): Set<string> =>
  files
    .filter((f) => /\.tsx?$/.test(f) && !f.startsWith('apps/docs/test/') && fs.existsSync(path.join(root, f)))
    .reduce(
      (names, f) =>
        namesOf(
          ts.createSourceFile(f, fs.readFileSync(path.join(root, f), 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? 4 : 3),
          names,
        ),
      new Set<string>(),
    );

let known: Known | undefined;
/** The names the repository's code has, read from the files git knows of under its four source tops, and its entries. */
const knownOfRepo = (): Known =>
  (known ??= {
    names: namesIn(
      ROOT,
      execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'packages', 'apps', 'lint', 'tools'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).split('\n'),
    ),
    entries: entries(),
    exists: (file) => fs.existsSync(path.join(ROOT, file)),
  });

test('REFUSED: a page citing a path that does not exist, or a name the code does not have', () => {
  const fixture: Known = {
    names: new Set(['assess', 'readRun', 'input-required']),
    entries: new Set(['agent-runtime', 'agent-runtime/vocabulary']),
    exists: (file) => ['docs/architecture.md', 'apps/web/src/styles.css', 'packages/agent-runtime/'].includes(file),
  };
  const page = [
    '---',
    'title: A fixture',
    '---',
    'Read `docs/architecture.md` and `apps/web/src/styles.css:218`, then `packages/agent-runtime/no-such-file.ts`.',
    'The tick calls `assess` and `readRun()`, never `noSuchFunctionAnywhere`; a task waits in `input-required`, not `input-wanted`.',
    'Reach it through `agent-runtime/vocabulary`, run `npm run dev`, and leave `packages/agent-runtime/` alone.',
    '```mermaid diagram=lifecycle',
    '```',
  ].join('\n');
  assert.deepEqual(staleCitations('page.mdx', page, fixture), [
    'page.mdx:4 cites `packages/agent-runtime/no-such-file.ts`, a path that does not exist',
    'page.mdx:5 cites `noSuchFunctionAnywhere`, a name the code does not have',
    'page.mdx:5 cites `input-wanted`, a name the code does not have',
  ]);
});

test('the code’s names are read: an identifier, a string’s word and a hyphened state, and no stale name of the fixture', () => {
  const root = scratch('docs-names-');
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  write('packages/agent-runtime/src/core/domain.ts', 'export const decide = (restartPolicy: string) => restartPolicy;\n');
  write('packages/agent-orchestrator/src/run/tick.ts', "export const t = () => readRun('a task waits in input-required');\n");
  write('apps/web/src/routes/runs.tsx', 'export const Runs = () => <p>a run</p>;\n');
  write('apps/docs/test/names.test.ts', 'const page = `the tick calls noSuchFunctionAnywhere`;\n');
  write('apps/docs/src/mermaid.ts', "export const read = () => 'ignoredByNothing';\n");
  write('packages/agent-runtime/README.md', 'The name `notTypeScript` is in no source.\n');
  const files = (fs.readdirSync(root, { recursive: true }) as string[]).map((f) => f.split(path.sep).join('/'));
  const names = namesIn(root, files);
  for (const name of ['decide', 'restartPolicy', 'readRun', 'input-required', 'Runs', 'read']) assert.ok(names.has(name), name);
  assert.equal(names.has('noSuchFunctionAnywhere'), false, 'the docs’ tests are left out of the scan');
  assert.equal(names.has('notTypeScript'), false, 'only TypeScript is read');
});

/** The pages the scan reads: every `.mdx` or `.md` file under the site's content, sorted. */
const scanned = (): string[] => (fs.readdirSync(PAGES, { recursive: true }) as string[]).filter((f) => /\.mdx?$/.test(f)).sort();

test('the scan reads all eleven pages, and the many spans they cite', () => {
  const pages = scanned();
  assert.deepEqual(
    [
      'index.mdx',
      'map.mdx',
      'runtime.mdx',
      'a2a.mdx',
      'workflows.mdx',
      'agents.mdx',
      'factories.mdx',
      'how-a-run-lives.mdx',
      'nemia.mdx',
      'glossary.mdx',
      'getting-started.mdx',
    ].filter((p) => !pages.includes(p)),
    [],
    `the scan read ${pages.join(', ')}`,
  );
  const cited = pages.flatMap((p) => citedIn(fs.readFileSync(path.join(PAGES, p), 'utf8')));
  assert.ok(cited.length > 200, `the pages cite ${cited.length} spans, far fewer than they hold`);
});

test('every page cites only paths that exist and names the code has', () => {
  const repo = knownOfRepo();
  assert.deepEqual(
    [...ELSEWHERE].filter((word) => repo.names.has(word)),
    [],
    'the code has these names: take them off ELSEWHERE',
  );
  assert.deepEqual(
    scanned().flatMap((p) => staleCitations(path.join('src/content/docs', p), fs.readFileSync(path.join(PAGES, p), 'utf8'), repo)),
    [],
    'cite a path from the repository’s root that is there, and a name the code has',
  );
});
