import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { Validator } from '@seriousme/openapi-schema-validator';
import { buildAppWithoutDb, type NoDbHarness } from '../setup/testAppNoDb.js';
import { listRegisteredRoutes, type RegisteredRoute } from '../setup/routeTree.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/openapi.feature', import.meta.url)));

const API_PREFIX = '/api/v1';

interface OpenApiSchema {
  $ref?: string;
  type?: string | string[];
  required?: string[];
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  enum?: unknown[];
}

interface OpenApiMediaTypeObject {
  schema?: OpenApiSchema;
}

interface OpenApiResponse {
  description?: string;
  content?: Record<string, OpenApiMediaTypeObject>;
}

interface OpenApiRequestBody {
  required?: boolean;
  content?: Record<string, OpenApiMediaTypeObject>;
}

interface OpenApiOperation {
  security?: Array<Record<string, unknown>>;
  responses?: Record<string, OpenApiResponse>;
  requestBody?: OpenApiRequestBody;
}

interface OpenApiDocument {
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, OpenApiSchema> };
}

function toDocumentPath(fastifyUrl: string): string {
  const withoutPrefix = fastifyUrl.startsWith(API_PREFIX) ? fastifyUrl.slice(API_PREFIX.length) : fastifyUrl;
  return withoutPrefix.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function operationFor(document: OpenApiDocument, path: string, method: string): OpenApiOperation {
  const operation = document.paths?.[path]?.[method];
  if (!operation) {
    throw new Error(`expected the generated document to describe ${method.toUpperCase()} ${path}`);
  }
  return operation;
}

/**
 * The set of `METHOD path` entries the generated document is expected to
 * publish: every actually-registered route, minus `/internal/*` (excluded
 * per spec §7.7) and the document's own endpoint (not self-described).
 * Built from Fastify's own routing table, not a hand-copied list, so this
 * is a real drift check rather than a restatement of the spec. Compares at
 * method granularity, not path alone, so a route silently losing a verb
 * (e.g. `POST /wars` dropping out while `GET /wars` remains) still fails.
 */
function expectedPublishedRoutes(routes: RegisteredRoute[]): Set<string> {
  return new Set(
    routes
      .filter((route) => !route.url.startsWith(`${API_PREFIX}/internal`))
      .filter((route) => route.url !== `${API_PREFIX}/openapi.json`)
      .map((route) => `${route.method} ${toDocumentPath(route.url)}`),
  );
}

/** Flattens the document's `paths` object into the same `METHOD path` shape as {@link expectedPublishedRoutes}. */
function documentRoutes(document: OpenApiDocument): Set<string> {
  const routes = new Set<string>();
  for (const [path, operations] of Object.entries(document.paths ?? {})) {
    for (const method of Object.keys(operations)) {
      routes.add(`${method.toUpperCase()} ${path}`);
    }
  }
  return routes;
}

async function fetchDocument(harness: NoDbHarness): Promise<{ response: request.Response; document: OpenApiDocument }> {
  const response = await request(harness.app.server).get('/api/v1/openapi.json');
  return { response, document: response.body as OpenApiDocument };
}

/** Follows a `$ref` (as `@fastify/swagger` emits them, `#/components/schemas/<key>`) into `components.schemas`. */
function resolveSchema(document: OpenApiDocument, schema: OpenApiSchema | undefined): OpenApiSchema {
  if (!schema) {
    throw new Error('expected a schema but found none');
  }
  if (!schema.$ref) {
    return schema;
  }
  const key = schema.$ref.replace('#/components/schemas/', '');
  const resolved = document.components?.schemas?.[key];
  if (!resolved) {
    throw new Error(`unresolved $ref: ${schema.$ref}`);
  }
  return resolved;
}

function responseEntry(document: OpenApiDocument, path: string, method: string, status: string): OpenApiResponse {
  const response = operationFor(document, path, method).responses?.[status];
  if (!response) {
    throw new Error(`expected a ${status} response for ${method.toUpperCase()} ${path}`);
  }
  return response;
}

/** The (already-`$ref`-resolved) JSON Schema an operation's response declares for a given status. */
function responseSchema(document: OpenApiDocument, path: string, method: string, status: string): OpenApiSchema {
  const schema = responseEntry(document, path, method, status).content?.['application/json']?.schema;
  return resolveSchema(document, schema);
}

/** The (already-`$ref`-resolved) JSON Schema an operation's request body declares. */
function requestBodySchema(document: OpenApiDocument, path: string, method: string): OpenApiSchema {
  const schema = operationFor(document, path, method).requestBody?.content?.['application/json']?.schema;
  return resolveSchema(document, schema);
}

/** Asserts a response status is documented with no body (an empty schema), per spec §11.2.1. */
function expectNoBody(document: OpenApiDocument, path: string, method: string, status: string): void {
  const schema = responseEntry(document, path, method, status).content?.['application/json']?.schema;
  expect(schema).toBeDefined();
  expect(Object.keys(schema ?? {})).toHaveLength(0);
}

/**
 * Walks a dotted property path (e.g. `"voter.id"`) through a schema tree,
 * resolving `$ref`s along the way, and asserts every segment is declared
 * `required` on its parent object.
 */
function expectRequiredPath(document: OpenApiDocument, schema: OpenApiSchema, dottedPath: string): OpenApiSchema {
  let current = resolveSchema(document, schema);
  for (const segment of dottedPath.split('.')) {
    expect(current.required ?? []).toContain(segment);
    const property = current.properties?.[segment];
    if (!property) {
      throw new Error(`property "${segment}" (from "${dottedPath}") is not declared`);
    }
    current = resolveSchema(document, property);
  }
  return current;
}

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: NoDbHarness;
  let registeredRoutes: RegisteredRoute[];
  let response: request.Response;
  let document: OpenApiDocument;

  BeforeEachScenario(async () => {
    harness = await buildAppWithoutDb();
    await harness.app.ready();
    registeredRoutes = listRegisteredRoutes(harness.app);
  });

  Scenario('The contract is published without authentication', ({ Given, When, Then, And }) => {
    Given('the API is running', () => {
      // The app is already built and ready via BeforeEachScenario.
    });

    When('an unauthenticated client GETs /api/v1/openapi.json', async () => {
      response = await request(harness.app.server).get('/api/v1/openapi.json');
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And('the response Content-Type is application/json', () => {
      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  Scenario('The published document is a valid OpenAPI 3.1 contract', ({ When, Then, And }) => {
    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then('it validates as a well-formed OpenAPI 3.1 document', async () => {
      const validator = new Validator();
      const result = await validator.validate(document as unknown as Record<string, unknown>);
      expect(result.errors).toBeUndefined();
      expect(result.valid).toBe(true);
      expect(validator.version).toBe('3.1');
    });

    And("its paths match the API's actual registered routes", () => {
      const expected = expectedPublishedRoutes(registeredRoutes);
      const actual = documentRoutes(document);
      expect(actual).toEqual(expected);
    });
  });

  Scenario('Internal endpoints are excluded from the contract', ({ Given, When, Then }) => {
    Given('the API registers internal routes under /api/v1/internal', () => {
      expect(registeredRoutes.some((route) => route.url.startsWith(`${API_PREFIX}/internal`))).toBe(true);
    });

    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then('no /api/v1/internal path appears in it', () => {
      const documentPaths = Object.keys(document.paths ?? {});
      expect(documentPaths.some((path) => path.startsWith('/internal'))).toBe(false);
    });
  });

  Scenario('Protected endpoints declare the bearer JWT requirement', ({ Given, When, Then }) => {
    Given('a route that requires "Authorization: Bearer <jwt>", such as GET /api/v1/auth/me', async () => {
      // Arrange: route registration alone does not prove the route is
      // actually auth-gated (a hand-maintained marker could drift from the
      // real preHandler). Probe it for real, unauthenticated.
      expect(registeredRoutes.some((route) => route.method === 'GET' && route.url === `${API_PREFIX}/auth/me`)).toBe(
        true,
      );

      // Act
      const probe = await request(harness.app.server).get('/api/v1/auth/me');

      // Assert: rejected without a bearer token.
      expect(probe.status).toBe(401);
    });

    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then('that path declares a bearerAuth security requirement', () => {
      const operation = operationFor(document, '/auth/me', 'get');
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
    });
  });

  Scenario('Public endpoints declare no auth requirement', ({ Given, When, Then }) => {
    Given('a route open to anonymous callers, such as GET /api/v1/wars', async () => {
      // Arrange
      expect(registeredRoutes.some((route) => route.method === 'GET' && route.url === `${API_PREFIX}/wars`)).toBe(
        true,
      );

      // Act
      const probe = await request(harness.app.server).get('/api/v1/wars');

      // Assert: under this no-DB harness an unauthenticated GET /wars still
      // reaches the (stubbed) database and fails there, so it does not
      // return 200 here -- but it must not be turned away for lack of a
      // bearer token either. That is the one thing this scenario claims.
      expect(probe.status).not.toBe(401);
    });

    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then('that path declares no security requirement', () => {
      const operation = operationFor(document, '/wars', 'get');
      expect(operation.security ?? []).toEqual([]);
    });
  });

  Scenario("The refresh endpoint's response schema declares the JWT", ({ When, Then }) => {
    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then('the POST /api/v1/auth/refresh 200 response schema requires a "token" string field', () => {
      const schema = responseSchema(document, '/auth/refresh', 'post', '200');
      const tokenSchema = expectRequiredPath(document, schema, 'token');
      expect(tokenSchema.type).toBe('string');
    });
  });

  Scenario("The voter profile endpoint's response schema declares the voter fields", ({ When, Then, And }) => {
    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then('the GET /api/v1/auth/me 200 response schema requires "voter.id"', () => {
      const schema = responseSchema(document, '/auth/me', 'get', '200');
      expectRequiredPath(document, schema, 'voter.id');
    });

    And('it declares "voter.avatar_url" nullable', () => {
      const schema = responseSchema(document, '/auth/me', 'get', '200');
      const voterSchema = resolveSchema(document, schema.properties?.voter);
      const avatarUrlSchema = voterSchema.properties?.avatar_url;
      expect(avatarUrlSchema?.type).toEqual(expect.arrayContaining(['null']));
    });
  });

  Scenario('The session logout endpoint declares no response body', ({ When, Then }) => {
    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then('the DELETE /api/v1/auth/session 204 response declares no body', () => {
      expectNoBody(document, '/auth/session', 'delete', '204');
    });
  });

  Scenario("The callback endpoint's error responses declare a message", ({ When, Then }) => {
    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then('the GET /api/v1/auth/{provider}/callback 400 response schema requires "error"', () => {
      const schema = responseSchema(document, '/auth/{provider}/callback', 'get', '400');
      expectRequiredPath(document, schema, 'error');
    });
  });

  Scenario('The wars list response schema is an array under a wars key', ({ When, Then, And }) => {
    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then('the GET /api/v1/wars 200 response schema declares "wars" as an array', () => {
      const schema = responseSchema(document, '/wars', 'get', '200');
      const warsSchema = expectRequiredPath(document, schema, 'wars');
      expect(warsSchema.type).toBe('array');
    });

    And('each item requires "id", "title", and "status"', () => {
      const schema = responseSchema(document, '/wars', 'get', '200');
      const itemSchema = resolveSchema(document, schema.properties?.wars?.items);
      expect(itemSchema.required ?? []).toEqual(expect.arrayContaining(['id', 'title', 'status']));
    });
  });

  Scenario('The war detail response schema nests contestants with media', ({ When, Then, And }) => {
    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then('the GET /api/v1/wars/{id} 200 response schema requires "contestants" as an array', () => {
      const schema = responseSchema(document, '/wars/{id}', 'get', '200');
      const contestantsSchema = expectRequiredPath(document, schema, 'contestants');
      expect(contestantsSchema.type).toBe('array');
    });

    And('each contestant requires "media" as an array', () => {
      const schema = responseSchema(document, '/wars/{id}', 'get', '200');
      const contestantSchema = resolveSchema(document, schema.properties?.contestants?.items);
      const mediaSchema = expectRequiredPath(document, contestantSchema, 'media');
      expect(mediaSchema.type).toBe('array');
    });
  });

  Scenario("The join endpoint declares its success and failure shapes", ({ When, Then, And }) => {
    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then('the POST /api/v1/wars/{id}/join 204 response declares no body', () => {
      expectNoBody(document, '/wars/{id}/join', 'post', '204');
    });

    And('its 403 and 404 responses each require "error"', () => {
      expectRequiredPath(document, responseSchema(document, '/wars/{id}/join', 'post', '403'), 'error');
      expectRequiredPath(document, responseSchema(document, '/wars/{id}/join', 'post', '404'), 'error');
    });
  });

  Scenario("The next-matchup endpoint's response schema declares progress as numbers", ({ When, Then, And }) => {
    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then(
      'the GET /api/v1/wars/{id}/matchups/next 200 response schema requires "progress.voted" and "progress.total" as numbers',
      () => {
        const schema = responseSchema(document, '/wars/{id}/matchups/next', 'get', '200');
        const voted = expectRequiredPath(document, schema, 'progress.voted');
        const total = expectRequiredPath(document, schema, 'progress.total');
        expect(voted.type).toBe('integer');
        expect(total.type).toBe('integer');
      },
    );

    And('its 204 response declares no body', () => {
      expectNoBody(document, '/wars/{id}/matchups/next', 'get', '204');
    });
  });

  Scenario("The vote endpoint's request body schema requires the winner", ({ When, Then }) => {
    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then('the POST /api/v1/wars/{id}/matchups/{mId}/vote request body schema requires "winner_id"', () => {
      const schema = requestBodySchema(document, '/wars/{id}/matchups/{mId}/vote', 'post');
      expectRequiredPath(document, schema, 'winner_id');
    });
  });

  Scenario("The vote endpoint's response schemas cover its status variations", ({ When, Then, And }) => {
    When('a client fetches the OpenAPI document', async () => {
      ({ response, document } = await fetchDocument(harness));
    });

    Then('its 201 response schema requires "vote_id"', () => {
      const schema = responseSchema(document, '/wars/{id}/matchups/{mId}/vote', 'post', '201');
      expectRequiredPath(document, schema, 'vote_id');
    });

    And('its 409 response schema requires "error"', () => {
      const schema = responseSchema(document, '/wars/{id}/matchups/{mId}/vote', 'post', '409');
      expectRequiredPath(document, schema, 'error');
    });

    And('its 422 response schema requires "error"', () => {
      const schema = responseSchema(document, '/wars/{id}/matchups/{mId}/vote', 'post', '422');
      expectRequiredPath(document, schema, 'error');
    });
  });
});
