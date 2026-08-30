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
 * The set of paths the generated document is expected to publish: every
 * actually-registered route, minus `/internal/*` (excluded per spec §7.7)
 * and the document's own endpoint (not self-described). Built from
 * Fastify's own routing table, not a hand-copied list, so this is a real
 * drift check rather than a restatement of the spec.
 */
function expectedPublishedPaths(routes: RegisteredRoute[]): Set<string> {
  return new Set(
    routes
      .filter((route) => !route.url.startsWith(`${API_PREFIX}/internal`))
      .filter((route) => route.url !== `${API_PREFIX}/openapi.json`)
      .map((route) => toDocumentPath(route.url)),
  );
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
      response = await request(harness.app.server).get('/api/v1/openapi.json');
      document = response.body as OpenApiDocument;
    });

    Then('it validates as a well-formed OpenAPI 3.1 document', async () => {
      const validator = new Validator();
      const result = await validator.validate(document as unknown as Record<string, unknown>);
      expect(result.errors).toBeUndefined();
      expect(result.valid).toBe(true);
      expect(validator.version).toBe('3.1');
    });

    And("its paths match the API's actual registered routes", () => {
      const expectedPaths = expectedPublishedPaths(registeredRoutes);
      const documentPaths = new Set(Object.keys(document.paths ?? {}));
      expect(documentPaths).toEqual(expectedPaths);
    });
  });

  Scenario('Internal endpoints are excluded from the contract', ({ Given, When, Then }) => {
    Given('the API registers internal routes under /api/v1/internal', () => {
      expect(registeredRoutes.some((route) => route.url.startsWith(`${API_PREFIX}/internal`))).toBe(true);
    });

    When('a client fetches the OpenAPI document', async () => {
      response = await request(harness.app.server).get('/api/v1/openapi.json');
      document = response.body as OpenApiDocument;
    });

    Then('no /api/v1/internal path appears in it', () => {
      const documentPaths = Object.keys(document.paths ?? {});
      expect(documentPaths.some((path) => path.startsWith('/internal'))).toBe(false);
    });
  });

  Scenario('Protected endpoints declare the bearer JWT requirement', ({ Given, When, Then }) => {
    Given('a route that requires "Authorization: Bearer <jwt>", such as GET /api/v1/auth/me', () => {
      expect(registeredRoutes.some((route) => route.method === 'GET' && route.url === `${API_PREFIX}/auth/me`)).toBe(
        true,
      );
    });

    When('a client fetches the OpenAPI document', async () => {
      response = await request(harness.app.server).get('/api/v1/openapi.json');
      document = response.body as OpenApiDocument;
    });

    Then('that path declares a bearerAuth security requirement', () => {
      const operation = operationFor(document, '/auth/me', 'get');
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
    });
  });

  Scenario('Public endpoints declare no auth requirement', ({ Given, When, Then }) => {
    Given('a route open to anonymous callers, such as GET /api/v1/wars', () => {
      expect(registeredRoutes.some((route) => route.method === 'GET' && route.url === `${API_PREFIX}/wars`)).toBe(
        true,
      );
    });

    When('a client fetches the OpenAPI document', async () => {
      response = await request(harness.app.server).get('/api/v1/openapi.json');
      document = response.body as OpenApiDocument;
    });

    Then('that path declares no security requirement', () => {
      const operation = operationFor(document, '/wars', 'get');
      expect(operation.security ?? []).toEqual([]);
    });
  });
});
