import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { Validator } from '@seriousme/openapi-schema-validator';
import { buildAppWithoutDb, type NoDbHarness } from '../setup/testAppNoDb.js';
import { listRegisteredRoutes, type RegisteredRoute } from '../setup/routeTree.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/openapi.feature', import.meta.url)));

const API_PREFIX = '/api/v1';

interface OpenApiOperation {
  security?: Array<Record<string, unknown>>;
}

interface OpenApiDocument {
  paths?: Record<string, Record<string, OpenApiOperation>>;
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
});
