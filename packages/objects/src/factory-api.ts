/**
 * Group `factories`: the factories, which no namespace holds, listed, read, removed, exported whole and filed from another store's export,
 * and each one's sub-resources — its rules and its instruction, read, written and cleared, the lines a person types for it (`commands`),
 * its cost line per workflow, its revisions policy, its places trusted again, a workflow attached and detached, and a harness setting set
 * and taken off; and the writes that name a template or a folder: a factory filed, a volume mounted and taken off, a factory made from a
 * template, a hand-made one taken over by one, either previewed, an upgrade filed and a conflict's choice. The factory's parts are each
 * in the factory's namespace: group `mcpservers`, its MCP servers, read, recorded and taken off, and signed in to; group `builtin`, the
 * servers Nemia offers, in no namespace; groups `schedules` and `hires`, read, written and taken back; and group `volumes`, read alone.
 * Cut from `api.ts`, which adds them to `Api`.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
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
import { McpServer, McpServerList, McpServerWrite, SignInCallback, SignInStarted, SignInState, SignedOut } from './mcp-server.ts';
import { Schedule, ScheduleList, ScheduleWrite } from './schedule.ts';
import { Volume, VolumeList } from './volume.ts';
import { listQuery, objectErrors } from './api-errors.ts';
import { cardParams, namespaceParams, factoryParams, factoryWorkflowParams, factorySettingParams, factoryOwnParams } from './api-params.ts';

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

/** A factory's MCP servers, in its namespace, and their sign-in. */
export class McpServersGroup extends HttpApiGroup.make('mcpservers').add(
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

/** The MCP servers Nemia offers a factory: a page whose items carry their spec alone, in no namespace. */
export class BuiltinGroup extends HttpApiGroup.make('builtin').add(
  HttpApiEndpoint.get('mcpservers', '/api/builtin/mcpservers', { query: listQuery, success: McpServerListObject, error: objectErrors }),
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
