/**
 * The repository a run of a workflow works on in a factory (agent-orchestrator, src/factory/factory.ts, `workflowRepo`): a card names a
 * factory and a workflow and nothing about repositories, and a brief's `--repo` only finds the factory, so the factory alone places the
 * run. Each workflow it attaches works on one of its repositories, named in its wiring by the repository's folder name (`nemia factory
 * attach <factory> <workflow> --repo <name>`), as a step's `writable:` names one; a workflow it names none for works on the factory's
 * only repository.
 *
 * Refused, closed: a factory of several repositories whose wiring names none for the workflow (`unwired`), a name no repository of the
 * factory has (`unknown`), and a name two of them share (`shared`): each said by its caller with the `nemia factory attach … --repo` that
 * fixes it. Pure: the caller hands each repository with its folder name (`path.basename` of the path as `path.resolve` spells it), so no
 * law reads a path.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A repository of the factory: its path, as `path.resolve` spells it, and its folder's name. */
export type NamedRepo = { readonly path: string; readonly name: string };

/** Why a factory gives a workflow no repository, closed: several and none named, a name none has, a name two share. */
export type WorkflowRepoRefusal = 'unwired' | 'unknown' | 'shared';

/** The repository a workflow works on, by its path, or why the factory gives it none. */
export type WorkflowRepoOf = { readonly repo: string } | { readonly refused: WorkflowRepoRefusal };

/** The folder name the factory's wiring gives `workflow`, where it gives one: a prototype's name (`constructor`) is none. */
const wiredName = (wired: Readonly<Record<string, string>> | undefined, workflow: string): string | undefined =>
  wired !== undefined && Object.hasOwn(wired, workflow) ? wired[workflow] : undefined;

/** How many of `repos` have the folder name `name`. */
const named = (repos: readonly NamedRepo[], name: string): number => repos.filter((r) => r.name === name).length;

const workflowRepoSpec = spec<
  (repos: readonly NamedRepo[], wired: Readonly<Record<string, string>> | undefined, workflow: string) => WorkflowRepoOf
>({
  ensures: {
    oneOfItsOwn: {
      description: "A workflow is only ever given one of the factory's own repositories",
      condition: ({ input: [repos], output }) => !('repo' in output) || repos.some((r) => r.path === output.repo),
    },
    wiringWins: {
      description: 'A workflow the wiring names a repository for, by a name one repository alone has, works on that repository',
      condition: ({ input: [repos, wired, workflow], output }) => {
        const name = wiredName(wired, workflow);
        return (
          name === undefined ||
          named(repos, name) !== 1 ||
          ('repo' in output && repos.some((r) => r.path === output.repo && r.name === name))
        );
      },
    },
    unknownNameRefused: {
      description: 'A workflow the wiring names a repository for by a name no repository of the factory has is refused as unknown',
      condition: ({ input: [repos, wired, workflow], output }) => {
        const name = wiredName(wired, workflow);
        return name === undefined || named(repos, name) !== 0 || ('refused' in output && output.refused === 'unknown');
      },
    },
    sharedNameRefused: {
      description: 'A workflow the wiring names a repository for by a name two repositories share is refused as shared',
      condition: ({ input: [repos, wired, workflow], output }) => {
        const name = wiredName(wired, workflow);
        return name === undefined || named(repos, name) < 2 || ('refused' in output && output.refused === 'shared');
      },
    },
    theOnlyOne: {
      description: "A workflow the wiring names no repository for works on the factory's only repository",
      condition: ({ input: [repos, wired, workflow], output }) =>
        wiredName(wired, workflow) !== undefined || repos.length !== 1 || ('repo' in output && output.repo === repos[0]?.path),
    },
    severalNeedWiring: {
      description: 'A workflow the wiring names no repository for, in a factory of several, is refused as unwired, never guessed',
      condition: ({ input: [repos, wired, workflow], output }) =>
        wiredName(wired, workflow) !== undefined || repos.length < 2 || ('refused' in output && output.refused === 'unwired'),
    },
  },
});

/** `workflowRepo`'s type, which src/factory/factory.ts takes. */
export type WorkflowRepo = Implementation<typeof workflowRepoSpec>;
