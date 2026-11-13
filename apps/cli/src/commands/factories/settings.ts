/**
 * The runners of what a factory gives the runs started in it: a volume mounted and taken off (`nemia factory volume add|rm`, its folder
 * sent through `pathSent`, the daemon keeping it by its whole path), a harness setting set and taken off (`setting set|rm`) and a
 * workflow's cost line (`cost-line set|rm`). Each prints, word for word as the old path did, what the answer says it wrote.
 */
import { type Args, NOT_THE_WORKSPACE } from 'objects';
import { asked } from '../../objects.ts';
import { pathSent, said } from '../requests.ts';
import { dollars, textOf, writtenOf } from './lines.ts';

/** How a volume is said: `:ro` or `:rw`, as docker compose marks it. */
const markOf = (readOnly: boolean): ':ro' | ':rw' => (readOnly ? ':ro' : ':rw');

/**
 * A volume as it is sent: its folder through `pathSent` and its mark as typed; one with no mark the api reads (`:ro`, `:rw`) sent whole
 * through `pathSent`, for the api to refuse in its words.
 */
export function volumeSent(spelled: string, env: NodeJS.ProcessEnv = process.env): string {
  const at = spelled.lastIndexOf(':');
  const mark = at < 0 ? '' : spelled.slice(at + 1);
  const folder = at < 0 ? '' : spelled.slice(0, at);
  return (mark === 'ro' || mark === 'rw') && folder.trim() !== '' ? `${pathSent(folder, env)}:${mark}` : pathSent(spelled, env);
}

/** `nemia factory volume add`: a folder mounted for every local step of a factory's runs, and how it was marked before. */
export async function factoryVolumeAdd(args: Args): Promise<number> {
  const factory = textOf(args, 'factory');
  const added = await asked('factory volume add', (c) =>
    c.factories.addVolume({ params: { factory }, payload: { volume: volumeSent(textOf(args, 'volume')) } }),
  );
  const { file, volume, was } = added;
  said([
    `${factory}  volume ${volume.path} ${markOf(volume.readOnly)}${was === null || was === volume.readOnly ? '' : ` (was ${markOf(was)})`}`,
    ...(volume.readOnly ? [] : [`writable for each step whose fence writes; ${NOT_THE_WORKSPACE}`]),
    `changed: ${file} — runs started from now on mount it; a run in flight keeps what it was started with`,
  ]);
  return 0;
}

/** `nemia factory volume rm`: a volume taken off a factory, by its path. */
export async function factoryVolumeRm(args: Args): Promise<number> {
  const factory = textOf(args, 'factory');
  const { file, removed } = await asked('factory volume rm', (c) =>
    c.factories.removeVolume({ params: { factory }, query: { path: pathSent(textOf(args, 'path')) } }),
  );
  said([`${factory}  volume ${removed} removed`, `changed: ${file}`]);
  return 0;
}

/** `nemia factory setting set`: a harness setting given to a factory's runs, printed as its file now holds it. */
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

/** `nemia factory setting rm`: a harness setting taken off a factory, by its key. */
export async function factorySettingRm(args: Args): Promise<number> {
  const [factory, setting] = [textOf(args, 'factory'), textOf(args, 'setting')];
  const answer = await asked('factory setting rm', (c) => c.factories.deleteSetting({ params: { name: factory, setting } }));
  said([`${factory}  setting ${setting} removed`, `changed: ${writtenOf(answer, 'factory setting rm').file}`]);
  return 0;
}

/** `nemia factory cost-line set`: the cost line of a workflow in a factory, and the line it replaced. */
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

/** `nemia factory cost-line rm`: the cost line of a workflow taken off a factory. */
export async function factoryCostLineRm(args: Args): Promise<number> {
  const [factory, workflow] = [textOf(args, 'factory'), textOf(args, 'workflow')];
  const answer = await asked('factory cost-line rm', (c) => c.factories.deleteCostLine({ params: { name: factory, workflow } }));
  said([
    `${factory}  cost line ${workflow} removed`,
    `changed: ${writtenOf(answer, 'factory cost-line rm').file} — a run in flight keeps the line it was started with`,
  ]);
  return 0;
}
