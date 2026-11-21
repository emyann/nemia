/**
 * What the welcome's template form reads of a template's parameters and sends (`src/lib/templateParameters.ts`): each parameter as
 * the form reads it (`parameterReadsOf`), the value a field starts at (`startWordOf`), and the words of an apply (`setsOf`), in the
 * order the template declares them, each the one `setWordOf` gives its field. Where each is drawn and what one field sends are proved
 * by `contracts/template-parameters.contract.ts`, never tested here.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { TemplateParameter } from 'objects';
import { parameterReadsOf, setsOf, setWordOf, startWordOf } from '../src/lib/templateParameters.ts';

/** A template's parameters: one a volume sets, one it asks, a string and a switch with defaults, and a number with none. */
const PARAMETERS: Record<string, TemplateParameter> = {
  github: { type: 'boolean', description: 'On GitHub.', default: false, whenOrigin: 'github.com' },
  label: { type: 'string', description: 'The label.', default: '', ask: true },
  check: { type: 'string', description: 'The check.', default: 'ci' },
  waits: { type: 'boolean', description: 'Waits.', default: true },
  budget: { type: 'number', description: 'Dollars.' },
};
const READS = parameterReadsOf(PARAMETERS);

test('each parameter is read in the order the template declares it: asked, set by a volume, its default as a field writes it', () => {
  assert.deepEqual(READS, [
    { name: 'github', type: 'boolean', ask: false, follows: true, defaultWord: 'false' },
    { name: 'label', type: 'string', ask: true, follows: false, defaultWord: '' },
    { name: 'check', type: 'string', ask: false, follows: false, defaultWord: 'ci' },
    { name: 'waits', type: 'boolean', ask: false, follows: false, defaultWord: 'true' },
    { name: 'budget', type: 'number', ask: false, follows: false, defaultWord: null },
  ]);
});

test('a field starts at its default, a switch with none off, any other field with none empty', () => {
  assert.deepEqual(READS.map(startWordOf), ['false', '', 'ci', 'true', '']);
  assert.equal(startWordOf({ name: 'on', type: 'boolean', ask: false, follows: false, defaultWord: null }), 'false');
});

test('a form left at its start sends no word', () => {
  assert.equal(setsOf(READS, {}).length, 0);
  assert.equal(setsOf(READS, Object.fromEntries(READS.map((read) => [read.name, startWordOf(read)]))).length, 0);
});

test("the words sent are setWordOf's for each declared field, in the template's order, and a key no parameter declares sends none", () => {
  const given: Record<string, string> = { budget: '5', waits: 'false', label: 'route', github: 'true', nowhere: 'x' };
  assert.deepEqual(setsOf(READS, given), ['label=route', 'waits=false', 'budget=5']);
  assert.deepEqual(
    setsOf(READS, given),
    READS.flatMap((read) => {
      const word = setWordOf(read, given[read.name] ?? startWordOf(read));
      return word === null ? [] : [word];
    }),
  );
});
