/**
 * A background session's Remote Control link: the bridge Claude Code opens to claude.ai for a session spawned with
 * `--remote-control`, read off the registration it writes for the session (`<sessions>/<pid>.json`, `bridgeSessionId`), which
 * `claude agents --json` does not list. The link is `https://claude.ai/code/<bridgeSessionId>`, and opens the session in a browser
 * or on a phone.
 */
import { quote } from '../../core/quote.ts';
import type { Bridge } from '../../core/index.ts';
import { claudeRegistration, type RegisteredBy } from './inbox.ts';

/** A `bridgeSessionId` as Claude Code writes it: `session_` and letters and digits. Anything else builds no link. */
export const BRIDGE_ID = /^session_[A-Za-z0-9]+$/;

/** The link that opens a bridged session, from its `bridgeSessionId`. */
export const bridgeUrl = (bridgeSessionId: string): string => `https://claude.ai/code/${bridgeSessionId}`;

/**
 * The bridge of the session `sessionId` running under `pid`, from the registration Claude Code wrote for it under `sessionsDir`:
 * its link, or why there is none, as a sentence that says what to do. Never a failure: the link is one session's fact, and a
 * registration it cannot read leaves every other fact of every session observed.
 *
 * - The registration is not taken (`claudeRegistration`): none for the pid, another session's, or an earlier process's.
 * - It holds no `bridgeSessionId`: the bridge is not up yet, or never will be.
 * - Its `bridgeSessionId` is not of the form `BRIDGE_ID`: refused by name, its value quoted, and no link built from it.
 *
 * `by` is who "this user" is and when a process started, passed only by a test.
 */
export const claudeBridge = async (sessionsDir: string, pid: number, sessionId: string, by: RegisteredBy = {}): Promise<Bridge> => {
  const read = await claudeRegistration(sessionsDir, pid, { sessionId }, by);
  if ('refused' in read) {
    return { url: null, why: `its registration is not read: ${read.refused}. It has exited, or runs where this runtime cannot see.` };
  }
  const id = read.registration.bridgeSessionId;
  if (id === undefined || id === null) {
    return {
      url: null,
      why:
        'its registration holds no `bridgeSessionId` yet: Claude Code opens the bridge within seconds of the start, and never while' +
        ' signed out or where the organisation turns Remote Control off; `/status` in the session says which.',
    };
  }
  if (typeof id !== 'string' || !BRIDGE_ID.test(id)) {
    return {
      url: null,
      why:
        `its registration's \`bridgeSessionId\` is ${quote(JSON.stringify(id) ?? 'nothing')}, not \`session_\` and letters and` +
        ' digits, so no link is built from it: run a Claude Code whose registration this runtime reads.',
    };
  }
  return { url: bridgeUrl(id) };
};
