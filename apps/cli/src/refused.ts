/** What this client refuses with: the bin prints its words and exits with its code. */
/** A refusal this client says and exits with: its words name what to type next, and `code` is the exit code (2, a usage refusal). */
export class Refused extends Error {
  readonly code: number;
  constructor(message: string, code = 2) {
    super(message);
    this.name = 'Refused';
    this.code = code;
  }
}
