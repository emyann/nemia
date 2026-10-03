/**
 * `wf factory`: the store's factories listed, filed, given workflows and relieved of them, hired into, fired from and removed — its help,
 * its arguments, read off the command line, and what each prints.
 */
import {
  addFactory,
  attachWorkflow,
  detachWorkflow,
  factoriesDir,
  factoryLines,
  fireAgent,
  hireAgent,
  readFactories,
  removeFactory,
} from '../../runner.ts';
import { readFlags, usage } from '../flags.ts';

export const FACTORY_HELP = `wf factory [ls]
wf factory add <name> --repo <path> [--repo <path> ...]
wf factory attach <factory> <workflow>
wf factory detach <factory> <workflow>
wf factory hire <factory> <agent> --step <workflow>/<step>
wf factory fire <factory> --step <workflow>/<step>
wf factory rm <name>

A factory is a named grouping in the store: \${WF_ROOT:-~/.agent-workflows}/factories/, one <name>.json per
factory, naming the repositories its work is on, the workflows it offers and the agents it hires into their steps:

    { "repos": ["/home/me/code/app"], "workflows": ["build"], "hires": { "build/implement": "ada" } }

  wf factory     lists the default factory first — every run and card that names no factory; it is no file,
                 and is read, never written — then each factory by name with its repositories. A file that
                 does not read as a factory is listed with why.
  wf factory add files a factory: its name a lowercase slug (letters, digits, dashes; 40 at most), and one
                 --repo at least, each a directory, written as an absolute path and named once. Git is not asked.
  wf factory attach attaches a workflow, by its folder's name: the factory then offers it, and only the
                 workflows attached to it — none, until one is. Only the name is stored, and a step that
                 names its own agent is filled already; whether the workflow exists is judged at the start.
  wf factory detach takes a workflow back, once the factory hires no one into its steps.
  wf factory hire hires an agent into a step, <workflow>/<step> — the workflow by its folder's name, the step
                 by its file's, without .md: one agent a step, so a second hire replaces the first. Any agent
                 fills any step; it is found, when the run starts, where the step's own agent: would be.
  wf factory fire takes a step's hire back.
  wf factory rm  removes a factory's file, one that does not read included.

wf start --factory <name> starts a run in a factory, of a workflow attached to it: each step its hires fill runs
as its agent, and the start is refused while a step names no agent and is hired none, or names its own agent
and is hired one too. Every run is started in a factory: with no --factory, in the one whose repository holds
--repo or the directory wf start is typed in, and refused where none or two do; a card names its own, by its
factory: line or --factory. The default factory holds the history of runs and cards that named none, and an
agent's try; no start names it.

Refused by name, and nothing written: a name that is not a slug, the name default, an add with no --repo or
with a --repo that is not a directory, an add of a name already filed, an rm, attach, detach, hire or fire of a
name with no factory, a workflow's name that is empty, hidden, holds a slash or is agents or skills, a detach
of a workflow not attached or still hired into, a --step that is not <workflow>/<step>, a hire into a workflow
not attached, and a fire of a step with no hire. A start in a factory of a workflow it has not attached is
refused, naming the attach.`;

/** `wf factory add`'s flags, after the name: `--repo <path>`, once per repository. */
export function factoryAddHow(argv: string[]): { repos: string[] } {
  const { values } = readFlags(argv, {
    takes: { '--repo': "a repository's directory: wf factory add <name> --repo <path> [--repo <path> ...]" },
    repeats: ['--repo'],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf factory add does not take ${arg}. It takes the factory's name, then --repo <path>, once per repository.`
        : `wf factory add files one factory, and ${arg} is a second: wf factory add <name> --repo <path>, once per factory.`,
    twice: () => 'wf factory add takes --repo once per repository.',
  });
  return { repos: values['--repo'] ?? [] };
}

/** `--step <workflow>/<step>`, the one flag of `wf factory <verb>`, after `shape`, its positional arguments, as the refusals say them. */
function stepFlag(verb: 'hire' | 'fire', shape: string, argv: string[]): string {
  const { values } = readFlags(argv, {
    takes: { '--step': `the step, as <workflow>/<step>: wf factory ${verb} ${shape} --step build/implement` },
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf factory ${verb} does not take ${arg}. It takes ${shape}, then --step <workflow>/<step>.`
        : `wf factory ${verb} takes ${shape}, and ${arg} is one more: wf factory ${verb} ${shape} --step <workflow>/<step>, once per step.`,
    twice: () => `wf factory ${verb} takes --step once: one step at a time.`,
  });
  const step = values['--step']?.[0];
  if (step === undefined)
    usage(`wf factory ${verb} names the step with --step: wf factory ${verb} ${shape} --step <workflow>/<step>. Nothing was ${verb}d.`);
  return step;
}

/** `wf factory hire`'s arguments: the factory, the agent, then `--step`. */
export function factoryHireHow(args: string[]): { factory: string; agent: string; step: string } {
  const [factory, agent, ...more] = args;
  if (factory === undefined || agent === undefined || factory.startsWith('--') || agent.startsWith('--'))
    usage(
      'wf factory hire takes the factory, then the agent: wf factory hire <factory> <agent> --step <workflow>/<step>. Nothing was hired.',
    );
  return { factory, agent, step: stepFlag('hire', '<factory> <agent>', more) };
}

/** `wf factory fire`'s arguments: the factory, then `--step`. */
export function factoryFireHow(args: string[]): { factory: string; step: string } {
  const [factory, ...more] = args;
  if (factory === undefined || factory.startsWith('--'))
    usage('wf factory fire takes the factory first: wf factory fire <factory> --step <workflow>/<step>. Nothing was fired.');
  return { factory, step: stepFlag('fire', '<factory>', more) };
}

/** `wf factory attach` and `detach`'s arguments: the factory, then the workflow, and nothing else. */
export function factoryWorkflowHow(verb: 'attach' | 'detach', args: string[]): { factory: string; workflow: string } {
  const flag = args.find((a) => a.startsWith('-'));
  if (flag)
    usage(`wf factory ${verb} does not take ${flag}. It takes the factory, then the workflow: wf factory ${verb} <factory> <workflow>.`);
  const [factory, workflow, ...more] = args;
  if (factory === undefined || workflow === undefined)
    usage(
      `wf factory ${verb} takes the factory, then the workflow, by its folder's name: wf factory ${verb} <factory> <workflow>. Nothing was ${verb}ed.`,
    );
  if (more.length)
    usage(`wf factory ${verb} takes one workflow, and ${more[0]} is a second: wf factory ${verb} <factory> <workflow>, once per workflow.`);
  return { factory, workflow };
}

/** `wf factory attach`: one workflow attached to one factory, or said to be attached already. */
function factoryAttach(args: string[]): void {
  const how = factoryWorkflowHow('attach', args);
  const { file, already } = attachWorkflow(how);
  console.log(`${how.factory}  ${already ? 'already attached' : 'attached'} ${how.workflow}`);
  console.log(`${already ? 'unchanged' : 'attached'}: ${file}`);
}

/** `wf factory detach`: one workflow taken from one factory. */
function factoryDetach(args: string[]): void {
  const how = factoryWorkflowHow('detach', args);
  const { file } = detachWorkflow(how);
  console.log(`${how.factory}  detached ${how.workflow}`);
  console.log(`detached: ${file}`);
}

/** `wf factory hire`: one agent hired into one step, and the agent it replaced, if any. */
function factoryHire(args: string[]): void {
  const how = factoryHireHow(args);
  const { file, replaced } = hireAgent(how);
  console.log(`${how.factory}  ${how.step} ← ${how.agent}${replaced === undefined ? '' : ` (was ${replaced})`}`);
  console.log(`hired: ${file}`);
}

/** `wf factory fire`: one step's hire taken back. */
function factoryFire(args: string[]): void {
  const how = factoryFireHow(args);
  const { file, fired } = fireAgent(how);
  console.log(`${how.factory}  ${how.step}  fired ${fired}`);
  console.log(`fired: ${file}`);
}

/** `wf factory ls`: the default factory, then each in the store. */
function factoryList(args: string[]): void {
  if (args.length) usage(`wf factory ls takes nothing, and was given ${args[0]}: wf factory ls lists every factory.`);
  for (const line of factoryLines(readFactories())) console.log(line);
  console.log(`\nfile one: wf factory add <name> --repo <path> — remove one: wf factory rm <name> — in ${factoriesDir()}`);
}

/** `wf factory add`: one factory filed, and where. */
function factoryAdd(args: string[]): void {
  const [name, ...more] = args;
  if (name === undefined || name.startsWith('--'))
    usage("wf factory add takes the factory's name, first: wf factory add <name> --repo <path> [--repo <path> ...]. Nothing was filed.");
  const { factory, file } = addFactory({ name, repos: factoryAddHow(more).repos });
  console.log(`${factory.name}  ${factory.repos.join(', ')}`);
  console.log(`filed: ${file}`);
}

/** `wf factory rm`: one factory's file removed. */
function factoryRm(args: string[]): void {
  const [name, ...more] = args;
  if (name === undefined || name.startsWith('--'))
    usage('wf factory rm takes the name of the factory to remove, as wf factory ls lists it: wf factory rm <name>.');
  if (more.length) usage(`wf factory rm removes one factory, and ${more[0]} is a second: wf factory rm <name>, once per factory.`);
  const { file } = removeFactory(name);
  console.log(`${name}  removed — ${file}`);
}

/**
 * `wf factory` and its subcommands `ls` (the bare verb too), `add`, `attach`, `detach`, `hire`, `fire` and `rm`; anything else is refused,
 * naming the seven.
 */
export function factoryVerb(rest: string[]): void {
  const [sub, ...args] = rest;
  if (sub === '--help') return console.log(FACTORY_HELP);
  if (sub === undefined || sub === 'ls') return factoryList(args);
  if (sub === 'add') return factoryAdd(args);
  if (sub === 'attach') return factoryAttach(args);
  if (sub === 'detach') return factoryDetach(args);
  if (sub === 'hire') return factoryHire(args);
  if (sub === 'fire') return factoryFire(args);
  if (sub === 'rm') return factoryRm(args);
  return usage(
    `wf factory does not take ${sub}. It lists the factories — wf factory ls — files one with wf factory add <name> --repo <path>, attaches a workflow with wf factory attach <factory> <workflow>, detaches it with wf factory detach <factory> <workflow>, hires an agent into a step with wf factory hire <factory> <agent> --step <workflow>/<step>, fires it with wf factory fire <factory> --step <workflow>/<step>, and removes one with wf factory rm <name> (wf factory --help).`,
  );
}
