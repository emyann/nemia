/**
 * The remote A2A agents a step may name, `harness: a2a:<name>`: the store's `a2a-agents.json`, which a person writes. It maps each name to
 * the agent's address — `{ "url": "https://…" }`, its base URL, where its card is served — or to its card itself, `{ "card": { … } }`:
 *
 *     { "reviewer": { "url": "https://agents.example.com/reviewer" } }
 *
 * No secret is in it. A scheme the agent's card asks a secret for is answered from the environment, `WF_A2A_<NAME>_<SCHEME>` (`envNameOf`),
 * read on every request, so a secret is never on disk here.
 *
 * Read when a process makes its engine (`engine()` in runtime-client.ts), which is also where each address is judged by the runtime's own
 * rule (`readRemote`) and what is refused is left out, when `nemia start` checks the names its steps give, and when the api lists what a step
 * may run on: an edit reaches a running `nemia up` or api when it restarts. A store file at the bottom of the tree: it reads one file, and
 * imports no other store file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REMOTE_NAME, REMOTE_PREFIX } from './harness.ts';
import { Invalid } from '../refusal/refusal.ts';

/** The file, in the store's root (`$WF_ROOT`). */
export const A2A_AGENTS_FILE = 'a2a-agents.json';

/** Where the file is, in the store at `home`. */
export const remoteAgentsFile = (home: string): string => path.join(home, A2A_AGENTS_FILE);

/** One agent as the file gives it: the runtime's `RemoteAgent`, whose keys the runtime judges (`remoteConfigRefusal`). */
export type RemoteEntry = Record<string, unknown>;

/** Every agent the file declares, by name, in the file's order. */
export type RemoteAgents = ReadonlyMap<string, RemoteEntry>;

/** A word of a variable's name: upper case, and anything but a letter or a digit an underscore. */
const envWord = (word: string): string => word.toUpperCase().replace(/[^A-Z0-9]/g, '_');

/**
 * The environment variable that holds the secret for the scheme `scheme` of the agent the file declares as `name`:
 * `WF_A2A_<NAME>_<SCHEME>`, each upper case with anything but a letter or a digit made `_` — `reviewer`'s `bearer` is
 * `WF_A2A_REVIEWER_BEARER`. The scheme is the name the agent's card gives it.
 */
export const envNameOf = (name: string, scheme: string): string => `WF_A2A_${envWord(name)}_${envWord(scheme)}`;

/** A refusal of the file, with the fix: exit code 2, as every refusal a person acts on. */
function refuse(file: string, why: string): never {
  throw new Invalid({ message: `${file}: ${why}` });
}

/**
 * The agents the file at `file` declares, or none when there is no file. Refused, naming the file and the fix: text that is not JSON, JSON
 * that is not an object of objects, a name that is not lowercase words joined by dashes (`REMOTE_NAME`), and two names whose variables can
 * meet (`meetingOf`). What each entry holds is the runtime's to judge, once the client has it (`readRemote` in runtime-client.ts).
 */
export function readRemoteAgents(file: string): RemoteAgents {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw e;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    refuse(
      file,
      `is not JSON (${(e as Error).message}). It maps each remote agent's name to its address: \`{ "reviewer": { "url": "https://…" } }\`.`,
    );
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    refuse(
      file,
      `is ${Array.isArray(json) ? 'a list' : `\`${JSON.stringify(json)}\``}, and it is an object that maps each remote agent's name to its address: \`{ "reviewer": { "url": "https://…" } }\`.`,
    );
  }
  const agents = new Map<string, RemoteEntry>();
  for (const [name, entry] of Object.entries(json)) {
    if (!REMOTE_NAME.test(name)) {
      refuse(
        file,
        `\`${name}\` is not a name a step can give: a remote agent is named in lowercase words joined by dashes, as \`harness: ${REMOTE_PREFIX}reviewer\` names \`reviewer\`. Rename it.`,
      );
    }
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      refuse(
        file,
        `\`${name}\` is given ${JSON.stringify(entry)}, and an agent is an object: \`{ "url": "https://…" }\`, its base URL, or \`{ "card": { … } }\`, its card.`,
      );
    }
    agents.set(name, entry as RemoteEntry);
  }
  const meeting = meetingOf([...agents.keys()]);
  if (meeting) {
    const [short, long] = meeting;
    const rest = long.slice(short.length + 1);
    refuse(
      file,
      `\`${short}\` and \`${long}\` are both declared, and their secrets' variables can meet: \`${envNameOf(long, 'token')}\` is ${long}'s secret for a scheme its card calls \`token\`, and ${short}'s for one its card calls \`${rest}-token\` — so a card the other party writes could name a scheme that is given ${long}'s secret. Rename one so that neither begins with the other and a dash.`,
    );
  }
  return agents;
}

/**
 * Two names whose variables can be one, or `undefined`: `WF_A2A_<NAME>_<SCHEME>` of one is another's for some scheme exactly when one name
 * is the other, a dash and more (`acme` and `acme-internal`), since a dash and an underscore are both `_` there and a name holds no
 * underscore.
 */
function meetingOf(names: readonly string[]): [string, string] | undefined {
  for (const short of names) {
    const long = names.find((n) => n.startsWith(`${short}-`));
    if (long) return [short, long];
  }
  return undefined;
}
