import { defineConfig } from 'vite';
import { relative } from 'node:path';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { Logger, LoggerEvent } from 'babel-plugin-react-compiler';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

/**
 * Where `/api` goes: the api `HKB_API_URL` names, for `vite` and `vite preview` alike (`npm run e2e` starts one on a free port); else,
 * for `vite`, the viewer `npm run dev` starts beside the daemon (`--no-tick`, 8788), and for `vite preview` the daemon itself (8787), each
 * at 127.0.0.1 as the api listens (apps/api/src/port.ts), since localhost can resolve to ::1 first.
 */
const named = process.env.HKB_API_URL;
const viewer = named ?? 'http://127.0.0.1:8788';
const daemon = named ?? 'http://127.0.0.1:8787';

/** Warns, one line each, of every component or hook the React Compiler leaves uncompiled: it still works, unmemoized. */
const logger: Logger = {
  logEvent(filename, event) {
    const why = skipped(event);
    if (!why) return;
    console.warn(`React Compiler skipped ${filename ? relative(import.meta.dirname, filename) : '?'}:${why.line ?? '?'}: ${why.reason}`);
  },
};

/**
 * The line and reason of a compiler event that leaves a function uncompiled, or `undefined` for any other event. The line is the
 * offending expression's where the compiler gives its location, and the function's where it gives none or a symbol in its place.
 */
function skipped(event: LoggerEvent): { line?: number; reason: string } | undefined {
  switch (event.kind) {
    case 'PipelineError':
      return { line: event.fnLoc?.start.line, reason: event.data };
    case 'CompileSkip':
      return { line: (event.loc ?? event.fnLoc)?.start.line, reason: event.reason };
    case 'CompileError': {
      const at = event.detail.primaryLocation();
      return { line: (typeof at === 'object' && at ? at : event.fnLoc)?.start.line, reason: event.detail.reason };
    }
    default:
      return undefined;
  }
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    babel({ presets: [reactCompilerPreset({ logger })] }),
    react(),
    tailwindcss(),
  ],
  resolve: { tsconfigPaths: true },
  server: {
    proxy: { '/api': viewer },
  },
  preview: {
    proxy: { '/api': daemon },
  },
});
