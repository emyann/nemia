/**
 * The two shapes of an entry of the command table: a command whole, which a handler serves on either side (`Command`), and one the CLI
 * serves alone and runs itself, with no handler (`Ran`).
 */
import type { Engine } from '../runtime-client.ts';
import type { Args, CommandSpec } from './command.ts';

/**
 * A command whole: its spec, `handler`, which calls one package verb with the arguments and answers data — never printed lines — and
 * `print`, the lines the CLI prints of that data. The api answers the data as JSON, or only its `apiKeys` where the CLI prints more of
 * it than the api answers. A handler reads its settings (`WF_MAX_RUNS`) from `env`, and a person's own files from the store `home`: the
 * process's own at the command line, the app's on the api. `note` is what the CLI says of the data on stderr, beside what it prints.
 */
export type Command<D extends object = Readonly<Record<string, unknown>>> = CommandSpec & {
  handler(e: Engine, args: Args, env?: NodeJS.ProcessEnv, home?: string): Promise<D>;
  print(data: D, args: Args): readonly string[];
  note?(data: D, args: Args): readonly string[];
  readonly apiKeys?: readonly (keyof D & string)[];
};

/** A command the CLI serves alone and runs itself, by its runner (`RUNS` in `cli/main.ts`): its spec, and no handler. */
export type Ran = CommandSpec & { readonly only: { readonly side: 'cli'; readonly why: string }; readonly handler?: undefined };
