/**
 * The runners of what a factory gives the runs started in it: a volume mounted and taken off (`nemia factory volume add|rm`, its folder
 * or git URL sent through `repoSent`, the daemon keeping it by its whole path), a harness setting set and taken off (`setting set|rm`) and
 * a
 * workflow's cost line (`cost-line set|rm`). Each prints, word for word as the old path did, what the answer says it wrote.
 */
import type { Args } from 'objects';
import { asked } from '../../objects.ts';
import { said, switchArg } from '../requests.ts';
import { Refused } from '../../refused.ts';
import { dollars, repoSent, textOf, trustedLines, volumeSent, writtenOf } from './lines.ts';

/** How a volume is said: `:ro` or `:rw`, as docker compose marks it. */
const markOf = (readOnly: boolean): ':ro' | ':rw' => (readOnly ? ':ro' : ':rw');

/**
 * A volume's switch as typed, `on` or `off`, as the api takes it: `{ [key]: true }` or `{ [key]: false }`, nothing where it was not given,
 * and refused where it is neither.
 * @param args The words typed after the command's name, parsed against its words.
 * @param key The switch's key, `claudeMd` or `skills`.
 */
const onOff = (args: Args, key: 'claudeMd' | 'skills'): { claudeMd?: boolean; skills?: boolean } => {
  const given = args[key];
  if (given === 'on') return { [key]: true };
  if (given === 'off') return { [key]: false };
  if (given === undefined) return {};
  const flag = key === 'claudeMd' ? '--claude-md' : '--skills';
  throw new Refused(`nemia factory volume add takes ${flag} on or ${flag} off, not ${JSON.stringify(given)}. Nothing was changed.`);
};

/** A volume's switches where they are not the defaults, as a person types them: ` --claude-md on`, ` --skills off`. */
const switchesSaid = (v: { claudeMd?: boolean; skills?: boolean }): string =>
  `${v.claudeMd === true ? ' --claude-md on' : ''}${v.skills === false ? ' --skills off' : ''}`;

/**
 * `nemia factory volume add`: a writable volume, a repository the factory works on, its place trusted unless `--no-trust`; or a
 * read-only one, mounted for every local step of its runs; and how it was marked before.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function factoryVolumeAdd(args: Args): Promise<number> {
  const factory = textOf(args, 'factory');
  const added = await asked('factory volume add', (c) =>
    c.factories.addVolume({
      params: { factory },
      payload: {
        volume: volumeSent(textOf(args, 'volume')),
        ...(switchArg(args, 'noTrust') ? { noTrust: true } : {}),
        ...onOff(args, 'claudeMd'),
        ...onOff(args, 'skills'),
      },
    }),
  );
  const { file, volume, was, trusts } = added;
  said([
    `${factory}  volume ${volume.path} ${markOf(volume.readOnly)}${was === null || was === volume.readOnly ? '' : ` (was ${markOf(was)})`}${switchesSaid(volume)}`,
    ...(volume.readOnly ? [] : ['a repository the factory works on: a run on it works in a worktree of its own']),
    `changed: ${file} — runs started from now on mount it; a run in flight keeps what it was started with`,
    ...trustedLines(factory, trusts),
  ]);
  return 0;
}

/**
 * `nemia factory volume rm`: a volume taken off a factory, by its path or the git URL it was cloned from.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function factoryVolumeRm(args: Args): Promise<number> {
  const factory = textOf(args, 'factory');
  const { file, removed } = await asked('factory volume rm', (c) =>
    c.factories.removeVolume({ params: { factory }, query: { path: repoSent(textOf(args, 'path')) } }),
  );
  said([`${factory}  volume ${removed} removed`, `changed: ${file}`]);
  return 0;
}

/**
 * `nemia factory setting set`: a harness setting given to a factory's runs, printed as its file now holds it.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function factorySettingSet(args: Args): Promise<number> {
  const [factory, setting] = [textOf(args, 'factory'), textOf(args, 'setting')];
  const answer = await asked('factory setting set', (c) =>
    c.factories.putSetting({ params: { name: factory, setting }, payload: { value: textOf(args, 'value') } }),
  );
  const dot = setting.indexOf('.');
  const value = answer.spec.harnessSettings?.[setting.slice(0, dot)]?.[setting.slice(dot + 1)];
  said([
    `${factory}  setting ${setting} ${JSON.stringify(value)}`,
    `changed: ${writtenOf(answer, 'factory setting set').file} — runs started from now on are given it; a run in flight keeps what it was started with`,
  ]);
  return 0;
}

/**
 * `nemia factory setting rm`: a harness setting taken off a factory, by its key.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function factorySettingRm(args: Args): Promise<number> {
  const [factory, setting] = [textOf(args, 'factory'), textOf(args, 'setting')];
  const answer = await asked('factory setting rm', (c) => c.factories.deleteSetting({ params: { name: factory, setting } }));
  said([`${factory}  setting ${setting} removed`, `changed: ${writtenOf(answer, 'factory setting rm').file}`]);
  return 0;
}

/**
 * `nemia factory cost-line set`: the cost line of a workflow in a factory, and the line it replaced.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function factoryCostLineSet(args: Args): Promise<number> {
  const [factory, workflow] = [textOf(args, 'factory'), textOf(args, 'workflow')];
  const usd = Number(textOf(args, 'usd'));
  const answer = await asked('factory cost-line set', (c) =>
    c.factories.putCostLine({ params: { name: factory, workflow }, payload: { usd } }),
  );
  const { file, replaced } = writtenOf(answer, 'factory cost-line set');
  said([
    `${factory}  cost line ${workflow} ${dollars(answer.spec.costLines?.[workflow] ?? usd)}${replaced === null || replaced === undefined ? '' : ` (was ${dollars(replaced)})`}`,
    `changed: ${file} — runs started from now on are held to it; a run in flight keeps the line it was started with`,
  ]);
  return 0;
}

/**
 * `nemia factory cost-line rm`: the cost line of a workflow taken off a factory.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function factoryCostLineRm(args: Args): Promise<number> {
  const [factory, workflow] = [textOf(args, 'factory'), textOf(args, 'workflow')];
  const answer = await asked('factory cost-line rm', (c) => c.factories.deleteCostLine({ params: { name: factory, workflow } }));
  said([
    `${factory}  cost line ${workflow} removed`,
    `changed: ${writtenOf(answer, 'factory cost-line rm').file} — a run in flight keeps the line it was started with`,
  ]);
  return 0;
}
