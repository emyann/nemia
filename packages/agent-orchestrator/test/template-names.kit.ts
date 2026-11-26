/**
 * What the template-names rule reads and counts (`template-names.test.ts`): the names a shipped template says — its own, its workflows',
 * its steps', its parameters' and the fields its agents' and steps' outputs add to the closeout — read as the test runs from
 * `packages/templates/<template>/`, and how many times a text of the core says one in a form that cannot be plain prose. Pure but for
 * the reads, so a script can print the measure.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { CLOSEOUT_SCHEMA } from '../src/closeout/closeout.ts';
import { workflowsIn } from '../src/folder/folder.store.ts';
import { ours } from 'test-kit/repo';

export const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** The folders of a package or an app the rule reads: the core's own source. The docs site imports no package and is no layer. */
const SOURCE_DIRS = ['src', 'bin', 'place'];

/** The core's folders: each package's and each app's source, but the templates package and the documentation site. */
export const CORE_DIRS = [
  ...fs
    .readdirSync(path.join(ROOT, 'packages'))
    .filter((p) => p !== 'templates')
    .flatMap((p) => SOURCE_DIRS.map((d) => `packages/${p}/${d}`)),
  ...fs
    .readdirSync(path.join(ROOT, 'apps'))
    .filter((a) => a !== 'docs')
    .flatMap((a) => SOURCE_DIRS.map((d) => `apps/${a}/${d}`)),
];

/** Whether `file` is a test, a story or a fixture: text that names a template on purpose, held by the template's own guards. */
const notSource = (file: string) =>
  /\.(?:test|stories|fixture)\.tsx?$/.test(file) ||
  file.split('/').includes('test') ||
  file.split('/').includes('node_modules') ||
  !ours(file);

/** The core's source texts by their path from the root: a `.ts` or `.tsx` of `CORE_DIRS` that is no test, story or fixture. */
export const coreTexts = () =>
  new Map(
    CORE_DIRS.filter((dir) => fs.existsSync(path.join(ROOT, dir)))
      .flatMap((dir) =>
        fs.readdirSync(path.join(ROOT, dir), { recursive: true, encoding: 'utf8' }).map((f) => `${dir}/${f.split(path.sep).join('/')}`),
      )
      .filter((f) => /\.tsx?$/.test(f) && !notSource(f))
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')] as const),
  );

/** The names a shipped template says (`templateWords`). */
export type TemplateWords = {
  readonly templates: readonly string[];
  readonly names: readonly string[];
  readonly fields: readonly string[];
};

const subfolders = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? [e.name] : [])) : [];

/** The properties of the output schemas under `dir`, each `*.schema.json`, whatever the depth. */
const propertiesUnder = (dir: string) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.schema.json'))
        .flatMap((f) => {
          const schema = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { properties?: Record<string, unknown> };
          return Object.keys(schema.properties ?? {});
        })
    : [];

/** The keys the closeout's envelope says and the loop reads: a template adds none of them. */
const ENVELOPE = [...Object.keys(CLOSEOUT_SCHEMA.properties), 'again', 'replies'];

/**
 * The names of the template folder `template` (under `packages/templates/`): its workflows, each workflow's steps (its `.md` files but a
 * README), its parameters, and the fields its outputs add to the envelope.
 * @param template The template's folder name.
 */
function wordsOf(template: string) {
  const folder = path.join(ROOT, 'packages', 'templates', template);
  const workflows = workflowsIn(path.join(folder, 'workflows'));
  const steps = workflows.flatMap((w) =>
    fs
      .readdirSync(path.join(folder, 'workflows', w))
      .filter((f) => f.endsWith('.md') && !/^readme\.md$/i.test(f))
      .map((f) => f.slice(0, -3)),
  );
  const manifest = yaml.load(fs.readFileSync(path.join(folder, 'nemia.yaml'), 'utf8')) as {
    spec?: { parameters?: Record<string, unknown> };
  };
  const fields = [...propertiesUnder(path.join(folder, 'agents')), ...propertiesUnder(path.join(folder, 'workflows'))];
  return { workflows, steps, parameters: Object.keys(manifest.spec?.parameters ?? {}), fields };
}

/**
 * Every template Nemia ships, read: the folders of `packages/templates` that hold a `nemia.yaml`.
 * @param kept The names the core says for its own reasons (`KEPT_NAMES`), left out of what is counted.
 */
export function templateWords(kept: ReadonlySet<string>) {
  const root = path.join(ROOT, 'packages', 'templates');
  const templates = subfolders(root).filter((t) => fs.existsSync(path.join(root, t, 'nemia.yaml')));
  const read = templates.map(wordsOf);
  const unique = (list: readonly string[]) => [...new Set(list)].filter((w) => !kept.has(w)).sort();
  return {
    templates,
    names: unique(read.flatMap((r) => [...r.workflows, ...r.steps, ...r.parameters])),
    fields: unique(read.flatMap((r) => r.fields).filter((f) => !ENVELOPE.includes(f))),
  } satisfies TemplateWords;
}

const escaped = (word: string) => word.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/**
 * How many times `text` says the words: a template's name as a whole word, in any case, comments included; a quoted literal equal to a
 * workflow, step or parameter name; and `output.<field>`, `output?.<field>` or `output['<field>']` for a field an output adds.
 * @param text A source file's text.
 * @param words What the templates say, as `templateWords` reads it.
 */
export function templateNamesIn(text: string, words: TemplateWords) {
  const patterns = [
    words.templates.length ? new RegExp(`(?<![\\w$])(?:${words.templates.map(escaped).join('|')})(?![\\w$])`, 'gi') : undefined,
    words.names.length ? new RegExp(`(['"])(?:${words.names.map(escaped).join('|')})\\1`, 'g') : undefined,
    words.fields.length
      ? new RegExp(
          `(?<![\\w$])output(?:\\??\\.(?:${words.fields.map(escaped).join('|')})(?![\\w$])|\\??\\.?\\[(['"])(?:${words.fields.map(escaped).join('|')})\\1\\])`,
          'g',
        )
      : undefined,
  ];
  return patterns.reduce((n, p) => n + (p ? [...text.matchAll(p)].length : 0), 0);
}
