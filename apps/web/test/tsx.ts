/**
 * Lets a node test import the board's components. Node runs a test's TypeScript as it is, and not a component's JSX: the hooks here
 * hand it the app's `.tsx` compiled by `typescript`, the compiler the app is typechecked with, and resolve an import as vite does —
 * no extension, and `@/` for `src/`. A test imports this file first, and each component after it, by `await import(…)`.
 */
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const SRC = path.resolve(import.meta.dirname, '..', 'src');

registerHooks({
  resolve(specifier, context, nextResolve) {
    const named = specifier.startsWith('@/') ? pathToFileURL(path.join(SRC, specifier.slice(2))).href : specifier;
    if ((named.startsWith('.') || named.startsWith('file:')) && !path.extname(named)) {
      for (const extension of ['.ts', '.tsx']) {
        try {
          return nextResolve(named + extension, context);
        } catch {}
      }
    }
    return nextResolve(named, context);
  },
  load(url, context, nextLoad) {
    if (!url.endsWith('.tsx')) return nextLoad(url, context);
    const fileName = fileURLToPath(url);
    const { outputText } = ts.transpileModule(fs.readFileSync(fileName, 'utf8'), {
      fileName,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: true,
      },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  },
});
