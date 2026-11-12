/**
 * The requests a link makes of an entry's input, where its endpoint names a key otherwise (`EndpointLink.request`): the input's keys
 * renamed to the endpoint's, the command line's own keys left out, and a key the endpoint cannot be sent refused in words that say where
 * the command runs instead. Pure, each answering a promise, rejected with the refusal where it cannot be sent.
 */
import { Invalid } from '../refusal/refusal.ts';
import type { EndpointLink } from './command.ts';

/** A link's request. */
type Request = NonNullable<EndpointLink['request']>;

/** What a request is made of: an entry's decoded input. */
type Input = Readonly<Record<string, unknown>>;

/**
 * The request that sends `input` with each key of `names` under the endpoint's name for it (`{ runId: 'name' }`), each of `dropped` left
 * out — a key the command line reads itself, or one that only chose the link (`takes`) — and the rest as they are.
 */
export const renamed =
  (names: Readonly<Record<string, string>>, dropped: readonly string[] = []): Request =>
  (input: Input) =>
    Promise.resolve(
      Object.fromEntries(
        Object.entries(input)
          .filter(([k]) => !dropped.includes(k))
          .map(([k, v]) => [names[k] ?? k, v]),
      ),
    );

/**
 * `request`, refused (`Invalid`) where `input` gives any of `keys` a value the endpoint cannot be sent (anything but undefined or false):
 * `verb` says where it runs with them — on the daemon's machine, or here with `NEMIA_CONTEXT=local`.
 */
export const refusing =
  (verb: string, keys: readonly string[], request: Request): Request =>
  (input: Input) => {
    const given = keys.filter((k) => input[k] !== undefined && input[k] !== false);
    if (given.length === 0) return request(input);
    return Promise.reject(
      new Invalid({
        message: `nemia ${verb} forwarded to another machine's api cannot send ${given.map((k) => `\`${k}\``).join(', ')}, which its endpoint does not take: run it on the daemon's machine, or on this machine's store with NEMIA_CONTEXT=local.`,
      }),
    );
  };

/** Whether `input` gives `key` a value: anything but undefined, false or an empty text. */
export const gives =
  (key: string) =>
  (input: Input): boolean =>
    input[key] !== undefined && input[key] !== false && input[key] !== '';

/** Whether `input` gives none of `keys` a value (`gives`). */
export const givesNone =
  (...keys: readonly string[]) =>
  (input: Input): boolean =>
    keys.every((k) => !gives(k)(input));

/**
 * `request`, refused (`Invalid`) where `input` gives `key` no value (`gives`): the endpoint's path takes it, which the command line takes
 * as optional here, where the store is read to find it. `form` is the command line that names it.
 */
export const requiring =
  (key: string, form: string, request: Request): Request =>
  (input: Input) =>
    gives(key)(input)
      ? request(input)
      : Promise.reject(
          new Invalid({
            message: `forwarded to another machine's api, the command names its ${key}: ${form}; or run it on this machine's store with NEMIA_CONTEXT=local.`,
          }),
        );

/**
 * The request of an entry whose input says the place it reads or writes under `from` — `yours` or `repo` the default namespace's, any other
 * word a factory's — with the namespace it is in, and `from` left out beside each of `dropped`.
 */
export const fromPlace =
  (names: Readonly<Record<string, string>> = {}, dropped: readonly string[] = []): Request =>
  (input: Input) =>
    renamed(names, ['from', ...dropped])(input).then((request) => {
      const from = input.from;
      const factory = typeof input.factory === 'string' && input.factory !== '' ? input.factory : undefined;
      const namespace = typeof from === 'string' && from !== 'yours' && from !== 'repo' ? from : (factory ?? 'default');
      return { ...request, namespace };
    });

/** `selector`, the `-l` selectors a command line took one by one, as the one label selector a query takes: joined by commas, each held. */
export const selectorQuery = (input: Input): Readonly<Record<string, string>> => {
  const selector = input.selector;
  const texts = Array.isArray(selector) ? selector.map(String) : typeof selector === 'string' ? [selector] : [];
  return texts.length ? { labelSelector: texts.join(',') } : {};
};
