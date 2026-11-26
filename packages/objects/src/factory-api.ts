/**
 * The factories and their parts as groups of the `Api` (`api.ts`): the factories, which no namespace holds; and in each factory's
 * namespace its MCP servers (with the store's library of servers, in no namespace), schedules, hires, adds from the library and volumes.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from 'effect/http-api';
import { Table } from './table.ts';
import {
  Factory,
  FactoryAdopted,
  FactoryAdoptWrite,
  FactoryApplied,
  FactoryApplyWrite,
  FactoryCommands,
  FactoryCreate,
  FactoryCreated,
  FactoryDiffWrite,
  FactoryPlan,
  FactoryResolved,
  FactoryResolveWrite,
  FactoryUpgraded,
  FactoryUpgradeWrite,
  VolumeAdded,
  VolumeRemoved,
  VolumeWrite,
  FactoryCostLineWrite,
  FactoryInstruction,
  FactoryInstructionWords,
  FactoryInstructionWrite,
  FactoryList,
  FactoryRemoved,
  FactoryRevisionsWrite,
  FactoryRules,
  FactoryRulesWrite,
  FactoryAttachWrite,
  FactorySettingWrite,
  FactoryTrusted,
} from './factory.ts';
import { FactoryHome } from './factory-home.ts';
import { FactoryExport, FactoryImported, FactoryImportWrite, MOVE_CARDS } from './factory-move.ts';
import { Hire, HireList, HireWrite } from './hire.ts';
import { LibraryAdd, LibraryAddList } from './library.ts';
import { McpServer, McpServerList, McpServerWrite, SignInCallback, SignInStarted, SignInState, SignedOut } from './mcp-server.ts';
import { Schedule, ScheduleList, ScheduleWrite } from './schedule.ts';
import { Trigger, TriggerList, TriggerWrite } from './trigger.ts';
import { Program, ProgramList } from './program.ts';
import { Volume, VolumeList, VolumeSwitchesWrite } from './volume.ts';
import {
  cardParams,
  namespaceParams,
  factoryParams,
  factoryWorkflowParams,
  factorySettingParams,
  factoryOwnParams,
  libraryParams,
  libraryAddParams,
} from './api-params.ts';
import { listQuery, objectErrors } from './api-errors.ts';

/** The factory's kinds and a page of each, named so that the document holds each as a component. */
const FactoryObject = Factory.annotate({ identifier: 'Factory' });
const FactoryListObject = FactoryList.annotate({ identifier: 'FactoryList' });
const FactoryCommandsObject = FactoryCommands.annotate({ identifier: 'FactoryCommands' });
const FactoryTrustedObject = FactoryTrusted.annotate({ identifier: 'FactoryTrusted' });
const FactoryRemovedObject = FactoryRemoved.annotate({ identifier: 'FactoryRemoved' });
const McpServerObject = McpServer.annotate({ identifier: 'McpServer' });
const McpServerListObject = McpServerList.annotate({ identifier: 'McpServerList' });
const ScheduleObject = Schedule.annotate({ identifier: 'Schedule' });
const ScheduleListObject = ScheduleList.annotate({ identifier: 'ScheduleList' });
const TriggerObject = Trigger.annotate({ identifier: 'Trigger' });
const TriggerListObject = TriggerList.annotate({ identifier: 'TriggerList' });
const HireObject = Hire.annotate({ identifier: 'Hire' });
const HireListObject = HireList.annotate({ identifier: 'HireList' });
const LibraryAddObject = LibraryAdd.annotate({ identifier: 'LibraryAdd' });
const LibraryAddListObject = LibraryAddList.annotate({ identifier: 'LibraryAddList' });
const VolumeObject = Volume.annotate({ identifier: 'Volume' });
const VolumeListObject = VolumeList.annotate({ identifier: 'VolumeList' });
const ProgramObject = Program.annotate({ identifier: 'Program' });
const ProgramListObject = ProgramList.annotate({ identifier: 'ProgramList' });
/** The factories and a factory's MCP servers, each a page or the same page as a `Table` where the request asks for one, as the cards. */
const FactoryListOrTable = [FactoryListObject, Table] as const;
const McpServerListOrTable = [McpServerListObject, Table] as const;

/**
 * The factories, which no namespace holds, and each one's rules, instruction, command lines and cost lines; filed, made from a template,
 * taken over by one, previewed, upgraded and resolved, and its volumes mounted and taken off.
 */
export class FactoriesGroup extends HttpApiGroup.make('factories').add(
  HttpApiEndpoint.get('listAll', '/api/factories', { query: listQuery, success: FactoryListOrTable, error: objectErrors }).annotate(
    OpenApi.Description,
    'Lists the factories, which no namespace holds, a page at a time, the default first; ?labelSelector= keeps those whose labels match. Answers a FactoryList, or the same page as a Table where the request asks for one.',
  ),
  HttpApiEndpoint.get('get', '/api/factories/:name', { params: factoryParams, success: FactoryObject, error: objectErrors }).annotate(
    OpenApi.Description,
    'Reads one factory by its name: its repositories, workflows, places, settings and status. Answers the Factory.',
  ),
  HttpApiEndpoint.get('rules', '/api/factories/:name/rules', {
    params: factoryParams,
    success: FactoryRules,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Reads a factory's rules: the file they are kept in, their words, and why that file does not read where it does not. Answers FactoryRules.",
  ),
  HttpApiEndpoint.put('putRules', '/api/factories/:name/rules', {
    params: factoryParams,
    payload: FactoryRulesWrite,
    success: FactoryRules,
    error: objectErrors,
  }).annotate(OpenApi.Description, "Writes a factory's rules from the words the body sends. Answers FactoryRules as they are now."),
  HttpApiEndpoint.delete('deleteRules', '/api/factories/:name/rules', {
    params: factoryParams,
    success: FactoryRules,
    error: objectErrors,
  }).annotate(OpenApi.Description, "Clears a factory's rules. Answers FactoryRules, with whether there were any to remove."),
  HttpApiEndpoint.get('instruction', '/api/factories/:name/instruction', {
    params: factoryParams,
    success: FactoryInstruction,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Reads a factory's instruction: where it is kept, its words, why the file there does not read, and whether the store keeps text for it. Answers FactoryInstruction.",
  ),
  HttpApiEndpoint.put('putInstruction', '/api/factories/:name/instruction', {
    params: factoryParams,
    payload: FactoryInstructionWrite,
    success: FactoryInstruction,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Places a factory's instruction: at the path the body names, or in the store's own keeping. Answers FactoryInstruction as it is now.",
  ),
  HttpApiEndpoint.delete('deleteInstruction', '/api/factories/:name/instruction', {
    params: factoryParams,
    success: FactoryInstruction,
    error: objectErrors,
  }).annotate(OpenApi.Description, "Clears where a factory's instruction is kept. Answers FactoryInstruction as it is now."),
  HttpApiEndpoint.put('putInstructionWords', '/api/factories/:name/instruction/words', {
    params: factoryParams,
    payload: FactoryInstructionWords,
    success: FactoryInstruction,
    error: objectErrors,
  }).annotate(OpenApi.Description, "Writes the words the store keeps as a factory's instruction. Answers FactoryInstruction as it is now."),
  HttpApiEndpoint.delete('deleteInstructionWords', '/api/factories/:name/instruction/words', {
    params: factoryParams,
    success: FactoryInstruction,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Takes off the words the store keeps as a factory's instruction, leaving where it is placed. Answers FactoryInstruction, with whether there was any text to remove.",
  ),
  HttpApiEndpoint.get('commands', '/api/factories/:name/commands', {
    params: factoryParams,
    success: FactoryCommandsObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Reads the command lines a person types for a factory, built off the command table: each of its verbs with the factory's name filled in, and the line that takes back each schedule and volume. Answers FactoryCommands.",
  ),
  HttpApiEndpoint.put('putCostLine', '/api/factories/:name/costlines/:workflow', {
    params: factoryWorkflowParams,
    payload: FactoryCostLineWrite,
    success: FactoryObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Sets the cost line of one of a factory's workflows, the dollars a run of it should stay under. Answers the Factory as it reads after, with the file written and what it replaced.",
  ),
  HttpApiEndpoint.delete('deleteCostLine', '/api/factories/:name/costlines/:workflow', {
    params: factoryWorkflowParams,
    success: FactoryObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Takes back the cost line of one of a factory's workflows. Answers the Factory as it reads after, with the file written and what it replaced.",
  ),
  HttpApiEndpoint.delete('delete', '/api/factories/:name', {
    params: factoryParams,
    success: FactoryRemovedObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Removes a factory: its file, and the folder of the instruction and rules the store kept for it; a trust given to its places is left. Answers FactoryRemoved.',
  ),
  HttpApiEndpoint.put('setRevisions', '/api/factories/:name/revisions', {
    params: factoryParams,
    payload: FactoryRevisionsWrite,
    success: FactoryObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Sets a factory's revisions policy: whether its runs follow merged revisions of their workflow or keep the one they started on. Answers the Factory as it reads after, with the file written and what it replaced.",
  ),
  HttpApiEndpoint.post('trust', '/api/factories/:name/trust', {
    params: factoryParams,
    success: FactoryTrustedObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Trusts a factory's places again where the store runs, asking each harness that keeps a trust. Answers FactoryTrusted, what was asked for each place.",
  ),
  HttpApiEndpoint.put('attach', '/api/factories/:name/workflows/:workflow', {
    params: factoryWorkflowParams,
    payload: FactoryAttachWrite,
    success: FactoryObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Attaches a workflow to a factory, on the repository the body names where it has several. Answers the Factory as it reads after, with the file written.',
  ),
  HttpApiEndpoint.delete('detach', '/api/factories/:name/workflows/:workflow', {
    params: factoryWorkflowParams,
    success: FactoryObject,
    error: objectErrors,
  }).annotate(OpenApi.Description, 'Detaches a workflow from a factory. Answers the Factory as it reads after, with the file written.'),
  HttpApiEndpoint.put('putSetting', '/api/factories/:name/settings/:setting', {
    params: factorySettingParams,
    payload: FactorySettingWrite,
    success: FactoryObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Sets one harness setting of a factory to the value the body sends. Answers the Factory as it reads after, with the file written and what it replaced.',
  ),
  HttpApiEndpoint.delete('deleteSetting', '/api/factories/:name/settings/:setting', {
    params: factorySettingParams,
    success: FactoryObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Takes one harness setting off a factory. Answers the Factory as it reads after, with the file written and what it replaced.',
  ),
  HttpApiEndpoint.post('create', '/api/factories', { payload: FactoryCreate, success: FactoryCreated, error: objectErrors }).annotate(
    OpenApi.Description,
    'Files a new factory with the volumes the body names, none at all included, each a folder of this machine by its whole path or a git URL it clones, its writable ones trusted unless the body says not to. Answers FactoryCreated.',
  ),
  HttpApiEndpoint.post('addVolume', '/api/factories/:factory/volumes', {
    params: factoryOwnParams,
    payload: VolumeWrite,
    success: VolumeAdded,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Gives a factory a volume: a folder of this machine by its whole path, or a git URL it clones, marked :ro or :rw; a writable one is a repository the factory works on. Answers VolumeAdded.',
  ),
  HttpApiEndpoint.delete('removeVolume', '/api/factories/:factory/volumes', {
    params: factoryOwnParams,
    query: {
      path: Schema.String.annotate({
        description: 'The folder of the machine the api runs on whose volume is taken off, as it was mounted.',
      }),
    },
    success: VolumeRemoved,
    error: objectErrors,
  }).annotate(OpenApi.Description, 'Takes the volume mounted at ?path= off a factory. Answers VolumeRemoved.'),
  HttpApiEndpoint.post('apply', '/api/factories/:name/apply', {
    params: factoryParams,
    payload: FactoryApplyWrite,
    success: FactoryApplied,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Makes a factory from the template the body sends or names, on the repositories it names, the template kept under the store once the factory is filed. Answers FactoryApplied: the factory, its file, its template and what was asked for its places' trust.",
  ),
  HttpApiEndpoint.get('export', '/api/factories/:name/export', {
    params: factoryParams,
    query: {
      cards: Schema.optionalKey(
        Schema.Literals(MOVE_CARDS).annotate({
          description: "Whether the factory's cards follow it to another store (follow, the default) or stay on the source (stay).",
        }),
      ),
    },
    success: FactoryExport,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Reads a factory whole for another store to file, its cards following it unless ?cards=stay; nothing of the source is written. Answers FactoryExport.',
  ),
  HttpApiEndpoint.get('home', '/api/factories/:name/home', {
    params: factoryParams,
    success: FactoryHome.annotate({ identifier: 'FactoryHome' }),
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Reads a factory's home whole, as a run copies it: every file of its tree's home/ and the digest a run's copy is named by, for a client to render read-only. Answers FactoryHome.",
  ),
  HttpApiEndpoint.post('import', '/api/factories/:name/import', {
    params: factoryParams,
    payload: FactoryImportWrite,
    success: FactoryImported,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Files a factory exported from another store under the name in the path, its repositories and volumes given as this machine's folders or git URLs. Answers FactoryImported, with the places a harness does not trust yet.",
  ),
  HttpApiEndpoint.post('adopt', '/api/factories/:factory/adopt', {
    params: factoryOwnParams,
    payload: FactoryAdoptWrite,
    success: FactoryAdopted,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Takes over a hand-made factory by the template the body sends, following the plan its preview printed. Answers FactoryAdopted: its file, the template it is now made from and the tree it runs from.',
  ),
  HttpApiEndpoint.post('diff', '/api/factories/:factory/diff', {
    params: factoryOwnParams,
    payload: FactoryDiffWrite,
    success: FactoryPlan,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Previews a factory's upgrade or takeover by the template the body sends: what would change, with nothing written and nothing sent kept. Answers FactoryPlan.",
  ),
  HttpApiEndpoint.post('upgrade', '/api/factories/:factory/upgrade', {
    params: factoryOwnParams,
    payload: FactoryUpgradeWrite,
    success: FactoryUpgraded,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Files a factory's upgrade onto a newer version of its template, from the template the body sends where it sends one. Answers FactoryUpgraded: the versions, its file, the parameters it drops and how many conflicts wait for a choice.",
  ),
  HttpApiEndpoint.post('resolve', '/api/factories/:factory/resolve', {
    params: factoryOwnParams,
    payload: FactoryResolveWrite,
    success: FactoryResolved,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Records the choice for one conflict of a factory's upgrade, proposed by the caller as an owner's resolution. Answers FactoryResolved, with the proposals the merge waits on.",
  ),
) {}

/**
 * A factory's MCP servers, in its namespace, and their sign-in; and the store's library of servers, in no namespace: the person's, kept
 * once for every factory that adds one, beside those Nemia offers.
 */
export class McpServersGroup extends HttpApiGroup.make('mcpservers').add(
  HttpApiEndpoint.get('listLibrary', '/api/mcpservers', {
    query: listQuery,
    success: [McpServerListObject, Table],
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "The store's library of MCP servers: the person's, recorded once for every factory that adds one, beside those Nemia offers, each with the factories that add it.",
  ),
  HttpApiEndpoint.get('getLibrary', '/api/mcpservers/:name', {
    params: libraryParams,
    success: McpServerObject,
    error: objectErrors,
  }).annotate(OpenApi.Description, "One MCP server of the store's library, the person's or a builtin, by its name."),
  HttpApiEndpoint.put('putLibrary', '/api/mcpservers/:name', {
    params: libraryParams,
    payload: McpServerWrite,
    success: McpServerObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Records an MCP server in the person's library, whole, its headers kept masked; a factory gets it once it adds it.",
  ),
  HttpApiEndpoint.delete('deleteLibrary', '/api/mcpservers/:name', {
    params: libraryParams,
    success: McpServerObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Takes an MCP server off the person's library; refused with a 409 naming each factory that adds it, and a builtin is never taken off.",
  ),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/mcpservers', {
    params: namespaceParams,
    query: listQuery,
    success: McpServerListOrTable,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a factory's MCP servers in its namespace, a page at a time, each header's value masked; ?labelSelector= keeps those whose labels match. Answers an McpServerList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/mcpservers/:name', {
    params: cardParams,
    success: McpServerObject,
    error: objectErrors,
  }).annotate(OpenApi.Description, "Reads one of a factory's MCP servers by its name, each header's value masked. Answers the McpServer."),
  HttpApiEndpoint.put('put', '/api/namespaces/:namespace/mcpservers/:name', {
    params: cardParams,
    payload: McpServerWrite,
    success: McpServerObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Records an MCP server in a factory under the name in the path, a header sent as the mask keeping the value stored. Answers the McpServer as it reads after, with the file written and the address it replaced.',
  ),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/mcpservers/:name', {
    params: cardParams,
    success: McpServerObject,
    error: objectErrors,
  }).annotate(OpenApi.Description, 'Takes an MCP server off a factory. Answers the McpServer as it was, with the file written.'),
  HttpApiEndpoint.post('signIn', '/api/namespaces/:namespace/mcpservers/:name/sign-in', {
    params: cardParams,
    success: SignInStarted,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Starts signing a factory's MCP server in for the harness, written to the harness's own store. Answers SignInStarted, the address a person opens to sign in.",
  ),
  HttpApiEndpoint.get('signInState', '/api/namespaces/:namespace/mcpservers/:name/sign-in', {
    params: cardParams,
    success: SignInState,
    error: objectErrors,
  }).annotate(OpenApi.Description, "Reads where signing a factory's MCP server in stands. Answers SignInState."),
  HttpApiEndpoint.post('signInCallback', '/api/namespaces/:namespace/mcpservers/:name/sign-in/callback', {
    params: cardParams,
    payload: SignInCallback,
    success: SignInState,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Completes signing a factory's MCP server in with the address the person's browser landed on, which no answer or log carries. Answers SignInState.",
  ),
  HttpApiEndpoint.delete('signOut', '/api/namespaces/:namespace/mcpservers/:name/sign-in', {
    params: cardParams,
    success: SignedOut,
    error: objectErrors,
  }).annotate(OpenApi.Description, "Signs a factory's MCP server out of the harness's store. Answers SignedOut."),
) {}

/** A factory's schedules, in its namespace, each named by its workflow. */
export class SchedulesGroup extends HttpApiGroup.make('schedules').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/schedules', {
    params: namespaceParams,
    query: listQuery,
    success: [ScheduleListObject, Table],
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a factory's schedules in its namespace, a page at a time, each with the runs it fired. Answers a ScheduleList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/schedules/:name', {
    params: cardParams,
    success: ScheduleObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one of a factory's schedules by its workflow's name, with the runs it fired. Answers the Schedule.",
  ),
  HttpApiEndpoint.put('put', '/api/namespaces/:namespace/schedules/:name', {
    params: cardParams,
    payload: ScheduleWrite,
    success: ScheduleObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Writes a factory's schedule of the workflow named in the path, the cron the body sends. Answers the Schedule as it reads after, with the file written and the cron it replaced.",
  ),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/schedules/:name', {
    params: cardParams,
    success: ScheduleObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Takes back a factory's schedule of the workflow named in the path. Answers the Schedule as it was, with the file written.",
  ),
) {}

/**
 * A factory's triggers, in its namespace: its schedules as the time kind, each named by its workflow, and its card triggers, each by its
 * own name, defined in its file or by its template.
 */
export class TriggersGroup extends HttpApiGroup.make('triggers').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/triggers', {
    params: namespaceParams,
    query: listQuery,
    success: [TriggerListObject, Table],
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a factory's triggers in its namespace, a page at a time, each with whether it can spend quota and what it does now: the cards it queues, or its next fire. Answers a TriggerList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/triggers/:name', {
    params: cardParams,
    success: TriggerObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one of a factory's triggers by its name, with whether it can spend quota and what it does now. Answers the Trigger.",
  ),
  HttpApiEndpoint.put('put', '/api/namespaces/:namespace/triggers/:name', {
    params: cardParams,
    payload: TriggerWrite,
    success: TriggerObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Writes a factory's trigger named in the path: a card labelSelector and its target, or a cron, named by its workflow, which writes the schedule. Answers the Trigger as it reads after, with the file written.",
  ),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/triggers/:name', {
    params: cardParams,
    success: TriggerObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Takes back a factory's own trigger named in the path, a schedule of the time kind. Answers the Trigger as it was, with the file written.",
  ),
) {}

/** A factory's hires, in its namespace, one per step it offers, each named `<workflow>.<step>`. */
export class HiresGroup extends HttpApiGroup.make('hires').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/hires', {
    params: namespaceParams,
    query: listQuery,
    success: [HireListObject, Table],
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a factory's hires in its namespace, a page at a time, one per step it offers, each named <workflow>.<step>. Answers a HireList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/hires/:name', {
    params: cardParams,
    success: HireObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one of a factory's hires, by <workflow>.<step>: the step and the agent hired into it. Answers the Hire.",
  ),
  HttpApiEndpoint.put('put', '/api/namespaces/:namespace/hires/:name', {
    params: cardParams,
    payload: HireWrite,
    success: HireObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Hires the agent the body names into the step. Answers the Hire as it reads after, with the file written and the agent it replaced.',
  ),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/hires/:name', {
    params: cardParams,
    success: HireObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Fires the agent hired into the step. Answers the Hire as it reads after, with the file written and the agent it fired.',
  ),
) {}

/**
 * A factory's adds from the store's library, in its namespace, each named `<kind>.<name>`: what the factory resolves of the library. A
 * factory with no record of its adds has those its workflows resolve today, until the first add or removal writes the record.
 */
export class LibraryAddsGroup extends HttpApiGroup.make('libraryadds').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/libraryadds', {
    params: namespaceParams,
    query: listQuery,
    success: [LibraryAddListObject, Table],
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "The library items a factory has added, each with what it is there: resolved, shadowed by the factory's own, or missing from the library.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/libraryadds/:name', {
    params: libraryAddParams,
    success: LibraryAddObject,
    error: objectErrors,
  }).annotate(OpenApi.Description, 'One add of a library item in a factory, by `<kind>.<name>`, with what it is there.'),
  HttpApiEndpoint.put('put', '/api/namespaces/:namespace/libraryadds/:name', {
    params: libraryAddParams,
    success: LibraryAddObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Adds a library item to a factory, so its runs resolve it; refused as Missing where the library holds no such item. Idempotent.',
  ),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/libraryadds/:name', {
    params: libraryAddParams,
    success: LibraryAddObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Takes an add off a factory, missing from the library or not; refused as Missing where it was not added.',
  ),
) {}

/** A factory's volumes, in its namespace, by their stored names: read, and their switches set (`patch`). */
export class VolumesGroup extends HttpApiGroup.make('volumes').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/volumes', {
    params: namespaceParams,
    query: listQuery,
    success: [VolumeListObject, Table],
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a factory's volumes in its namespace, a page at a time, each with the runs in play that mount it. Answers a VolumeList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/volumes/:name', {
    params: cardParams,
    success: VolumeObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one of a factory's volumes by its stored name, with the runs in play that mount it. Answers the Volume.",
  ),
  HttpApiEndpoint.patch('patch', '/api/namespaces/:namespace/volumes/:name', {
    params: cardParams,
    payload: VolumeSwitchesWrite,
    success: VolumeObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Sets the switches of one of a factory's volumes, by its stored name: those the body gives, the others kept, its folder and mark unmoved. Answers the Volume as it reads after, with the file written.",
  ),
) {}

/** A factory's programs, in its namespace: the long-lived commands its template declares, each with where its task runs now. */
export class ProgramsGroup extends HttpApiGroup.make('programs').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/programs', {
    params: namespaceParams,
    query: listQuery,
    success: [ProgramListObject, Table],
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a factory's programs in its namespace, a page at a time, each with its phase, its restarts and since when. Answers a ProgramList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/programs/:name', {
    params: cardParams,
    success: ProgramObject,
    error: objectErrors,
  }).annotate(OpenApi.Description, "Reads one of a factory's programs by its name, with where its task runs now. Answers the Program."),
) {}
