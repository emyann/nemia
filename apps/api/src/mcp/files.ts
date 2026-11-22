/**
 * Files given to a tool of the MCP port, in the shape of MCP's files extension (`io.modelcontextprotocol/files`, a draft): a key of a
 * tool's input whose items are a card's file reference (`objects`' `CARD_FILE_REF` in its `$defs`) takes, besides `{ name?, file }`
 * naming a File uploaded first, the extension's `FileInput` — `{ id, mimeType, size, name?, data?, digest? }`, its schema marked
 * `x-mcp-file` — whose `data`, the file's bytes in base64 of `MAX_INLINE_BYTES` at most, the port uploads to the call's namespace (`POST
 * /api/namespaces/<namespace>/files`, through the app's own fetch, with the caller's `Authorization`) and sends on by the File it is
 * answered. The port advertises the extension inline alone (`FILES_EXTENSION`: `maxInlineBytes`, no `upload`): the server SDK it is
 * served on (`@modelcontextprotocol/server` 2.4.0) answers a call `complete` or `input_required` and nothing else, so it cannot answer
 * the extension's `upload_required`, and a `FileInput` without `data` is refused with the way to hand the file: upload it over HTTP
 * first and name its File by `file`.
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

/** The files extension as the port advertises it on `initialize` and `server/discover`: inline `data` alone, no `upload`. */
export const FILES_EXTENSION = { 'io.modelcontextprotocol/files': { maxInlineBytes: MAX_INLINE_BYTES } };

/** A file given as the extension's `FileInput`, as the port lists it beside a reference to a File: marked `x-mcp-file`. */
const FILE_INPUT = {
  type: 'object',
  'x-mcp-file': { accept: ['*/*'], maxSize: MAX_INLINE_BYTES },
  properties: {
    id: { type: 'string', description: "The caller's own id for the file." },
    mimeType: { type: 'string', description: "The file's media type, image/png for a picture." },
    size: { type: 'integer', minimum: 0, description: "The file's size in bytes." },
    name: { type: 'string', description: 'The name it takes in the card, no folder in it; absent, its id.' },
    data: {
      type: 'string',
      contentEncoding: 'base64',
      description: `The file's bytes in base64, of ${MAX_INLINE_BYTES} bytes at most: the port uploads them and names the File it is answered. Required here: this port takes no upload out of band. A larger file is uploaded first (POST /api/namespaces/<namespace>/files) and named by its File's id, as file.`,
    },
    digest: { type: 'string', description: "A digest of the file's bytes, which the port does not check." },
  },
  required: ['id', 'mimeType', 'size'],
  additionalProperties: false,
};

/**
 * A tool's input as the port lists it: where it names a card's files, each may be a File's id or the file's bytes inline.
 * @param input The tool's input, as the endpoint's schema reads.
 */
export function inlineInput(input: ToolInput) {
  const ref = input.$defs?.[CARD_FILE_REF];
  if (ref === undefined || fileKeysOf(input).length === 0) return input;
  const listed: ToolInput = { ...input, $defs: { ...input.$defs, [CARD_FILE_REF]: { anyOf: [ref, FILE_INPUT] } } };
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

/**
 * One item of a key naming a card's files, sent on: as it is where it names a File (`file`), or, given as a `FileInput`, its `data`
 * uploaded and named by its File's id under its name, else its id; or why not, where it has no `data`.
 */
async function itemSent(namespace: string, item: unknown, via: Uploading) {
  if (!Predicate.isObject(item) || typeof item.file === 'string' || typeof item.id !== 'string') return { item };
  const name = typeof item.name === 'string' && item.name !== '' ? item.name : item.id;
  if (typeof item.data !== 'string')
    return {
      refused: `the file ${name} has no data, and this port takes no upload out of band (no upload_required): give its bytes in base64 as data, of ${MAX_INLINE_BYTES} bytes at most, or upload it first (POST /api/namespaces/${namespace}/files) and name it by its File's id as file`,
    };
  const mediaType = typeof item.mimeType === 'string' && item.mimeType !== '' ? item.mimeType : 'application/octet-stream';
  const up = await uploaded(namespace, name, item.data, mediaType, via);
  return up.id === undefined ? { refused: up.refused } : { item: { name, file: up.id } };
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
