/**
 * A page of a factory's wiring, or of the feed, as a table (`scheduleTable`, `triggerTable`, `hireTable`, `libraryAddTable`,
 * `volumeTable`, `delegationTable`, `subscriptionTable`, `eventTable`), Kubernetes' server-side printing of a list (`objects`' `Table`),
 * as `kind-table.ts` gives the definitions': the columns `nemia get <resource>` prints of each kind, priority 0 by default and 1 when
 * asked wide, a row per item of the page in its order, and the item's metadata beside its cells (`PartialObjectMetadata`). Every cell is
 * one line of text read off the served object, a text of several lines cut at its first break; a `boolean` or `integer` column's cells
 * are a boolean or a number. Pure.
 */
import type {
  DelegationList,
  Event,
  EventList,
  Hire,
  HireList,
  LibraryAdd,
  LibraryAddList,
  Schedule,
  ScheduleList,
  Subscription,
  SubscriptionList,
  Table,
  TableColumnDefinition,
  Trigger,
  TriggerList,
  Volume,
  VolumeList,
} from 'objects';
import { column, firstLine, tableOf } from './table-of.ts';

/** The columns of a schedule's row, in the order its cells are. */
export const SCHEDULE_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The schedule's name: the workflow it starts.", 0),
  column('Cron', 'The cron its runs start at.', 0),
  column('Next', 'Its next fire, where it fires again.', 0),
  column('Last run', 'Its last scheduled run, and when it started.', 0),
  column('Refused', 'Why its latest fire was refused.', 0),
  column('Brief', 'The first line of the brief each run is asked.', 1),
  column('Time zone', 'The time zone the cron is read in.', 1),
  column('Since', 'When the schedule was set.', 1),
];

/** A scheduled run as a cell: its id and when it started; `''` for none. */
const firedCell = (fired: { readonly run: string; readonly at: string } | undefined) =>
  fired === undefined ? '' : `${fired.run} at ${fired.at}`;

/** The cells of `schedule`'s row, in `SCHEDULE_COLUMNS`' order. */
const scheduleCells = ({ metadata, spec, status }: Schedule) => [
  metadata.name,
  spec.cron,
  status.next ?? '',
  firedCell(status.last),
  firstLine(status.refused),
  firstLine(spec.brief),
  spec.tz ?? '',
  status.since,
];

/**
 * `list` as a table: `SCHEDULE_COLUMNS`, and a row per schedule of the page.
 * @param list The page of schedules, as the list answers it.
 */
export const scheduleTable = (list: ScheduleList) => tableOf(list, SCHEDULE_COLUMNS, scheduleCells) satisfies Table;

/** The columns of a trigger's row, in the order its cells are. */
export const TRIGGER_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The trigger's name.", 0),
  column('When', 'When it fires: at its cron, or on the cards its label selector matches.', 0),
  column('Target', 'The workflow it sends to.', 0),
  column('Quota', 'Whether it can spend quota: spends, free or unknown.', 0),
  column('Now', 'What it does now: the cards it queues, or its next fire.', 0),
  column('From', "Where it is defined: the factory's own file or its template.", 1),
  column('Clashes', 'The cards it selects that wait on a clash with another trigger.', 1),
  column('Refused', 'Why its latest fire was refused.', 1),
];

/** When a trigger fires, as a cell: `cron <cron>`, or `cards <selector>`. */
const whenCell = ({ spec: { when } }: Trigger) => (when.kind === 'time' ? `cron ${when.cron}` : `cards ${when.labelSelector}`);

/** What a trigger does now, as a cell: how many cards it queues, or its next fire; `''` for neither. */
const nowCell = ({ status }: Trigger) =>
  status.queued !== undefined ? `queues ${status.queued.length}` : status.next === undefined ? '' : `next ${status.next}`;

/** The cells of `trigger`'s row, in `TRIGGER_COLUMNS`' order. */
const triggerCells = (trigger: Trigger) => [
  trigger.metadata.name,
  whenCell(trigger),
  trigger.spec.target.name,
  trigger.status.quota,
  nowCell(trigger),
  trigger.status.from,
  (trigger.status.clashes ?? []).map((clash) => clash.card).join(', '),
  firstLine(trigger.status.refused),
];

/**
 * `list` as a table: `TRIGGER_COLUMNS`, and a row per trigger of the page.
 * @param list The page of triggers, as the list answers it.
 */
export const triggerTable = (list: TriggerList) => tableOf(list, TRIGGER_COLUMNS, triggerCells) satisfies Table;

/** The columns of a hire's row, in the order its cells are. */
export const HIRE_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The hire's name, <workflow>.<step>.", 0),
  column('Agent', 'The agent that fills the step.', 0),
  column('Filled', 'Who fills the step.', 0),
  column('Error', 'Why the hire does not read.', 0),
  column('Model', 'The model a session on the step runs on.', 1),
  column('Harness', 'What runs the session.', 1),
];

/** A setting's value as a cell: a list comma-joined, anything else as it reads; `''` where the harness's default holds. */
const settingCell = (value: string | number | boolean | readonly string[] | undefined) =>
  value === undefined ? '' : Array.isArray(value) ? value.join(', ') : String(value);

/** The cells of `hire`'s row, in `HIRE_COLUMNS`' order. */
const hireCells = ({ metadata, spec, status }: Hire) => [
  metadata.name,
  status.agent ?? spec.agent ?? '',
  status.filled,
  firstLine(status.error),
  settingCell(status.settings.model.value),
  settingCell(status.settings.harness.value),
];

/**
 * `list` as a table: `HIRE_COLUMNS`, and a row per hire of the page.
 * @param list The page of hires, as the list answers it.
 */
export const hireTable = (list: HireList) => tableOf(list, HIRE_COLUMNS, hireCells) satisfies Table;

/** The columns of a library add's row, in the order its cells are. */
export const LIBRARY_ADD_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The add's name, <kind>.<name>.", 0),
  column('Kind', 'The kind of the library item added.', 0),
  column('Item', "The library item's name.", 0),
  column('State', 'What the add is in its factory: resolved, shadowed or missing.', 0),
  column('Origin', 'Where the library holds the item.', 1),
  column('Shadowed by', "The factory's own origin that holds the name first.", 1),
  column('Message', 'What to do about a missing add.', 1),
];

/** The cells of `add`'s row, in `LIBRARY_ADD_COLUMNS`' order. */
const libraryAddCells = ({ metadata, spec, status }: LibraryAdd) => [
  metadata.name,
  spec.kind,
  spec.name,
  status.state,
  status.origin ?? '',
  status.shadowedBy ?? '',
  firstLine(status.message),
];

/**
 * `list` as a table: `LIBRARY_ADD_COLUMNS`, and a row per add of the page.
 * @param list The page of library adds, as the list answers it.
 */
export const libraryAddTable = (list: LibraryAddList) => tableOf(list, LIBRARY_ADD_COLUMNS, libraryAddCells) satisfies Table;

/** The columns of a volume's row, in the order its cells are. */
export const VOLUME_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The volume's name.", 0),
  column('Path', "The folder's absolute path on the machine.", 0),
  column('Read-only', 'Whether steps only read the folder.', 0, 'boolean'),
  column('Present', 'Whether the folder is there now.', 0, 'boolean'),
  column('Refused', "Why a run's start would refuse it.", 0),
  column('Runs', 'How many runs not ended mount it.', 1, 'integer'),
];

/** The cells of `volume`'s row, in `VOLUME_COLUMNS`' order. */
const volumeCells = ({ metadata, spec, status }: Volume) => [
  metadata.name,
  spec.path,
  spec.readOnly,
  status.present,
  firstLine(status.refused),
  status.runs.length,
];

/**
 * `list` as a table: `VOLUME_COLUMNS`, and a row per volume of the page.
 * @param list The page of volumes, as the list answers it.
 */
export const volumeTable = (list: VolumeList) => tableOf(list, VOLUME_COLUMNS, volumeCells) satisfies Table;

/** The columns of a delegation's row, in the order its cells are. */
export const DELEGATION_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The delegation's name: the agent it lets approve.", 0),
  column('Rules', 'How many rules it holds.', 0, 'integer'),
  column('Verbs', 'The verbs its rules let the agent approve.', 0),
  column('Resources', 'The resources its rules cover.', 1),
];

/** The words of `lists`, each once, in the order first met, comma-joined. */
const unionOf = (lists: readonly (readonly string[])[]) => [...new Set(lists.flat())].join(', ');

/**
 * `list` as a table: `DELEGATION_COLUMNS`, and a row per delegation of the page.
 * @param list The page of delegations, as the list answers it.
 */
export const delegationTable = (list: DelegationList) =>
  tableOf(list, DELEGATION_COLUMNS, ({ metadata, spec }) => [
    metadata.name,
    spec.rules.length,
    unionOf(spec.rules.map((rule) => rule.verbs)),
    unionOf(spec.rules.map((rule) => rule.resources)),
  ]) satisfies Table;

/** The columns of a subscription's row, in the order its cells are. */
export const SUBSCRIPTION_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The subscription's name.", 0),
  column('Task', 'The runtime task that is told.', 0),
  column('Selectors', "The feed's selectors it matches.", 0),
  column('Pending', 'How many routine lines are folded into its digest and not yet told.', 0, 'integer'),
  column('Error', "Why the deliverer's file did not read.", 0),
  column('Digest every', 'The minutes between digests of routine lines.', 1, 'integer'),
  column('Cursor', 'The byte every line before which is told or folded.', 1, 'integer'),
];

/** The cells of `subscription`'s row, in `SUBSCRIPTION_COLUMNS`' order. */
const subscriptionCells = ({ metadata, spec, status }: Subscription) => [
  metadata.name,
  spec.task,
  spec.selectors.join(', '),
  status.pending,
  firstLine(status.error),
  spec.digestEvery,
  status.cursor,
];

/**
 * `list` as a table: `SUBSCRIPTION_COLUMNS`, and a row per subscription of the page.
 * @param list The page of subscriptions, as the list answers it.
 */
export const subscriptionTable = (list: SubscriptionList) => tableOf(list, SUBSCRIPTION_COLUMNS, subscriptionCells) satisfies Table;

/** The columns of an event's row, in the order its cells are. */
export const EVENT_COLUMNS: readonly TableColumnDefinition[] = [
  column('At', 'When the line was written.', 0),
  column('Type', "The line's type.", 0),
  column('Reason', 'The reason a machine selects on.', 0),
  column('Object', 'What it is about, kind/name.', 0),
  column('Message', 'The first line of what happened.', 0),
  column('Source', 'Whose deed it is.', 1),
  column('Name', "The event's name.", 1),
];

/** The cells of `event`'s row, in `EVENT_COLUMNS`' order. */
const eventCells = (event: Event) => [
  event.metadata.creationTimestamp,
  event.type,
  event.reason,
  `${event.involved.kind}/${event.involved.name}`,
  firstLine(event.message),
  event.source,
  event.metadata.name,
];

/**
 * `list` as a table: `EVENT_COLUMNS`, and a row per event of the page, in the order written.
 * @param list The page of events, as the list answers it.
 */
export const eventTable = (list: EventList) => tableOf(list, EVENT_COLUMNS, eventCells) satisfies Table;
