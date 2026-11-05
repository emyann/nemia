/**
 * The templates group's handlers (`objects`' `Api`): the templates Nemia builds in, which no namespace holds, listed and read as objects
 * (`templateList`, `templateObject`), and each one's documents — its workflows, agents and skills — served in the Schemas a namespace
 * serves them in.
 *
 * A template's documents are its render with its parameters' defaults (`templateTree`, written once per digest), read as a factory's tree
 * is read: the request placed in a factory of the template's wiring whose tree is the render (`renderedIn`), then the definitions' own
 * readers of a tree (`treeWorkflowsHeld`, `treeAgentsHeld`, `treeSkillsHeld`), each held at origin `builtin`, in no namespace, with no
 * revision of the ledger's, which counts a definition by its bare name. A workflow is loaded in no factory, since the loader reads one
 * from the store by its name and the store holds none of a template's: its hires fill none of its steps there. Each program runs over
 * the request's own services (`inRequest`), so the builtin folder and the folder of renders are the app's.
 */
import { HttpApiBuilder } from 'effect/http-api';
import { templateList, templateObject, templateTree, type Factory } from 'agent-orchestrator';
import { Api } from 'objects';
import type { Served } from '../layer.ts';
import { agentObjectsOf, treeAgentsHeld } from '../definitions/agents.ts';
import { listed, servedNamed, servedOf } from '../definitions/served.ts';
import { skillObjectsOf, treeSkillsHeld } from '../definitions/skills.ts';
import { treeWorkflowsHeld, workflowObjectsOf } from '../definitions/workflows.ts';
import { queryOf } from '../factory-parts/parts.ts';
import { answered, answeredWrite } from './refused.ts';

/**
 * The request's services placed in the template `name`'s render, as a factory made from it is: its workflows and hires the render's
 * wiring, no schedules, its tree the render's folder, on the request's repository. `Missing` where Nemia builds in no template of that
 * name, `Invalid` where it does not render with its parameters' defaults.
 */
async function renderedIn(s: Served, name: string): Promise<Served> {
  const tree = await s.inRequest(templateTree(name));
  const factory: Factory = {
    name: tree.name,
    repos: [s.repo],
    workflows: tree.workflows,
    hires: tree.hires,
    schedules: {},
    tree: tree.dir,
  };
  return { ...s, factory };
}

/** The list a template's document of `plural` is named in, said by a refusal of one it lacks. */
const listPath = (name: string, plural: string) => `GET /api/templates/${name}/${plural}`;

/** The one object read of the one served, or a defect: `servedNamed` refused the name before anything was read. */
const theOne = <T>([one]: readonly T[], doc: string): T => {
  if (one === undefined) throw new Error(`${doc} was served and then not read.`);
  return one;
};

export const templatesHandlers = HttpApiBuilder.group(Api, 'templates', (handlers) =>
  handlers
    .handle('listAll', ({ query }) => answered((s) => s.inRequest(templateList(queryOf(query)))))
    .handle('get', ({ params: { name } }) => answered((s) => s.inRequest(templateObject(name))))
    .handle('workflows', ({ params: { name }, query }) =>
      answeredWrite(async (s) => {
        const at = await renderedIn(s, name);
        return listed(
          'Workflow',
          await workflowObjectsOf(at, servedOf(treeWorkflowsHeld(at, 'builtin'), undefined), undefined, false),
          queryOf(query),
        );
      }),
    )
    .handle('workflow', ({ params: { name, doc } }) =>
      answeredWrite(async (s) => {
        const at = await renderedIn(s, name);
        const one = servedNamed(treeWorkflowsHeld(at, 'builtin'), doc, undefined, listPath(name, 'workflows'));
        return theOne(await workflowObjectsOf(at, [one], undefined, false), doc);
      }),
    )
    .handle('agents', ({ params: { name }, query }) =>
      answeredWrite(async (s) => {
        const at = await renderedIn(s, name);
        return listed('Agent', await agentObjectsOf(at, servedOf(await treeAgentsHeld(at, 'builtin'), undefined)), queryOf(query));
      }),
    )
    .handle('agent', ({ params: { name, doc } }) =>
      answeredWrite(async (s) => {
        const at = await renderedIn(s, name);
        const one = servedNamed(await treeAgentsHeld(at, 'builtin'), doc, undefined, listPath(name, 'agents'));
        return theOne(await agentObjectsOf(at, [one]), doc);
      }),
    )
    .handle('skills', ({ params: { name }, query }) =>
      answeredWrite(async (s) => {
        const at = await renderedIn(s, name);
        return listed('Skill', await skillObjectsOf(at, servedOf(await treeSkillsHeld(at, 'builtin'), undefined)), queryOf(query));
      }),
    )
    .handle('skill', ({ params: { name, doc } }) =>
      answeredWrite(async (s) => {
        const at = await renderedIn(s, name);
        const one = servedNamed(await treeSkillsHeld(at, 'builtin'), doc, undefined, listPath(name, 'skills'));
        return theOne(await skillObjectsOf(at, [one]), doc);
      }),
    ),
);
