/**
 * The factory's place in an address (src/lib/factoryAddress.ts): every address of before the factory's paths reaches its page under the
 * factory's path, its other keys kept, and lands where no redirect sends it again; a run's, a step's or a card's page belongs where its
 * object's namespace says; and no file of the board but that one reads a page's factory from `?factory=` or writes one into an address.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { seatOf } from '../src/components/nav/nav.ts';
import { factoryRedirect, objectHome } from '../src/lib/factoryAddress.ts';

const SRC = path.resolve(import.meta.dirname, '../src');

/** Every full path of the board's routes, as the router's generated tree declares them, each parameter given a value. */
function routePaths(): string[] {
  const tree = fs.readFileSync(path.join(SRC, 'routeTree.gen.ts'), 'utf8');
  const start = tree.indexOf('export interface FileRoutesByFullPath');
  const end = tree.indexOf('export interface FileRoutesByTo', start);
  assert.ok(start !== -1 && end !== -1, 'the route tree declares FileRoutesByFullPath, then FileRoutesByTo');
  return [...tree.slice(start, end).matchAll(/'([^']+)'\s*:/g)].map((match) => match[1].replace(/\$[A-Za-z]+/g, 'x'));
}

/** The path and the search of `href`, the search as an object of strings. */
const split = (href: string): { path: string; search: Record<string, string> } => {
  const url = new URL(href, 'http://board');
  return { path: url.pathname, search: Object.fromEntries(url.searchParams) };
};

describe('factoryRedirect: each address of before the factory’s paths reaches its page under the factory’s path', () => {
  test('each row of the table goes to its path, every other key kept and `factory` dropped', () => {
    const rows: [string, string][] = [
      ['/', '/factories/kit'],
      ['/runs', '/factories/kit/runs'],
      ['/runs/', '/factories/kit/runs'],
      ['/inbox', '/factories/kit/inbox'],
      ['/workflows', '/factories/kit/workflows'],
      ['/workflows/repo/dev', '/factories/kit/workflows/repo/dev'],
      ['/workflows/repo/dev/review', '/factories/kit/workflows/repo/dev/review'],
      ['/capabilities', '/factories/kit/skills'],
      ['/agents', '/factories/kit/agents'],
      ['/agents/factory/scribe', '/factories/kit/agents/scribe'],
      ['/agents/skills/factory/tidy', '/factories/kit/skills/tidy'],
      ['/runs/abc', '/runs/abc'],
      ['/runs/abc/steps/review', '/runs/abc/steps/review'],
      ['/inbox/card', '/inbox/card'],
    ];
    for (const [from, to] of rows) {
      const href = factoryRedirect(from, { factory: 'kit', l: 'a=b', older: 't', repo: '/r', bar: 'gauges' });
      assert.ok(href, `${from} is sent on`);
      assert.deepEqual(split(href), { path: to, search: { l: 'a=b', older: 't', repo: '/r', bar: 'gauges' } }, from);
    }
  });
  test("a repository's agent or skill read in the factory says it is the repository's", () => {
    assert.deepEqual(split(factoryRedirect('/agents/repo/scribe', { factory: 'kit', repo: '/r' }) ?? ''), {
      path: '/factories/kit/agents/scribe',
      search: { from: 'repo', repo: '/r' },
    });
  });
  test('the factory’s name is escaped in its path', () => {
    assert.equal(factoryRedirect('/runs', { factory: 'a b' }), '/factories/a%20b/runs');
  });
  test('an address that names no factory, or names one with nothing or no string, is left as it is', () => {
    for (const search of [{}, { factory: '' }, { factory: 7 }, { factory: ['kit'] }, { repo: '/r' }])
      assert.equal(factoryRedirect('/runs', search), undefined, JSON.stringify(search));
    assert.equal(
      factoryRedirect('/agents/new', { factory: 'kit', workflow: 'w', step: 's' }),
      undefined,
      'a hire’s old spelling is no page’s',
    );
  });
  test('REFUSED: every route of the board given ?factory=x either reaches a page seated in factory x that is sent nowhere again, or is left', () => {
    const paths = routePaths();
    assert.ok(paths.length > 30, `the route tree lists the board's routes, ${paths.length} read`);
    const wrong = paths.flatMap((one) => {
      const href = factoryRedirect(one, { factory: 'x' });
      if (href === undefined) return [];
      const to = split(href);
      if (factoryRedirect(to.path, to.search) !== undefined) return [`${one} → ${href} is sent on again`];
      const seat = seatOf(to.path);
      const object = to.path === one && /^\/(runs|inbox)\/x/.test(one);
      if (object) return [];
      return seat?.level === 'factory' && seat.factory === 'x' ? [] : [`${one} → ${href} is no page of factory x`];
    });
    assert.deepEqual(wrong, []);
    for (const one of paths) assert.equal(factoryRedirect(one, {}), undefined, `${one} without ?factory= is left`);
  });
});

test("objectHome: a run's, a step's or a card's page belongs where its object's namespace says", () => {
  assert.equal(objectHome('/runs/abc', 'kit', undefined), '/factories/kit/runs/abc', 'a named factory’s run, reached at the store');
  assert.equal(objectHome('/runs/abc', 'default', 'kit'), '/runs/abc', 'the default factory’s run belongs at the store');
  assert.equal(objectHome('/runs/abc', undefined, 'kit'), '/runs/abc', 'a namespace not said is the default');
  assert.equal(objectHome('/inbox/c', 'mill', 'kit'), '/factories/mill/inbox/c', 'a stale path goes to the right factory');
  assert.equal(objectHome('/runs/abc', 'kit', 'kit'), undefined, 'an address that agrees is left');
  assert.equal(objectHome('/runs/abc', 'default', undefined), undefined, 'the default’s run at the store is left');
});

/** Each line of `text` that reads a page's factory from its search or writes one into a board address, comments left out. */
const factoryInAddress = (text: string): string[] =>
  text
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .filter((line) => /search(?:\s*[=:]\s*\{\{?|\??\.)\s*factory\b|[?&]factory=/.test(line));

/** Every source file under `dir`. */
const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(at);
    return /\.tsx?$/.test(entry.name) ? [at] : [];
  });

describe("REFUSED: no file of the board but factoryAddress.ts reads a page's factory from ?factory= or writes one into an address", () => {
  test('the scan names a link that writes the key, and a route that reads it', () => {
    assert.equal(factoryInAddress('<Link to="/runs" search={{ factory }}>').length, 1);
    assert.equal(factoryInAddress('const picked = search.factory;').length, 1);
    assert.equal(factoryInAddress(' * the old `?factory=` address').length, 0, 'a comment says it, and writes nothing');
  });
  test("the board's own files: none but the redirect's, and the api's own parameter under lib/api", () => {
    const allowed = (file: string) =>
      file === path.join(SRC, 'lib/factoryAddress.ts') || file.startsWith(path.join(SRC, 'lib/api') + path.sep);
    const found = sources(SRC)
      .filter((file) => !allowed(file) && !file.endsWith('routeTree.gen.ts'))
      .flatMap((file) => factoryInAddress(fs.readFileSync(file, 'utf8')).map((line) => `${path.relative(SRC, file)}: ${line.trim()}`));
    assert.deepEqual(found, []);
  });
});
