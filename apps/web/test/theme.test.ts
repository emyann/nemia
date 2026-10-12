import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const web = path.resolve(import.meta.dirname, '..');
const GENERATED = ['theme.css', 'theme.v4.css', 'DESIGN.resolved.md'] as const;

/** A file of an installed package, from the nearest `node_modules` above the board that has it. */
const installed = (file: string): string => {
  for (let dir = web; ; dir = path.dirname(dir)) {
    const found = path.join(dir, 'node_modules', file);
    if (fs.existsSync(found)) return found;
    assert.notEqual(path.dirname(dir), dir, `${file} is installed`);
  }
};

/** The kit's generator run on `design` into a new folder: the folder, and what it said. */
const generated = (design: string): { out: string; said: string } => {
  const out = path.join(scratch('web-theme-'), 'theme');
  const generator = path.join(web, 'src', 'components', 'ui', 'ds', 'tokens', 'generate-theme.mjs');
  const ran = spawnSync(process.execPath, ['--import', 'tsx', generator, design, '--out', out], { cwd: web, encoding: 'utf8' });
  assert.equal(ran.status, 0, ran.stderr);
  return { out, said: `${ran.stdout}${ran.stderr}` };
};

/** The generated files in `out` that are not, byte for byte, the board's own. */
const stale = (out: string): string[] =>
  GENERATED.filter((name) => fs.readFileSync(path.join(out, name), 'utf8') !== fs.readFileSync(path.join(web, 'theme', name), 'utf8'));

/** How many errors and warnings the kit's lint finds in `design`. */
const findings = (design: string): number => {
  const ran = spawnSync(process.execPath, [installed('@google/design.md/dist/index.js'), 'lint', design], { cwd: web, encoding: 'utf8' });
  const { summary } = JSON.parse(ran.stdout) as { summary: { errors: number; warnings: number } };
  return summary.errors + summary.warnings;
};

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
