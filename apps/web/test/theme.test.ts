import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { COMPONENT_TOKENS } from '../src/components/ui/ds/tokens/design-md.mjs';

const web = path.resolve(import.meta.dirname, '..');
const GENERATED = ['theme.css', 'theme.v4.css', 'DESIGN.resolved.md'] as const;

/** A file of an installed package, from the nearest `node_modules` above the board that has it. */
const installed = (file: string) => {
  for (let dir = web; ; dir = path.dirname(dir)) {
    const found = path.join(dir, 'node_modules', file);
    if (fs.existsSync(found)) return found;
    assert.notEqual(path.dirname(dir), dir, `${file} is installed`);
  }
};

/** The kit's generator run on `design` into a new folder: the folder, and what it said. */
const generated = (design: string) => {
  const out = path.join(scratch('web-theme-'), 'theme');
  const generator = path.join(web, 'src', 'components', 'ui', 'ds', 'tokens', 'generate-theme.mjs');
  const ran = spawnSync(process.execPath, ['--import', 'tsx', generator, design, '--out', out], { cwd: web, encoding: 'utf8' });
  assert.equal(ran.status, 0, ran.stderr);
  return { out, said: `${ran.stdout}${ran.stderr}` };
};

/** The generated files in `out` that are not, byte for byte, the board's own. */
const stale = (out: string) =>
  GENERATED.filter((name) => fs.readFileSync(path.join(out, name), 'utf8') !== fs.readFileSync(path.join(web, 'theme', name), 'utf8'));

/** How many errors and warnings the kit's lint finds in `design`. */
const findings = (design: string) => {
  const ran = spawnSync(process.execPath, [installed('@google/design.md/dist/index.js'), 'lint', design], { cwd: web, encoding: 'utf8' });
  const { summary } = JSON.parse(ran.stdout) as { summary: { errors: number; warnings: number } };
  return summary.errors + summary.warnings;
};

describe("the theme: the generator's output for the board's DESIGN.md, linted, following the system, with its mono face and its tracking", () => {
  test("the theme is the generator's output for the board's DESIGN.md, with no warning — a DESIGN.md changed and not regenerated is refused", () => {
    const { out, said } = generated(path.join(web, 'DESIGN.md'));
    assert.equal(stale(out).length, 0, `regenerate the theme: ${stale(out).join(', ')}`);
    assert.match(said, /\(0 warnings\)/);
    assert.doesNotMatch(said, /warning:/i);
    assert.doesNotMatch(fs.readFileSync(path.join(web, 'theme', 'DESIGN.resolved.md'), 'utf8'), /^\s*warning:/im);

    const look = fs.readFileSync(path.join(web, 'DESIGN.md'), 'utf8');
    assert.ok(look.includes('primary: "#f5e61a"'), 'the fixture changes a colour the look writes');
    const other = path.join(scratch('web-theme-'), 'DESIGN.md');
    fs.writeFileSync(other, look.replace('primary: "#f5e61a"', 'primary: "#c5e61a"'));
    assert.ok(stale(generated(other).out).includes('theme.css'), 'another primary generates another theme.css');
  });
  test('the board follows the system between light and dark, as its stylesheet and React Flow do', () => {
    assert.match(fs.readFileSync(path.join(web, 'DESIGN.md'), 'utf8'), /--md3-dark-mode:\s*system;/);
    assert.match(fs.readFileSync(path.join(web, 'theme', 'theme.css'), 'utf8'), /@media \(prefers-color-scheme: dark\)/);
  });
  test("the DESIGN.md and its resolved copy pass the kit's lint with no error and no warning — a colour that is none is found", () => {
    assert.equal(findings(path.join(web, 'DESIGN.md')), 0);
    assert.equal(findings(path.join(web, 'theme', 'DESIGN.resolved.md')), 0);
    const broken = path.join(scratch('web-theme-'), 'DESIGN.md');
    fs.writeFileSync(broken, '---\nname: Broken\ncolors:\n  primary: "nope"\n---\n');
    assert.ok(findings(broken) > 0, 'the lint finds a colour that is no colour');
  });
  test('the look names a mono face, and the theme reads it — a DESIGN.md that names none gives the system stack', () => {
    const hooked = /--md-sys-typescale-mono-font:\s*var\(--font-[a-z0-9-]+\)/;
    assert.match(fs.readFileSync(path.join(web, 'theme', 'theme.v4.css'), 'utf8'), hooked);

    const look = fs.readFileSync(path.join(web, 'DESIGN.md'), 'utf8');
    const named = /\n {2}mono:\s*\n {4}fontFamily:[^\n]*/;
    assert.match(look, named, 'the fixture cuts the mono face the look names');
    const other = path.join(scratch('web-theme-'), 'DESIGN.md');
    fs.writeFileSync(other, look.replace(named, ''));
    const { out } = generated(other);
    assert.doesNotMatch(fs.readFileSync(path.join(out, 'theme.v4.css'), 'utf8'), hooked);
    assert.ok(stale(out).includes('theme.v4.css'), 'a look with no mono face generates another theme.v4.css');
  });
  test('each label role is tracked for what it mostly draws: a button and a tag by six hundredths of an em, a heading by a tenth', () => {
    const theme = fs.readFileSync(path.join(web, 'theme', 'theme.v4.css'), 'utf8');
    const tracked = Object.fromEntries(
      ['large', 'medium', 'small'].map((size) => [
        size,
        theme.match(new RegExp(`--md-sys-typescale-label-${size}-tracking:\\s*([^;]+);`))?.[1],
      ]),
    );
    assert.equal(JSON.stringify(tracked), JSON.stringify({ large: '0.06em', medium: '0.06em', small: '0.1em' }));
  });
  test('REFUSED: a tracking on running text: the body roles and the two titles drawn in the plain face are untracked, so its joined letters hold', () => {
    const theme = fs.readFileSync(path.join(web, 'theme', 'theme.v4.css'), 'utf8');
    const tracked = Object.fromEntries(
      ['body-large', 'body-medium', 'body-small', 'title-medium', 'title-small'].map((role) => [
        role,
        theme.match(new RegExp(`--md-sys-typescale-${role}-tracking:\\s*([^;]+);`))?.[1],
      ]),
    );
    assert.equal(
      JSON.stringify(tracked),
      JSON.stringify({
        'body-large': '0px',
        'body-medium': '0px',
        'body-small': '0px',
        'title-medium': '0px',
        'title-small': '0px',
      }),
    );
  });
});

/** The kit's selected and active parts, each token pointed at a role: the text's ink, and `surface` where the ink is drawn upon. */
const INK = {
  '--md-comp-switch-selected-track-color': 'on-surface',
  '--md-comp-switch-selected-handle-color': 'surface',
  '--md-comp-switch-selected-hover-handle-color': 'surface-container-highest',
  '--md-comp-switch-selected-icon-color': 'on-surface',
  '--md-comp-checkbox-selected-container-color': 'on-surface',
  '--md-comp-checkbox-selected-icon-color': 'surface',
  '--md-comp-radio-button-selected-icon-color': 'on-surface',
  '--md-comp-slider-active-track-color': 'on-surface',
  '--md-comp-slider-active-handle-color': 'on-surface',
  '--md-comp-slider-active-stop-indicator-container-color': 'surface',
  '--md-comp-primary-navigation-tab-active-indicator-color': 'on-surface',
  '--md-comp-primary-navigation-tab-with-label-text-active-label-text-color': 'on-surface',
  '--md-comp-primary-navigation-tab-with-icon-active-icon-color': 'on-surface',
  '--md-comp-button-text-label-text-color': 'on-surface',
  '--md-comp-icon-button-standard-selected-icon-color': 'on-surface',
} as const;

/** The component tokens a block of theme.css writes, by name, each with the role it points at. */
const componentRolesIn = (css: string) =>
  Object.fromEntries([...css.matchAll(/(--md-comp-[a-z-]+):\s*var\(--md-sys-color-([a-z-]+)\)\s*;/g)].map((m) => [m[1], m[2]]));

/** The light scheme's component tokens and the dark one's, the dark scheme beginning at its media query. */
const schemesOf = (css: string) => {
  const at = css.indexOf('@media (prefers-color-scheme: dark)');
  return { light: componentRolesIn(css.slice(0, at)), dark: componentRolesIn(css.slice(at)) };
};

/** The component tokens `design` writes in its reference block, that its `## Where we differ from Material` section does not name. */
const undeparted = (design: string) => {
  const reference = design.slice(design.indexOf('## Reference CSS'));
  const written = [...reference.matchAll(/(--md-comp-[a-z-]+):/g)].map((m) => m[1]);
  const start = design.indexOf('## Where we differ from Material');
  const section = design.slice(start, design.indexOf('\n## ', start + 1));
  return written.filter((token) => !section.includes(token));
};

describe("the kit's selected parts are ink, by its component tokens", () => {
  test('each component token is written in both schemes of the theme, to its role', () => {
    assert.deepEqual(Object.keys(INK), Object.keys(COMPONENT_TOKENS));
    const { light, dark } = schemesOf(fs.readFileSync(path.join(web, 'theme', 'theme.css'), 'utf8'));
    assert.deepEqual(light, INK);
    assert.deepEqual(dark, INK);
  });
  test('REFUSED: a token cut and another pointed at primary is found in the generated theme', () => {
    const look = fs.readFileSync(path.join(web, 'DESIGN.md'), 'utf8');
    const cut = /^ *--md-comp-switch-selected-track-color:.*\n/m;
    const radio = '--md-comp-radio-button-selected-icon-color: var(--md-sys-color-on-surface);';
    assert.match(look, cut, 'the fixture cuts a token the look writes');
    assert.ok(look.includes(radio), 'the fixture changes a token the look writes');
    const other = path.join(scratch('web-theme-'), 'DESIGN.md');
    fs.writeFileSync(other, look.replace(cut, '').replace(radio, '--md-comp-radio-button-selected-icon-color: var(--md-sys-color-primary);'));
    const { light } = schemesOf(fs.readFileSync(path.join(generated(other).out, 'theme.css'), 'utf8'));
    assert.equal('--md-comp-switch-selected-track-color' in light, false);
    assert.equal(light['--md-comp-radio-button-selected-icon-color'], 'primary');
  });
  test('each component token the reference block writes has its departure under `## Where we differ from Material`', () => {
    const look = fs.readFileSync(path.join(web, 'DESIGN.md'), 'utf8');
    assert.deepEqual(undeparted(look), []);
    assert.ok(look.includes('--md-comp-checkbox-selected-icon-color'));
    const start = look.indexOf('## Where we differ from Material');
    const end = look.indexOf('\n## ', start + 1);
    const cut = look.slice(0, start) + look.slice(start, end).replaceAll('--md-comp-checkbox-selected-icon-color', 'the tick') + look.slice(end);
    assert.deepEqual(undeparted(cut), ['--md-comp-checkbox-selected-icon-color']);
  });
});
