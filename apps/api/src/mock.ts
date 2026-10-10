/**
 * `@johnmorrisdotca/rest-in-pieces/mock`: mock an API from its OpenAPI (3.x) or Swagger (2.0) document.
 *
 * `createMockApp(document)` returns a fetch-style app that answers every operation of the document with seeded data in
 * the shape of its response schema, checks requests against it, and honours `?delay=`, `?status=`, `?fail=` and
 * `?trickle=`. It uses no Node modules, so it runs in a test, a worker or a browser as it does behind
 * `rest-in-pieces serve --openapi`. See docs/mock-your-openapi.md.
 */
export type { Mock, MockOperationInfo, MockOptions } from './lib/openapiMock.ts';
export { CONTROLS, createMock, createMockApp, LIMIT_NAMES, MOCK_LIMITS, OpenApiError } from './lib/openapiMock.ts';
export { SPEC_LIMITS } from './lib/openapiSpec.ts';
