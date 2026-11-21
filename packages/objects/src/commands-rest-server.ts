/**
 * The words of the reads of the server and the store that the board makes and no other verb linked: `server version`, `server upgrades`,
 * `capabilities`, `repository`, `store` and `milestones`. Each prints the api's answer as YAML, or as JSON with `--json`, and links the
 * one endpoint it reads, so the MCP port has its tool and Nemia's shell its allow. Pure.
 */
import { CLI, type CommandWords, type Flag } from './command.ts';
import { answerSpec } from './commands-flags.ts';

/** `--factory` and `--repo`, the place a read is answered in, as the endpoint's query takes them. */
const placeFlags = (verb: string) =>
  [
    {
      flag: '--factory',
      kind: 'name',
      key: 'factory',
      takes: `--factory takes the factory the read is answered in: ${CLI} ${verb} --factory <factory>`,
      twice: `${CLI} ${verb} takes --factory once: one factory at a time.`,
    },
    {
      flag: '--repo',
      kind: 'text',
      key: 'repo',
      takes: `--repo takes the repository of that factory the read is answered in: ${CLI} ${verb} --repo <path>`,
      twice: `${CLI} ${verb} takes --repo once: one repository at a time.`,
    },
  ] as const satisfies readonly Flag[];

/** The usage of a read answered in a place. */
const PLACE_USAGE = '[--factory <factory>] [--repo <path>] [--json]';

/** The words of a read answered in a place: `--factory`, `--repo` and `--json`. */
const placeSpec = (verb: string) => answerSpec(verb, PLACE_USAGE, [], placeFlags(verb));

/** The words of a read that takes `--json` alone. */
const bareSpec = (verb: string) => answerSpec(verb, '[--json]');

/** `nemia server version`: the release the server a context names runs, and the newest it knows of. */
export const SERVER_VERSION_WORDS = {
  name: 'server version',
  served: [{ endpoint: 'server.version' }],
  usage: '[--json]',
  help: ['the release the server runs and the newest it knows of, as YAML;', "--json: as JSON. nemia version is this machine's"],
  spec: bareSpec('server version'),
  writes: false,
  class: 'read',
} as const satisfies CommandWords;

/** `nemia server upgrades`: the release going back goes to, and the server's last upgrade. */
export const SERVER_UPGRADES_WORDS = {
  name: 'server upgrades',
  served: [{ endpoint: 'upgrades.read' }],
  usage: '[--json]',
  help: ["the server's last upgrade and the release going back goes to, as", 'YAML; --json: as JSON'],
  spec: bareSpec('server upgrades'),
  writes: false,
  class: 'read',
} as const satisfies CommandWords;

/** `nemia capabilities`: what a factory's steps may be given, in a place. */
export const CAPABILITIES_WORDS = {
  name: 'capabilities',
  served: [{ endpoint: 'server.capabilities' }],
  usage: PLACE_USAGE,
  help: ['the harnesses, models, skills and servers a step may be given, as', 'YAML, in a factory or a repository of it; --json: as JSON'],
  spec: placeSpec('capabilities'),
  writes: false,
  class: 'read',
} as const satisfies CommandWords;

/** `nemia repository`: the repository a factory works in, as the server reads it. */
export const REPOSITORY_WORDS = {
  name: 'repository',
  served: [{ endpoint: 'server.repository' }],
  usage: PLACE_USAGE,
  help: ['the repository a factory works in, as the server reads it, as YAML;', '--json: as JSON'],
  spec: placeSpec('repository'),
  writes: false,
  class: 'read',
} as const satisfies CommandWords;

/** `nemia store`: the store's folders of definitions, and the lines that file a factory and turn Nemia on. */
export const STORE_WORDS = {
  name: 'store',
  served: [{ endpoint: 'server.store' }],
  usage: '[--json]',
  help: [
    'where the store keeps its workflows, agents and skills, with the',
    'commands that file a factory and turn Nemia on, as YAML; --json: as JSON',
  ],
  spec: bareSpec('store'),
  writes: false,
  class: 'read',
} as const satisfies CommandWords;

/** `nemia milestones`: how far the store is on the way to its first landed change. */
export const MILESTONES_WORDS = {
  name: 'milestones',
  served: [{ endpoint: 'readiness.milestones' }],
  usage: '[--json]',
  help: ['how far the store is towards its first landed change, each milestone', 'done or not, as YAML; --json: as JSON'],
  spec: bareSpec('milestones'),
  writes: false,
  class: 'read',
} as const satisfies CommandWords;

/** The group's words, in the order the help lists them. */
export const SERVER_READ_WORDS = [
  SERVER_VERSION_WORDS,
  SERVER_UPGRADES_WORDS,
  CAPABILITIES_WORDS,
  REPOSITORY_WORDS,
  STORE_WORDS,
  MILESTONES_WORDS,
] as const satisfies readonly CommandWords[];
