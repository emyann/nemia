/**
 * What kind of address a bind names, and whether the daemon may listen there unasked (`contracts/address-kind.contract.ts`): the parse
 * of a text (`addressParsed`), its kind (`addressKind`), whether a bind of that kind is listened on or waits on the person's
 * acknowledgement (`bindExposure`), and this machine's own addresses with their kinds (`machineAddresses`), which `nemia service
 * addresses` lists and the installer offers. `nemia service install --bind` and the api's start judge a bind by the same two.
 */
import os from 'node:os';
import type { AddressKind } from 'objects';
import type { AddressKindOf, BindExposure, Exposure, Parsed } from '../../contracts/address-kind.contract.ts';

export type { Exposure, Parsed };

/** IPv4's four octets of a dotted text, or `undefined` for any text that is not one. */
const v4Of = (text: string): readonly [number, number, number, number] | undefined => {
  const parts = text.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return undefined;
  const [a, b, c, d] = parts.map(Number);
  if (a === undefined || b === undefined || c === undefined || d === undefined) return undefined;
  const octets = [a, b, c, d] as const;
  return octets.every((o) => o <= 255) ? octets : undefined;
};

/** The groups of one side of an IPv6 text's `::`, an embedded IPv4 tail read as two groups, or `undefined` for a malformed side. */
const groupsOf = (side: string, last: boolean): number[] | undefined => {
  if (side === '') return [];
  const out: number[] = [];
  const parts = side.split(':');
  for (const [i, part] of parts.entries()) {
    if (last && i === parts.length - 1 && part.includes('.')) {
      const tail = v4Of(part);
      if (tail === undefined) return undefined;
      out.push(tail[0] * 256 + tail[1], tail[2] * 256 + tail[3]);
    } else if (/^[0-9a-f]{1,4}$/i.test(part)) out.push(parseInt(part, 16));
    else return undefined;
  }
  return out;
};

/** IPv6's eight groups of a text (`[…]` and a `%zone` taken off), or `undefined` for any text that is not one. */
const v6Of = (text: string): readonly [number, number, number, number, number, number, number, number] | undefined => {
  const bare = text.replace(/^\[(.*)\]$/, '$1').replace(/%.*$/, '');
  const halves = bare.split('::');
  if (halves.length > 2) return undefined;
  const [head = '', tail] = halves;
  const before = groupsOf(head, tail === undefined);
  const after = tail === undefined ? [] : groupsOf(tail, true);
  if (before === undefined || after === undefined) return undefined;
  const missing = 8 - before.length - after.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return undefined;
  const all = [...before, ...Array<number>(Math.max(missing, 0)).fill(0), ...after];
  const [g0, g1, g2, g3, g4, g5, g6, g7] = all;
  if (g0 === undefined || g1 === undefined || g2 === undefined || g3 === undefined) return undefined;
  if (g4 === undefined || g5 === undefined || g6 === undefined || g7 === undefined) return undefined;
  return [g0, g1, g2, g3, g4, g5, g6, g7];
};

/** An address's text parsed, or `undefined` for a text that is no IPv4 or IPv6 address (a host's name, `localhost`). */
export const addressParsed = (text: string): Parsed | undefined => {
  const octets = v4Of(text.trim());
  if (octets !== undefined) return { v: 4, octets };
  const groups = v6Of(text.trim());
  return groups === undefined ? undefined : { v: 6, groups };
};

/** Whether every number of `xs` is 0. */
const zeros = (xs: readonly number[]): boolean => xs.every((x) => x === 0);

/** The kind of an IPv4 address by its range. */
const v4Kind = ([x, y, z, w]: readonly [number, number, number, number]): AddressKind => {
  if (x === 127) return 'loopback';
  if (zeros([x, y, z, w])) return 'wildcard';
  if (x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168)) return 'private';
  if (x === 100 && y >= 64 && y <= 127) return 'shared';
  return x === 169 && y === 254 ? 'link-local' : 'public';
};

/** The kind of an IPv6 address by its range; an IPv4-mapped one reads as public, the safe side. */
const v6Kind = (g: readonly [number, number, number, number, number, number, number, number]): AddressKind => {
  const head = zeros(g.slice(0, 7));
  if (head && g[7] === 1) return 'loopback';
  if (head && g[7] === 0) return 'wildcard';
  if (g[0] >= 0xfe80 && g[0] <= 0xfebf) return 'link-local';
  return g[0] >= 0xfc00 && g[0] <= 0xfdff ? 'unique-local' : 'public';
};

/** The kind of a parsed address, by its range: the contract's laws. */
export const addressKind: AddressKindOf = (a) => (a.v === 4 ? v4Kind(a.octets) : v6Kind(a.groups));

/** Whether a bind of `kind` is listened on, or refused until the person acknowledges a public or wildcard one. */
export const bindExposure: BindExposure = (kind, acknowledged) =>
  (kind === 'public' || kind === 'wildcard') && !acknowledged ? 'unacknowledged' : 'listen';

/**
 * The kind of a bind's text: an address's by its range, `localhost` this machine's, and any other name `public`, the safe side — a
 * name may resolve anywhere.
 */
export const kindOfBind = (text: string): AddressKind => {
  if (text.trim() === 'localhost') return 'loopback';
  const parsed = addressParsed(text);
  return parsed === undefined ? 'public' : addressKind(parsed);
};

/** The variable that acknowledges a public or wildcard bind, which `nemia service install --public` writes. */
export const BIND_PUBLIC_VARIABLE = 'NEMIA_BIND_PUBLIC';

/** One of this machine's addresses: the address, its interface's name, its family and its kind. */
export type MachineAddress = {
  readonly address: string;
  readonly interface: string;
  readonly family: 4 | 6;
  readonly kind: AddressKind;
};

/** This machine's addresses with their kinds, as `os.networkInterfaces` gives them (or `interfaces` given), loopback first. */
export const machineAddresses = (interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): readonly MachineAddress[] =>
  Object.entries(interfaces)
    .flatMap(([name, infos]) =>
      (infos ?? []).map((info) => ({
        address: info.address,
        interface: name,
        family: info.family === 'IPv4' ? (4 as const) : (6 as const),
        kind: kindOfBind(info.address),
      })),
    )
    .sort((a, b) => Number(b.kind === 'loopback') - Number(a.kind === 'loopback'));
