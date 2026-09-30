/** The board's one read of the api: a GET answered with JSON, or refused in the api's words (`ReadRefusal`). */

/** A read the api answered with an error: its words, and its status, which is how a run gone from the store is told apart (`runGone`). */
export class ReadRefusal extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Reads `path` from the api: resolves with its JSON; rejects with a `ReadRefusal` in the api's own words (its `error`, which says what to
 * do next) where it gave them, else naming the status.
 */
export async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const said = await res.json().then(
      (body: { error?: unknown }) => body.error,
      () => undefined,
    );
    throw new ReadRefusal(typeof said === 'string' ? said : `GET ${path} answered ${res.status} ${res.statusText}`, res.status);
  }
  return (await res.json()) as T;
}
