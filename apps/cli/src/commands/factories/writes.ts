/**
 * The runners of a factory's own writes: `nemia factory add` (its repositories sent as `repoSent` says), `attach` and `detach` a
 * workflow, `hire` and `fire` an agent of a step (the Hire named `<workflow>.<step>`), `revisions`, `trust` and `rm`. Each asks its
 * endpoint and prints, word for word as the old path did, what the answer says it wrote (`writtenOf`).
 */
import { type Args, REVISIONS_POLICIES } from 'objects';
import { asked } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { listArg, said, switchArg } from '../requests.ts';
import { repoSent, textOf, trustedLines, writtenOf } from './lines.ts';

/** `nemia factory add`: the factory filed on its repositories, then the trust asked for each place unless `--no-trust`. */
export async function factoryAdd(args: Args): Promise<number> {
  const name = textOf(args, 'name');
  const repos = listArg(args, 'repos').map((r) => repoSent(r));
  const filed = await asked('factory add', (c) =>
    c.factories.create({ payload: { name, repos, ...(switchArg(args, 'noTrust') ? { noTrust: true } : {}) } }),
  );
  said([`${filed.name}  ${filed.repos.join(', ')}`, `filed: ${filed.file}`, ...trustedLines(filed.name, filed.trusts)]);
  return 0;
}

/** `nemia factory attach`: one workflow given to one factory, or that it had it already. */
export async function factoryAttach(args: Args): Promise<number> {
  const [factory, workflow] = [textOf(args, 'factory'), textOf(args, 'workflow')];
  const answer = await asked('factory attach', (c) => c.factories.attach({ params: { name: factory, workflow } }));
  const { file, already } = writtenOf(answer, 'factory attach');
  said([
    `${factory}  ${already === true ? 'already attached' : 'attached'} ${workflow}`,
    `${already === true ? 'unchanged' : 'attached'}: ${file}`,
  ]);
  return 0;
}

/** `nemia factory detach`: one workflow taken from one factory. */
export async function factoryDetach(args: Args): Promise<number> {
  const [factory, workflow] = [textOf(args, 'factory'), textOf(args, 'workflow')];
  const answer = await asked('factory detach', (c) => c.factories.detach({ params: { name: factory, workflow } }));
  said([`${factory}  detached ${workflow}`, `detached: ${writtenOf(answer, 'factory detach').file}`]);
  return 0;
}

/** The Hire's name of the step `<workflow>/<step>`: `<workflow>.<step>`. */
const hireName = (step: string): string => step.replace('/', '.');

/** `nemia factory hire`: an agent hired into a workflow's step, and the one it replaced. */
export async function factoryHire(args: Args): Promise<number> {
  const [factory, agent, step] = [textOf(args, 'factory'), textOf(args, 'agent'), textOf(args, 'step')];
  const answer = await asked('factory hire', (c) =>
    c.hires.put({ params: { namespace: factory, name: hireName(step) }, payload: { agent } }),
  );
  const { file, was } = writtenOf(answer, 'factory hire');
  said([`${factory}  ${step} ← ${agent}${was === null || was === undefined || was === agent ? '' : ` (was ${was})`}`, `hired: ${file}`]);
  return 0;
}

/** `nemia factory fire`: a step's hire taken back, and the agent fired. */
export async function factoryFire(args: Args): Promise<number> {
  const [factory, step] = [textOf(args, 'factory'), textOf(args, 'step')];
  const answer = await asked('factory fire', (c) => c.hires.delete({ params: { namespace: factory, name: hireName(step) } }));
  const { file, was } = writtenOf(answer, 'factory fire');
  said([`${factory}  ${step}  fired ${was ?? ''}`, `fired: ${file}`]);
  return 0;
}

/** `nemia factory revisions`: whether a factory's runs follow merged revisions, and what it said before. */
export async function factoryRevisions(args: Args): Promise<number> {
  const factory = textOf(args, 'factory');
  const revisions = REVISIONS_POLICIES.find((p) => p === textOf(args, 'revisions'));
  if (revisions === undefined)
    throw new Refused(
      `nemia factory revisions takes follow or pinned: nemia factory revisions ${factory} follow|pinned. Nothing was changed.`,
    );
  const answer = await asked('factory revisions', (c) => c.factories.setRevisions({ params: { name: factory }, payload: { revisions } }));
  const { file, was } = writtenOf(answer, 'factory revisions');
  said([
    `${factory}  revisions: ${revisions}${was === null || was === undefined || was === revisions ? '' : ` (was ${was})`}`,
    `changed: ${file}`,
  ]);
  return 0;
}

/** `nemia factory trust`: the trust of each of a factory's places asked again, and what was done of it. */
export async function factoryTrust(args: Args): Promise<number> {
  const factory = textOf(args, 'factory');
  const { name, trusts } = await asked('factory trust', (c) => c.factories.trust({ params: { name: factory } }));
  const lines = trustedLines(name, trusts);
  said(lines.length ? lines : [`${name}  every place is trusted already: nothing was written`]);
  return 0;
}

/** `nemia factory rm`: a factory's file removed, and the instruction and rules the store kept for it. */
export async function factoryRm(args: Args): Promise<number> {
  const factory = textOf(args, 'factory');
  const { file, instruction } = await asked('factory rm', (c) => c.factories.delete({ params: { name: factory } }));
  said([`${factory}  removed — ${file}`, ...(instruction === null ? [] : [`instruction removed: ${instruction}`])]);
  return 0;
}
