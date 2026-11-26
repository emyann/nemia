/**
 * A local server that frames a card the way the artifact's page does: the tokens' stylesheet written from tokens.json, the bundle's
 * stylesheet, React 18.3.1 and ReactDOM from the producer's own workspace, the bundle's script, the theme asked for on the root, then
 * the card's page. A request it does not frame is a story reaching for a network.
 */
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { requireOwn } from '../paths.ts';

/** tokens.json as the server reads it. */
type Tokens = {
  name: string;
  color: { themes: { id: string }[]; tokens: { name: string; value: string | Record<string, string> }[] };
  shadow?: { tokens: { name: string; value: string | Record<string, string> }[] };
  type: {
    families: Record<string, string>;
    fonts: { family: string; file: string; weight: string; style: string }[];
    groups: {
      family: string;
      styles: { name: string; family?: string; fontSize: string; lineHeight: string; fontWeight: number; letterSpacing: string }[];
    }[];
  };
  [family: string]: unknown;
};

/** The flat families of tokens.json, each a list of a name and a value. */
const flatTokens = (tokens: Tokens) =>
  Object.entries(tokens)
    .filter(([key]) => !['color', 'shadow', 'type', 'meta'].includes(key))
    .flatMap(([, family]) => {
      const listed = (family as { tokens?: unknown } | null)?.tokens;
      return Array.isArray(listed)
        ? (listed as { name: string; value: string }[]).map((token) => `  --${token.name}: ${token.value};`)
        : [];
    });

/**
 * The tokens' stylesheet the artifact writes from tokens.json: each theme's colours and shadows, the flat families, the faces and the
 * type styles.
 * @param text tokens.json's text.
 */
const tokensSheet = (text: string) => {
  const tokens = JSON.parse(text) as Tokens;
  const themes = tokens.color.themes.map((theme) => theme.id);
  const first = themes[0] ?? 'dark';
  const valueIn = (value: string | Record<string, string>, theme: string) =>
    typeof value === 'string' ? value : (value[theme] ?? value[first] ?? '');
  const block = (theme: string) =>
    [...tokens.color.tokens, ...(tokens.shadow?.tokens ?? [])].map(
      (token) => `  --${token.name}: ${valueIn(token.value, theme).replace(/^\{(.+)\}$/, 'var(--$1)')};`,
    );
  return [
    `:root, [data-theme="${first}"] {`,
    ...block(first),
    '}',
    ...themes.slice(1).flatMap((theme) => [`[data-theme="${theme}"] {`, ...block(theme), '}']),
    ':root {',
    ...flatTokens(tokens),
    ...Object.entries(tokens.type.families).map(([key, stack]) => `  --font-${key}: ${stack};`),
    '}',
    ...tokens.type.fonts.map(
      (face) =>
        `@font-face { font-family: "${face.family}"; src: url("/project/${face.file}") format("woff2"); font-weight: ${face.weight}; font-style: ${face.style}; font-display: block; }`,
    ),
    ...tokens.type.groups.flatMap((group) =>
      group.styles.map(
        (style) =>
          `.${style.name} { font-family: var(--font-${style.family ?? group.family}); font-size: ${style.fontSize}; line-height: ${style.lineHeight}; font-weight: ${style.fontWeight}; letter-spacing: ${style.letterSpacing}; }`,
      ),
    ),
  ].join('\n');
};

/** Whether a request is one the frame itself makes. */
export const ofTheFrame = (pathname: string) => /^\/(tokens\.css$|lib\/|card\/|project\/|check\/)/.test(pathname);

/** What the frame loads before a card: the stylesheets, React, the bundle, and the theme the address asks for. */
const PRELOAD = [
  '<link rel="stylesheet" href="/tokens.css">',
  '<link rel="stylesheet" href="/project/components/bundle.css">',
  '<script src="/lib/react.js"></script>',
  '<script src="/lib/react-dom.js"></script>',
  '<script src="/project/components/bundle.js"></script>',
  '<script>document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") || "dark";</script>',
].join('\n');

/** The libraries the frame serves, React 18's builds from the producer's workspace. */
const LIBRARIES: Readonly<Record<string, readonly [string, string]>> = {
  '/lib/react.js': ['react', 'umd/react.production.min.js'],
  '/lib/react-dom.js': ['react-dom', 'umd/react-dom.production.min.js'],
};

/** A file of a package of the producer's workspace, read past the package's `exports`, which name no UMD build. */
const ownFile = ([name, file]: readonly [string, string]) => path.join(path.dirname(requireOwn.resolve(`${name}/package.json`)), file);

const TYPES: Readonly<Record<string, string>> = {
  '.woff2': 'font/woff2',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

/** The body and type of one request, or undefined for one the frame does not serve. */
const answerOf = (project: string, pages: Readonly<Record<string, string>>, pathname: string) => {
  const library = LIBRARIES[pathname];
  if (library) return { body: fs.readFileSync(ownFile(library)), type: TYPES['.js'] };
  if (pathname === '/tokens.css')
    return { body: tokensSheet(fs.readFileSync(path.join(project, 'tokens.json'), 'utf8')), type: TYPES['.css'] };
  if (pathname.startsWith('/card/')) {
    const page = fs.readFileSync(path.join(project, 'components', pathname.slice(6), 'preview.html'), 'utf8');
    return { body: page.replace('<head>', `<head>\n${PRELOAD}`), type: TYPES['.html'] };
  }
  const given = pages[pathname];
  if (given !== undefined) return { body: given, type: TYPES['.html'] };
  if (pathname.startsWith('/project/') && !pathname.includes('..'))
    return {
      body: fs.readFileSync(path.join(project, pathname.slice(9))),
      type: TYPES[path.extname(pathname)] ?? 'application/octet-stream',
    };
  return undefined;
};

/**
 * Serves the build's `project/` on a free port of the loopback.
 * @param project the artifact's folder.
 * @param pages further pages, by their paths, as the faces' and the icons' checks write them.
 */
export const serve = async (project: string, pages: Readonly<Record<string, string>> = {}) => {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://frame').pathname);
    try {
      const answer = answerOf(project, pages, pathname);
      if (!answer) throw new Error('not framed');
      response.writeHead(200, { 'content-type': answer.type ?? 'application/octet-stream' });
      response.end(answer.body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>((done) => server.close(() => done())) };
};
