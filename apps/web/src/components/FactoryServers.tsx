/**
 * A factory's own MCP servers, on its settings page: each server the factory records, with the state its harness reports now, and a
 * form to record a remote one. A server is removed from its row.
 *
 * **The state is read on load and on a press, never on the board's poll.** Reading one spawns a short-lived harness session, so the
 * query is unpolled (`factoryServersQuery`) and "Check again" is how a chip is refreshed: a chip may be a few minutes old, and says so.
 * A state that could not be read is drawn as unread, in rest — an absence read off a failed look is not an absence — never as a
 * server that needs a sign-in.
 *
 * The form takes a **remote** server only, and refuses an `Authorization` header in the api's own words: nothing a person types enters
 * the record, and a server's own sign-in is the road for a credential. Every other header is kept, and a line beside the field says a
 * header changed after a sign-in asks for a new one.
 */
import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CutFrame, CutPress, CutTag, FRAMED_BOX, Plate } from '@/components/look';
import { container, hairline } from '@/lib/meaning';
import { CHIP } from './Reach';
import { ServerSignIn } from './ServerSignIn';
import { stateDrawn } from '../lib/serverState';
import { factoryServersQuery, recordServer, removeServer, type FactoryServer, type ShippedServer } from '../lib/api';

/** What a person asks of a factory's record: one server recorded, or one taken off. */
type Change = { kind: 'record'; server: string; body: Parameters<typeof recordServer>[2] } | { kind: 'remove'; server: string };

/** What a change did, said once it is done, and what a refusal of it is headed with. */
const SAID: Record<Change['kind'], { done: string; refused: string }> = {
  record: { done: 'Recorded: a run started from now on hands it to every step whose agent names it.', refused: 'Not recorded' },
  remove: { done: "Removed: a step naming it resolves the name against the checkout's .mcp.json instead.", refused: 'Not removed' },
};

/** One server's state as a chip: the harness's own word, in the one meaning it carries (`stateDrawn`). */
export function ServerState({ state }: { state: string | null }) {
  const { word, hue, title } = stateDrawn(state);
  return (
    <CutTag>
      <span data-server-state={word} title={title} className={`${CHIP} ${hue === 'grey' ? hairline : container[hue]}`}>
        {word}
      </span>
    </CutTag>
  );
}

/**
 * One recorded server: its name, its state, its address, its headers, its sign-in where it signs in through an OAuth client
 * (`signIn`, `ServerSignIn`), and the press that takes it off the record. Exported for its stories, which draw a state a node test
 * cannot judge.
 */
export function ServerRow({
  server,
  pending,
  onRemove,
  signIn,
}: {
  server: FactoryServer;
  pending: boolean;
  onRemove: (name: string) => void;
  signIn?: ReactNode;
}) {
  const headers = Object.entries(server.headers ?? {});
  return (
    <li data-factory-server={server.name} aria-label={`MCP server ${server.name}`} className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{server.name}</span>
        <ServerState state={server.state} />
        <span className="font-mono text-body-small text-muted-foreground">{server.type}</span>
        {server.tools !== undefined && (
          <span className="text-body-small text-muted-foreground">{server.tools === 1 ? '1 tool' : `${server.tools} tools`}</span>
        )}
        <span className="ml-auto">
          <CutPress isDisabled={pending} onPress={() => onRemove(server.name)}>
            Remove
          </CutPress>
        </span>
      </div>
      <p className="font-mono text-body-small break-all text-foreground">{server.url}</p>
      {headers.length > 0 && (
        <p data-server-headers className="font-mono text-body-small break-all text-muted-foreground">
          {headers.map(([k, v]) => `${k}: ${v}`).join('  ')}
        </p>
      )}
      {server.oauth && (
        <p data-server-oauth className="text-body-small text-muted-foreground">
          Signs in as client <span className="font-mono break-all">{server.oauth.clientId}</span>
          {server.oauth.callbackPort !== undefined && <> on port {server.oauth.callbackPort}</>}.
        </p>
      )}
      {signIn}
      {server.error !== undefined && (
        <pre className="rounded bg-failure-container p-2 font-mono text-body-small leading-snug whitespace-pre-wrap break-words text-on-failure-container">
          {server.error}
        </pre>
      )}
    </li>
  );
}

/** The form's own fields, as a person fills them. */
type Draft = { name: string; url: string; transport: string; header: string; clientId: string; callbackPort: string };

const EMPTY: Draft = { name: '', url: '', transport: 'http', header: '', clientId: '', callbackPort: '' };

/** `shipped` as a draft: the facts Nemia ships of it, so a person types neither its address nor its client id. */
const draftOf = (shipped: ShippedServer): Draft => ({
  name: shipped.name,
  url: shipped.url,
  transport: shipped.type,
  header: Object.entries(shipped.headers ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(', '),
  clientId: shipped.oauth?.clientId ?? '',
  callbackPort: shipped.oauth?.callbackPort === undefined ? '' : String(shipped.oauth.callbackPort),
});

/** How the form writes one field of its draft: the same handler for each, by the field's key. */
type Fills = { draft: Draft; set: (key: keyof Draft) => (e: { target: { value: string } }) => void };

/** The form's headers field: one `name=value` per header, and what a header changed after a sign-in costs. */
function HeaderField({ draft, set }: Fills) {
  return (
    <Field>
      <FieldLabel htmlFor="server-header">Headers</FieldLabel>
      <Input id="server-header" name="header" value={draft.header} onChange={set('header')} placeholder="X-MCP-Toolsets=actions,repos" />
      <FieldDescription data-server-header-note>
        One <code className="font-mono text-body-small">name=value</code> per header, separated by commas. A header changed after a sign-in
        asks for a new one: the state reads needs-auth again on the next read.{' '}
        <code className="font-mono text-body-small">Authorization</code> is refused — nothing a person types enters the record, and a server
        signs in instead.
      </FieldDescription>
    </Field>
  );
}

/** The form's sign-in fields: the OAuth client the server signs in as, and the port its callback is registered on. No secret. */
function SignInFields({ draft, set }: Fills) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="server-client-id">OAuth client id</FieldLabel>
        <Input id="server-client-id" name="clientId" value={draft.clientId} onChange={set('clientId')} placeholder="Iv23li…" />
        <FieldDescription>
          For a server that signs in. No secret: a server Nemia ships signs in with the secret Nemia ships, and the harness reads any
          other's from its own store.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="server-callback-port">Callback port</FieldLabel>
        <Input id="server-callback-port" name="callbackPort" value={draft.callbackPort} onChange={set('callbackPort')} placeholder="8791" />
        <FieldDescription>The port the OAuth app's callback is registered on.</FieldDescription>
      </Field>
    </>
  );
}

/**
 * The form that records a remote server: its name, address, transport, headers and the facts of its OAuth client. Exported for its
 * stories.
 */
export function ServerForm({
  shipped,
  pending,
  onRecord,
}: {
  shipped: readonly ShippedServer[];
  pending: boolean;
  onRecord: (server: string, body: Parameters<typeof recordServer>[2]) => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const set = (key: keyof Draft) => (e: { target: { value: string } }) => setDraft((was) => ({ ...was, [key]: e.target.value }));
  const header = draft.header
    .split(',')
    .map((one) => one.trim())
    .filter((one) => one.length > 0);
  const send = () =>
    onRecord(draft.name.trim(), {
      url: draft.url.trim(),
      transport: draft.transport.trim() || 'http',
      ...(header.length ? { header } : {}),
      ...(draft.clientId.trim() ? { clientId: draft.clientId.trim() } : {}),
      ...(draft.callbackPort.trim() ? { callbackPort: draft.callbackPort.trim() } : {}),
    });
  return (
    <form
      data-server-form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {shipped.length > 0 && (
        <div data-server-shipped className="flex flex-wrap items-center gap-2">
          <span className="text-body-medium text-muted-foreground">Nemia ships:</span>
          {shipped.map((one) => (
            <Button key={one.name} type="button" variant="outline" size="sm" onClick={() => setDraft(draftOf(one))}>
              {one.name}
            </Button>
          ))}
        </div>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="server-name">Name</FieldLabel>
          <Input id="server-name" name="name" value={draft.name} onChange={set('name')} placeholder="github" />
          <FieldDescription>
            The name an agent's <code className="font-mono text-body-small">mcp:</code> line asks for. Letters, digits, - and _.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="server-url">Address</FieldLabel>
          <Input id="server-url" name="url" value={draft.url} onChange={set('url')} placeholder="https://api.githubcopilot.com/mcp/" />
          <FieldDescription>
            A factory records a remote server alone: a program to start belongs to the checkout's{' '}
            <code className="font-mono text-body-small">.mcp.json</code>.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="server-transport">Transport</FieldLabel>
          <Input id="server-transport" name="transport" value={draft.transport} onChange={set('transport')} placeholder="http" />
          <FieldDescription>http or sse. The harness loads no server from an address without one.</FieldDescription>
        </Field>
        <HeaderField draft={draft} set={set} />
        <SignInFields draft={draft} set={set} />
      </FieldGroup>
      <div className="flex items-center gap-3">
        <CutPress isDisabled={pending || !draft.name.trim() || !draft.url.trim()} onPress={send}>
          Record
        </CutPress>
      </div>
    </form>
  );
}

/** The record's rows in a cut frame, each with its sign-in where it signs in through an OAuth client; nothing for an empty record. */
function ServerList({
  factory,
  servers,
  pending,
  onRemove,
}: {
  factory: string;
  servers: readonly FactoryServer[];
  pending: boolean;
  onRemove: (name: string) => void;
}) {
  if (servers.length === 0) return null;
  return (
    <CutFrame className={FRAMED_BOX}>
      <ul className="divide-y divide-outline-variant">
        {servers.map((server) => (
          <ServerRow
            key={server.name}
            server={server}
            pending={pending}
            onRemove={onRemove}
            signIn={server.oauth && <ServerSignIn factory={factory} server={server.name} state={server.state} />}
          />
        ))}
      </ul>
    </CutFrame>
  );
}

/**
 * A factory's MCP servers section. The record is listed in a cut frame under its plate, each server with its state; the form records a
 * remote one. A refusal is shown in the api's own words, the record as it was.
 */
export function FactoryServers({ name }: { name: string }) {
  const queryClient = useQueryClient();
  const query = factoryServersQuery(name);
  const { data, error, isFetching, refetch } = useQuery(query);
  const change = useMutation({
    mutationFn: (asked: Change) =>
      asked.kind === 'record' ? recordServer(name, asked.server, asked.body) : removeServer(name, asked.server),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true }),
  });
  const ask = (asked: Change) => {
    change.reset();
    change.mutate(asked);
  };
  const said = change.variables ? SAID[change.variables.kind] : null;
  const servers = data?.servers ?? [];
  return (
    <section aria-label="MCP servers" data-factory-servers className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Plate count={servers.length} title="MCP servers" hue="alive" quiet={servers.length === 0} />
        <span className="ml-auto">
          <CutPress isDisabled={isFetching} onPress={() => void refetch()}>
            Check again
          </CutPress>
        </span>
      </div>
      <p data-servers-told className="text-body-medium text-muted-foreground">
        Handed to every step of every run started in this factory whose agent names one, before the checkout's{' '}
        <code className="font-mono text-body-small">.mcp.json</code>. A step whose server needs a sign-in is not started until it has one.
        The state is read when this page opens and when you press Check again, never on the board's poll: reading one starts a short-lived
        harness session.
      </p>
      {data ? (
        <>
          {data.unread !== null && (
            <Alert data-servers-unread>
              <AlertTitle>The states were not read, which is not an absence</AlertTitle>
              <AlertDescription className="break-words">{data.unread}</AlertDescription>
            </Alert>
          )}
          <ServerList factory={name} servers={servers} pending={change.isPending} onRemove={(server) => ask({ kind: 'remove', server })} />
          <ServerForm
            shipped={data.shipped}
            pending={change.isPending}
            onRecord={(server, body) => ask({ kind: 'record', server, body })}
          />
        </>
      ) : (
        <p className="text-body-medium text-muted-foreground">
          {error instanceof Error ? `Could not read the servers: ${error.message}` : 'Reading the servers…'}
        </p>
      )}
      {change.isSuccess && said && (
        <p data-servers-done className="text-body-medium text-muted-foreground">
          {said.done}
        </p>
      )}
      {change.error && said && (
        <Alert variant="destructive" data-servers-refused>
          <AlertTitle>{said.refused}</AlertTitle>
          <AlertDescription className="break-words">
            {change.error instanceof Error ? change.error.message : String(change.error)}
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
