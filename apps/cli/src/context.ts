/**
 * Which daemon a command asks, kubectl's way (`contracts/context.contract.ts`): the client's own config file,
 * `${XDG_CONFIG_HOME:-~/.config}/nemia/config.yaml`, holds named contexts — a remote daemon's address and a person's token for it — and
 * the one in use; `NEMIA_CONTEXT` names one for a single command. None named, or `local`, is this machine's store, as before contexts.
 * The file is the client's, not the store's: written with mode 0600, since it holds tokens, and read by `contextOf` alone.
 *
 * `nemia config use-context <name>`, `set-context <name> --server <url> --token-file <file>`, `get-contexts` and `current-context` write
 * and read it. The token is read from a file, never from the command line, where a shell's history and `ps` would keep it, and no verb
 * prints it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import type { ContextOf } from '../contracts/context.contract.ts';
import { Refused } from './refused.ts';

/** The name that always means this machine's store, whatever the file holds. */
export const LOCAL_CONTEXT = 'local';

/** The variable that names a context for a single command, over the file's. */
export const CONTEXT_VARIABLE = 'NEMIA_CONTEXT';

/** The verb that reads and writes the client's config: `nemia config <use-context|set-context|get-contexts|current-context>`. */
export const CONFIG_VERB = 'config';

/** A context of the client's config: its name, the daemon's address (`http(s)://host:port`) and a person's token for it. */
export type Context = { readonly name: string; readonly server: string; readonly token: string };

/**
 * The client's config as read: its contexts, the name of the one in use, if any, and a person's token for this machine's own daemon
 * (`localToken`, `local-token` in the file), which a store marked exposed asks of every caller, its own machine's included.
 */
export type ClientConfig = {
  readonly contexts: readonly Context[];
  readonly current: string | undefined;
  readonly localToken?: string;
};

/** Which daemon a command asks: this machine's store, a remote daemon by its context, or refused for a name the file does not hold. */
export type Chosen =
  | { readonly kind: 'local' }
  | { readonly kind: 'remote'; readonly name: string; readonly server: string; readonly token: string }
  | { readonly kind: 'refused'; readonly name: string };

/** Which daemon a command asks, from the config and the name `NEMIA_CONTEXT` holds, trimmed, if any: pure. */
export const contextOf: ContextOf = (config, asked) => {
  const name = asked !== undefined && asked !== '' ? asked : config.current;
  if (name === undefined || name === LOCAL_CONTEXT) return { kind: 'local' };
  const context = config.contexts.find((c) => c.name === name);
  return context === undefined ? { kind: 'refused', name } : { kind: 'remote', name, server: context.server, token: context.token };
};

/** The client's config file: `$XDG_CONFIG_HOME/nemia/config.yaml`, else under `~/.config`. */
export const configFileOf = (env: NodeJS.ProcessEnv = process.env): string => {
  const xdg = env.XDG_CONFIG_HOME;
  const home = env.HOME !== undefined && env.HOME !== '' ? env.HOME : os.homedir();
  return path.join(xdg !== undefined && xdg !== '' ? xdg : path.join(home, '.config'), 'nemia', 'config.yaml');
};

/** A config file that does not read as one: refused, naming the file to fix and how to write it again. */
const unreadable = (file: string, why: string): Refused =>
  new Refused(
    `${file} is not a nemia config (${why}): fix it, or delete it and add each context again with \`nemia config set-context <name> --server <url> --token-file <file>\``,
  );

/** A string field of `value`, or none. */
const textOf = (value: unknown, key: string): string | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const field: unknown = Object.entries(value).find(([k]) => k === key)?.[1];
  return typeof field === 'string' && field !== '' ? field : undefined;
};

/** The contexts a read file's `contexts` holds, each with its three fields; refused where one lacks one. */
const contextsIn = (file: string, listed: unknown): Context[] => {
  if (listed === undefined || listed === null) return [];
  if (!Array.isArray(listed)) throw unreadable(file, '`contexts` is not a list');
  return listed.map((entry: unknown, i) => {
    const [name, server, token] = [textOf(entry, 'name'), textOf(entry, 'server'), textOf(entry, 'token')];
    if (name === undefined || server === undefined || token === undefined)
      throw unreadable(file, `context ${i + 1} lacks its name, server or token`);
    return { name, server, token };
  });
};

/** The client's config, as its file holds it: none, where there is no file. Refused where the file does not read as one. */
export function configRead(env: NodeJS.ProcessEnv = process.env): ClientConfig {
  const file = configFileOf(env);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { contexts: [], current: undefined };
  }
  let read: unknown;
  try {
    read = parse(text);
  } catch (err) {
    throw unreadable(file, err instanceof Error ? err.message : String(err));
  }
  if (read === null || read === undefined) return { contexts: [], current: undefined };
  if (typeof read !== 'object' || Array.isArray(read)) throw unreadable(file, 'it is not a mapping');
  const contexts = contextsIn(file, Object.entries(read).find(([k]) => k === 'contexts')?.[1]);
  const localToken = textOf(read, 'local-token');
  return { contexts, current: textOf(read, 'current-context'), ...(localToken === undefined ? {} : { localToken }) };
}

/** `config` written whole to the client's config file, mode 0600 in a folder of mode 0700, through a temporary file renamed over it. */
export function configWritten(config: ClientConfig, env: NodeJS.ProcessEnv = process.env): void {
  const file = configFileOf(env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const doc = {
    ...(config.current === undefined ? {} : { 'current-context': config.current }),
    contexts: config.contexts.map(({ name, server, token }) => ({ name, server, token })),
    ...(config.localToken === undefined ? {} : { 'local-token': config.localToken }),
  };
  const temporary = path.join(path.dirname(file), `.config.yaml.${process.pid}`);
  fs.writeFileSync(temporary, stringify(doc), { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, file);
}

/** Which daemon a command run with `env` asks: the config file read, `NEMIA_CONTEXT` over it (`contextOf`). */
export const chosenOf = (env: NodeJS.ProcessEnv = process.env): Chosen => contextOf(configRead(env), env[CONTEXT_VARIABLE]?.trim());

/**
 * The token a command run with `env` presents, where `WF_SESSION_TOKEN` is not set: the remote context's, or under this machine's
 * context the person's token for its own daemon where the config keeps one (`set-context local --token-file`); none otherwise.
 */
export function chosenToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const config = configRead(env);
  const chosen = contextOf(config, env[CONTEXT_VARIABLE]?.trim());
  return chosen.kind === 'remote' ? chosen.token : chosen.kind === 'local' ? config.localToken : undefined;
}

/** A context named that the file does not hold: refused, naming the list and how to add one. */
export const unheld = (name: string): Refused =>
  new Refused(
    `no context named ${name} in ${CONTEXT_VARIABLE} or the config: see the contexts there are with \`nemia config get-contexts\`, or add it with \`nemia config set-context ${name} --server <url> --token-file <file>\``,
  );

/**
 * `nemia template export --factory <name>` typed under the remote context `name`: refused, since the factory it reads is this machine's
 * store's, not the daemon's, and no endpoint serves an export; naming the machine to run it on and the context that reads this one.
 */
export const factoryNotHere = (name: string): Refused =>
  new Refused(
    `nemia template export --factory reads the factory from a store in process, and the context in use, ${name}, is a remote daemon: run it on that daemon's machine, or export this machine's factory with \`NEMIA_CONTEXT=local nemia template export …\``,
  );

/** What `nemia config` says of itself, on `--help` or no words. */
const USAGE = [
  'nemia config use-context <name>          use the context <name> (local: this machine’s store)',
  'nemia config set-context <name> --server <url> --token-file <file>',
  '                                         add or change a context: a remote daemon and a token of yours for it',
  'nemia config set-context local --token-file <file>',
  '                                         keep a token of yours for this machine’s own daemon, where its store is exposed',
  'nemia config get-contexts                list the contexts, the one in use marked *',
  'nemia config current-context             say the context a command uses now',
];

/** A `nemia config` typed otherwise than its usage: refused, naming it. */
const misused = (said: string): Refused => new Refused(`nemia config: ${said}. Type one of:\n${USAGE.join('\n')}`);

/** The value after `flag` among `args`, if typed. */
const flagOf = (args: readonly string[], flag: string): string | undefined => {
  const at = args.indexOf(flag);
  return at < 0 ? undefined : args[at + 1];
};

/** A server's address, read as http(s): refused where it is not one. */
const serverOf = (typed: string): string => {
  let url: URL;
  try {
    url = new URL(typed);
  } catch {
    throw misused(`--server takes a daemon's address, as http://vps:7777, not ${typed}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw misused(`--server takes an http or https address, not ${typed}`);
  return url.origin;
};

/** The token a `--token-file` holds, its line breaks and spaces trimmed: refused where it cannot be read or is empty. */
const tokenIn = (file: string): string => {
  let token: string;
  try {
    token = fs.readFileSync(file, 'utf8').trim();
  } catch (err) {
    throw misused(`--token-file ${file} cannot be read (${err instanceof Error ? err.message : String(err)})`);
  }
  if (token === '') throw misused(`--token-file ${file} is empty: mint a token on the daemon's machine with \`nemia token add <name>\``);
  return token;
};

/** `nemia config set-context <name> --server <url> --token-file <file>`: a context added, or the fields typed changed on one held. */
function setContext(args: readonly string[], env: NodeJS.ProcessEnv): number {
  const [name, ...rest] = args;
  if (args.includes('--token'))
    throw misused('a token is never typed on the command line, where history keeps it: write it to a file and give --token-file <file>');
  if (name === undefined || name.startsWith('-')) throw misused('set-context takes the context’s name first');
  const config = configRead(env);
  if (name === LOCAL_CONTEXT) return setLocal(rest, config, env);
  const held = config.contexts.find((c) => c.name === name);
  const typedServer = flagOf(rest, '--server');
  const typedToken = flagOf(rest, '--token-file');
  const server = typedServer === undefined ? held?.server : serverOf(typedServer);
  const token = typedToken === undefined ? held?.token : tokenIn(typedToken);
  if (server === undefined || token === undefined) throw misused(`a new context takes both --server <url> and --token-file <file>`);
  const context = { name, server, token };
  configWritten({ ...config, contexts: [...config.contexts.filter((c) => c.name !== name), context] }, env);
  process.stdout.write(`context ${name} ${held === undefined ? 'added' : 'changed'}: ${server}\n`);
  return 0;
}

/**
 * `nemia config set-context local --token-file <file>`: a token of the person's kept for this machine's own daemon, which a store marked
 * exposed asks of every caller; `local` keeps naming this machine's store, so the verbs of the store still run in process. Refused: a
 * `--server`, since `local` is always this machine's.
 */
function setLocal(rest: readonly string[], config: ClientConfig, env: NodeJS.ProcessEnv): number {
  if (rest.includes('--server'))
    throw misused(`${LOCAL_CONTEXT} always names this machine’s store, at its lease’s address: give it --token-file <file> alone`);
  const typedToken = flagOf(rest, '--token-file');
  if (typedToken === undefined) throw misused(`set-context ${LOCAL_CONTEXT} takes --token-file <file>`);
  configWritten({ ...config, localToken: tokenIn(typedToken) }, env);
  process.stdout.write(`context ${LOCAL_CONTEXT}: this machine’s daemon is asked with your token
`);
  return 0;
}

/** `nemia config use-context <name>`: the context in use from now on, `local` for this machine's store. */
function useContext(args: readonly string[], env: NodeJS.ProcessEnv): number {
  const [name] = args;
  if (name === undefined || args.length !== 1) throw misused('use-context takes one context’s name');
  const config = configRead(env);
  if (name !== LOCAL_CONTEXT && !config.contexts.some((c) => c.name === name)) throw unheld(name);
  configWritten({ ...config, current: name === LOCAL_CONTEXT ? undefined : name }, env);
  process.stdout.write(`using context ${name}\n`);
  return 0;
}

/** `nemia config get-contexts`: each context, `local` first, the one in use marked, with its server; never a token. */
function getContexts(env: NodeJS.ProcessEnv): number {
  const config = configRead(env);
  const current = config.current ?? LOCAL_CONTEXT;
  const rows = [
    { name: LOCAL_CONTEXT, server: '(this machine’s store)' },
    ...config.contexts.map(({ name, server }) => ({ name, server })),
  ];
  const width = Math.max(4, ...rows.map((r) => r.name.length));
  const lines = [`CURRENT   ${'NAME'.padEnd(width)}   SERVER`];
  for (const { name, server } of rows) lines.push(`${name === current ? '*' : ' '}         ${name.padEnd(width)}   ${server}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

/** `nemia config current-context`: the context a command run now uses, `NEMIA_CONTEXT` over the file's. */
function currentContext(env: NodeJS.ProcessEnv): number {
  const chosen = chosenOf(env);
  if (chosen.kind === 'refused') throw unheld(chosen.name);
  process.stdout.write(`${chosen.kind === 'local' ? LOCAL_CONTEXT : chosen.name}\n`);
  return 0;
}

/** `nemia config <verb> …`, on the words after `config`: answers its exit code, or throws its refusal. */
export async function config(args: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const [verb, ...rest] = args;
  if (verb === undefined || verb === '--help' || verb === '-h') {
    process.stdout.write(`${USAGE.join('\n')}\n`);
    return 0;
  }
  if (verb === 'set-context') return setContext(rest, env);
  if (verb === 'use-context') return useContext(rest, env);
  if (verb === 'get-contexts') return getContexts(env);
  if (verb === 'current-context') return currentContext(env);
  throw misused(`it has no verb ${verb}`);
}
