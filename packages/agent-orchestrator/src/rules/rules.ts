/**
 * A factory's rules: the words told to every agent hired into it, its rules and policies, kept by the store with the factory and never in a
 * repository. Here, the file's name (`FACTORY_RULES_FILE`), where it sits (`rulesFile`) and the refusal of a file that would do more than
 * add words (`factoryRulesRefusal`). The store reads and writes it (`rules.store.ts`), and `nemia start` freezes its words with each step.
 */
import path from 'node:path';
import type { Factory } from '../factory/factory.ts';

/** The file a factory's rules are kept in, beside its instruction: in the store's folder for it, or in its tree. */
export const FACTORY_RULES_FILE = 'RULES.md';

/**
 * Where the rules of `factory` are kept: `RULES.md` in its tree when it was made from a template, else in `storeFolder`, the folder the
 * store keeps for it (`$WF_ROOT/factories/<name>`).
 */
export const rulesFile = (factory: Pick<Factory, 'tree'>, storeFolder: string): string =>
  path.join(factory.tree ?? storeFolder, FACTORY_RULES_FILE);

/**
 * Why `text`, the rules of `file`, cannot be taken, or `undefined` when it can: a frontmatter block, a first line of `---` (after a byte
 * order mark too), since a factory's rules only add words and never set a key — a fence, a tool, a model, a mode or a skill is an agent's
 * file's or a step's.
 */
export function factoryRulesRefusal(file: string, text: string): string | undefined {
  if (!/^\uFEFF?---[ \t]*(\r?\n|$)/.test(text)) return undefined;
  return `${file} opens with a frontmatter block, a first line of \`---\`. A factory's rules only add words: they set no key, and so never widen an agent's fence, give it a tool, or change its model, mode or skills. Put a key in an agent's own file or on a step, and start the rules with a word.`;
}
