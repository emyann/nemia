/**
 * The runners of the server's and the store's own reads (`objects`' `SERVER_READ_WORDS`): `server version`, `server upgrades`,
 * `capabilities`, `repository`, `store` and `milestones`, each the api's answer printed as YAML, or JSON with `--json` (`answered`).
 */
import type { Args } from 'objects';
import { answered } from '../answer.ts';
import { textArg } from '../requests.ts';

/** The place `args` name, as the endpoint's query takes it: the factory and the repository, each where given. */
const placeOf = (args: Args) => {
  const factory = textArg(args, 'factory');
  const repo = textArg(args, 'repo');
  return { ...(factory === undefined ? {} : { factory }), ...(repo === undefined ? {} : { repo }) };
};

/**
 * `nemia server version`'s runner: the release the server runs, and the newest it knows of.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export const serverVersion = (args: Args) => answered('server version', args, (c) => c.server.version());

/**
 * `nemia server upgrades`' runner: the server's last upgrade and the release going back goes to.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export const serverUpgrades = (args: Args) => answered('server upgrades', args, (c) => c.upgrades.read());

/**
 * `nemia capabilities`' runner: what a step may be given, in the place named.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export const capabilities = (args: Args) => answered('capabilities', args, (c) => c.server.capabilities({ query: placeOf(args) }));

/**
 * `nemia repository`'s runner: the repository a factory works in, in the place named.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export const repository = (args: Args) => answered('repository', args, (c) => c.server.repository({ query: placeOf(args) }));

/**
 * `nemia store`'s runner: the store's folders of definitions and the lines that file a factory and turn Nemia on.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export const store = (args: Args) => answered('store', args, (c) => c.server.store());

/**
 * `nemia milestones`' runner: how far the store is towards its first landed change.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export const milestones = (args: Args) => answered('milestones', args, (c) => c.readiness.milestones());
