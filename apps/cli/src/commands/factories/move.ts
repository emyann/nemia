/**
 * The runner of `nemia factory move`: a factory read whole from the store one context names (`--from`, the context in use where none is
 * typed) and filed on the store another names (`--to`), each daemon asked by its own context, the export of the one sent as it was
 * answered to the other's import. Neither daemon is asked to write the other, and nothing of the source is removed: the lines it prints
 * end on the trust to give the factory there and, once it runs there, its removal here.
 *
 * A context is judged as every command's is (`contextOf` over the client's config), refused naming `nemia config get-contexts` where the
 * config holds none of its name, and where the two name one store. A `--repo` and a `--volume` are split at their first `=`, the value
 * sent as the target's machine reads it (`repoSent`, `pathSent` under the target's context).
 */
import type { Args, FactoryExport, FactoryImported } from 'objects';
import { CONTEXT_VARIABLE, configRead, contextOf, LOCAL_CONTEXT, unheld } from '../../context.ts';
import { asked } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { listArg, pathSent, said, textArg } from '../requests.ts';
import { repoSent, textOf } from './lines.ts';

/** The command a person types next, under the context `context`. */
const under = (context: string, command: string): string => `${CONTEXT_VARIABLE}=${context} ${command}`;

/** The context in use, by its name: `NEMIA_CONTEXT`, else the config's, else this machine's. */
function inUse(env: NodeJS.ProcessEnv): string {
  const named = env[CONTEXT_VARIABLE]?.trim();
  return named !== undefined && named !== '' ? named : (configRead(env).current ?? LOCAL_CONTEXT);
}

/** `env` with the context `name` in use, which the config holds; refused naming `nemia config get-contexts` where it holds none. */
function envOf(name: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (contextOf(configRead(env), name).kind === 'refused') throw unheld(name);
  return { ...env, [CONTEXT_VARIABLE]: name };
}

/** The `<key>=<value>` words of `key`, by their key, each value sent as `sent` makes it; the objects' check has refused one with no `=`. */
function pairsOf(args: Args, key: string, sent: (value: string) => string): Record<string, string> | undefined {
  const words = listArg(args, key);
  if (!words.length) return undefined;
  return Object.fromEntries(
    words.map((word) => {
      const at = word.indexOf('=');
      return [word.slice(0, at), sent(word.slice(at + 1))];
    }),
  );
}

/** What `nemia factory move` says of a move from `from` to `to`: what was filed, cloned, mounted and moved, then what to type next. */
export function movedLines(from: string, to: string, exp: FactoryExport, filed: FactoryImported): string[] {
  const cloned = new Set(filed.cloned);
  return [
    `${filed.name}: moved from ${from} to ${to}`,
    `filed: ${filed.file}`,
    `repositories: ${filed.repos.join(', ')}`,
    ...(filed.cloned.length ? [`cloned: ${[...cloned].join(', ')}`] : []),
    ...filed.volumes.map((v) => `volume ${v.name}: ${v.path}`),
    ...(filed.cards.length ? ['cards moved:', ...filed.cards.map((c) => `  ${c.name} ← ${c.was}`)] : []),
    ...(exp.left.length ? [`cards left on ${from}:`, ...exp.left.map((c) => `  ${c.name}: ${c.why}`)] : []),
    ...(exp.stays.length ? [`stays on ${from}: ${exp.stays.join(', ')}`] : []),
    'next:',
    `  trust its places there, which the move left untrusted (${filed.untrusted.join(', ')}):`,
    `    ${under(to, `nemia factory trust ${filed.name}`)}`,
    `  once it runs there, remove it here:`,
    `    ${under(from, `nemia factory rm ${filed.name}`)}`,
  ];
}

/** `nemia factory move`: the factory exported from `--from`'s store and imported into `--to`'s, never trusted there. */
export async function factoryMove(args: Args, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const name = textOf(args, 'name');
  const to = textOf(args, 'to');
  const from = textArg(args, 'from') ?? inUse(env);
  const [fromEnv, toEnv] = [envOf(from, env), envOf(to, env)];
  if (from === to)
    throw new Refused(
      `nemia factory move takes two stores, and --to names ${to}, the context in use: give --from the store it is in, or --to another (nemia config get-contexts).`,
    );
  const cards = textArg(args, 'cards');
  const query = cards === 'follow' || cards === 'stay' ? { cards } : {};
  const exp = await asked('factory move', (c) => c.factories.export({ params: { name }, query }), fromEnv);
  const repos = pairsOf(args, 'repos', (value) => repoSent(value, toEnv));
  const volumes = pairsOf(args, 'volumes', (value) => pathSent(value, toEnv));
  const payload = { export: exp, from, ...(repos === undefined ? {} : { repos }), ...(volumes === undefined ? {} : { volumes }) };
  const filed = await asked('factory move', (c) => c.factories.import({ params: { name: exp.name }, payload }), toEnv);
  said(movedLines(from, to, exp, filed));
  return 0;
}
