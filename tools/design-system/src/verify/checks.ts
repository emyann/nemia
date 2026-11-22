/**
 * Two checks of what a canvas gets from the artifact alone. The faces: a page that links `components/bundle.css` and nothing else sets
 * a line in each face, and every face must load from `fonts/` by the address the stylesheet gives, under the family name the code's
 * stacks ask for. The icons: a page that loads React 18, the stylesheet and the script mounts every member of `Nemia.Icons`, an
 * `IconButton` and a `NavigationRail` given them, and each must draw. Each writes its picture and returns its faults.
 */
import path from 'node:path';
import { chromium } from 'playwright';
import type { Face } from '../stylesheet/fonts.ts';
import { serve } from './serve.ts';

/** The faces' page: one line set in each face, with the stylesheet alone. */
const facesPage = (faces: readonly Face[]) => {
  const lines = faces.map((face, i) => {
    const weight = face.weight.split(' ').at(-1) === '900' ? 800 : Number(face.weight);
    const stretch = face.stretch ? 'font-stretch:125%;' : '';
    return `<p id="f${i}" style="margin:0 0 12px;font:${weight} 28px '${face.family}', monospace;${stretch}">${face.family} ${weight} &mdash; Hardware is cut 0123</p>`;
  });
  return `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="components/bundle.css"></head>
<body style="margin:0;padding:24px;background:#111;color:#eee">${lines.join('\n')}</body></html>`;
};

/**
 * The faces' faults: a face that did not load, a file not fetched or answered otherwise than 200, a request outside the server.
 * @param project the artifact's folder.
 * @param shots the folder its picture is written to.
 * @param faces the faces the stylesheet declares.
 */
export const checkFaces = async (project: string, shots: string, faces: readonly Face[]) => {
  const { base, close } = await serve(project, { '/project/check.html': facesPage(faces) });
  const browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 960, height: 420 } });
  const fetched: string[] = [];
  const outside: string[] = [];
  tab.on(
    'response',
    (response) => response.url().endsWith('.woff2') && fetched.push(`${response.status()} ${new URL(response.url()).pathname}`),
  );
  tab.on('request', (request) => !request.url().startsWith(`${base}/`) && outside.push(request.url()));
  await tab.goto(`${base}/project/check.html`, { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  const loaded = await tab.evaluate(() =>
    [...document.fonts].filter((face) => face.status === 'loaded').map((face) => `${face.family.replace(/"/g, '')} ${face.weight}`),
  );
  await tab.screenshot({ path: path.join(shots, 'faces.png') });
  await browser.close();
  await close();
  const missing = faces.map((face) => `${face.family} ${face.weight}`).filter((face) => !loaded.includes(face));
  return [
    ...missing.map((face) => `the face ${face} did not load from bundle.css alone: check its @font-face and its file under fonts/`),
    ...outside.map((url) => `the faces' page asked outside the artifact for ${url}: keep every face's file under fonts/`),
    ...(fetched.length !== faces.length || fetched.some((line) => !line.startsWith('200 '))
      ? [
          `the faces' page fetched ${fetched.length} face files of ${faces.length} (${fetched.join(', ')}): each face's file must answer 200`,
        ]
      : []),
  ];
};

const ICONS_PAGE = `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">
<link rel="stylesheet" href="/project/components/bundle.css">
<script src="/lib/react.js"></script><script src="/lib/react-dom.js"></script><script src="/project/components/bundle.js"></script>
</head><body style="margin:0;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface)"><div id="root"></div>
<script>
const h = React.createElement, N = window.Nemia, I = N.Icons;
const names = Object.keys(I).sort();
const rail = names.slice(0, 5).map((n) => ({ id: n, label: n, icon: I[n] }));
ReactDOM.createRoot(document.getElementById("root")).render(
  h("div", { style: { display: "flex", gap: 24, padding: 24 } },
    h(N.NavigationRail, { items: rail, defaultSelectedKey: names[1], "aria-label": "Board" }),
    h("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
      h("div", { style: { display: "flex", gap: 8 } },
        h(N.IconButton, { icon: I[names[5]], "aria-label": "Settings" }),
        h(N.IconButton, { icon: I[names[6]], variant: "tonal", "aria-label": "Bell" }),
        h(N.IconButton, { icon: I[names[7]], variant: "outlined", "aria-label": "Star" }),
        h(N.Button, { icon: I[names[8]], variant: "filled" }, "Start")),
      h("div", { id: "all", style: { display: "grid", gridTemplateColumns: "repeat(7, 96px)", gap: 8 } },
        names.map((n) => h("div", { key: n, style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, font: "11px var(--font-share-tech-mono)" } }, h(I[n], { size: 24 }), n))))));
</script></body></html>`;

/**
 * The icons' faults: an icon of the board missing from `Nemia.Icons` or one it has beyond them, an icon that does not draw, a rail or
 * a button that draws none, an error the page logged.
 * @param project the artifact's folder.
 * @param shots the folder its picture is written to.
 * @param icons the icons the board imports.
 */
export const checkIcons = async (project: string, shots: string, icons: readonly string[]) => {
  const { base, close } = await serve(project, { '/check/icons.html': ICONS_PAGE });
  const browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 960, height: 760 } });
  const errors: string[] = [];
  tab.on('pageerror', (error) => errors.push(String(error)));
  tab.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await tab.goto(`${base}/check/icons.html`, { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  await tab
    .waitForFunction(() => document.querySelectorAll('#all svg.lucide').length > 0, null, { timeout: 30_000 })
    .catch(() => undefined);
  const seen = await tab.evaluate(() => ({
    names: Object.keys((window as unknown as { Nemia: { Icons: object } }).Nemia.Icons).toSorted(),
    drawn: document.querySelectorAll('#all svg.lucide').length,
    rail: document.querySelectorAll('nav svg.lucide').length,
    buttons: document.querySelectorAll('[data-slot=icon-button] svg.lucide').length,
  }));
  await tab.screenshot({ path: path.join(shots, 'icons.png'), fullPage: true });
  await browser.close();
  await close();
  const missing = icons.filter((name) => !seen.names.includes(name));
  const extra = seen.names.filter((name) => !icons.includes(name));
  return [
    ...(missing.length || extra.length
      ? [
          `Nemia.Icons lacks ${missing.join(', ') || 'none'} and has beyond the board's ${extra.join(', ') || 'none'}: build icons.ts from the board again`,
        ]
      : []),
    ...(seen.drawn !== icons.length ? [`${seen.drawn} of ${icons.length} icons drew on the icons' page: read its picture, icons.png`] : []),
    ...(seen.rail < 5 || seen.buttons < 3 ? ["the rail or the icon buttons drew no icon from Nemia.Icons: read the icons' picture"] : []),
    ...errors.map((error) => `the icons' page logged: ${error.slice(0, 200)}`),
  ];
};
