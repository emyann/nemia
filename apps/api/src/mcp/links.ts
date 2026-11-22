/**
 * A file the api serves as its bytes (`objects`' `READS` calls its read `bytes`: a step's artifact or file, a kept file's content) as the
 * MCP port hands it over: never its bytes in a tool's answer, but an MCP `resource_link` to `nemia://<its path>` with its media type and
 * size (`linkOf`), so a list or a read of one stays data and the file is reached by a path of its own. `resources/read` of such a URI
 * (`fileUriOf`) answers the file, read through the app with the caller's own `Authorization` (`fileRead`): a text type as its text,
 * any other as base64, refused past `ANSWER_BOUND` naming the api's path, which a client fetches whole.
 */
import { Api, type ApiGetName, READS } from 'objects';
import { ANSWER_BOUND } from './bound.ts';
import { SCHEME } from './resources.ts';
import type { Fetching } from './port.ts';

/** A path of the `Api` as a pattern of the paths it serves: each `:name` one segment, the last of a file's path any. */
const patternOf = (path: string) =>
  new RegExp(
    `^${path
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:[A-Za-z]+$/, '.+')
      .replace(/:[A-Za-z]+/g, '[^/]+')}$`,
  );

/** The patterns of the paths of every GET endpoint of the `Api` that serves a file's bytes. */
const BYTES_PATHS: readonly RegExp[] = Object.values(Api.groups).flatMap((group) =>
  Object.entries(group.endpoints)
    .filter(([name, e]) => e.method === 'GET' && READS[`${group.identifier}.${name}` as ApiGetName].shape === 'bytes')
    .map(([, e]) => patternOf(e.path)),
);

/** Whether a media type is text a host reads as it is: `text/*`, JSON, YAML, XML, or one that says its charset. */
const isText = (mimeType: string) => /^text\/|[/+](json|yaml|xml)\b|^application\/(javascript|x-yaml|x-sh)\b|charset=/i.test(mimeType);

/**
 * The resource link a file the api answered is handed over as: its `nemia://` URI (its path and query under the scheme), its name (the
 * path's last segment), its media type and, where the answer says it, its size in bytes.
 * @param url The URL the file was read at.
 * @param headers The headers the api answered it with.
 */
export const linkOf = (url: URL, headers: Headers) => {
  const size = Number(headers.get('content-length') ?? Number.NaN);
  const name = decodeURIComponent(
    url.pathname
      .split('/')
      .filter((part) => part !== '')
      .at(-1) ?? url.pathname,
  );
  return {
    type: 'resource_link' as const,
    uri: `${SCHEME}://${url.pathname}${url.search}`,
    name,
    mimeType: headers.get('content-type') ?? 'application/octet-stream',
    ...(Number.isInteger(size) && size >= 0 ? { size } : {}),
  };
};

/**
 * The api's path and query a `nemia://` URI names, where it names a file the api serves as its bytes; undefined where it does not.
 * @param uri The URI a read names.
 */
export const fileUriOf = (uri: string) => {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return undefined;
  }
  if (url.protocol !== `${SCHEME}:` || url.host !== '') return undefined;
  return BYTES_PATHS.some((pattern) => pattern.test(url.pathname)) ? `${url.pathname}${url.search}` : undefined;
};

/**
 * The file at `path` read through `app` with `from`'s `Authorization`, as `resources/read` answers it: its text for a text type, else its
 * bytes as base64; a refusal in words where the api refuses it or it passes `bound`, naming the path to fetch it whole.
 * @param uri The URI the read names, answered beside the content.
 * @param path The api's path and query of the file (`fileUriOf`).
 * @param from The request to the port that carried the read, whose `Authorization` the read presents.
 * @param app The app whose fetch reads the file.
 * @param bound The most characters a read answers; ANSWER_BOUND by default.
 */
export async function fileRead(uri: string, path: string, from: Request, app: Fetching, bound = ANSWER_BOUND) {
  const headers = new Headers();
  const authorization = from.headers.get('authorization');
  if (authorization !== null) headers.set('authorization', authorization);
  const res = await app.fetch(new Request(new URL(path, from.url), { method: 'GET', headers }));
  if (!res.ok) {
    const text = await res.text();
    return { kind: 'refused' as const, message: `GET ${path} answered ${res.status}${text === '' ? '' : `: ${text}`}` };
  }
  const mimeType = res.headers.get('content-type') ?? 'application/octet-stream';
  const bytes = Buffer.from(await res.arrayBuffer());
  const text = isText(mimeType) ? bytes.toString('utf8') : undefined;
  const blob = text === undefined ? bytes.toString('base64') : undefined;
  const content = text !== undefined ? { uri, mimeType, text } : { uri, mimeType, blob: blob ?? '' };
  const size = (text ?? blob ?? '').length;
  if (size > bound)
    return {
      kind: 'refused' as const,
      message: `${uri} is ${size} characters, past the ${bound} a read answers: read it whole over HTTP, GET ${path} with your token`,
    };
  return { kind: 'read' as const, content };
}
