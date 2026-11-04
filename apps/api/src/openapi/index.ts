/**
 * The run object's OpenAPI 3.1 document: its route (`openapi`, `GET /openapi/v3/nemia/v1`) and the document it serves
 * (`openapiDocument`), which `print.ts` prints for the board's generator of its run mirror; and the page that browses it
 * (`referenceOf`, `GET /openapi`).
 */
export { OPENAPI_PATH, openapi, openapiDocument, RUN_READS } from './openapi.ts';
export { REFERENCE_BUNDLE, REFERENCE_PATH, REFERENCE_SCRIPT_PATH, referenceOf } from './reference.ts';
