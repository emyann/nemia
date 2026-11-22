/**
 * The seam between the board's code and the page a canvas mounts it on: React, ReactDOM and the JSX runtime resolve to the page's
 * React 18 globals, with the two hooks of React 19 the board calls (`useEffectEvent`, `use` over a context) and a ref handed to a
 * function component as a prop, which React 18 drops; and the esbuild options every bundle of the producer shares.
 */
import type { BuildOptions, Plugin } from 'esbuild';
import path from 'node:path';
import { REPO, SRC, WEB } from '../paths.ts';

/** The packages whose one instance lives in the page's bundle, each under a namespace of `window.Nemia`: a story reaches that one. */
export const SHARED: Readonly<Record<string, string>> = {
  'react-aria-components': 'Aria',
  '@tanstack/react-router': 'Router',
  '@tanstack/react-query': 'Query',
  '@internationalized/date': 'Dates',
  '@xyflow/react': 'Flow',
  objects: 'Objects',
};

const JSX_SHIM = `
const R = window.React;
const held = new WeakMap();
const holderOf = (type) => {
  let holder = held.get(type);
  if (!holder) {
    holder = (props) => { const { __ref, ...rest } = props; return type({ ...rest, ref: __ref }); };
    holder.displayName = type.displayName || type.name;
    held.set(type, holder);
  }
  return holder;
};
const plain = (type) => typeof type === "function" && !(type.prototype && type.prototype.isReactComponent);
const jsx = (type, props, key) => {
  const { children, ...rest } = props || {};
  if (key !== undefined) rest.key = key;
  let drawn = type;
  if (rest.ref !== undefined && plain(type)) { rest.__ref = rest.ref; delete rest.ref; drawn = holderOf(type); }
  if (children === undefined) return R.createElement(drawn, rest);
  return Array.isArray(children) ? R.createElement(drawn, rest, ...children) : R.createElement(drawn, rest, children);
};
module.exports = { jsx, jsxs: jsx, jsxDEV: jsx, Fragment: R.Fragment };
`;

const REACT_SHIM = `
const R = window.React;
const useEffectEvent = (fn) => {
  const ref = R.useRef(fn);
  R.useInsertionEffect(() => { ref.current = fn; });
  return R.useCallback((...given) => ref.current(...given), []);
};
const use = (what) => {
  if (what && what.$$typeof === Symbol.for("react.context")) return R.useContext(what);
  throw new Error("use() of a promise is not shimmed on React 18: read the promise through a query instead");
};
module.exports = { ...R, useEffectEvent: R.useEffectEvent || useEffectEvent, use: R.use || use, default: R };
`;

/** React, ReactDOM and the JSX runtime, resolved to the page's globals. */
export const pageGlobals: Plugin = {
  name: 'page-globals',
  setup(build) {
    build.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ }, (asked) => ({
      path: asked.path,
      namespace: 'page-global',
    }));
    build.onLoad({ filter: /.*/, namespace: 'page-global' }, (asked) => {
      if (asked.path === 'react') return { contents: REACT_SHIM, loader: 'js' };
      if (asked.path.startsWith('react-dom')) return { contents: 'module.exports = window.ReactDOM;', loader: 'js' };
      return { contents: JSX_SHIM, loader: 'js' };
    });
  },
};

/** The options every bundle shares: one minified browser script, the board's `@/` alias, its CSS imports left to the stylesheet. */
export const esbuildBase = {
  bundle: true,
  minify: true,
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': '"production"',
  },
  alias: { '@': SRC },
  nodePaths: [path.join(WEB, 'node_modules'), path.join(REPO, 'node_modules')],
  write: false,
  logLevel: 'warning',
  legalComments: 'none',
  loader: { '.css': 'empty' },
} satisfies BuildOptions;

/** A regular expression's literal for `text`, every character it reads as syntax escaped. */
export const literal = (text: string) => text.replace(/[/.*+?^${}()|[\]\\-]/g, '\\$&');
