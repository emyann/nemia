/**
 * `ae sweep [--yes]` on a board of its own (`AE_ROOT`): it counts the bodies no journal names, and refuses any other argument with
 * exit code 2.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main, sweepAsked, sweepLine } from '../src/cli/main.ts';
import { scratch } from './scratch.ts';

/** What `main(argv)` printed with `console.log`, on the board at `root`. */
const printed = async (root: string, argv: string[]): Promise<string[]> => {
  const lines: string[] = [];
  const log = console.log;
  const given = process.env.AE_ROOT;
  process.env.AE_ROOT = root;
  console.log = (...args: unknown[]) => void lines.push(args.join(' '));
  try {
    await main(argv);
  } finally {
    console.log = log;
    if (given === undefined) delete process.env.AE_ROOT;
    else process.env.AE_ROOT = given;
  }
  return lines;
};

test('ae sweep counts the bodies of an empty board, and --yes removes none there', async () => {
  const root = scratch('ae-sweep-cli-');
  assert.deepEqual(await printed(root, ['sweep']), ['0 bodies no journal names (0 bytes): `ae sweep --yes` removes them; 0 kept']);
  assert.deepEqual(await printed(root, ['sweep', '--yes']), ['0 bodies removed (0 bytes), 0 kept']);
});

test('REFUSED: ae sweep given anything but --yes, with exit code 2', () => {
  const err = (() => {
    try {
      sweepAsked(['--yes', '--all']);
    } catch (e) {
      return e as Error & { exitCode?: number };
    }
    return assert.fail('`--all` was taken');
  })();
  assert.deepEqual([err.message, err.exitCode], ['sweep: takes `--yes` to remove, or nothing to count; it was handed --all.', 2]);
  assert.deepEqual([sweepAsked([]), sweepAsked(['--yes'])], [{ yes: false }, { yes: true }]);
});

test('ae sweep says one body in the singular', () => {
  assert.equal(
    sweepLine({ removable: 1, bytes: 2048, kept: 3, removed: 0 }, false),
    '1 body no journal names (2048 bytes): `ae sweep --yes` removes them; 3 kept',
  );
  assert.equal(sweepLine({ removable: 1, bytes: 2048, kept: 3, removed: 1 }, true), '1 body removed (2048 bytes), 3 kept');
});
