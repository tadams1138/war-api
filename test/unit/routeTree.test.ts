import { describe, expect, it } from 'vitest';
import { parseRouteTree } from '../setup/routeTree.js';

// Arrange: a fixture mirroring the shape of Fastify's own
// `printRoutes({ commonPrefix: false })` output -- box-drawing tree with
// merged path segments, mixed depths, and a route that both has children
// and is itself registered (`/api/v1/wars`).
const SAMPLE_TREE = `├── /api/v1/health (GET, HEAD)
├── /api/v1/auth/me (GET, HEAD)
├── /api/v1/wars (GET, HEAD, POST)
│   └── /:id (GET, HEAD, PATCH)
│       ├── /activate (POST)
│       ├── /contestants (POST)
│       │   └── /:cId (PATCH, DELETE)
│       │       └── /media/:mId (PATCH, DELETE)
│       └── /rankings (GET, HEAD)
├── /api/v1/internal/close-expired-wars (POST)
└── * (OPTIONS)
`;

describe('parseRouteTree', () => {
  it('flattens single-level routes with their methods', () => {
    // Act
    const routes = parseRouteTree(SAMPLE_TREE);

    // Assert
    expect(routes).toContainEqual({ method: 'GET', url: '/api/v1/health' });
    expect(routes).toContainEqual({ method: 'GET', url: '/api/v1/auth/me' });
  });

  it('reconstructs full paths for deeply nested merged segments', () => {
    // Act
    const routes = parseRouteTree(SAMPLE_TREE);

    // Assert
    expect(routes).toContainEqual({ method: 'PATCH', url: '/api/v1/wars/:id/contestants/:cId/media/:mId' });
    expect(routes).toContainEqual({ method: 'DELETE', url: '/api/v1/wars/:id/contestants/:cId/media/:mId' });
  });

  it('records a node that is itself a route in addition to having children', () => {
    // Act
    const routes = parseRouteTree(SAMPLE_TREE);

    // Assert
    expect(routes).toContainEqual({ method: 'GET', url: '/api/v1/wars' });
    expect(routes).toContainEqual({ method: 'POST', url: '/api/v1/wars' });
    expect(routes).toContainEqual({ method: 'PATCH', url: '/api/v1/wars/:id' });
  });

  it('excludes HEAD and OPTIONS entries, and the wildcard preflight route', () => {
    // Act
    const routes = parseRouteTree(SAMPLE_TREE);

    // Assert
    expect(routes.some((route) => route.method === 'HEAD')).toBe(false);
    expect(routes.some((route) => route.method === 'OPTIONS')).toBe(false);
    expect(routes.some((route) => route.url === '*')).toBe(false);
  });

  it('keeps siblings at the same depth from leaking into each other\'s paths', () => {
    // Act
    const routes = parseRouteTree(SAMPLE_TREE);

    // Assert
    expect(routes).toContainEqual({ method: 'POST', url: '/api/v1/wars/:id/activate' });
    expect(routes).toContainEqual({ method: 'GET', url: '/api/v1/wars/:id/rankings' });
    expect(routes.some((route) => route.url === '/api/v1/wars/:id/rankings/activate')).toBe(false);
  });

  it('throws a clear error rather than silently returning an empty list when it matches no routes', () => {
    // Arrange: text that does not resemble Fastify's printRoutes() tree at all
    // -- standing in for a future Fastify version changing that format.
    const unrecognizedFormat = 'not a route tree\njust some other text\n';

    // Act / Assert
    expect(() => parseRouteTree(unrecognizedFormat)).toThrow(/matched no routes/);
  });
});
