/**
 * `components/bundle.js`: one classic script that sets `window.Nemia` on the page's React 18, bundled by esbuild from the generated
 * entry, its header (`@ds-bundle`) listing the components that have a card, each refused unless the bundle exports it.
 */
import * as esbuild from 'esbuild';
import { inlinable } from './guards.ts';
import { esbuildBase, pageGlobals } from './page.ts';

/**
 * The bundle's body, minified and inlinable, and the names it exports.
 * @param entry the generated entry.
 */
export const bundleOf = async (entry: string) => {
  const shared = { ...esbuildBase, entryPoints: [entry], plugins: [pageGlobals] };
  const iife = await esbuild.build({ ...shared, format: 'iife', globalName: 'Nemia' });
  const [script] = iife.outputFiles;
  if (iife.outputFiles.length !== 1 || !script) throw new Error(`the bundle came out as ${iife.outputFiles.length} files, not one`);
  const named = await esbuild.build({ ...shared, format: 'esm', metafile: true, outfile: 'named.js' });
  const exported = Object.values(named.metafile.outputs)[0]?.exports.toSorted() ?? [];
  return { body: inlinable(script.text.trimEnd(), 'bundle.js'), exported };
};

/**
 * The script as the artifact holds it: its header listing `listed`, the body, and the global set on the window.
 * @param body the bundle's body.
 * @param listed the components that have a card.
 * @param exported the names the bundle exports.
 */
export const scriptOf = (body: string, listed: readonly string[], exported: readonly string[]) => {
  const absent = listed.filter((name) => !exported.includes(name));
  if (absent.length)
    throw new Error(
      `${absent.join(', ')} has a card but the bundle exports no component of that name: export it from the look's door or beside its story`,
    );
  const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: 'Nemia', components: listed.map((name) => ({ name })) })} */`;
  return `${header}\n${body}\nwindow.Nemia=Nemia;\n`;
};
