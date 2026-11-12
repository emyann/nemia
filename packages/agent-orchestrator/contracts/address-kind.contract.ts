/**
 * What kind of address a bind names (`addressKind`, src/service/address.ts), and whether the daemon may listen there unasked
 * (`bindExposure`). An address is handed parsed — four octets, or eight groups of an IPv6 address — so the laws are over numbers, and
 * the parse of a text is the code's (`addressParsed`, held by its tests).
 *
 * The kinds are the ones a person tells apart when choosing where a board listens: this machine alone (`loopback`), every interface
 * (`wildcard`), a private network's (`private`, RFC 1918), a carrier-grade or Tailscale network's (`shared`, 100.64.0.0/10, RFC 6598),
 * a link's own (`link-local`, 169.254.0.0/16 and fe80::/10), an IPv6 private network's (`unique-local`, fc00::/7, RFC 4193), and any
 * other (`public`). An IPv4-mapped IPv6 address reads as `public`: the safe side, since a public bind asks to be acknowledged.
 *
 * A public or wildcard bind is listened on only where the person acknowledged it (`NEMIA_BIND_PUBLIC=1`, `--public` at
 * `nemia service install`); every other kind is listened on as asked (whether the store must be marked exposed is `bindOf`'s, in
 * apps/api/contracts/bind.contract.ts, and unchanged).
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** An address, parsed: IPv4's four octets, or IPv6's eight 16-bit groups. Implement moves it into src/service/address.ts. */
export type Parsed =
  | { readonly v: 4; readonly octets: readonly [number, number, number, number] }
  | {
      readonly v: 6;
      readonly groups: readonly [number, number, number, number, number, number, number, number];
    };

/** The kinds of address a bind is told as. Implement moves it into objects' words, the readiness read's `bind` piece shows it. */
export type AddressKind = 'loopback' | 'wildcard' | 'private' | 'shared' | 'link-local' | 'unique-local' | 'public';

/** Whether every part of `a` is a whole number in its range: an octet 0–255, a group 0–65535. */
const wellFormed = (a: Parsed): boolean =>
  a.v === 4
    ? a.octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255)
    : a.groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff);

const v4 = (a: Parsed, test: (o: readonly [number, number, number, number]) => boolean): boolean => a.v === 4 && test(a.octets);

const v6 = (a: Parsed, test: (g: readonly [number, number, number, number, number, number, number, number]) => boolean): boolean =>
  a.v === 6 && test(a.groups);

const isLoopback = (a: Parsed): boolean =>
  v4(a, ([o]) => o === 127) ||
  v6(a, (g) => g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0 && g[6] === 0 && g[7] === 1);

const isWildcard = (a: Parsed): boolean =>
  v4(a, (o) => o[0] === 0 && o[1] === 0 && o[2] === 0 && o[3] === 0) ||
  v6(a, (g) => g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0 && g[6] === 0 && g[7] === 0);

const isPrivate = (a: Parsed): boolean => v4(a, ([x, y]) => x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168));

const isShared = (a: Parsed): boolean => v4(a, ([x, y]) => x === 100 && y >= 64 && y <= 127);

const isLinkLocal = (a: Parsed): boolean => v4(a, ([x, y]) => x === 169 && y === 254) || v6(a, ([g]) => g >= 0xfe80 && g <= 0xfebf);

const isUniqueLocal = (a: Parsed): boolean => v6(a, ([g]) => g >= 0xfc00 && g <= 0xfdff);

const addressKindSpec = spec<(address: Parsed) => AddressKind>({
  /** Every octet is a whole number from 0 to 255, every group one from 0 to 65535. */
  requires: ({ input: [a] }) => wellFormed(a),
  ensures: {
    loopbackIsThisMachine: {
      description: '127.0.0.0/8 and ::1 are this machine’s loopback',
      condition: ({ input: [a], output }) => !isLoopback(a) || output === 'loopback',
    },
    unspecifiedIsEveryInterface: {
      description: '0.0.0.0 and :: listen on every interface',
      condition: ({ input: [a], output }) => !isWildcard(a) || output === 'wildcard',
    },
    rfc1918IsPrivate: {
      description: '10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16 are a private network’s',
      condition: ({ input: [a], output }) => !isPrivate(a) || output === 'private',
    },
    cgnatIsShared: {
      description: '100.64.0.0/10, a carrier-grade or Tailscale network’s, is shared',
      condition: ({ input: [a], output }) => !isShared(a) || output === 'shared',
    },
    linkLocalIsTheLinks: {
      description: '169.254.0.0/16 and fe80::/10 are a link’s own',
      condition: ({ input: [a], output }) => !isLinkLocal(a) || output === 'link-local',
    },
    ulaIsUniqueLocal: {
      description: 'fc00::/7 is an IPv6 private network’s',
      condition: ({ input: [a], output }) => !isUniqueLocal(a) || output === 'unique-local',
    },
    anyOtherIsPublic: {
      description: 'An address of none of those ranges is public',
      condition: ({ input: [a], output }) =>
        isLoopback(a) || isWildcard(a) || isPrivate(a) || isShared(a) || isLinkLocal(a) || isUniqueLocal(a) || output === 'public',
    },
  },
});

/** `addressKind`'s type, which src/service/address.ts takes. */
export type AddressKindOf = Implementation<typeof addressKindSpec>;

/** Whether a bind of a kind may be listened on: as asked, or refused until the person acknowledges a public one. */
export type Exposure = 'listen' | 'unacknowledged';

const exposed = (kind: AddressKind): boolean => kind === 'public' || kind === 'wildcard';

const bindExposureSpec = spec<(kind: AddressKind, acknowledged: boolean) => Exposure>({
  ensures: {
    aPublicBindNeedsItsAcknowledgement: {
      description: 'A public or wildcard bind the person did not acknowledge is refused, unacknowledged',
      condition: ({ input: [kind, acknowledged], output }) => !exposed(kind) || acknowledged || output === 'unacknowledged',
    },
    anAcknowledgedBindIsListenedOn: {
      description: 'A public or wildcard bind the person acknowledged is listened on',
      condition: ({ input: [kind, acknowledged], output }) => !exposed(kind) || !acknowledged || output === 'listen',
    },
    aPrivateBindIsListenedOn: {
      description:
        'A bind of any other kind — this machine, a private, shared, link or unique-local network — is listened on, acknowledged or not',
      condition: ({ input: [kind], output }) => exposed(kind) || output === 'listen',
    },
  },
});

/** `bindExposure`'s type, which src/service/address.ts takes. */
export type BindExposure = Implementation<typeof bindExposureSpec>;
