/**
 * The objects' OpenAPI 3.1 document: its route (`openapi`, `GET /openapi/v3/nemia/v1`) and the document it serves,
 * which `print.ts` prints to a file; and the page that browses it
 * (`referenceOf`, `GET /openapi`).
 */
export { OPENAPI_PATH, openapi } from './openapi.ts';
export { REFERENCE_BUNDLE, REFERENCE_PATH, REFERENCE_SCRIPT_PATH, referenceOf } from './reference.ts';
