/**
 * The check of the built site (`built.ts`), which `npm run build` runs on what `astro build` wrote: it is made to refuse on a
 * fixture `dist/` here, since the build that proves it over the real site is the repository's own, run by a round's check and by
 * the landing, never by this file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { faultsOf, PAGES } from '../built.ts';
import { scratch } from './scratch.ts';

/** A built page holding `figures`, each the words of one SVG. */
const page = (figures: string[]): string =>
  `<html><body>${figures.map((words) => `<svg viewBox="0 0 10 10"><title>${words}</title></svg>`).join('')}</body></html>`;

/** A fixture `dist/` as the build writes it: every page, the lifecycle on the runtime's, Nemia's machine on hers, a sequence. */
const built = (figuresOf: Record<string, string[]> = {}): string => {
  const dist = scratch('docs-built-');
  const drawn: Record<string, string[]> = {
    runtime: ['a task waits in input-required'],
    nemia: ['a folder is untrusted'],
    'how-a-run-lives': ['a run files its first step'],
    ...figuresOf,
  };
  for (const name of PAGES) {
    fs.mkdirSync(path.join(dist, name), { recursive: true });
    fs.writeFileSync(path.join(dist, name, 'index.html'), page(drawn[name] ?? []));
  }
  return dist;
};

test('REFUSED: a page not built, a figure printing its style, a machine lost and a machine on two pages', () => {
  assert.deepEqual(faultsOf(built()), [], 'the site as the build writes it');
  const whole = built();
  fs.rmSync(path.join(whole, 'how-a-run-lives'), { recursive: true });
  fs.rmSync(path.join(whole, 'glossary'), { recursive: true });
  assert.deepEqual(faultsOf(whole), ['these pages are not built: how-a-run-lives, glossary'], 'named in the sidebar’s order');
  assert.deepEqual(faultsOf(built({ runtime: [] })), ['the lifecycle is drawn on no page, not on runtime alone']);
  assert.deepEqual(
    faultsOf(built({ map: ['a task waits in input-required'] })),
    ['the lifecycle is drawn on map, runtime, not on runtime alone'],
    'a second home is refused as a lost one is',
  );
  assert.deepEqual(faultsOf(built({ nemia: ['a folder is trusted'] })), ["Nemia's machine is drawn on no page, not on nemia alone"]);
  assert.deepEqual(faultsOf(built({ 'how-a-run-lives': [] })), ['how a run lives draws no sequence']);
  const styled = built();
  fs.writeFileSync(path.join(styled, 'map', 'index.html'), '<html><body><figure set:html="<svg/>"></figure></body></html>');
  assert.deepEqual(faultsOf(styled), ["a figure of map prints its style as an attribute: draw it through the site's stylesheet"]);
});
