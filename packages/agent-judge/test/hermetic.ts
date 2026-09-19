/**
 * Imported first by every test file (`hermetic.test.ts` refuses one that does not): no test reads a key or reaches the
 * network. The key is taken out of the environment, and the global `fetch` throws. A test that means to ask hands the
 * judge a stub `fetch` and a stub environment of its own.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

for (const name of Object.keys(process.env)) if (name.startsWith('TYPESAFE_')) delete process.env[name];

/** Every call the global `fetch` refused. A test that sees one reached for the network. */
export const reached: string[] = [];
globalThis.fetch = (async (input: unknown) => {
  reached.push(String(input));
  throw new Error(`hermetic: a test reached for the network (${String(input)}); hand the judge a stub fetch`);
}) as typeof fetch;

/** A key for a stub environment: never a real one, and distinctive enough to find if it leaks. */
export const KEY = 'ts-test-key-7c1f9d2e0b';
export const ENV = { TYPESAFE_API_KEY: KEY };

export const tmp = (name = 'judge') => fs.mkdtempSync(path.join(os.tmpdir(), `agent-judge-${name}-`));

export type Call = { url: string; headers: Record<string, string>; body: any; signal?: AbortSignal };

/** A reply the stub gives: a status and a JSON body, or a function of the call. */
export type Reply = { status?: number; body?: unknown; text?: string; headers?: Record<string, string> } | 'hang' | 'throw';

/**
 * A `fetch` that answers from `replies` in turn (the last one again when they run out) and notes each call. `hang` waits
 * until the request is aborted; `throw` fails as a lost connection does.
 */
export const stub = (...replies: (Reply | ((call: Call) => Reply))[]) => {
  const calls: Call[] = [];
  const fetch = async (url: string, init: RequestInit = {}) => {
    const call: Call = {
      url, headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body, signal: init.signal ?? undefined,
    };
    calls.push(call);
    const next = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    const r = typeof next === 'function' ? next(call) : next;
    if (r === 'throw') throw new TypeError('fetch failed: ECONNRESET');
    if (r === 'hang') {
      return new Promise<Response>((_, reject) => {
        const abort = () => reject(init.signal!.reason ?? new Error('aborted'));
        if (init.signal?.aborted) abort();
        init.signal?.addEventListener('abort', abort, { once: true });
      });
    }
    const text = r.text ?? JSON.stringify(r.body ?? {});
    return new Response(text, { status: r.status ?? 200, headers: { 'content-type': 'application/json', ...r.headers } });
  };
  return { fetch, calls };
};

/** The reply Jev gives: an answer for each question the call carried, from `values` by id (a noul's P, a score's level). */
export const answering = (values: Record<string, number>, model = 'jev-1.13.0') => (call: Call): Reply => ({
  body: {
    model,
    answers: Object.fromEntries(Object.entries(call.body.questions as Record<string, { type: string }>).map(([id, q]) => [id,
      q.type === 'noul' ? { type: 'noul', noul: values[id] ?? 0.5 }
      : q.type === 'score' ? { type: 'score', score: values[id] ?? 1, confidence: 0.9, legend: {}, probabilities: {} }
      : { type: 'choice', choice: Object.keys((q as any).criteria)[values[id] ?? 0], confidence: 0.9, probabilities: {} }])),
    usage: { input_tokens: 1000, output_tokens: 0 },
  },
});

/** Every file under a directory, relative to it, sorted. */
export const files = (dir: string): string[] =>
  fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort() : [];

/** Why a test file's text does not import the hermetic harness first, or null when it does. */
export function unsealed(text: string): string | null {
  const fix = "Make `import './hermetic.ts'` first";
  const first = /^\s*import\b[^;]*?['"]([^'"]+)['"]/m.exec(text);
  const dynamic = /\bimport\s*\(\s*['"`]/.exec(text);
  if (!first) return `it imports no harness. ${fix}.`;
  if (dynamic && dynamic.index < first.index) return `it imports a module with import() before any static import. ${fix}, above it.`;
  if (first[1] !== './hermetic.ts') return `its first import is ${first[1]}. ${fix}, above it.`;
  return null;
}
