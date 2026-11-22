/**
 * Each card's `components/<Card>/preview.html`: a page whose script draws the card's stories (`runner.ts`) on the page's bundle, its
 * first line the artifact's marker (`@dsCard`, the card's group and the height it is shown at). A board card is one story file, its
 * stories drawn under `NemiaRoot` where their fate is a card; a kit card draws the stories the kit's map picks, as they are; a text
 * primitive draws its three sizes. A picture a story takes from a photo site is replaced by a drawn one, and the kit's motion library
 * draws its parts still.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import type { Plugin } from 'esbuild';
import { SRC } from '../paths.ts';
import { esbuildBase, pageGlobals } from '../bundle/page.ts';
import { inlinable } from '../bundle/guards.ts';
import { seams } from '../bundle/seams.ts';
import { KIT_MAP, type Drawn } from '../kit/cards.ts';

/** A card of the artifact: its name, its group, whether it is the board's, the story files it draws, and whether it is a page. */
export type Card = {
  readonly name: string;
  readonly group: string;
  readonly rooted: boolean;
  readonly page: boolean;
  readonly files: readonly Pick<Drawn, 'file' | 'shown'>[];
};

/** The largest page a card may be, in bytes. */
const PAGE_CAP = 256 * 1024;

const OUTSIDE_PICTURE = /https:\/\/(?:images\.unsplash\.com|picsum\.photos|placehold\.co)\/[^"'`\s)]+/g;

const PICTURE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320" preserveAspectRatio="xMidYMid slice"><rect width="480" height="320" fill="#aab4c3"/><circle cx="356" cy="92" r="34" fill="#dfe5ee"/><path d="M0 320 150 150l86 96 62-58 182 132z" fill="#7b8798"/><path d="M0 320 92 232l70 56 96-84 222 116z" fill="#5d6878"/></svg>',
)}`;

const STILL = `
const R = window.React;
const MOVES = ["initial","animate","exit","transition","variants","whileHover","whileTap","whileFocus","whileInView","layout"];
const made = {};
const still = (tag) => R.forwardRef((props, ref) => { const rest = { ...props, ref }; for (const k of MOVES) delete rest[k]; return R.createElement(tag, rest); });
export const motion = new Proxy({}, { get: (_, tag) => (made[tag] ??= still(tag)) });
export const AnimatePresence = ({ children }) => R.createElement(R.Fragment, null, children);
`;

/** The runner, by its file; the prover's `spec` stood in by the identity, as the contract's laws are no card's. */
const RUNNER = path.join(import.meta.dirname, 'runner.ts');

/** Replaces a story's outside pictures by a drawn one. */
const pictures: Plugin = {
  name: 'outside-pictures',
  setup(build) {
    build.onLoad({ filter: /(\.stories\.tsx|\.storybook\/fixtures\/[a-zA-Z]+\.ts)$/ }, (asked) => ({
      contents: fs.readFileSync(asked.path, 'utf8').replace(OUTSIDE_PICTURE, PICTURE),
      loader: asked.path.endsWith('x') ? 'tsx' : 'ts',
    }));
  },
};

/** What a card's bundle reads beside its stories: the inert module and the bundle's export names. */
export type CardBuild = { readonly inert: string; readonly exported: readonly string[]; readonly kit: string };

/** The script of a card that draws stories. */
const storiesScript = async (card: Card, given: CardBuild) => {
  const entry = [
    `import { show } from ${JSON.stringify(RUNNER)};`,
    ...card.files.map(({ file }, i) => `import * as file${i} from ${JSON.stringify(file)};`),
    `show([${card.files.map(({ shown }, i) => `{ module: file${i}, shown: ${JSON.stringify(shown)} }`).join(', ')}], ${card.rooted});`,
  ].join('\n');
  const built = await esbuild.build({
    ...esbuildBase,
    stdin: {
      contents: entry,
      resolveDir: card.rooted ? path.join(SRC, 'components') : given.kit,
      sourcefile: `${card.name}.js`,
      loader: 'js',
    },
    format: 'iife',
    plugins: [
      pageGlobals,
      seams({
        inert: given.inert,
        kit: !card.rooted,
        exported: given.exported.filter((name) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)),
        extra: (virtual) => {
          virtual(/^framer-motion$/, () => STILL);
          virtual(/^@emyann\/tsverify$/, () => 'export const spec = (laws) => laws;');
        },
      }),
      pictures,
    ],
  });
  const [script] = built.outputFiles;
  if (!script) throw new Error(`${card.name}: esbuild wrote no script for its card`);
  return inlinable(script.text.trimEnd().replaceAll('</script', '<\\/script'), `${card.name}'s card`);
};

/** The script of a text primitive's card: its three sizes. */
const typeScript = (name: string) =>
  `(function(){var h=React.createElement,T=window.Nemia.${name};ReactDOM.createRoot(document.getElementById("root")).render(["large","medium","small"].map(function(s){return h("div",{key:s,className:"cell","data-wide":""},h("span",{className:"name"},s),h(T,{size:s},"${name} "+s))}));window.__cells=[];window.__drawn=true})();`;

/**
 * A card's script.
 * @param card the card.
 * @param given what its bundle reads beside its stories.
 */
export const cardScript = (card: Card, given: CardBuild) =>
  card.files.length === 0 ? Promise.resolve(typeScript(card.name)) : storiesScript(card, given);

const STYLE = [
  'body { margin: 0; background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); font-family: var(--font-barlow); }',
  '#root { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 24px 32px; padding: 24px; }',
  '.cell { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; }',
  '.cell[data-wide] { flex: 1 1 100%; display: block; }',
  '.cell[data-wide] > .name { display: block; margin-bottom: 8px; }',
  '.cell > .name { font: 600 11px/16px var(--font-chakra-petch); letter-spacing: 0.06em; text-transform: uppercase; color: var(--md-sys-color-on-surface-variant); }',
].join('\n');

/** A part of the board that fills the window (`100svh` less the bars) is drawn 560 px tall, as a card is as tall as what it holds. */
const WINDOW = [
  '.cell [class*="h-[calc(100svh"] { height: 560px; }',
  '.cell [class*="max-h-[calc(100svh"] { height: auto; max-height: 560px; }',
  '.cell .min-h-svh { min-height: 560px; }',
].join('\n');

/** The style of a card's page. */
const styleOf = (card: Card) => {
  const screen = KIT_MAP.SCREEN[card.name];
  if (screen) return `${STYLE}\n.cell .h-screen { height: ${screen}px; }`;
  return card.rooted ? `${STYLE}\n${WINDOW}` : STYLE;
};

/**
 * A card's page, refused past its cap.
 * @param card the card.
 * @param script its script.
 * @param height the height it is shown at.
 */
export const pageOf = (card: Card, script: string, height: number) => {
  const marker = `<!-- @dsCard group="${card.group}" height=${height}${card.page ? ' page' : ''} -->`;
  const page = [
    marker,
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${card.name}</title>`,
    '<style>',
    styleOf(card),
    '</style>',
    '</head>',
    '<body>',
    '<div id="root"></div>',
    '<script>',
    script,
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
  if (Buffer.byteLength(page) > PAGE_CAP)
    throw new Error(
      `${card.name}'s card is ${Buffer.byteLength(page)} bytes, over the ${PAGE_CAP} a card may be: move what its stories import into the bundle`,
    );
  return page;
};

/**
 * The height a card is shown at: what the verification measured, at least what the kit's map gives it room for.
 * @param name the card's name.
 * @param measured what the verification measured, if it has.
 */
export const heightOf = (name: string, measured: number | undefined) => Math.max(measured ?? 320, KIT_MAP.ROOM[name] ?? 0);
