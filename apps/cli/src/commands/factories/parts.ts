/**
 * The runners of a factory's parts kept in its namespace: `nemia factory trigger` and `untrigger` (a card Trigger), `nemia factory
 * schedule` and `unschedule` (a Schedule, named by its
 * workflow, a retired `--repo` still sent as `repoSent` says, for the api to refuse naming the attach) and its MCP servers, listed with
 * their states (`servers`), recorded (`server add`, its flags mapped here to the McpServer's write) and taken off (`server rm`). Each
 * prints, word for word as the old path did, what the answer says it wrote (`writtenOf`).
 */
import { type Args, MCP_TRANSPORTS, type McpServer, type McpServerWrite } from 'objects';
import { asked, everyPage, pageOf } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { listArg, said, textArg } from '../requests.ts';
import { repoSent, textOf, writtenOf } from './lines.ts';

/**
 * `nemia factory schedule`: a workflow started at each fire of a cron, and the cron it replaced.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function factorySchedule(args: Args) {
  const [factory, workflow] = [textOf(args, 'factory'), textOf(args, 'workflow')];
  const repo = textArg(args, 'repo');
  const tz = textArg(args, 'tz');
  const payload = {
    cron: textOf(args, 'cron'),
    brief: textOf(args, 'brief'),
    ...(repo ? { repo: repoSent(repo) } : {}),
    ...(tz ? { tz } : {}),
  };
  const answer = await asked('factory schedule', (c) => c.schedules.put({ params: { namespace: factory, name: workflow }, payload }));
  const { file, was } = writtenOf(answer, 'factory schedule');
  const { cron, tz: zone } = answer.spec;
  said([
    `${factory}  ${workflow} at ${cron}${zone ? ` (${zone})` : ''}${was ? ` (was ${was})` : ''}`,
    `scheduled: ${file} — its first run starts at its next fire`,
  ]);
  return 0;
}

/**
 * `nemia factory unschedule`: a workflow's schedule taken back.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function factoryUnschedule(args: Args) {
  const [factory, workflow] = [textOf(args, 'factory'), textOf(args, 'workflow')];
  const answer = await asked('factory unschedule', (c) => c.schedules.delete({ params: { namespace: factory, name: workflow } }));
  said([`${factory}  ${workflow} no longer at ${answer.spec.cron}`, `unscheduled: ${writtenOf(answer, 'factory unschedule').file}`]);
  return 0;
}

/**
 * `nemia factory trigger`: a card trigger, which queues each card of the factory its labelSelector matches, and whether it can spend quota.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function factoryTrigger(args: Args) {
  const [factory, name] = [textOf(args, 'factory'), textOf(args, 'name')];
  const payload = {
    when: { kind: 'cards' as const, labelSelector: textOf(args, 'labelSelector') },
    target: { kind: 'Workflow' as const, name: textOf(args, 'to') },
  };
  const answer = await asked('factory trigger', (c) => c.triggers.put({ params: { namespace: factory, name }, payload }));
  const { file, was } = writtenOf(answer, 'factory trigger');
  const queued = answer.status.queued ?? [];
  said([
    `${factory}  ${name}: ${payload.when.labelSelector} to ${payload.target.name}${was ? ` (was ${was})` : ''}`,
    `${QUOTA_SAID[answer.status.quota]}${answer.status.quotaBy ? `: ${answer.status.quotaBy}` : ''}; queues ${queued.length} card${queued.length === 1 ? '' : 's'} now`,
    `triggered: ${file}`,
  ]);
  return 0;
}

/** What a trigger's quota is said as. */
const QUOTA_SAID = {
  spends: 'spends quota, since an agent runs where it reaches',
  free: 'no quota: nothing it reaches runs an agent',
  unknown: 'quota unknown: a workflow it reaches does not read',
} as const;

/**
 * `nemia factory untrigger`: a factory's own card trigger taken back.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function factoryUntrigger(args: Args) {
  const [factory, name] = [textOf(args, 'factory'), textOf(args, 'name')];
  const answer = await asked('factory untrigger', (c) => c.triggers.delete({ params: { namespace: factory, name } }));
  said([`${factory}  ${name} no longer queues cards`, `untriggered: ${writtenOf(answer, 'factory untrigger').file}`]);
  return 0;
}

/**
 * Why the states of `servers` were not read, or null: every server unread (no state) carrying the one error the read gave, which the
 * api sets on each where the harness was not asked.
 */
function unreadOf(servers: readonly McpServer[]) {
  const errors = new Set(servers.map((s) => (s.status?.state === undefined ? s.status?.error : undefined)));
  const [only] = [...errors];
  return errors.size === 1 && only !== undefined ? only : null;
}

/**
 * The lines of a factory's servers, each with its state, and once why the states were not read, where they were not.
 * @param factory The factory's name, said where it has no server.
 * @param servers The factory's recorded servers, as the api lists them.
 */
function serverLines(factory: string, servers: readonly McpServer[]) {
  if (servers.length === 0)
    return [`${factory}  no server recorded — nemia factory server add ${factory} <server> --url <address>`] satisfies string[];
  const unread = unreadOf(servers);
  return [
    ...servers.map(({ metadata, spec, status }) => {
      const error = status?.error === undefined || status.error === unread ? '' : `  ${status.error}`;
      return `${metadata.name.padEnd(20)} ${spec.type}  ${spec.url}  ${status?.state ?? 'unread'}${status?.tools === undefined ? '' : ` (${status.tools} tools)`}${error}`;
    }),
    ...(unread === null ? [] : [`the states were not read: ${unread}`]),
  ] satisfies string[];
}

/**
 * `nemia factory servers`: a factory's recorded MCP servers, each with the state its harness reports now.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function factoryServers(args: Args) {
  const factory = textOf(args, 'factory');
  const listed = await asked('factory servers', (c) =>
    pageOf(everyPage((page) => c.mcpservers.list({ params: { namespace: factory }, query: page }))),
  );
  said(serverLines(factory, listed.items));
  return 0;
}

/** The headers `--header` gave, by name; refused for one with no `<name>=`. */
function headersOf(args: Args) {
  const lines = listArg(args, 'header');
  if (!lines.length) return undefined;
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const at = line.indexOf('=');
    if (at < 1)
      throw new Refused(
        `--header takes <name>=<value>, and \`${line}\` has no name and value: --header X-MCP-Toolsets=actions,repos. Nothing was recorded.`,
      );
    headers[line.slice(0, at)] = line.slice(at + 1);
  }
  return headers;
}

/** The `oauth` the flags gave, or undefined; refused for a callback port with no client id, or a port that is no port. */
function oauthOf(args: Args) {
  const clientId = textArg(args, 'clientId');
  const port = textArg(args, 'callbackPort');
  if (!clientId) {
    if (!port) return undefined;
    throw new Refused(
      '--callback-port is the port of the OAuth app --client-id names, and no --client-id was given: give both, or neither. Nothing was recorded.',
    );
  }
  if (!port) return { clientId };
  const n = Number(port);
  if (!Number.isSafeInteger(n) || n < 1 || n > 65535)
    throw new Refused(
      `--callback-port (\`oauth.callbackPort\`) takes the port the OAuth app's callback is registered on, a whole number from 1 to 65535, and \`${port}\` is not one: --callback-port 8791. Nothing was recorded.`,
    );
  return { clientId, callbackPort: n };
}

/** `--transport`, http where none is given; refused for a word that is no transport. */
function transportOf(args: Args) {
  const given = textArg(args, 'transport') ?? 'http';
  const type = MCP_TRANSPORTS.find((t) => t === given);
  if (type !== undefined) return type;
  throw new Refused(
    `--transport takes ${MCP_TRANSPORTS.join(' or ')}, and \`${given}\` is neither: --transport http. Nothing was recorded.`,
  );
}

/**
 * `nemia factory server add`: one remote MCP server recorded for a factory, and the address it replaced.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function factoryServerAdd(args: Args) {
  const [factory, server] = [textOf(args, 'factory'), textOf(args, 'server')];
  const headers = headersOf(args);
  const oauth = oauthOf(args);
  const payload: McpServerWrite = {
    type: transportOf(args),
    url: textOf(args, 'url'),
    ...(headers === undefined ? {} : { headers }),
    ...(oauth === undefined ? {} : { oauth }),
  };
  const answer = await asked('factory server add', (c) => c.mcpservers.put({ params: { namespace: factory, name: server }, payload }));
  const { file, was } = writtenOf(answer, 'factory server add');
  said([
    `${factory}  ${server} → ${answer.spec.type} ${answer.spec.url}${was ? ` (was ${was})` : ''}`,
    `recorded: ${file}${answer.spec.oauth === undefined ? '' : ' — sign the server in before a step needs it'}`,
  ]);
  return 0;
}

/**
 * `nemia factory server rm`: one server taken off a factory's record; the harness's sign-in for it is left.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function factoryServerRm(args: Args) {
  const [factory, server] = [textOf(args, 'factory'), textOf(args, 'server')];
  const answer = await asked('factory server rm', (c) => c.mcpservers.delete({ params: { namespace: factory, name: server } }));
  said([
    `${factory}  ${server} removed`,
    `recorded: ${writtenOf(answer, 'factory server rm').file} — the sign-in filed for it is left in the runtime's or the harness's own store`,
  ]);
  return 0;
}
