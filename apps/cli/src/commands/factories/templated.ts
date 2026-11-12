/**
 * The runners of a factory made from a template: `nemia factory apply` makes one, `diff` previews an upgrade or a hand-made factory's
 * takeover, `adopt` takes one over and `upgrade` files an upgrade, each by the plan's digest the preview printed, and `resolve` gives a
 * conflict of an upgrade its choice, a `--file` read here and sent as its text.
 *
 * A `--template` is sent as `templateSent` says: a builtin template's name as it is; under this machine's context, a folder or an
 * archive by its whole path, which the factory made from it reads again on every pass, as the old path read it; under a remote one, an
 * archive's bytes, or a folder packed by this machine's `nemia template pack`, in base64, since the daemon's machine has neither.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Args, TemplateGiven } from 'objects';
import { chosenOf } from '../../context.ts';
import { captured } from '../../local.ts';
import { asked } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { textOf as fileText } from '../files.ts';
import { listArg, said, switchArg, textArg } from '../requests.ts';
import { repoSent, textOf, trustedLines } from './lines.ts';
import { adoptLines, approveLine, planLines, resolveLine, UNKNOWN } from './plan.ts';

/** A builtin template's name: lowercase words joined by dashes. */
const TEMPLATE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The archive `nemia template pack` writes of `folder` on this machine, read and removed; refused where it does not pack. */
async function packed(folder: string, command: string, env: NodeJS.ProcessEnv): Promise<Buffer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-template-'));
  try {
    const out = path.join(dir, 'template.tgz');
    const { code } = await captured(['template', 'pack', folder, '--out', out], env);
    if (code !== 0)
      throw new Refused(
        `nemia ${command} cannot send ${folder}, since nemia template pack ${folder} refused it: fix what it says, and try again.`,
        code,
      );
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The template `given` as the request sends it: a builtin's name as it is; under this machine's context, its whole path; under a remote
 * one, a file's bytes or a folder packed, in base64. Refused, under a remote context, where `given` is neither a file nor a folder.
 */
export async function templateSent(given: string, command: string, env: NodeJS.ProcessEnv = process.env): Promise<TemplateGiven> {
  if (TEMPLATE_NAME.test(given)) return { name: given };
  if (chosenOf(env).kind !== 'remote') return { path: path.resolve(given) };
  const at = fs.statSync(given, { throwIfNoEntry: false });
  if (at?.isFile()) return { archive: fs.readFileSync(given).toString('base64') };
  if (at?.isDirectory()) return { archive: (await packed(given, command, env)).toString('base64') };
  throw new Refused(
    `nemia ${command} sends the template ${path.resolve(given)} to the daemon, and there is no folder or archive there: name a builtin template, a template's folder or an archive nemia template pack wrote.`,
  );
}

/** The template `--template` names, sent; none where it is not given, for the api to refuse in its words. */
const templateOf = async (args: Args, command: string): Promise<{ template?: TemplateGiven }> => {
  const given = textArg(args, 'template');
  return given === undefined ? {} : { template: await templateSent(given, command) };
};

/** The `--set` words, where any were given. */
const setsOf = (args: Args): { sets?: readonly string[] } => {
  const sets = listArg(args, 'sets');
  return sets.length ? { sets } : {};
};

/** `nemia factory apply`: a factory made from a template, its repositories trusted unless `--no-trust`. */
export async function factoryApply(args: Args): Promise<number> {
  const name = textOf(args, 'name');
  const repos = listArg(args, 'repos').map((r) => repoSent(r));
  const payload = {
    ...(await templateOf(args, 'factory apply')),
    ...(repos.length ? { repos } : {}),
    ...setsOf(args),
    ...(switchArg(args, 'noTrust') ? { noTrust: true } : {}),
  };
  const made = await asked('factory apply', (c) => c.factories.apply({ params: { name }, payload }));
  const { template, place, tree } = made;
  said([
    `${made.name}  ${made.repos.join(', ')}`,
    `filed: ${made.file}`,
    `made from ${place === template.source ? template.source : `the builtin template ${template.source} (${place})`} at ${template.version}; the daemon renders its tree into ${tree} on its next pass (nemia up)`,
    ...trustedLines(made.name, made.trusts),
  ]);
  return 0;
}

/** `nemia factory diff`: the preview of a templated factory's upgrade, or of a hand-made one's takeover; nothing written. */
export async function factoryDiff(args: Args): Promise<number> {
  const factory = textOf(args, 'factory');
  const to = textArg(args, 'to');
  const payload = { ...(to === undefined ? {} : { to }), ...(await templateOf(args, 'factory diff')), ...setsOf(args) };
  const planned = await asked('factory diff', (c) => c.factories.diff({ params: { factory }, payload }));
  said(planned.kind === 'adopt' ? adoptLines(planned) : planLines(planned));
  return 0;
}

/** `nemia factory adopt`: a hand-made factory taken over by a template, by the plan's digest its preview printed. */
export async function factoryAdopt(args: Args): Promise<number> {
  const factory = textOf(args, 'factory');
  const plan = textArg(args, 'plan');
  const payload = { ...(await templateOf(args, 'factory adopt')), ...setsOf(args), ...(plan === undefined ? {} : { plan }) };
  const { name, file, template, tree } = await asked('factory adopt', (c) => c.factories.adopt({ params: { factory }, payload }));
  said([
    `${name}: taken over by ${template.source} at ${template.version}`,
    `filed: ${file}`,
    `runs from ${tree}; the daemon writes its status on its next pass (nemia up)`,
  ]);
  return 0;
}

/** `nemia factory upgrade`: an upgrade filed, by the plan's digest where its preview printed one. */
export async function factoryUpgrade(args: Args): Promise<number> {
  const factory = textOf(args, 'factory');
  const [to, plan] = [textArg(args, 'to'), textArg(args, 'plan')];
  const payload = {
    ...(to === undefined ? {} : { to }),
    ...(await templateOf(args, 'factory upgrade')),
    ...setsOf(args),
    ...(plan === undefined ? {} : { plan }),
    ...(switchArg(args, 'downgrade') ? { downgrade: true } : {}),
  };
  const filed = await asked('factory upgrade', (c) => c.factories.upgrade({ params: { factory }, payload }));
  const { name, from, file, dropped, conflicts } = filed;
  said([
    from === filed.to ? `${name}: its parameters at ${filed.to}` : `${name}: ${from ?? UNKNOWN} → ${filed.to}`,
    `filed: ${file}`,
    ...(dropped.length ? [`dropped: ${dropped.join(', ')}`] : []),
    conflicts
      ? `${conflicts} conflict${conflicts === 1 ? '' : 's'} wait for a choice: nemia factory diff ${name} --to ${filed.to} shows each, and nemia factory resolve its line; the daemon merges once each has one`
      : 'the daemon merges it on its next pass (nemia up)',
  ]);
  return 0;
}

/** The choice the resolve's arguments give: ours, theirs, or the text of `--file`, read here. */
const choiceOf = (args: Args): { ours: true } | { theirs: true } | { text: string } =>
  switchArg(args, 'ours')
    ? { ours: true }
    : switchArg(args, 'theirs')
      ? { theirs: true }
      : { text: fileText(textOf(args, 'file'), 'factory resolve') };

/** `nemia factory resolve`: one conflict of the upgrade under way given its choice, and what still waits. */
export async function factoryResolve(args: Args): Promise<number> {
  const factory = textOf(args, 'factory');
  const conflict = textOf(args, 'conflict');
  const payload = { conflict, ...choiceOf(args) };
  const { name, at, to, file, left, proposed, waits } = await asked('factory resolve', (c) =>
    c.factories.resolve({ params: { factory }, payload }),
  );
  said([
    `${name}: ${at} resolved for the upgrade to ${to} — ${file}`,
    ...(proposed === undefined
      ? []
      : [
          `the ${proposed.kind} ${proposed.name} is proposed as your choices compose it, ${proposed.proposal}: ${approveLine(name, proposed.proposal)}`,
        ]),
    left.length
      ? `${left.length} conflict${left.length === 1 ? '' : 's'} still wait for a choice: ${left.map((c) => resolveLine(name, c)).join('; ')}`
      : waits.length
        ? `every conflict has a choice: the daemon merges once ${waits.join(', ')} applied (${waits.map((p) => approveLine(name, p)).join('; ')})`
        : 'every conflict has a choice: the daemon merges on its next pass (nemia up)',
  ]);
  return 0;
}
