/**
 * The contrast of every text a rendered page shows, measured in the page: the board's own measure, kept beside its e2e.
 *
 * `measure` reads each visible text's ink and the ground it is drawn on as sRGB off a canvas pixel, whatever space the stylesheet
 * writes them in (oklch, `color-mix`), composites what is translucent over what is under it, and answers one row per pair of colours.
 * `photograph` (board.ts) writes the rows beside each picture when the e2e runs with `--contrast`, and `contrast-report.ts` makes the
 * table of them. The bar is `BAR` for every text, with no relief for a large one.
 *
 * What it does not see: a state no picture reaches (a hover, a focus); the text of a pseudo-element; a shape of an SVG under a text.
 * A cut frame's ground is read from its own layer (`data-cut-ground`), which is no ancestor of what the frame holds. A ground under
 * a grain, a tile of one colour whose specks come and go, is measured twice: plain, and at the grain's far end, the speck at its
 * strongest `GRAIN_TAIL` of the tile laid over the ground, a row that says `grained`. A ground drawn by any other
 * `background-image` is answered `unmeasured`, never passed. A text made fainter by an `opacity` is measured as blended into its
 * ground, and its row says `faded`.
 */
import type { Locator, Page } from 'playwright';

/** The least ratio a text has against its ground: WCAG's 4.5:1, asked of every text. */
export const BAR = 4.5;

/**
 * How much of a grain's tile its far end leaves out: the speck is read at the strength only this share of the tile's pixels is past.
 * No eye reads the one strongest pixel of a tile.
 */
export const GRAIN_TAIL = 0.02;

/** A colour as sRGB: red, green and blue from 0 to 255. */
export type Rgb = readonly [number, number, number];

const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** A colour's relative luminance, as WCAG 2 defines it. */
export const luminance = ([r, g, b]: Rgb): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** The contrast ratio of two colours, from 1 to 21, whichever is the lighter. */
export function ratio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** A colour as the six digits a stylesheet writes. */
export const hex = (rgb: Rgb): string => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/**
 * One pair of colours a page shows text in. `state`: `measured`; `unmeasured`, with `why`, where the ground cannot be read; `exempt`
 * for the text of a disabled control, which WCAG asks nothing of. `grained` says the ground is a grain's far end, the same text having
 * a row against the plain ground too. `count` is how many texts share the pair, `text` and `classes` one of them, to find it by.
 */
export interface Pair {
  readonly state: 'measured' | 'unmeasured' | 'exempt';
  readonly ink: Rgb;
  readonly ground: Rgb;
  readonly faded: boolean;
  readonly grained: boolean;
  readonly why?: string;
  readonly text: string;
  readonly classes: string;
  readonly count: number;
}

/** What `measure` answers for one picture: the scheme the page was in, and its pairs. */
export interface Measured {
  readonly scheme: 'light' | 'dark';
  readonly pairs: readonly Pair[];
}

/** A measured pair's ratio, to two decimals as the table says it. */
export const ratioOf = (pair: Pair): number => Math.floor(ratio(pair.ink, pair.ground) * 100) / 100;

/** Whether a pair fails the bar: measured, and under it. */
export const under = (pair: Pair): boolean => pair.state === 'measured' && ratioOf(pair) < BAR;

/** A grain's tile as a page draws it: the one colour of its specks, and their strength, from 0 to 1, at the tile's far end. */
interface Grain {
  readonly speck: readonly [number, number, number];
  readonly alpha: number;
}

/** The grains a page draws, each by the `background-image` a computed style says it as. */
type Grains = Readonly<Record<string, Grain>>;

type Rgb3 = [number, number, number];
type Rgba = [number, number, number, number];

/** What a text stands on: its `ground`, the `far` end of a grain over it if it has one, `why` it cannot be read, and its opacity. */
interface Ground {
  readonly ground: Rgb3;
  readonly far?: Rgb3;
  readonly why?: string;
  readonly opacity: number;
}

/** What reads a page's colours, living in the page: a colour as it paints, one laid over another, and the ground under an element. */
interface Reader {
  readonly rgba: (color: string) => Rgba;
  readonly over: (top: Rgba, under: Rgb3) => Rgb3;
  readonly groundOf: (el: Element) => Ground;
}

/**
 * Every pair of colours the texts under `target` are drawn in: a page's whole body, or what a locator finds. Runs in the page, and
 * changes nothing in it.
 */
export async function measure(target: Page | Locator): Promise<Measured> {
  const root = 'viewportSize' in target ? target.locator('body') : target;
  const grains = await root.evaluate(grainsIn, GRAIN_TAIL);
  const reader = await root.evaluateHandle(readerIn, grains);
  try {
    return await root.evaluate(inPage, reader);
  } finally {
    await reader.dispose();
  }
}

/**
 * The grains of the document `root` is in, serialised into the page: each `background-image` that is one tile written as an SVG in
 * the address itself, drawn once and read pixel by pixel. A tile is a grain when every pixel it paints is one colour; its strength
 * is the one only `tail` of its pixels are past. A tile of several colours, or one that cannot be drawn or read, is none.
 */
async function grainsIn(root: Element, tail: number): Promise<Record<string, Grain>> {
  const images = new Set<string>();
  for (const el of Array.from(root.ownerDocument.querySelectorAll('*'))) {
    const image = getComputedStyle(el).backgroundImage;
    if (image.startsWith('url("data:image/svg+xml')) images.add(image);
  }
  const found: Record<string, Grain> = {};
  for (const image of images) {
    const address = /^url\("((?:[^"\\]|\\.)*)"\)$/.exec(image)?.[1]?.replace(/\\(.)/g, '$1');
    if (!address) continue;
    const tile = new Image();
    tile.src = address;
    const drawn = await tile.decode().then(
      () => tile.naturalWidth > 0 && tile.naturalHeight > 0,
      () => false,
    );
    if (!drawn) continue;
    const canvas = document.createElement('canvas');
    canvas.width = tile.naturalWidth;
    canvas.height = tile.naturalHeight;
    const sheet = canvas.getContext('2d', { willReadFrequently: true })!;
    sheet.drawImage(tile, 0, 0);
    let data: Uint8ClampedArray;
    try {
      data = sheet.getImageData(0, 0, canvas.width, canvas.height).data;
    } catch {
      continue;
    }
    const at = (i: number): number => data[i] ?? 0;
    const alphas = new Uint8Array(data.length / 4);
    let top = 0;
    for (let i = 0; i < data.length; i += 4) {
      alphas[i / 4] = at(i + 3);
      if (at(i + 3) > at(top + 3)) top = i;
    }
    const speck = [at(top), at(top + 1), at(top + 2)] as const;
    let one = at(top + 3) > 0;
    for (let i = 0; one && i < data.length; i += 4) {
      const slack = Math.ceil(255 / Math.max(1, at(i + 3))) + 1;
      one = at(i + 3) === 0 || speck.every((channel, c) => Math.abs(at(i + c) - channel) <= slack);
    }
    if (!one) continue;
    alphas.sort();
    const far = Math.min(alphas.length - 1, Math.floor(alphas.length * (1 - tail)));
    found[image] = { speck, alpha: (alphas[far] ?? 0) / 255 };
  }
  return found;
}

/**
 * The reader of a page's colours, serialised into the page and kept there: it reads no name of this file. Its `groundOf` composites
 * each ancestor's ground, a cut frame's from the layer that draws it, and carries the far end of a grain among `grains` up to the
 * text; a ground drawn by another image has a `why`.
 */
function readerIn(_root: Element, grains: Grains): Reader {
  const pixel = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  const parsed = new Map<string, Rgba>();
  const rgba = (color: string): Rgba => {
    const known = parsed.get(color);
    if (known) return known;
    pixel.clearRect(0, 0, 1, 1);
    pixel.fillStyle = color;
    pixel.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
    const read: Rgba = [r ?? 0, g ?? 0, b ?? 0, (a ?? 0) / 255];
    parsed.set(color, read);
    return read;
  };
  const over = (top: Rgba, under: Rgb3): Rgb3 => [
    top[0] * top[3] + under[0] * (1 - top[3]),
    top[1] * top[3] + under[1] * (1 - top[3]),
    top[2] * top[3] + under[2] * (1 - top[3]),
  ];
  const painted = (layer: Element, under: Ground): Ground => {
    const style = getComputedStyle(layer);
    const paint = rgba(style.backgroundColor);
    const ground = over(paint, under.ground);
    const through = paint[3] >= 1 ? {} : { far: under.far && over(paint, under.far), why: under.why };
    if (style.backgroundImage === 'none') return { ...through, ground, opacity: under.opacity };
    const grain = grains[style.backgroundImage];
    if (!grain) return { ground, why: 'its ground is a background-image', opacity: under.opacity };
    return { ...through, ground, far: over([...grain.speck, grain.alpha], through.far ?? ground), opacity: under.opacity };
  };
  const grounds = new Map<Element, Ground>();
  const groundOf = (el: Element): Ground => {
    const known = grounds.get(el);
    if (known) return known;
    const below: Ground = el.parentElement ? groundOf(el.parentElement) : { ground: [255, 255, 255], opacity: 1 };
    const own = Array.from(el.hasAttribute('data-cut-frame') ? el.querySelectorAll('[data-cut-ground]') : []).filter(
      (layer) => layer.closest('[data-cut-frame]') === el,
    );
    let drawn = painted(el, below);
    for (const layer of own) drawn = painted(layer, drawn);
    const found = { ...drawn, opacity: below.opacity * Number(getComputedStyle(el).opacity) };
    grounds.set(el, found);
    return found;
  };
  return { rgba, over, groundOf };
}

/** `measure`'s walk of the texts, serialised into the page: it reads no name of this file, and its colours through `reader`. */
function inPage(root: Element, { rgba, over, groundOf }: Reader): Measured {
  const rows = new Map<string, Pair & { count: number }>();
  const round = (c: Rgb3): Rgb => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
  const add = (el: Element, color: string, text: string): void => {
    const { ground, far, why, opacity } = groundOf(el);
    const paint = rgba(color);
    const disabled = el.closest('[disabled], [aria-disabled="true"], [data-disabled]') !== null;
    const state = disabled ? 'exempt' : why ? 'unmeasured' : 'measured';
    const classes = (el.getAttribute('class') ?? '').slice(0, 160);
    for (const under of far && !why ? [ground, far] : [ground]) {
      const ink = round(over([paint[0], paint[1], paint[2], paint[3] * opacity], under));
      const key = `${state}|${under === far}|${ink.join(',')}|${round(under).join(',')}|${classes}`;
      const row = rows.get(key);
      if (row) row.count += 1;
      else
        rows.set(key, {
          state,
          ink,
          ground: round(under),
          faded: opacity < 1,
          grained: under === far,
          ...(state === 'unmeasured' && { why }),
          text: text.trim().replace(/\s+/g, ' ').slice(0, 60),
          classes,
          count: 1,
        });
    }
  };
  const shown = (el: Element): boolean => {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;
    const box = el.getBoundingClientRect();
    return box.width > 1 && box.height > 1;
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    const text = node.nodeValue ?? '';
    if (!el || !text.trim() || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(el.tagName) || !shown(el)) continue;
    range.selectNodeContents(node);
    if (!range.getClientRects().length) continue;
    const style = getComputedStyle(el);
    const drawn = el instanceof SVGElement ? style.fill : style.webkitTextFillColor || style.color;
    add(el, drawn, text);
  }
  for (const field of Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))) {
    if (!shown(field) || ['checkbox', 'radio', 'hidden', 'file', 'range', 'color'].includes(field.type)) continue;
    if (field.value) add(field, getComputedStyle(field).color, field.value);
    else if (field.placeholder) add(field, getComputedStyle(field, '::placeholder').color, field.placeholder);
  }
  return { scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', pairs: [...rows.values()] };
}

/** One picture's measure as the report reads it: the picture's file name, beside what was measured. */
export interface Sheet extends Measured {
  readonly picture: string;
}

const line = (cells: readonly (string | number)[]): string => `| ${cells.join(' | ')} |`;
const escaped = (text: string): string => text.replace(/\|/g, '\\|').replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'));
const pageOf = (picture: string): string => picture.replace(/-(?:light|dark)\.png$/, '');

/** A pair's ground as the table says it: its six digits, and that it is a grain's far end where it is. */
const groundSaid = (pair: Pair): string => (pair.grained ? `${hex(pair.ground)} (grain)` : hex(pair.ground));

/**
 * Each measured pair of `sheets` whose ground is a grain's far end, once per scheme and colours, with how many texts stand on it,
 * least ratio first.
 */
export function grainedOf(sheets: readonly Sheet[]): Array<{ pair: Pair; scheme: string; texts: number }> {
  const found = new Map<string, { pair: Pair; scheme: string; texts: number }>();
  for (const sheet of sheets)
    for (const pair of sheet.pairs.filter((each) => each.grained && each.state === 'measured')) {
      const key = `${sheet.scheme}|${hex(pair.ink)}|${hex(pair.ground)}`;
      const row = found.get(key) ?? { pair, scheme: sheet.scheme, texts: 0 };
      row.texts += pair.count;
      found.set(key, row);
    }
  return [...found.values()].sort((a, b) => ratioOf(a.pair) - ratioOf(b.pair));
}

/** Every failing pair of `sheets`, once per scheme, colours and classes, with the pictures that show it, worst first. */
export function failing(sheets: readonly Sheet[]): Array<{ pair: Pair; scheme: string; pictures: string[] }> {
  const found = new Map<string, { pair: Pair; scheme: string; pictures: string[] }>();
  for (const sheet of sheets)
    for (const pair of sheet.pairs.filter(under)) {
      const key = `${sheet.scheme}|${pair.grained}|${hex(pair.ink)}|${hex(pair.ground)}|${pair.classes}`;
      const row = found.get(key) ?? { pair, scheme: sheet.scheme, pictures: [] };
      row.pictures.push(sheet.picture);
      found.set(key, row);
    }
  return [...found.values()].sort((a, b) => ratioOf(a.pair) - ratioOf(b.pair));
}

/**
 * The table of `sheets` as markdown: the totals, a row per picture and scheme (pairs measured, under the bar, unmeasured, exempt), then
 * each failing pair with its colours, a text, its classes and its pictures, what could not be measured, and each pair read at a
 * grain's far end.
 */
export function tableOf(sheets: readonly Sheet[]): string {
  const sorted = [...sheets].sort((a, b) => (a.picture < b.picture ? -1 : 1));
  const count = (sheet: Sheet, state: Pair['state']) => sheet.pairs.filter((pair) => pair.state === state).length;
  const total = (of: (sheet: Sheet) => number) => sorted.reduce((sum, sheet) => sum + of(sheet), 0);
  const failures = failing(sorted);
  const grained = grainedOf(sorted);
  const unmeasured = sorted.flatMap((sheet) => sheet.pairs.filter((pair) => pair.state === 'unmeasured').map((pair) => ({ sheet, pair })));
  return [
    '# Contrast of every text pair, as rendered',
    '',
    `The bar is ${BAR}:1 for every text. ${sorted.length} pictures measured: ${total((s) => count(s, 'measured'))} pairs, ` +
      `${total((s) => s.pairs.filter(under).length)} under the bar (${failures.length} distinct), ` +
      `${total((s) => count(s, 'unmeasured'))} unmeasured, ${total((s) => count(s, 'exempt'))} exempt (a disabled control), ` +
      `${total((s) => s.pairs.filter((pair) => pair.faded).length)} faded by an opacity and measured blended, ` +
      `${total((s) => s.pairs.filter((pair) => pair.grained).length)} at a grain's far end (${grained.length} distinct).`,
    '',
    '## Under the bar',
    '',
    ...(failures.length
      ? [
          line(['ratio', 'scheme', 'ink', 'ground', 'text', 'classes', 'pictures']),
          line(['---', '---', '---', '---', '---', '---', '---']),
          ...failures.map(({ pair, scheme, pictures }) =>
            line([
              ratioOf(pair).toFixed(2),
              scheme,
              hex(pair.ink),
              groundSaid(pair),
              escaped(pair.text),
              `\`${escaped(pair.classes)}\``,
              `${pictures.slice(0, 3).join(', ')}${pictures.length > 3 ? ` and ${pictures.length - 3} more` : ''}`,
            ]),
          ),
        ]
      : ['None.']),
    '',
    '## Each picture',
    '',
    line(['page', 'scheme', 'picture', 'measured', 'least', 'under', 'unmeasured', 'exempt']),
    line(['---', '---', '---', '---', '---', '---', '---', '---']),
    ...sorted.map((sheet) => {
      const ratios = sheet.pairs.filter((pair) => pair.state === 'measured').map(ratioOf);
      return line([
        pageOf(sheet.picture),
        sheet.scheme,
        sheet.picture,
        ratios.length,
        ratios.length ? Math.min(...ratios).toFixed(2) : '—',
        sheet.pairs.filter(under).length,
        count(sheet, 'unmeasured'),
        count(sheet, 'exempt'),
      ]);
    }),
    '',
    '## Unmeasured',
    '',
    ...(unmeasured.length
      ? unmeasured.map(({ sheet, pair }) => `- ${sheet.picture}: “${escaped(pair.text)}” — ${pair.why ?? 'unread'}`)
      : ['None.']),
    '',
    '## On a grain',
    '',
    ...(grained.length
      ? [
          line(['ratio', 'scheme', 'ink', 'ground at the far end', 'texts', 'a text']),
          line(['---', '---', '---', '---', '---', '---']),
          ...grained.map(({ pair, scheme, texts }) =>
            line([ratioOf(pair).toFixed(2), scheme, hex(pair.ink), hex(pair.ground), texts, escaped(pair.text)]),
          ),
        ]
      : ['None.']),
    '',
  ].join('\n');
}

/** A page of `pictures` for a person: each page's light picture beside its dark one, by name. */
export function lookOf(pictures: readonly string[]): string {
  const pages = [...new Set(pictures.map(pageOf))].sort();
  const cell = (page: string, scheme: string) =>
    pictures.includes(`${page}-${scheme}.png`)
      ? `<a href="${page}-${scheme}.png"><img loading="lazy" src="${page}-${scheme}.png"></a>`
      : '';
  return [
    '<!doctype html><meta charset="utf-8"><title>The look, every page, light then dark</title>',
    '<style>body{font:14px system-ui;margin:16px;background:#222;color:#eee}section{margin:0 0 32px}',
    'div{display:grid;grid-template-columns:1fr 1fr;gap:8px}img{width:100%;border:1px solid #555}</style>',
    ...pages.map((page) => `<section><h2>${page}</h2><div>${cell(page, 'light')}${cell(page, 'dark')}</div></section>`),
    '',
  ].join('\n');
}
