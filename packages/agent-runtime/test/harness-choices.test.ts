/**
 * `HARNESS_CHOICES`, the words each default harness takes for a key of a task's config: every word a harness is offered is one
 * `configRefusal` takes of it, and a harness has a list of permission modes or of sandboxes as `fenceReach` says its fence is set,
 * never both and never neither. Each rule is made to refuse with a planted table.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HARNESS_CHOICES, fenceReach } from '../src/vocabulary.ts';
import { configRefusal } from '../src/index.ts';
import { DEFAULT_HARNESSES } from '../src/service/default-harnesses.ts';

type Choices = typeof HARNESS_CHOICES;

/** The config a task sets `word` of `key` in: a sandbox is named as the task's `permissionMode`. */
const configOf = (key: keyof Choices, word: string) => (key === 'effort' ? { effort: word } : { permissionMode: word });

/** Where `table` offers a harness a word `configRefusal` would refuse of it, each worded with the runtime's refusal. */
function refusedWords(table: Choices): string[] {
  const out: string[] = [];
  for (const key of Object.keys(table) as (keyof Choices)[])
    for (const [harness, words] of Object.entries(table[key]))
      for (const word of words) {
        const why = configRefusal(harness, configOf(key, word));
        if (why) out.push(`${key}: ${word} on ${harness} is refused: ${why}`);
      }
  return out;
}

/**
 * Where `table` breaks the fence's shape: a harness `fenceReach` fences by mode with no `permissionMode` list or a `sandbox` one, one
 * fenced by sandbox the reverse, and a harness that is not one of `DEFAULT_HARNESSES`.
 */
function choicesBreaks(table: Choices): string[] {
  const out: string[] = [];
  const named = new Set(Object.values(table).flatMap((byHarness) => Object.keys(byHarness)));
  for (const harness of named)
    if (!Object.hasOwn(DEFAULT_HARNESSES, harness)) out.push(`${harness} is offered words, and is no default harness`);
  for (const harness of Object.keys(DEFAULT_HARNESSES)) {
    const by = fenceReach(harness)?.by;
    if (by === undefined) continue;
    const has = { mode: Object.hasOwn(table.permissionMode, harness), sandbox: Object.hasOwn(table.sandbox, harness) };
    const other = by === 'mode' ? 'sandbox' : 'mode';
    if (!has[by]) out.push(`${harness} is fenced by ${by}, and is offered no ${by === 'mode' ? 'permissionMode' : 'sandbox'} list`);
    if (has[other]) out.push(`${harness} is fenced by ${by}, and is offered a ${other === 'mode' ? 'permissionMode' : 'sandbox'} list`);
  }
  return out;
}

test('every word HARNESS_CHOICES offers a harness is one configRefusal takes of it', () => {
  assert.deepEqual(refusedWords(HARNESS_CHOICES), []);
});

test('REFUSED: a word HARNESS_CHOICES would offer that configRefusal refuses', () => {
  for (const key of Object.keys(HARNESS_CHOICES) as (keyof Choices)[])
    for (const harness of Object.keys(HARNESS_CHOICES[key])) {
      const planted = { ...HARNESS_CHOICES, [key]: { ...HARNESS_CHOICES[key], [harness]: ['nope'] } };
      assert.equal(refusedWords(planted).length, 1, `${key} on ${harness}`);
    }
});

test('each harness HARNESS_CHOICES names is a default harness, offered the list its fence is set by and not the other', () => {
  assert.deepEqual(choicesBreaks(HARNESS_CHOICES), []);
});

test('REFUSED: codex offered a permissionMode list, Claude Code a sandbox list, or a harness the runtime has not', () => {
  const codexModes = { ...HARNESS_CHOICES, permissionMode: { ...HARNESS_CHOICES.permissionMode, codex: ['read-only'] } };
  assert.deepEqual(choicesBreaks(codexModes), ['codex is fenced by sandbox, and is offered a permissionMode list']);
  const claudeSandbox = { ...HARNESS_CHOICES, sandbox: { ...HARNESS_CHOICES.sandbox, claude: ['read-only'] } };
  assert.deepEqual(choicesBreaks(claudeSandbox), ['claude is fenced by mode, and is offered a sandbox list']);
  const { codex: _codex, ...noCodex } = HARNESS_CHOICES.sandbox;
  assert.deepEqual(choicesBreaks({ ...HARNESS_CHOICES, sandbox: noCodex }), ['codex is fenced by sandbox, and is offered no sandbox list']);
  const unknown = { ...HARNESS_CHOICES, effort: { ...HARNESS_CHOICES.effort, gemini: ['high'] } };
  assert.deepEqual(choicesBreaks(unknown), ['gemini is offered words, and is no default harness']);
});
