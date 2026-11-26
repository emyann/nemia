/**
 * No template's name in the core (`docs/architecture.md`, *Who owns what*; the factory's rule *Nemia is generic*). Every package's and
 * app's source says what any team's workflows run on, and a shipped template is one team's: its own name, its workflows', steps' and
 * parameters' names and the output fields it adds to the closeout are read as the test runs from `packages/templates/<template>/`
 * (`templateWords`), so a new workflow or parameter is refused with no edit here.
 *
 * What is counted is what cannot be plain prose (`templateNamesIn`): the template's name as a word, comments included; a quoted literal
 * equal to a workflow, step or parameter name; and `output.<field>` for a field an output adds. A name the core says for its own reasons
 * (`KEPT_NAMES`, `KEPT_FIELDS`) is no template's, each with why. Each file that says one today is a known exception
 * (`TEMPLATE_NAMES`) with the card that removes it, and the counts only shrink. Tests, stories and fixtures are the template's own
 * guards' to hold, and are not read.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { coreTexts, ROOT, templateNamesIn, templateWords, type TemplateWords } from './template-names.kit.ts';
import { TEMPLATE_CARDS, TEMPLATE_NAMES, type TemplateDebt } from './template-names.baseline.ts';

/** The names of a template that the core says too, in its own meaning, each with why. */
const KEPT_NAMES: Readonly<Record<string, string>> = {
  answer: "the core's own verb and kind: a question answered, a run waiting on an answer",
  backlog: "the card's own kind in a route: a card filed back to the inbox",
  build: "the release's own source: `from: 'build'` against 'archive'",
  door: "the core's own word for the layer in front of a store (a door)",
  github: 'a host and a builtin server the core ships: the servers it offers, the host a template follows',
  labelValues: "the core's own setting, `spec.labelValues`, which a template's parameter is named after",
  land: "the core's own verb: `nemia land` and the git place's `land`",
  next: 'plain English: the next step of a list',
  storeRoot: "the core's own word for the store's folder, which a template's parameter is named after",
};

/** The output fields of a template that the core says too, in its own meaning, each with why. */
const KEPT_FIELDS: Readonly<Record<string, string>> = {
  message: "the landing's message: an ending's closeout carries it and the core commits the merge under it",
  read: "a harness's own read of a session's output, not a closeout's field",
  title: 'plain English: the title of a card the core files',
};

const WORDS = templateWords(new Set([...Object.keys(KEPT_NAMES), ...Object.keys(KEPT_FIELDS)]));

/** What the baseline and the measure of `texts` disagree on, each a sentence naming the fix. */
function breaches(texts: ReadonlyMap<string, string>, words: TemplateWords, baseline: Readonly<Record<string, TemplateDebt>>) {
  const counts = new Map([...texts].map(([file, text]) => [file, templateNamesIn(text, words)] as const).filter(([, n]) => n !== 0));
  const fix = "say it in the core's own words, or move what needs it into the template; never add an entry for it here";
  return [
    ...[...counts].filter(([file]) => !(file in baseline)).map(([file, n]) => `${file} says ${n} template names: ${fix}`),
    ...Object.entries(baseline).flatMap(([file, debt]) => {
      const n = counts.get(file) ?? 0;
      const held = [
        ...(debt.card in TEMPLATE_CARDS
          ? []
          : [`${file}'s entry names ${debt.card}, a card TEMPLATE_CARDS does not know: name a filed card`]),
        ...(debt.why.trim() ? [] : [`${file}'s entry says why in no words: say what it is waiting on`]),
      ];
      if (n === 0) return [...held, `${file} says no template name left: take its entry off the baseline`];
      if (n > debt.count) return [...held, `${file} says ${n} template names, more than the ${debt.count} the baseline allows: ${fix}`];
      if (n < debt.count)
        return [...held, `${file} says ${n} template names, fewer than the baseline's ${debt.count}: lower its count to ${n}`];
      return held;
    }),
  ];
}

test('the core says no template name but those the baseline holds, each with its card', () => {
  assert.deepEqual(breaches(coreTexts(), WORDS, TEMPLATE_NAMES), []);
});

test('the names are read from the templates as they stand, and the kept words are still the templates', () => {
  assert.ok(WORDS.templates.includes('sdlc'), 'a shipped template is read');
  for (const name of ['implement', 'review', 'quick', 'ciCheck', 'front-door'])
    assert.ok(WORDS.names.includes(name), `${name} is a name of a template`);
  for (const field of ['findings', 'goal', 'verdicts']) assert.ok(WORDS.fields.includes(field), `${field} is a field of a template`);
  for (const kept of Object.keys(KEPT_NAMES))
    assert.ok(
      templateWords(new Set(Object.keys(KEPT_FIELDS))).names.includes(kept),
      `${kept} is kept but no template says it: take it off KEPT_NAMES`,
    );
  for (const kept of Object.keys(KEPT_FIELDS))
    assert.ok(
      templateWords(new Set(Object.keys(KEPT_NAMES))).fields.includes(kept),
      `${kept} is kept but no template adds it: take it off KEPT_FIELDS`,
    );
  for (const why of [...Object.values(KEPT_NAMES), ...Object.values(KEPT_FIELDS)]) assert.ok(why.trim().length > 0);
});

test('REFUSED: a planted workflow name, an output field, a template name, and not a kept word', () => {
  const planted = (file: string, text: string) => breaches(new Map([...coreTexts(), [file, text]]), WORDS, TEMPLATE_NAMES);
  const quick = "export const w = 'quick';\n";
  assert.equal(planted('packages/agent-orchestrator/src/x/x.ts', quick).length, 1, 'a quoted workflow name');
  assert.equal(planted('packages/agent-orchestrator/src/x/x.ts', 'export const w = "review";\n').length, 1, 'a quoted step name');
  assert.equal(planted('apps/web/src/lib/x.ts', 'const n = output.findings;\n').length, 1, 'a reviewer field read off an output');
  assert.equal(planted('apps/web/src/lib/x.ts', "const n = output?.['goal'];\n").length, 1, 'an output field in brackets');
  assert.equal(planted('apps/api/src/x.ts', '/** as sdlc does */\n').length, 1, "a template's name, in a comment");
  assert.equal(planted('apps/api/src/x.ts', "const k = 'land';\nconst m = output.message;\n").length, 0, "the core's own words");
  assert.equal(planted('apps/api/src/x.ts', 'const reviewed = 1; // the review of a change\n').length, 0, 'prose is no name');
});

test('REFUSED: a count above or below the baseline, an entry for a clean file, one with no known card or no why', () => {
  const texts = new Map([['apps/web/src/x.ts', "const a = 'quick'; const b = 'quick';\n"]]);
  const held = (debt: Partial<TemplateDebt>) => ({ 'apps/web/src/x.ts': { count: 2, card: '7kuf', why: 'waits', ...debt } });
  assert.deepEqual(breaches(texts, WORDS, held({})), []);
  assert.equal(breaches(texts, WORDS, held({ count: 1 })).length, 1, 'above');
  assert.equal(breaches(texts, WORDS, held({ count: 3 })).length, 1, 'below');
  assert.equal(breaches(new Map([['apps/web/src/x.ts', 'const a = 1;\n']]), WORDS, held({})).length, 1, 'clean');
  assert.equal(breaches(texts, WORDS, held({ card: 'nope' })).length, 1, 'unknown card');
  assert.equal(breaches(texts, WORDS, held({ why: ' ' })).length, 1, 'no why');
});

test("the rule reads the core's source and no template, test or story", () => {
  const files = [...coreTexts().keys()];
  assert.ok(files.length > 100, 'the core is read');
  assert.ok(files.every((f) => !f.startsWith('packages/templates/') && !f.startsWith('apps/docs/')));
  assert.ok(files.every((f) => !/\.(?:test|stories|fixture)\.tsx?$/.test(f)));
  assert.ok(fs.existsSync(path.join(ROOT, 'packages', 'templates')));
});
