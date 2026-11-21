/**
 * A label key's two segments, as Kubernetes spells one (agent-orchestrator, src/label-spelling/label-spelling.ts, `labelKeyShape`): an optional prefix
 * and a name, separated by one slash. The name is required, 63 characters at most; the prefix, where one is written, is not empty and
 * 253 characters at most. A key with no slash is a name alone; a key with one slash splits at it; a key with two is refused. What the
 * characters of each segment may be — the name's alphanumerics with `-`, `_` and `.` between, the prefix's lowercase DNS subdomain — is
 * a regular expression's, which tsverify does not read: `src/watch/selector.test.ts` and `src/labels/labels.test.ts` hold those, a row
 * each. The structure here is what a person's label, a card's `labels:` and a selector's key all read through.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Why a key has no shape a label key takes: a second slash, a prefix written empty, no name, a prefix past 253, a name past 63. */
export type LabelKeyFlaw = 'slashes' | 'empty-prefix' | 'empty-name' | 'long-prefix' | 'long-name';

/** A key's segments: a name alone, a prefix and a name, or the first flaw that leaves it none. */
export type LabelKeyParts =
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'prefixed'; readonly prefix: string; readonly name: string }
  | { readonly kind: 'refused'; readonly reason: LabelKeyFlaw };

/** The longest name segment, as Kubernetes holds it. */
const NAME_CAP = 63;

/** The longest prefix, a DNS subdomain, as Kubernetes holds it. */
const PREFIX_CAP = 253;

/** Whether `key` writes a prefix: it holds a slash. */
const prefixed = (key: string) => key.includes('/');

/** What is before the first slash of `key`. */
const prefixOf = (key: string) => key.slice(0, key.indexOf('/'));

/** What is after the first slash of `key`, or the whole key where it holds none. */
const nameOf = (key: string) => (prefixed(key) ? key.slice(key.indexOf('/')).slice(1) : key);

/** Whether `key` holds a second slash, after its first. */
const twoSlashes = (key: string) => prefixed(key) && nameOf(key).includes('/');

/** Whether `key` writes its prefix empty: it opens on its slash. */
const emptyPrefix = (key: string) => key.startsWith('/');

/** Whether `key` has no flaw before its caps: one slash at most, a prefix not written empty, and a name. */
const wellFormed = (key: string) => !twoSlashes(key) && !emptyPrefix(key) && nameOf(key) !== '';

/** Whether `key`'s prefix is past its cap. */
const longPrefix = (key: string) => prefixed(key) && prefixOf(key).length > PREFIX_CAP;

/** Whether `key` has no flaw at all. */
const shaped = (key: string) => wellFormed(key) && !longPrefix(key) && nameOf(key).length <= NAME_CAP;

/** Whether `output` refuses for `reason`. */
const refusedFor = (output: LabelKeyParts, reason: LabelKeyFlaw) => output.kind === 'refused' && output.reason === reason;

const labelKeyShapeSpec = spec<(key: string) => LabelKeyParts>({
  ensures: {
    oneSlashAtMost: {
      description: 'A key with a second slash is refused: a label key has one prefix at most',
      condition: ({ input: [key], output }) => !twoSlashes(key) || refusedFor(output, 'slashes'),
    },
    prefixNotWrittenEmpty: {
      description: 'A key that opens on its slash, and has one, is refused: a prefix written is not empty',
      condition: ({ input: [key], output }) => twoSlashes(key) || !emptyPrefix(key) || refusedFor(output, 'empty-prefix'),
    },
    nameRequired: {
      description: 'A key with one slash at most and a prefix not written empty, but no name after it, is refused: the name is required',
      condition: ({ input: [key], output }) =>
        twoSlashes(key) || emptyPrefix(key) || nameOf(key) !== '' || refusedFor(output, 'empty-name'),
    },
    prefixAt253: {
      description: 'A key well formed whose prefix is longer than 253 characters is refused',
      condition: ({ input: [key], output }) => !wellFormed(key) || !longPrefix(key) || refusedFor(output, 'long-prefix'),
    },
    nameAt63: {
      description: 'A key well formed, its prefix within 253, whose name is longer than 63 characters is refused',
      condition: ({ input: [key], output }) =>
        !wellFormed(key) || longPrefix(key) || nameOf(key).length <= NAME_CAP || refusedFor(output, 'long-name'),
    },
    bareKeyIsItsName: {
      description: 'A key with no slash and no flaw is a name alone, the key itself',
      condition: ({ input: [key], output }) =>
        prefixed(key) || !shaped(key) || (output.kind === 'name' && output.name === key),
    },
    prefixedSplitsAtItsSlash: {
      description: 'A key with one slash and no flaw is its prefix, before the slash, and its name, after it',
      condition: ({ input: [key], output }) =>
        !prefixed(key) ||
        !shaped(key) ||
        (output.kind === 'prefixed' && output.prefix === prefixOf(key) && output.name === nameOf(key)),
    },
  },
});
export type LabelKeyShape = Implementation<typeof labelKeyShapeSpec>;
