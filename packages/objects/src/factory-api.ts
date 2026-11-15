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
import { FactoryExport, FactoryImported, FactoryImportWrite, MOVE_CARDS } from './factory-move.ts';
import { Hire, HireList, HireWrite } from './hire.ts';
import { LibraryAdd, LibraryAddList } from './library.ts';
import { McpServer, McpServerList, McpServerWrite, SignInCallback, SignInStarted, SignInState, SignedOut } from './mcp-server.ts';
import { Schedule, ScheduleList, ScheduleWrite } from './schedule.ts';
import { Volume, VolumeList } from './volume.ts';
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
const HireObject = Hire.annotate({ identifier: 'Hire' });
const HireListObject = HireList.annotate({ identifier: 'HireList' });
const LibraryAddObject = LibraryAdd.annotate({ identifier: 'LibraryAdd' });
const LibraryAddListObject = LibraryAddList.annotate({ identifier: 'LibraryAddList' });
const VolumeObject = Volume.annotate({ identifier: 'Volume' });
const VolumeListObject = VolumeList.annotate({ identifier: 'VolumeList' });
/** The factories and a factory's MCP servers, each a page or the same page as a `Table` where the request asks for one, as the cards. */
const FactoryListOrTable = [FactoryListObject, Table] as const;
const McpServerListOrTable = [McpServerListObject, Table] as const;

/**
 * The factories, which no namespace holds, and each one's rules, instruction, command lines and cost lines; filed, made from a template,
 * taken over by one, previewed, upgraded and resolved, and its volumes mounted and taken off.
 */
export class FactoriesGroup extends HttpApiGroup.make('factories').add(
  HttpApiEndpoint.get('listAll', '/api/factories', { query: listQuery, success: FactoryListOrTable, error: objectErrors }),
  HttpApiEndpoint.get('get', '/api/factories/:name', { params: factoryParams, success: FactoryObject, error: objectErrors }),
  HttpApiEndpoint.get('rules', '/api/factories/:name/rules', { params: factoryParams, success: FactoryRules, error: objectErrors }),
  HttpApiEndpoint.put('putRules', '/api/factories/:name/rules', {
    params: factoryParams,
    payload: FactoryRulesWrite,
    success: FactoryRules,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('deleteRules', '/api/factories/:name/rules', {
    params: factoryParams,
    success: FactoryRules,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('instruction', '/api/factories/:name/instruction', {
    params: factoryParams,
    success: FactoryInstruction,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('putInstruction', '/api/factories/:name/instruction', {
    params: factoryParams,
    payload: FactoryInstructionWrite,
    success: FactoryInstruction,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('deleteInstruction', '/api/factories/:name/instruction', {
    params: factoryParams,
    success: FactoryInstruction,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('putInstructionWords', '/api/factories/:name/instruction/words', {
    params: factoryParams,
    payload: FactoryInstructionWords,
    success: FactoryInstruction,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('deleteInstructionWords', '/api/factories/:name/instruction/words', {
    params: factoryParams,
    success: FactoryInstruction,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('commands', '/api/factories/:name/commands', {
    params: factoryParams,
    success: FactoryCommandsObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('putCostLine', '/api/factories/:name/costlines/:workflow', {
    params: factoryWorkflowParams,
    payload: FactoryCostLineWrite,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('deleteCostLine', '/api/factories/:name/costlines/:workflow', {
    params: factoryWorkflowParams,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/factories/:name', {
    params: factoryParams,
    success: FactoryRemovedObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('setRevisions', '/api/factories/:name/revisions', {
    params: factoryParams,
    payload: FactoryRevisionsWrite,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('trust', '/api/factories/:name/trust', {
    params: factoryParams,
    success: FactoryTrustedObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('attach', '/api/factories/:name/workflows/:workflow', {
    params: factoryWorkflowParams,
    payload: FactoryAttachWrite,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('detach', '/api/factories/:name/workflows/:workflow', {
    params: factoryWorkflowParams,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('putSetting', '/api/factories/:name/settings/:setting', {
    params: factorySettingParams,
    payload: FactorySettingWrite,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('deleteSetting', '/api/factories/:name/settings/:setting', {
    params: factorySettingParams,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('create', '/api/factories', { payload: FactoryCreate, success: FactoryCreated, error: objectErrors }),
  HttpApiEndpoint.post('addVolume', '/api/factories/:factory/volumes', {
    params: factoryOwnParams,
    payload: VolumeWrite,
    success: VolumeAdded,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('removeVolume', '/api/factories/:factory/volumes', {
    params: factoryOwnParams,
    query: {
      path: Schema.String.annotate({
        description: 'The folder of the machine the api runs on whose volume is taken off, as it was mounted.',
      }),
    },
    success: VolumeRemoved,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('apply', '/api/factories/:name/apply', {
    params: factoryParams,
    payload: FactoryApplyWrite,
    success: FactoryApplied,
    error: objectErrors,
  }),
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
  }),
  HttpApiEndpoint.post('import', '/api/factories/:name/import', {
    params: factoryParams,
    payload: FactoryImportWrite,
    success: FactoryImported,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('adopt', '/api/factories/:factory/adopt', {
    params: factoryOwnParams,
    payload: FactoryAdoptWrite,
    success: FactoryAdopted,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('diff', '/api/factories/:factory/diff', {
    params: factoryOwnParams,
    payload: FactoryDiffWrite,
    success: FactoryPlan,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('upgrade', '/api/factories/:factory/upgrade', {
    params: factoryOwnParams,
    payload: FactoryUpgradeWrite,
    success: FactoryUpgraded,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('resolve', '/api/factories/:factory/resolve', {
    params: factoryOwnParams,
    payload: FactoryResolveWrite,
    success: FactoryResolved,
    error: objectErrors,
  }),
) {}

/**
 * A factory's MCP servers, in its namespace, and their sign-in; and the store's library of servers, in no namespace: the person's, kept
 * once for every factory that adds one, beside those Nemia offers.
 */
export class McpServersGroup extends HttpApiGroup.make('mcpservers').add(
  HttpApiEndpoint.get('listLibrary', '/api/mcpservers', { query: listQuery, success: McpServerListObject, error: objectErrors }).annotate(
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
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/mcpservers/:name', {
    params: cardParams,
    success: McpServerObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('put', '/api/namespaces/:namespace/mcpservers/:name', {
    params: cardParams,
    payload: McpServerWrite,
    success: McpServerObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/mcpservers/:name', {
    params: cardParams,
    success: McpServerObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('signIn', '/api/namespaces/:namespace/mcpservers/:name/sign-in', {
    params: cardParams,
    success: SignInStarted,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('signInState', '/api/namespaces/:namespace/mcpservers/:name/sign-in', {
    params: cardParams,
    success: SignInState,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('signInCallback', '/api/namespaces/:namespace/mcpservers/:name/sign-in/callback', {
    params: cardParams,
    payload: SignInCallback,
    success: SignInState,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('signOut', '/api/namespaces/:namespace/mcpservers/:name/sign-in', {
    params: cardParams,
    success: SignedOut,
    error: objectErrors,
  }),
) {}

/** A factory's schedules, in its namespace, each named by its workflow. */
export class SchedulesGroup extends HttpApiGroup.make('schedules').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/schedules', {
    params: namespaceParams,
    query: listQuery,
    success: ScheduleListObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/schedules/:name', {
    params: cardParams,
    success: ScheduleObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('put', '/api/namespaces/:namespace/schedules/:name', {
    params: cardParams,
    payload: ScheduleWrite,
    success: ScheduleObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/schedules/:name', {
    params: cardParams,
    success: ScheduleObject,
    error: objectErrors,
  }),
) {}

/** A factory's hires, in its namespace, one per step it offers, each named `<workflow>.<step>`. */
export class HiresGroup extends HttpApiGroup.make('hires').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/hires', {
    params: namespaceParams,
    query: listQuery,
    success: HireListObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/hires/:name', { params: cardParams, success: HireObject, error: objectErrors }),
  HttpApiEndpoint.put('put', '/api/namespaces/:namespace/hires/:name', {
    params: cardParams,
    payload: HireWrite,
    success: HireObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/hires/:name', {
    params: cardParams,
    success: HireObject,
    error: objectErrors,
  }),
) {}

/**
 * A factory's adds from the store's library, in its namespace, each named `<kind>.<name>`: what the factory resolves of the library. A
 * factory with no record of its adds has those its workflows resolve today, until the first add or removal writes the record.
 */
export class LibraryAddsGroup extends HttpApiGroup.make('libraryadds').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/libraryadds', {
    params: namespaceParams,
    query: listQuery,
    success: LibraryAddListObject,
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

/** A factory's volumes, in its namespace, by their stored names: read alone over the api. */
export class VolumesGroup extends HttpApiGroup.make('volumes').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/volumes', {
    params: namespaceParams,
    query: listQuery,
    success: VolumeListObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/volumes/:name', {
    params: cardParams,
    success: VolumeObject,
    error: objectErrors,
  }),
) {}
