/** The board's one read of the api: a GET answered with JSON, or refused in the api's words (`ReadRefusal`). */

/** A read the api answered with an error: its words, and its status, which is how a run gone from the store is told apart (`runGone`). */
export class ReadRefusal extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    // The api says what to do next in `error`, which is worth more than the status line.
    const said = await res.json().then(
      (body: { error?: unknown }) => body.error,
      () => undefined,
    );
    throw new ReadRefusal(typeof said === 'string' ? said : `GET ${path} answered ${res.status} ${res.statusText}`, res.status);
  }
  return (await res.json()) as T;
}
