/**
 * The factories group's handlers (`objects`' `Api`): the factories as objects, cluster-scoped — a page of them (`factoryList`), the
 * default first on the api's own repository, and one (`factoryObject`) — and a factory's sub-resources over the package's entries the
 * command line runs, each entry called by its `input` through `inRequest`: its rules (`nemia factory rules`), read, written and cleared;
 * its instruction, where it is kept (`nemia factory instruction`) and the words the store keeps (`nemia factory instruct`); its command
 * lines (`factoryCommandsOf`), built off the command table; its cost line per workflow, set and taken back (`nemia factory
 * cost-line`), its revisions policy (`nemia factory revisions`), a workflow attached and detached (`nemia factory attach`, `detach`) and
 * a harness setting set and taken off (`nemia factory setting`), each answered with the factory as it then reads; its places trusted
 * again where the store runs (`nemia factory trust`), answered with what was asked of each; and the factory removed (`nemia factory rm`),
 * answered with what was removed.
 *
 * And the writes that name a template or a folder, each answered with what its entry answers: a factory filed (`nemia factory add`), a
 * volume mounted and taken off (`nemia factory volume add`, `rm`), a factory made from a template (`nemia factory apply`), a hand-made one
 * taken over (`nemia factory adopt`), either previewed (`nemia factory diff`), an upgrade filed (`nemia factory upgrade`) and a
 * conflict's choice, sent as its text (`nemia factory resolve`). A repository's or a volume's path names a folder of this machine by its
 * whole path, and a repository may be a git URL instead, which this machine clones under its store with its own git credentials
 * (`cloneTarget`, then the verb's clone, refused on the spot with the setup to do); a template sent packed is kept under the store while a factory is made from it (`withTemplateTaken`), and a preview's or a
 * refused request's is removed as the request ends.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import {
  cloneTarget,
  factoryTable,
  factoryCommandsOf,
  factoryList,
  factoryObject,
  FACTORY_ATTACH,
  FACTORY_COST_LINE_RM,
  FACTORY_COST_LINE_SET,
  FACTORY_DETACH,
  FACTORY_INSTRUCT,
  FACTORY_INSTRUCTION,
  FACTORY_REVISIONS,
  FACTORY_RM,
  FACTORY_RULES,
  FACTORY_SETTING_RM,
  FACTORY_SETTING_SET,
  FACTORY_TRUST,
  FACTORY_ADD,
  FACTORY_ADOPT,
  FACTORY_APPLY,
  FACTORY_PLAN,
  FACTORY_RESOLVE,
  FACTORY_UPGRADE,
  FACTORY_VOLUME_ADD,
  FACTORY_VOLUME_RM,
  Invalid as Refused,
  withResolutionProposerAs,
  withTemplateTaken,
} from 'agent-orchestrator';
import {
  Api,
  type FactoryAdoptWrite,
  type FactoryApplyWrite,
  type FactoryCreate,
  type FactoryDiffWrite,
  type FactoryPlan,
  type FactoryResolveWrite,
  type FactoryUpgradeWrite,
  type TemplateGiven,
} from 'objects';
import type { Served } from '../layer.ts';
import { defaultRepo, factoryNamed, queryOf } from './parts/index.ts';
import { answered, answeredWrite } from '../objects/refused.ts';
import { wantsTable } from '../objects/table.ts';

/** The rules of the factory `name`, read, written (`words`) or cleared, as `nemia factory rules` does it. */
const rules = (method: string, name: string, args: { words?: string; clear?: boolean }) =>
  answered(async (s: Served) => {
    factoryNamed(`${method} /api/factories/${name}/rules`, name);
    return s.inRequest(FACTORY_RULES.handler({ factory: name, ...args }));
  });

/** The instruction of the factory `name`, read or placed (`path`, `store`, `clear`), as `nemia factory instruction` does it. */
const instruction = (method: string, name: string, args: { path?: string; store?: boolean; clear?: boolean }) =>
  answered(async (s: Served) => {
    factoryNamed(`${method} /api/factories/${name}/instruction`, name);
    return s.inRequest(FACTORY_INSTRUCTION.handler({ factory: name, ...args }));
  });

/** The words the store keeps as the factory `name`'s instruction, written or cleared, as `nemia factory instruct` does it. */
const instruct = (method: string, name: string, args: { words?: string; clear?: boolean }) =>
  answered(async (s: Served) => {
    factoryNamed(`${method} /api/factories/${name}/instruction/words`, name);
    return s.inRequest(FACTORY_INSTRUCT.handler({ factory: name, ...args }));
  });

/**
 * The cost line of `workflow` in the factory `name`, set (`usd`) or taken back, as `nemia factory cost-line` does it, answering
 * the factory after.
 */
const costLine = (method: string, name: string, workflow: string, usd?: number) =>
  answeredWrite(async (s: Served) => {
    factoryNamed(`${method} /api/factories/${name}/costlines/${workflow}`, name);
    await s.inRequest(
      usd === undefined
        ? FACTORY_COST_LINE_RM.handler({ factory: name, workflow })
        : FACTORY_COST_LINE_SET.handler({ factory: name, workflow, usd }),
    );
    return s.inRequest(factoryObject(s.home, defaultRepo(s), name));
  });

/**
 * `write`, one of the package's writes of the factory `name` (`route` the request, named in a refusal of the name), run in the request,
 * then the factory as it reads after it.
 */
const writtenThen = (route: string, name: string, write: (s: Served) => Promise<unknown>) =>
  answeredWrite(async (s: Served) => {
    factoryNamed(route, name);
    await write(s);
    return s.inRequest(factoryObject(s.home, defaultRepo(s), name));
  });

/**
 * Each of `values` that `isPath` reads as a path, as a folder of this machine, by its whole path: a relative one is refused `Invalid`,
 * `route` and `key` named, since no folder the caller's command ran from is this machine's. `orElse`, where given, is the other fix a
 * refusal names.
 */
const wholePaths = (
  route: string,
  key: string,
  values: readonly string[] | undefined,
  isPath: (given: string) => boolean = () => true,
  orElse = '',
): void => {
  const relative = (values ?? []).filter((given) => isPath(given) && !path.isAbsolute(given));
  if (relative.length)
    throw new Refused({
      message: `${route}: ${key} names a folder of the machine the api runs on by its whole path, and ${relative.join(', ')} is not one: give it from /${orElse}.`,
    });
};

/** Whether a repository given names a folder, as the verb reads it (`cloneTarget`): a URL or a refused one is the verb's to judge. */
const repoPath = (given: string): boolean => cloneTarget(given).kind === 'path';

/** The other fix a refusal of a repository's relative path names. */
const OR_URL = ', or give the repository by its git URL for this machine to clone';

/** `repos` held to the whole-path rule where they are paths, `route` named in a refusal. */
const wholeRepos = (route: string, repos: readonly string[] | undefined): void => wholePaths(route, 'repos', repos, repoPath, OR_URL);

/**
 * The program `run` makes of a template's source, given the template sent (`withTemplateTaken`, the archive kept as `keep` says), or
 * of none where none was sent, for the verb to refuse in its own words.
 */
const withTemplate = <A, E, R>(
  given: TemplateGiven | undefined,
  keep: 'never' | 'made',
  run: (source: string | undefined) => Effect.Effect<A, E, R>,
) => (given === undefined ? run(undefined) : withTemplateTaken(given, keep, run));

/**
 * A preview as the Api answers it: an upgrade's merge without its files' builds, a version no status names left out; a takeover as it
 * is.
 */
const planOf = (planned: Effect.Success<ReturnType<typeof FACTORY_PLAN.handler>>): FactoryPlan => {
  if (planned.kind === 'adopt') return planned;
  const { name, from, to, merge, next, switched } = planned;
  return {
    kind: 'upgrade',
    name,
    ...(from === undefined ? {} : { from }),
    to,
    merge: { base: merge.base, merged: merge.merged, conflicts: merge.conflicts },
    next: { line: next.line, digest: next.digest, dropped: next.dropped },
    ...(switched === undefined ? {} : { switched }),
  };
};

/**
 * `nemia factory add`: the factory `name` filed on `repos`, each by its whole path or a git URL this machine clones, its places trusted
 * unless `noTrust`.
 */
const created = ({ name, repos, noTrust }: FactoryCreate) =>
  answeredWrite(async (s: Served) => {
    factoryNamed('POST /api/factories', name);
    wholeRepos('POST /api/factories', repos);
    return s.inRequest(FACTORY_ADD.handler({ name, repos, noTrust }));
  });

/** `nemia factory volume add`: `volume`, a folder by its whole path and its mark, mounted for the factory's runs. */
const volumeAdded = (factory: string, volume: string) =>
  answeredWrite(async (s: Served) => {
    const route = `POST /api/factories/${factory}/volumes`;
    factoryNamed(route, factory);
    wholePaths(route, 'volume', [volume]);
    return s.inRequest(FACTORY_VOLUME_ADD.handler({ factory, volume }));
  });

/** `nemia factory volume rm`: the volume at `at`, by its whole path, taken off the factory. */
const volumeRemoved = (factory: string, at: string) =>
  answeredWrite(async (s: Served) => {
    const route = `DELETE /api/factories/${factory}/volumes`;
    factoryNamed(route, factory);
    wholePaths(route, 'path', [at]);
    return s.inRequest(FACTORY_VOLUME_RM.handler({ factory, path: at }));
  });

/**
 * `nemia factory apply`: the factory `name` made from the template sent, kept under the store once it is filed, on `repos`, each by its
 * whole path or a git URL this machine clones.
 */
const applied = (name: string, { template, repos, sets, noTrust }: FactoryApplyWrite) =>
  answeredWrite(async (s: Served) => {
    const route = `POST /api/factories/${name}/apply`;
    factoryNamed(route, name);
    wholeRepos(route, repos);
    return s.inRequest(withTemplate(template, 'made', (source) => FACTORY_APPLY.handler({ name, template: source, repos, sets, noTrust })));
  });

/** `nemia factory adopt`: the hand-made `factory` taken over by the template sent, by the plan its preview printed. */
const adopted = (factory: string, { template, sets, plan }: FactoryAdoptWrite) =>
  answeredWrite(async (s: Served) => {
    factoryNamed(`POST /api/factories/${factory}/adopt`, factory);
    return s.inRequest(withTemplate(template, 'made', (source) => FACTORY_ADOPT.handler({ factory, template: source, sets, plan })));
  });

/** `nemia factory diff`: the upgrade or the takeover of `factory` previewed, nothing written and nothing sent kept. */
const previewed = (factory: string, { to, template, sets }: FactoryDiffWrite) =>
  answeredWrite(async (s: Served) => {
    factoryNamed(`POST /api/factories/${factory}/diff`, factory);
    return planOf(
      await s.inRequest(withTemplate(template, 'never', (source) => FACTORY_PLAN.handler({ factory, to, template: source, sets }))),
    );
  });

/** `nemia factory upgrade`: `factory`'s upgrade filed, from the template sent where one was. */
const upgraded = (factory: string, { to, template, sets, plan, downgrade }: FactoryUpgradeWrite) =>
  answeredWrite(async (s: Served) => {
    factoryNamed(`POST /api/factories/${factory}/upgrade`, factory);
    const { from, ...filed } = await s.inRequest(
      withTemplate(template, 'made', (source) => FACTORY_UPGRADE.handler({ factory, to, template: source, sets, plan, downgrade })),
    );
    return { ...filed, ...(from === undefined ? {} : { from }) };
  });

/** `nemia factory resolve`: the choice for one conflict of `factory`'s upgrade, an owner's resolution proposed by the request's caller. */
const resolved = (factory: string, { conflict, ours, theirs, text }: FactoryResolveWrite) =>
  answeredWrite(async (s: Served) => {
    factoryNamed(`POST /api/factories/${factory}/resolve`, factory);
    const proposing = withResolutionProposerAs(s.caller, { home: s.home, repo: s.repo });
    return s.inRequest(proposing(FACTORY_RESOLVE.handler({ factory, conflict, ours, theirs, text })));
  });

export const factoriesHandlers = HttpApiBuilder.group(Api, 'factories', (handlers) =>
  handlers
    .handle('listAll', ({ query }) =>
      Effect.flatMap(wantsTable, (table) =>
        answered(async (s) => {
          const list = await s.inRequest(factoryList(s.home, defaultRepo(s), queryOf(query)));
          return table ? factoryTable(list) : list;
        }),
      ),
    )
    .handle('get', ({ params: { name } }) =>
      answered((s) => {
        factoryNamed(`GET /api/factories/${name}`, name);
        return s.inRequest(factoryObject(s.home, defaultRepo(s), name));
      }),
    )
    .handle('rules', ({ params: { name } }) => rules('GET', name, {}))
    .handle('putRules', ({ params: { name }, payload }) => rules('PUT', name, { words: payload.words, clear: false }))
    .handle('deleteRules', ({ params: { name } }) => rules('DELETE', name, { clear: true }))
    .handle('instruction', ({ params: { name } }) => instruction('GET', name, {}))
    .handle('putInstruction', ({ params: { name }, payload }) =>
      instruction('PUT', name, 'path' in payload ? { path: payload.path, clear: false } : { store: true, clear: false }),
    )
    .handle('deleteInstruction', ({ params: { name } }) => instruction('DELETE', name, { clear: true }))
    .handle('putInstructionWords', ({ params: { name }, payload }) => instruct('PUT', name, { words: payload.words, clear: false }))
    .handle('deleteInstructionWords', ({ params: { name } }) => instruct('DELETE', name, { clear: true }))
    .handle('putCostLine', ({ params: { name, workflow }, payload }) => costLine('PUT', name, workflow, payload.usd))
    .handle('deleteCostLine', ({ params: { name, workflow } }) => costLine('DELETE', name, workflow))
    .handle('delete', ({ params: { name } }) =>
      answeredWrite(async (s: Served) => {
        factoryNamed(`DELETE /api/factories/${name}`, name);
        const { file, instruction } = await s.inRequest(FACTORY_RM.handler({ factory: name }));
        return { name, file, instruction };
      }),
    )
    .handle('setRevisions', ({ params: { name }, payload: { revisions } }) =>
      writtenThen(`PUT /api/factories/${name}/revisions`, name, (s) =>
        s.inRequest(FACTORY_REVISIONS.handler({ factory: name, revisions })),
      ),
    )
    .handle('trust', ({ params: { name } }) =>
      answeredWrite(async (s: Served) => {
        factoryNamed(`POST /api/factories/${name}/trust`, name);
        return s.inRequest(FACTORY_TRUST.handler({ factory: name }));
      }),
    )
    .handle('attach', ({ params: { name, workflow } }) =>
      writtenThen(`PUT /api/factories/${name}/workflows/${workflow}`, name, (s) =>
        s.inRequest(FACTORY_ATTACH.handler({ factory: name, workflow })),
      ),
    )
    .handle('detach', ({ params: { name, workflow } }) =>
      writtenThen(`DELETE /api/factories/${name}/workflows/${workflow}`, name, (s) =>
        s.inRequest(FACTORY_DETACH.handler({ factory: name, workflow })),
      ),
    )
    .handle('putSetting', ({ params: { name, setting }, payload: { value } }) =>
      writtenThen(`PUT /api/factories/${name}/settings/${setting}`, name, (s) =>
        s.inRequest(FACTORY_SETTING_SET.handler({ factory: name, setting, value })),
      ),
    )
    .handle('deleteSetting', ({ params: { name, setting } }) =>
      writtenThen(`DELETE /api/factories/${name}/settings/${setting}`, name, (s) =>
        s.inRequest(FACTORY_SETTING_RM.handler({ factory: name, setting })),
      ),
    )
    .handle('commands', ({ params: { name } }) =>
      answered((s) => {
        factoryNamed(`GET /api/factories/${name}/commands`, name);
        return s.inRequest(factoryCommandsOf(s.home, defaultRepo(s), name));
      }),
    )
    .handle('create', ({ payload }) => created(payload))
    .handle('addVolume', ({ params: { factory }, payload: { volume } }) => volumeAdded(factory, volume))
    .handle('removeVolume', ({ params: { factory }, query: { path: at } }) => volumeRemoved(factory, at))
    .handle('apply', ({ params: { name }, payload }) => applied(name, payload))
    .handle('adopt', ({ params: { factory }, payload }) => adopted(factory, payload))
    .handle('diff', ({ params: { factory }, payload }) => previewed(factory, payload))
    .handle('upgrade', ({ params: { factory }, payload }) => upgraded(factory, payload))
    .handle('resolve', ({ params: { factory }, payload }) => resolved(factory, payload)),
);
