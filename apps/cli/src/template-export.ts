/**
 * `nemia template export <folder> --from <repo> --factory <name>`: a verb about this machine — it writes a folder here from a repository
 * here — that holds a factory's parts, which only the store has. The client reads them through the api of the context in use (the factory,
 * its rules and its instruction: `factories.get`, `factories.rules`, `factories.instruction`) and hands them to the orchestrator's
 * `template export` on stdin (`--factory-parts -`), which reads no store; the same under this machine's context and a remote one.
 */
import path from 'node:path';
import { Effect } from 'effect';
import type { Factory, FactoryInstruction, FactoryRules } from 'objects';
import { chosenOf } from './context.ts';
import { type Entry, piped } from './local.ts';
import { asked } from './objects.ts';
import { storeRoot } from './where.ts';

/** The verb as the api is asked under it. */
const VERB = 'template export';

/**
 * The factory `words` name with `--factory <name>` or `--factory=<name>`, else none.
 * @param words The words typed after the bin's name.
 */
export const factoryNamed = (words: readonly string[]) => {
  const at = words.findIndex((word) => word === '--factory' || word.startsWith('--factory='));
  if (at < 0) return undefined;
  const word = words[at] ?? '';
  return word.includes('=') ? word.slice(word.indexOf('=') + 1) : words[at + 1];
};

/**
 * Whether `words` are a `nemia template export` that holds a factory's parts (`--factory`), asking no help.
 * @param words The words typed after the bin's name.
 */
export const exportsAFactory = (words: readonly string[]) =>
  words[0] === 'template' && words[1] === 'export' && !words.includes('--help') && factoryNamed(words) !== undefined;

/**
 * Where the factory `name` is kept, as an export says where its hires came from: its file in this machine's store under this machine's
 * context, else its address on the daemon the context names.
 */
const keptAt = (name: string, env: NodeJS.ProcessEnv) => {
  const chosen = chosenOf(env);
  return chosen.kind === 'remote'
    ? `${chosen.server.replace(/\/+$/, '')}/api/factories/${name}`
    : path.join(storeRoot(env), 'factories', `${name}.json`);
};

/**
 * The parts the orchestrator's export reads on stdin, made of the api's answers.
 * @param factory The factory as the api answers it.
 * @param rules The factory's rules as the api answers them.
 * @param instruction The factory's instruction as the api answers it.
 * @param file Where the factory is kept: its file in this machine's store, or its address on the context's daemon.
 */
export const partsOf = (factory: Factory, rules: FactoryRules, instruction: FactoryInstruction, file: string) => ({
  factory: {
    name: factory.metadata.name,
    volumes: factory.spec.volumes.map(({ path, readOnly }) => ({ path, readOnly })),
    workflows: factory.spec.workflows ?? [],
    hires: factory.spec.hires,
    ...(factory.spec.revisions === undefined ? {} : { revisions: factory.spec.revisions }),
  },
  file,
  instruction: { words: instruction.words, error: instruction.error, file: instruction.file },
  rules: { words: rules.words, error: rules.error, file: rules.file },
});

/**
 * `words`, a `template export` that names a factory, run on the orchestrator's CLI with the factory's parts read through the api and
 * handed on stdin; a factory the api does not have is its `Missing`, exit 2.
 * @param words The words typed after the bin's name, the factory among them.
 * @param entry Which bin's entry the orchestrator's CLI is spawned by.
 * @param env The environment read for the context in use, the store and the token, and given the child.
 */
export async function templateExported(words: readonly string[], entry: Entry, env: NodeJS.ProcessEnv = process.env) {
  const name = factoryNamed(words) ?? '';
  const { factory, rules, instruction } = await asked(
    VERB,
    (c) =>
      Effect.all(
        {
          factory: c.factories.get({ params: { name } }),
          rules: c.factories.rules({ params: { name } }),
          instruction: c.factories.instruction({ params: { name } }),
        },
        { concurrency: 'unbounded' },
      ),
    env,
  );
  const parts = partsOf(factory, rules, instruction, keptAt(name, env));
  return piped([...words, '--factory-parts', '-'], JSON.stringify(parts), entry, env);
}
