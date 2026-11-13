/**
 * The machine's memory read off `/proc/meminfo`'s text: a planted text, never the host's own, so the test says the same on every
 * machine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meminfoOf } from './machine.ts';

const MEMINFO = [
  'MemTotal:       16318412 kB',
  'MemFree:          812344 kB',
  'MemAvailable:    9437184 kB',
  'Buffers:          301220 kB',
  'Cached:          7012448 kB',
].join('\n');

test("meminfoOf: the machine's total and available memory in bytes off the kernel's lines, and nothing where either is missing", async (t) => {
  await t.test('both lines: each kibibyte count in bytes', () => {
    assert.deepEqual(meminfoOf(MEMINFO), { totalBytes: 16318412 * 1024, availableBytes: 9 * 2 ** 30 });
  });
  await t.test('no `MemAvailable`, as a kernel before 3.14 writes it: no reading, never a guess from free memory', () => {
    assert.equal(meminfoOf(MEMINFO.replace(/^MemAvailable:.*$/m, '')), undefined);
  });
  await t.test('no `MemTotal`: no reading', () => {
    assert.equal(meminfoOf(MEMINFO.replace(/^MemTotal:.*$/m, '')), undefined);
  });
  await t.test('an empty file: no reading', () => {
    assert.equal(meminfoOf(''), undefined);
  });
});
