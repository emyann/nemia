/**
 * How many story files the stories' Vitest runs at once, where its contract does not reach (`contracts/stories-workers.contract.ts`
 * proves the rule): the storybook project's `maxWorkers` is the decision's (`storiesWorkersOf`, `.storybook/workers.ts`), never a
 * number written in `vitest.config.ts`, an ask it refuses is thrown as the config loads, and what the contract assumes of an ask's
 * spelling (`askedCountOf`) holds of the real function.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { brokenOn } from '@emyann/tsverify';
import { test } from 'vitest';
import { askedCountOf } from '../contracts/stories-workers.contract.ts';
import { askedCount } from '../.storybook/asked.ts';
import { storiesWorkersOf } from '../.storybook/workers.ts';

/** The board's folder. */
const WEB = path.resolve(import.meta.dirname, '..');

/**
 * What leaves the storybook project's bound other than the decision's: its `maxWorkers` read from anything but the bound the config
 * takes from `storiesWorkersOf`, or a refusal not thrown.
 * @param config The text of the board's `vitest.config.ts`.
 */
const boundBreaks = (config: string) => {
  const at = config.indexOf("name: 'storybook'");
  const project = at < 0 ? '' : config.slice(at);
  const breaks: string[] = [];
  if (!/\bmaxWorkers: bound\.workers\b/.test(project))
    breaks.push('the storybook project runs other than maxWorkers: bound.workers: set it from storiesWorkersOf (vitest.config.ts)');
  if (!/const bound = storiesWorkersOf\(/.test(config)) breaks.push('vitest.config.ts reads no bound from storiesWorkersOf');
  if (!/if \(bound\.kind === 'refused'\) throw new Error\(bound\.message\);/.test(config))
    breaks.push('vitest.config.ts does not throw a refused ask as it loads');
  return breaks;
};

test("the storybook project's bound is storiesWorkersOf's, read as the config loads", () => {
  assert.deepEqual(boundBreaks(fs.readFileSync(path.join(WEB, 'vitest.config.ts'), 'utf8')), []);
});

test('REFUSED: a storybook project bound by a number written in the config, and a refusal not thrown', () => {
  const config = fs.readFileSync(path.join(WEB, 'vitest.config.ts'), 'utf8');
  assert.equal(boundBreaks(config.replace('maxWorkers: bound.workers', 'maxWorkers: 1')).length, 1);
  assert.equal(boundBreaks(config.replace("if (bound.kind === 'refused') throw new Error(bound.message);", '')).length, 1);
});

test('REFUSED: an ask no whole number is refused with a message to throw; one asked is the bound', () => {
  const refused = storiesWorkersOf({ ci: true, asked: 'many', cores: 4 });
  assert.equal(refused.kind, 'refused');
  assert.ok(refused.kind === 'refused' && refused.message.includes('STORIES_WORKERS'), 'it names the variable to set');
  assert.deepEqual(storiesWorkersOf({ ci: false, asked: '3', cores: 4 }), { kind: 'workers', workers: 3 });
});

test("what the contract assumes of an ask's spelling holds of the real one, which reads whole numbers of one or more alone", () => {
  const asks = ['1', '2', '16', '0', '01', '-2', '+2', '2.5', ' 2', '2 ', 'two', '1e3', '0x10'];
  assert.deepEqual(
    brokenOn(
      askedCountOf,
      asks.map((ask) => [ask] satisfies [string]),
    ).map((broken) => broken.law),
    [],
  );
  assert.deepEqual(
    asks.map((ask) => askedCount(ask)),
    [1, 2, 16, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
  );
});
