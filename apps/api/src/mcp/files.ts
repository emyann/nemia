/**
 * Files given to a tool of the MCP port inline: a key of a tool's input whose items are a card's file reference (`objects`'
 * `CARD_FILE_REF` in its `$defs`) takes, besides `{ name?, file }` naming a File uploaded first, `{ name, data, mediaType? }`, the file's
 * bytes in base64 — of `MAX_INLINE_BYTES` at most — which the port uploads to the call's namespace (`POST
 * /api/namespaces/<namespace>/files`, through the app's own fetch, with the caller's `Authorization`) and sends on by the id it is
 * answered. The SDK this port is served by has no result that asks a client to upload a file and call again, as MCP's files extension
 * has, so inline bytes are a host's one way to hand a file through the port; a larger file is uploaded over HTTP first.
 */
import { Predicate } from 'effect';
import { CARD_FILE_REF, type ToolWords } from 'objects';

/** The most bytes a file given inline may decode to: one mebibyte. */
export const MAX_INLINE_BYTES = 1_048_576;

/** The reference a key's items take where they name a card's files. */
const FILE_REF = `#/$defs/${CARD_FILE_REF}`;

/** A tool's input, as `objects` reads it off its endpoint. */
type ToolInput = ToolWords['inputSchema'];

/**
 * The keys of a tool's input whose value is a list of a card's file references.
 * @param input The tool's input, a JSON Schema object.
 */
export function fileKeysOf(input: ToolInput) {
  return Object.entries(input.properties).flatMap(([key, value]) =>
    Predicate.isObject(value.items) && value.items.$ref === FILE_REF ? [key] : [],
  );
}

/** A file given inline, as the port lists it beside a reference to a File. */
const INLINE = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'The name it takes in the card, no folder in it.' },
    data: {
      type: 'string',
      contentEncoding: 'base64',
      description: `The file's bytes in base64, of ${MAX_INLINE_BYTES} bytes at most: the port uploads them and names the File it is answered. A larger file is uploaded first (POST /api/namespaces/<namespace>/files) and named by its id.`,
    },
    mediaType: { type: 'string', description: "The file's media type, image/png for a picture; absent, application/octet-stream." },
  },
  required: ['name', 'data'],
  additionalProperties: false,
};

/**
 * A tool's input as the port lists it: where it names a card's files, each may be a File's id or the file's bytes inline.
 * @param input The tool's input, as the endpoint's schema reads.
 */
export function inlineInput(input: ToolInput) {
  const ref = input.$defs?.[CARD_FILE_REF];
  if (ref === undefined || fileKeysOf(input).length === 0) return input;
  const listed: ToolInput = { ...input, $defs: { ...input.$defs, [CARD_FILE_REF]: { anyOf: [ref, INLINE] } } };
  return listed;
}

/** What the port reaches the api through, and the request that carried the call. */
export type Uploading = {
  readonly fetch: (request: Request) => Response | Promise<Response>;
  readonly from: Request;
  readonly signal?: AbortSignal;
};

/** The arguments sent on, or the words of why not, which say what to do next. */
type Inlined = { readonly args: Readonly<Record<string, unknown>> } | { readonly refused: string };

/** `text` as base64 decoded, or none where it is not base64. */
const bytesOf = (text: string) => {
  const clean = text.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) return undefined;
  return Buffer.from(clean, 'base64');
};

/** One file given inline, uploaded to `namespace`: the id it was answered, or the words of why not. */
async function uploaded(namespace: string, name: string, data: string, mediaType: string, via: Uploading) {
  const bytes = bytesOf(data);
  if (bytes === undefined) return { refused: `the file ${name}'s data is not base64: give its bytes in base64, or upload it first` };
  if (bytes.length > MAX_INLINE_BYTES)
    return {
      refused: `the file ${name} is ${bytes.length} bytes, past the ${MAX_INLINE_BYTES} a file given inline may be: upload it first (POST /api/namespaces/${namespace}/files) and name it by its id`,
    };
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mediaType }), name);
  const headers = new Headers();
  const authorization = via.from.headers.get('authorization');
  if (authorization !== null) headers.set('authorization', authorization);
  const url = new URL(`/api/namespaces/${encodeURIComponent(namespace)}/files`, via.from.url);
  const res = await via.fetch(new Request(url, { method: 'POST', headers, body: form, signal: via.signal }));
  const body: unknown = await res.json().catch(() => undefined);
  if (res.ok && Predicate.isObject(body) && typeof body.id === 'string') return { id: body.id };
  const said = Predicate.isObject(body) && typeof body.error === 'string' ? body.error : `answered ${res.status}`;
  return { refused: `the file ${name} was not uploaded: ${said}` };
}

/** One item of a key naming a card's files, sent on: as it is, or, given inline, uploaded and named by its File's id; or why not. */
async function itemSent(namespace: string, item: unknown, via: Uploading) {
  if (!Predicate.isObject(item) || typeof item.data !== 'string' || typeof item.name !== 'string') return { item };
  const mediaType = typeof item.mediaType === 'string' && item.mediaType !== '' ? item.mediaType : 'application/octet-stream';
  const up = await uploaded(namespace, item.name, item.data, mediaType, via);
  return up.id === undefined ? { refused: up.refused } : { item: { name: item.name, file: up.id } };
}

/**
 * The arguments of a call with each file given inline uploaded and named by its File's id; an item naming a File by `file` is sent as it
 * is. The words of why not where a file's data is not base64, is past `MAX_INLINE_BYTES`, or its upload is refused.
 * @param keys The keys of the tool's input that name a card's files (`fileKeysOf`).
 * @param args The call's arguments, its defaults sent.
 * @param via The app's fetch and the request that carried the call.
 */
export async function inlined(keys: readonly string[], args: Readonly<Record<string, unknown>>, via: Uploading) {
  const namespace = typeof args.namespace === 'string' && args.namespace !== '' ? args.namespace : 'default';
  const sent: Record<string, unknown> = { ...args };
  for (const key of keys) {
    const given = args[key];
    if (!Array.isArray(given)) continue;
    const items: unknown[] = [];
    for (const item of given) {
      const one = await itemSent(namespace, item, via);
      if (one.refused !== undefined) {
        const out: Inlined = { refused: one.refused };
        return out;
      }
      items.push(one.item);
    }
    sent[key] = items;
  }
  const out: Inlined = { args: sent };
  return out;
}
