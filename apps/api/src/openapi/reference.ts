/**
 * The api's reference page of its OpenAPI document (`GET /openapi`): Scalar's API reference for Hono, drawn in the browser from the
 * document the api serves at `OPENAPI_PATH`, so it shows whatever the document holds. The page reaches nothing beyond this api: the
 * viewer's script is the installed `@scalar/api-reference` bundle served at `REFERENCE_SCRIPT_PATH` (Scalar's Hono helper loads it from
 * jsDelivr unless told a `cdn`), and the viewer's own calls out are off: its fonts, its telemetry, its agent, its MCP button, and its
 * developer tools, whose buttons send a person to Scalar's site; no request proxy is given it. Its "try it" client is off too: it would
 * send a request to the live api, which acts on the person's store once the document holds a write.
 */
import { Hono } from 'hono';
import { Scalar } from '@scalar/hono-api-reference';
import { OPENAPI_PATH } from './openapi.ts';
import type { ApiEnv } from '../layer.ts';

/** The page's path, beside the document's. */
export const REFERENCE_PATH = '/openapi';

/** Where the api serves the viewer's script, read from the installed package. */
export const REFERENCE_SCRIPT_PATH = '/openapi/scalar.js';

/**
 * The viewer's single-file browser bundle in the installed package, which the app reads (`app.ts`, where the api touches the machine).
 * Its `exports` do not name `dist/browser`, so it is found beside the entry they do name (`dist/index.js`).
 */
export const REFERENCE_BUNDLE = new URL('./browser/standalone.js', import.meta.resolve('@scalar/api-reference'));

/** The page and the viewer's script, the script's text given by `script`. */
export const referenceOf = (script: () => Promise<string>) =>
  new Hono<ApiEnv>()
    .get(REFERENCE_SCRIPT_PATH, async (c) => c.body(await script(), 200, { 'content-type': 'text/javascript; charset=utf-8' }))
    .get(
      REFERENCE_PATH,
      Scalar({
        url: OPENAPI_PATH,
        cdn: REFERENCE_SCRIPT_PATH,
        pageTitle: 'Nemia API reference',
        darkMode: true,
        withDefaultFonts: false,
        telemetry: false,
        hideClientButton: true,
        hideTestRequestButton: true,
        agent: { disabled: true },
        mcp: { disabled: true },
        showDeveloperTools: 'never',
      }),
    );
