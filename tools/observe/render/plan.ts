/**
 * What a run of the render is asked to do, read from its command line before anything is started: the flags it knows, the dashboards
 * the checkout has, and where the files go. Every refusal here names the fix and exits 2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { boundOf } from './hold.ts';
import type { Dashboard } from './panels.ts';
import { refusal } from './stack.ts';

/** What one run of the command does. */
export type Plan = { observe: string; dashboards?: string[]; out: string; wait: number; hold?: number; stop?: string };

/** A dashboard of the checkout: its file's name without `.json`, and the file as read. */
export type Named = { name: string; uid: string; file: Dashboard };

/** The checkout's `tools/observe`, where this file is. */
const OBSERVE = path.join(import.meta.dirname, '..');

/** How long a render waits for the slot when `--wait` says nothing, in seconds. */
const WAIT_DEFAULT = 600;

/** The flags that take a value, and those that may. */
const VALUED = ['--dashboards', '--out', '--observe', '--wait', '--stop'];
const USAGE = 'render.ts [--dashboards <name,…>] [--out <dir>] [--observe <dir>] [--wait <seconds>] [--hold [<seconds>]] | --stop <name>';

/** The flags of `argv` with their values; refuses a word that is no flag of the command, and a flag left without its value. */
function flagsOf(argv: readonly string[]): Map<string, string | undefined> {
  const flags = new Map<string, string | undefined>();
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
    if (!VALUED.includes(flag) && flag !== '--hold') throw refusal(`${flag}: not a flag of the render; usage: ${USAGE}`);
    if (VALUED.includes(flag) && value === undefined) throw refusal(`${flag} needs a value; usage: ${USAGE}`);
    flags.set(flag, value);
    if (value !== undefined) i += 1;
  }
  return flags;
}

/** The plan `argv` asks for, the files going to `env.WF_ARTIFACTS` when a run gives one; refuses what `flagsOf` and `boundOf` refuse. */
export function planOf(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Plan {
  const flags = flagsOf(argv);
  const observe = path.resolve(flags.get('--observe') ?? OBSERVE);
  const wait = flags.get('--wait') ?? String(WAIT_DEFAULT);
  if (!/^\d+$/.test(wait)) throw refusal(`--wait ${wait}: a whole number of seconds; say --wait ${WAIT_DEFAULT}`);
  return {
    observe,
    out: path.resolve(flags.get('--out') ?? (env.WF_ARTIFACTS || path.join(observe, '..', '..', '.observe'))),
    wait: Number(wait),
    ...(flags.has('--dashboards') ? { dashboards: (flags.get('--dashboards') ?? '').split(',').filter(Boolean) } : {}),
    ...(flags.has('--hold') ? { hold: boundOf(flags.get('--hold')) } : {}),
    ...(flags.has('--stop') ? { stop: flags.get('--stop') } : {}),
  };
}

/** The dashboards of `observe` the plan asks for, every one when it names none; refuses a name no file has, listing those there are. */
export function dashboardsOf(observe: string, asked?: readonly string[]): Named[] {
  const dir = path.join(observe, 'dashboards');
  const names = fs.readdirSync(dir).flatMap((file) => (file.endsWith('.json') ? [file.slice(0, -'.json'.length)] : []));
  const unknown = (asked ?? []).filter((name) => !names.includes(name));
  if (unknown.length) throw refusal(`no dashboard ${unknown.join(', ')} in ${dir}: there are ${names.join(', ')}`);
  return (asked?.length ? asked : names).map((name) => {
    const file = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Dashboard;
    return { name, uid: file.uid, file };
  });
}
